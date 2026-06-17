import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Select, Space, Button, message, Tooltip } from "antd";
import { CopyOutlined, LoadingOutlined, FileAddOutlined } from "@ant-design/icons";
import { AI_TIMEOUT_MS } from "#src/api/ai";
import type { TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";
import { csmDecrypt, csmEncrypt } from "#src/components/csm-grid/CsmCrypto";
import { request } from "#src/utils";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
import CodeMirror from "#src/components/editor/CodeMirrorWithAiAssistant";import { javascript } from "@codemirror/lang-javascript";
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

/** Static code templates for each trigger type. Used as seed for AI or as standalone snippet. */
function buildTriggerTemplate(triggerType: string, pName?: string): string {
  const p = pName || "ten_menu";
  switch (triggerType) {
    case "load_db":
      return `(function() {
  // Tải dữ liệu cho menu: ${p}
  var params = seft.getParams ? seft.getParams() : {};
  csmApi.loadData({ pName: "${p}", ...params }, function(data) {
    if (data && data.list) {
      seft.setData(data.list);
      seft.setTotal(data.total || data.list.length);
    }
  });
})();`;

    case "update_db":
      return `(function() {
  // Lưu dữ liệu cho menu: ${p}
  var data = seft.getEditRow ? seft.getEditRow() : seft.getRow();
  if (!data) { csmApi.message.warning("Không có dữ liệu để lưu!"); return; }
  csmApi.saveData({ pName: "${p}", data: data }, function(result) {
    if (result && result.success) {
      csmApi.message.success("Lưu thành công!");
      seft.reload && seft.reload();
    } else {
      csmApi.message.error("Lỗi: " + (result && result.message || "Không xác định"));
    }
  });
})();`;

    case "delete_db":
      return `(function() {
  // Xóa dữ liệu cho menu: ${p}
  var id = seft.getSelectedId ? seft.getSelectedId() : (seft.getRow() && seft.getRow().id);
  if (!id) { csmApi.message.warning("Chọn dòng cần xóa!"); return; }
  csmApi.confirm("Xác nhận xóa dòng này?", function() {
    csmApi.deleteData({ pName: "${p}", id: id }, function(result) {
      if (result && result.success) {
        csmApi.message.success("Đã xóa!");
        seft.reload && seft.reload();
      } else {
        csmApi.message.error("Lỗi xóa: " + (result && result.message || "Không xác định"));
      }
    });
  });
})();`;

    case "filter":
      return `(function() {
  // Lọc dữ liệu cho menu: ${p}
  var value = seft.getFilterValue ? seft.getFilterValue() : "";
  var field = seft.getActiveCol ? seft.getActiveCol() : "ten_cot";
  if (!value) { seft.clearFilter && seft.clearFilter(); return; }
  csmApi.filter({ pName: "${p}", field: field, value: value });
})();`;

    case "update":
      return `(function(row, col, value) {
  // Cập nhật giá trị ô trong menu: ${p}
  if (!row || !col) return;
  row[col] = value;
  seft.setRow && seft.setRow(row);
})();`;

    case "datacolumntemplate":
      return `(function(value, row, col) {
  // Template hiển thị cột cho menu: ${p}
  if (value == null || value === "") return "";
  return '<span class="csm-cell" title="' + value + '">' + value + '</span>';
})();`;

    case "datarowtemplate":
      return `(function(row) {
  // Template hiển thị dòng cho menu: ${p}
  if (!row) return "";
  return '<div class="csm-row" data-id="' + (row.id || "") + '"></div>';
})();`;

    case "barcode":
      return `(function(value) {
  // Xử lý quét barcode cho menu: ${p}
  var code = (value || "").trim();
  if (!code) return;
  csmApi.loadData({ pName: "${p}", barcode: code }, function(data) {
    var list = data && (data.list || data);
    if (list && list.length > 0) {
      seft.setRow && seft.setRow(list[0]);
      csmApi.message.success("Tìm thấy: " + code);
    } else {
      csmApi.message.warning("Không tìm thấy mã: " + code);
    }
  });
})();`;

    case "report_db":
      return `(function() {
  // Lấy dữ liệu báo cáo cho menu: ${p}
  var params = seft.getParams ? seft.getParams() : {};
  csmApi.loadData({ pName: "${p}", ...params, reportMode: true }, function(data) {
    if (data && data.list) {
      seft.setReportData ? seft.setReportData(data) : seft.setData(data.list);
    }
  });
})();`;

    default:
      return `(function() {\n  // Trigger: ${triggerType} cho menu: ${p}\n  // TODO: implement\n})();`;
  }
}

const AI_UNAVAILABLE_MARKERS = [
  "Local AI provider chưa sẵn sàng",
  "LOCAL_PROVIDER_UNAVAILABLE",
  "Local AI unavailable",
  "Local AI disabled",
  "native llama unavailable",
  "build with -tags llamacpp",
  "Model GGUF",
];

function isAiUnavailableResponse(text: string): boolean {
  return AI_UNAVAILABLE_MARKERS.some((m) => text.includes(m));
}

interface TriggerEditorProps {
  value?: TriggerConfig | Record<string, any>;
  onChange?: (next: TriggerConfig | Record<string, any>) => void;
  appId?: string;
  pName?: string;
  pType?: number;
  editorMetadata?: Record<string, unknown>;
  /** Thêm key vào dropdown (vd: print_*, auto_parse_*) */
  extraOptions?: Array<{ label: string; value: string }>;
}

export function TriggerEditor({ value, onChange, appId, pName, pType, editorMetadata, extraOptions = [] }: TriggerEditorProps) {
  const { t } = useTranslation();
  const TRIGGER_OPTIONS = [
    ...[
      { label: t('system.menu.trigger.datacolumntemplate'), value: "datacolumntemplate" },
      { label: t('system.menu.trigger.datarowtemplate'), value: "datarowtemplate" },
      { label: t('system.menu.trigger.filter'), value: "filter" },
      { label: t('system.menu.trigger.update'), value: "update" },
      { label: t('system.menu.trigger.barcode'), value: "barcode" },
      { label: t('system.menu.trigger.load_db'), value: "load_db" },
      { label: t('system.menu.trigger.report_db'), value: "report_db" },
      { label: t('system.menu.trigger.update_db'), value: "update_db" },
      { label: t('system.menu.trigger.delete_db'), value: "delete_db" },
    ],
    ...extraOptions.filter((opt) => opt?.value && !["datacolumntemplate", "datarowtemplate", "filter", "update", "barcode", "load_db", "report_db", "update_db", "delete_db"].includes(opt.value)),
  ];
  const [selectTrigger, setSelectTrigger] = useState<string>("load_db");
  const [codeMode, setCodeMode] = useState<string>("javascript");
  const [trigger, setTrigger] = useState<Record<string, any>>({});
  const [aiLoading, setAiLoading] = useState(false);

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

  /** Chèn mẫu code tĩnh cho trigger đang chọn — không cần AI, hoạt động offline. */
  const handleInsertTemplate = () => {
    const template = buildTriggerTemplate(selectTrigger, pName);
    handleCodeChange(template);
    message.success(`Đã tạo mẫu cho "${selectTrigger}"`);
  };

  /**
   * AI Gợi ý: nếu editor trống thì tự chèn mẫu trước rồi gọi AI cải thiện.
   * Dùng responseMode: "raw_code" để backend trả về code thuần (không phải JSON textEdits).
   * Nếu AI chưa sẵn sàng → giữ nguyên mẫu, không báo lỗi crash.
   */
  const handleAISuggestion = async () => {
    let code = currentCode.trim();
    if (!code) {
      code = buildTriggerTemplate(selectTrigger, pName);
      handleCodeChange(code);
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

    setAiLoading(true);
    try {
      const response = await request.post("ai-code-stream", {
        json: {
          appId: String(appId || "trigger_editor").trim() || "trigger_editor",
          message: `Cải thiện và hoàn chỉnh trigger "${selectTrigger}" cho menu "${pName || "csm"}" bằng ${language}. Chỉ trả về code thuần, không giải thích:\n\n${code}`,
          flowType: "code_editor",
          taskType: "code_assistant",
          currentCode: code,
          language: codeMode,
          contextType: "code",
          responseMode: "raw_code",
          pName,
          pType,
          editorMetadata: {
            ...(editorMetadata || {}),
            source: "TriggerEditor",
            activeSection: "trigger_editor",
            activeTriggerKey: selectTrigger,
            triggerLanguage: codeMode,
          },
        },
        timeout: AI_TIMEOUT_MS,
        throwHttpErrors: false,
      });

      if (!response.ok || !response.body) {
        message.warning("Không gọi được AI nội bộ — giữ nguyên mẫu.");
        return;
      }

      let completed = false;
      let fullResponse = "";

      await consumeSseStream(response, {
        onEvent: (evt) => {
          const payload = (evt.payload && typeof evt.payload === "object")
            ? (evt.payload as Record<string, unknown>)
            : null;
          if (!payload) return;
          const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
            onChunk: (_chunk, accumulated) => { fullResponse = accumulated; },
            onComplete: (p) => {
              if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
              completed = true;
            },
            onError: (msg) => { message.error(msg || "AI trả về lỗi"); },
          });
          fullResponse = result.accumulated;
          if (result.completed) completed = true;
        },
      });

      if (!completed && !fullResponse.trim()) {
        message.warning("Luồng AI kết thúc sớm — giữ nguyên mẫu.");
        return;
      }

      const aiText = fullResponse.trim();
      if (!aiText || isAiUnavailableResponse(aiText)) {
        message.warning("AI nội bộ chưa sẵn sàng — giữ nguyên mẫu. Cần build -tags llamacpp.");
        return;
      }

      // Strip markdown fences if model added them despite instructions
      let aiCode = aiText;
      const fenceMatch = aiCode.match(/^```(?:\w+)?\n([\s\S]+?)\n```$/m);
      if (fenceMatch) aiCode = fenceMatch[1];

      handleCodeChange(aiCode);
      message.success("Đã nhận gợi ý từ AI");
    } catch (err) {
      message.warning("Lỗi gọi AI nội bộ — giữ nguyên mẫu: " + String(err));
    } finally {
      setAiLoading(false);
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
        <Tooltip title="Chèn mẫu code sẵn cho trigger đang chọn (không cần AI)">
          <Button icon={<FileAddOutlined />} onClick={handleInsertTemplate}>
            Sinh từ mẫu
          </Button>
        </Tooltip>
        <Tooltip title={aiLoading ? "Đang chờ AI..." : "AI cải thiện code (tự sinh mẫu nếu editor trống)"}>
          <Button
            icon={aiLoading ? <LoadingOutlined /> : <CopyOutlined />}
            onClick={handleAISuggestion}
            disabled={aiLoading}
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
