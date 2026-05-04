import { useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Input, Select, Space, Tag, Typography, Upload, message } from "antd";
import type { UploadProps } from "antd";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { usePreferences } from "#src/hooks";
import {
  getBusinessMemoryStats,
  indexBusinessMarkdown,
  searchBusinessMemory,
  streamOptimizeWithBusinessMemory,
} from "#src/api/ai/assistant-engine";

const DEFAULT_CODE = `<section class="customer-form">
  <h2>Thong tin khach hang</h2>
  <div class="row">
    <label>Ho ten</label>
    <input type="text" name="full_name" />
  </div>
  <script>
    const cfg = { locale: "vi", tracking: false };
    console.log(cfg);
  </script>
</section>`;

function extractOptimizedCodeFromResponse(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!text) {
    return null;
  }

  const candidates: string[] = [text];
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.push(String(fenceMatch[1]).trim());
  }

  for (const item of candidates) {
    try {
      const parsed = JSON.parse(item) as Record<string, unknown>;
      const optimized = String(parsed?.optimizedCode || "").trim();
      if (optimized) {
        return optimized;
      }
      const code = String(parsed?.code || "").trim();
      if (code) {
        return code;
      }
    } catch {
      // Continue parsing next candidate.
    }
  }

  return null;
}

export default function AiAssistantEngine() {
  const { theme } = usePreferences();
  const [appId, setAppId] = useState("csm");
  const [language, setLanguage] = useState<"html" | "javascript" | "json">("html");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [instruction, setInstruction] = useState("Dua tren nghiep vu khach hang, toi uu doan code da chon de de bao tri, dung semantic HTML va giu logic hien tai.");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [selectedCode, setSelectedCode] = useState("");
  const [streamText, setStreamText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [memoryStats, setMemoryStats] = useState<Record<string, unknown> | null>(null);
  const [hitsPreview, setHitsPreview] = useState<Array<{ sourceName: string; summary: string; score: number }>>([]);

  const streamBufferRef = useRef("");

  const editorExtensions = useMemo(() => {
    if (language === "json") {
      return [json()];
    }
    if (language === "javascript") {
      return [javascript({ jsx: false, typescript: false })];
    }
    return [
      html({
        autoCloseTags: true,
        matchClosingTags: true,
      }),
      javascript({ jsx: true }),
      json(),
    ];
  }, [language]);

  const uploaderProps: UploadProps = {
    multiple: true,
    accept: ".md,.markdown,text/markdown",
    showUploadList: true,
    beforeUpload: async (file) => {
      try {
        const res = await indexBusinessMarkdown({
          appId,
          file,
        });
        if (!res.success) {
          message.error(res.message || `Index that bai: ${file.name}`);
          return Upload.LIST_IGNORE;
        }
        message.success(`Da index: ${file.name}`);
        const stats = await getBusinessMemoryStats(appId);
        setMemoryStats(stats);
      } catch (err: any) {
        message.error(err?.message || `Khong the index file ${file.name}`);
      }
      return Upload.LIST_IGNORE;
    },
  };

  const refreshStats = async () => {
    const stats = await getBusinessMemoryStats(appId);
    setMemoryStats(stats);
  };

  const previewSearch = async () => {
    if (!instruction.trim()) {
      message.warning("Nhap yeu cau truoc khi preview memory");
      return;
    }
    const hits = await searchBusinessMemory({
      appId,
      q: `${instruction}\n${selectedCode || code}`,
      k: 5,
    });
    setHitsPreview(hits.map((h) => ({ sourceName: h.sourceName, summary: h.summary, score: h.score })));
  };

  const runOptimize = async () => {
    if (!instruction.trim()) {
      message.warning("Yeu cau khong duoc de trong");
      return;
    }
    setIsRunning(true);
    setStreamText("");
    streamBufferRef.current = "";

    try {
      await streamOptimizeWithBusinessMemory(
        {
          appId,
          instruction,
          selection: selectedCode,
          currentCode: code,
          language,
          model,
          topK: 6,
        },
        {
          onStatus: (status) => {
            const stage = String(status?.stage || "status");
            const msg = String(status?.message || "");
            if (msg) {
              setStreamText((prev) => `${prev}\n[${stage}] ${msg}`.trim());
            }
          },
          onChunk: (_chunk, fullText) => {
            streamBufferRef.current = fullText;
            setStreamText(fullText);
          },
          onComplete: (payload) => {
            const completeText = String(payload?.text || streamBufferRef.current || "");
            const optimized = extractOptimizedCodeFromResponse(completeText);
            if (optimized) {
              setCode(optimized);
              message.success("Da ap dung ket qua toi uu vao editor");
            } else {
              message.info("Khong parse duoc optimizedCode JSON. Da giu nguyen editor.");
            }
          },
          onError: (err) => {
            message.error(err || "Stream loi");
          },
        },
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="AI-Assistant Engine | Business Memory Loader">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space wrap>
            <Input
              style={{ width: 220 }}
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="appId"
            />
            <Select
              style={{ width: 170 }}
              value={language}
              onChange={(v) => setLanguage(v)}
              options={[
                { label: "HTML", value: "html" },
                { label: "JavaScript", value: "javascript" },
                { label: "JSON", value: "json" },
              ]}
            />
            <Select
              style={{ width: 220 }}
              value={model}
              onChange={setModel}
              options={[
                { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
                { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
                { label: "Local Qwen/DeepSeek", value: "local-qwen" },
              ]}
            />
            <Button onClick={refreshStats}>Refresh Memory Stats</Button>
            <Button onClick={previewSearch}>Preview Retrieval</Button>
            <Button type="primary" loading={isRunning} onClick={runOptimize}>Optimize Selection</Button>
          </Space>

          <Upload.Dragger {...uploaderProps}>
            <p style={{ margin: 0 }}>
              Nap file nghiep vu .md/.markdown vao Lucene Vector Memory
            </p>
          </Upload.Dragger>

          {memoryStats && (
            <Alert
              type="info"
              showIcon
              message={`Memory docs: ${String(memoryStats.documents || 0)} | sources: ${Array.isArray(memoryStats.sources) ? memoryStats.sources.length : 0}`}
              description={<Typography.Text type="secondary">{String(memoryStats.indexPath || "")}</Typography.Text>}
            />
          )}

          {hitsPreview.length > 0 && (
            <Card size="small" title="Top retrieved business memories">
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {hitsPreview.map((hit, idx) => (
                  <div key={`${hit.sourceName}_${idx}`}>
                    <Tag color="blue">{hit.sourceName}</Tag>
                    <Tag>{Number(hit.score || 0).toFixed(3)}</Tag>
                    <Typography.Text>{hit.summary}</Typography.Text>
                  </div>
                ))}
              </Space>
            </Card>
          )}

          <Input.TextArea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="Mo ta yeu cau toi uu code theo nghiep vu khach hang"
          />

          <Alert
            type="warning"
            showIcon
            message="Smart Selection"
            description={selectedCode ? `Dang chon ${selectedCode.length} ky tu trong editor` : "Chua co doan boi den. He thong se dung toan bo editor."}
          />

          <CodeMirror
            value={code}
            height="420px"
            extensions={editorExtensions}
            theme={theme === "dark" ? vscodeDark : vscodeLight}
            onChange={(value) => setCode(value)}
            onUpdate={(vu) => {
              const state = vu.state;
              const main = state.selection.main;
              if (!main || main.empty) {
                setSelectedCode("");
                return;
              }
              const selected = state.sliceDoc(main.from, main.to);
              setSelectedCode(String(selected || ""));
            }}
          />

          <Card size="small" title="Streaming result">
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 220, overflow: "auto" }}>{streamText}</pre>
          </Card>
        </Space>
      </Card>
    </Space>
  );
}
