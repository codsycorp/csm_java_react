import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Select, Space, Button, message, Tooltip } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import type { TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";
import { csmDecrypt, csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { useAuthStore } from "#src/store/auth";
import CodeMirror from "#src/components/editor/CodeMirrorWithAiAssistant";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";

// TRIGGER_OPTIONS sẽ được tạo bên trong component để dùng t

const MODE_OPTIONS = [
  { label: "JavaScript", value: "javascript" },
  { label: "HTML", value: "html" },
  { label: "XML", value: "xml" },
  { label: "CSS", value: "css" },
  { label: "Python", value: "python" },
  { label: "SQL", value: "sql" },
];

const getLanguageExtension = (mode: string) => {
  switch (mode) {
    case "html": return html();
    case "css": return css();
    case "python": return python();
    case "sql": return sql();
    case "xml": return xml();
    case "javascript":
    default:
      return javascript();
  }
};

const decodeTriggerCode = (raw: any): string => {
  if (raw == null) return "";
  if (typeof raw !== "string") return String(raw);

  // Old URL-encoded data
  if (raw.includes("%")) {
    try {
      return decodeURIComponent(raw);
    } catch {
      // fall through
    }
  }

  try {
    const dec = csmDecrypt(raw);
    if (dec && typeof dec === "string") return dec;
  } catch {
    // ignore
  }

  return raw;
};

const encodeTriggerCode = (plain: string): string => {
  if (!plain) return "";
  try {
    return csmEncrypt(String(plain));
  } catch {
    return String(plain);
  }
};

interface TriggerEditorProps {
  value?: TriggerConfig | Record<string, any>;
  onChange?: (next: TriggerConfig | Record<string, any>) => void;
}

export function TriggerEditor({ value, onChange }: TriggerEditorProps) {
  const { t } = useTranslation();
  const TRIGGER_OPTIONS = [
    { label: t('system.menu.trigger.datacolumntemplate'), value: "datacolumntemplate" },
    { label: t('system.menu.trigger.datarowtemplate'), value: "datarowtemplate" },
    { label: t('system.menu.trigger.filter'), value: "filter" },
    { label: t('system.menu.trigger.update'), value: "update" },
    { label: t('system.menu.trigger.barcode'), value: "barcode" },
    { label: t('system.menu.trigger.load_db'), value: "load_db" },
    { label: t('system.menu.trigger.report_db'), value: "report_db" },
    { label: t('system.menu.trigger.update_db'), value: "update_db" },
    { label: t('system.menu.trigger.delete_db'), value: "delete_db" },
  ];
  const [selectTrigger, setSelectTrigger] = useState<string>("load_db");
  const [codeMode, setCodeMode] = useState<string>("javascript");
  const [trigger, setTrigger] = useState<Record<string, any>>({});

  // Khởi tạo trigger từ value
  useEffect(() => {
    if (value && typeof value === "object") {
      setTrigger(value);
    }
  }, [value]);

  const currentCode = decodeTriggerCode(trigger[selectTrigger] || "");

  const handleCodeChange = (val: string) => {
    const nextTrigger = { ...trigger, [selectTrigger]: encodeTriggerCode(val) };
    setTrigger(nextTrigger);
    onChange?.(nextTrigger);
  };

  const saveTrigger = () => {
    if (!selectTrigger) return;
    onChange?.(trigger);
    message.success(`Đã lưu: ${selectTrigger}`);
  };

  const handleAISuggestion = async () => {
    const code = currentCode.trim();
    if (!code) {
      message.warning("Hãy nhập code trước!");
      return;
    }

    const langMap: Record<string, string> = {
      javascript: "JavaScript",
      python: "Python",
      html: "HTML",
      css: "CSS",
      xml: "XML",
      sql: "SQL",
    };
    const language = langMap[codeMode] || "Plain Text";
    const authState = useAuthStore.getState();
    const token = authState.token ?? "";
    const refreshToken = authState.refreshToken ?? "";
    const csrfToken = authState.csrfToken
      || (typeof document !== "undefined" ? decodeURIComponent(document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/)?.[1] || "") : "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["csm-token"] = token;
    }
    if (refreshToken) {
      headers["X-Refresh-Token"] = refreshToken;
    }
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/ai-code-stream`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          appId: "trigger_editor",
          message: `Hoàn thành và cải thiện đoạn mã sau bằng ${language} và chỉ trả về code, không giải thích:\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\``,
          flowType: "code_editor",
          taskType: "code_assistant",
          currentCode: code,
          language: codeMode,
          contextType: "code",
          responseMode: "edit",
        }),
      });

      if (!response.ok || !response.body) {
        message.error("Không gọi được AI nội bộ");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const evt = JSON.parse(json) as { stage?: string; chunk?: string; fullResponse?: string; message?: string };
            if (evt.stage === "streaming" && evt.chunk) {
              fullResponse += evt.chunk;
            } else if (evt.stage === "complete" && evt.fullResponse) {
              fullResponse = evt.fullResponse;
            } else if (evt.stage === "error") {
              message.error(evt.message || "AI trả về lỗi");
              return;
            }
          } catch {
            // Ignore parse failures for partial SSE lines.
          }
        }
      }

      let aiSuggestion = fullResponse.trim() || "Không có gợi ý.";
      const codeMatch = aiSuggestion.match(/```(?:\w+)?\n([\s\S]+?)\n```/);
      if (codeMatch) {
        aiSuggestion = codeMatch[1];
      }

      handleCodeChange(aiSuggestion);
      message.success("Đã nhận gợi ý từ AI");
    } catch (err) {
      message.error("Lỗi gọi AI nội bộ: " + String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {/* Trigger selector and Mode selector */}
      <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
        <Space wrap>
          <label style={{ fontWeight: 500, minWidth: 100 }}>Chọn trigger:</label>
          <Select
            value={selectTrigger}
            onChange={setSelectTrigger}
            options={TRIGGER_OPTIONS}
            style={{ width: 300 }}
          />
        </Space>
        <Space wrap>
          <label style={{ fontWeight: 500, minWidth: 50 }}>Ngôn ngữ:</label>
          <Select
            value={codeMode}
            onChange={setCodeMode}
            options={MODE_OPTIONS}
            style={{ width: 150 }}
          />
        </Space>
      </Space>

      {/* Save and AI Suggestion buttons */}
      <Space wrap>
        <Tooltip title="Ctrl/Cmd+S để lưu">
          <Button type="primary" onClick={saveTrigger}>
            Lưu
          </Button>
        </Tooltip>
        <Tooltip title="Gợi ý AI dựa trên code hiện tại">
          <Button 
            icon={<CopyOutlined />}
            onClick={handleAISuggestion}
          >
            AI Gợi ý
          </Button>
        </Tooltip>
      </Space>

      {/* CodeMirror container */}
      <div style={{ border: "1px solid var(--ant-colorBorder)", borderRadius: 4, overflow: "hidden", width: "100%" }}>
        <CodeMirror
          value={currentCode}
          height="400px"
          width="100%"
          theme={vscodeDark}
          extensions={[getLanguageExtension(codeMode)]}
          onChange={handleCodeChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            autocompletion: true,
            bracketMatching: true,
            closeBrackets: true,
          }}
        />
      </div>
    </div>
  );
}

export default TriggerEditor;
