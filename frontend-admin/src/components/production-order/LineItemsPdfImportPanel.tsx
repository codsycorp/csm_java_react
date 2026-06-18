import { useCallback, useMemo, useState } from "react";
import {
  Alert, Button, Card, Form, Input, Modal, Select, Space, Upload, message,
} from "antd";
import { FilePdfOutlined, RobotOutlined, ThunderboltOutlined, UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload";

import type { LiColumnDef, LiPrintConfig } from "./types";
import {
  type PrintDocKind,
  fileToPreviewDataUrls,
  generatePrintTriggerFromSample,
  getBuiltinPrintTriggerBody,
  suggestPrintConfig,
} from "./line-items-print-import";

export interface LineItemsPdfImportPanelProps {
  appId?: string;
  tableFields?: Array<{ f_name?: string; f_header?: string }>;
  lineColumns?: LiColumnDef[];
  triggerKey?: string;
  onApplyTrigger?: (key: string, body: string) => void;
  onApplyPrintConfig?: (cfg: LiPrintConfig) => void;
  editorMetadata?: Record<string, unknown>;
}

const DOC_KIND_OPTIONS: Array<{ value: PrintDocKind; label: string }> = [
  { value: "bao_gia", label: "Báo giá" },
  { value: "lenh_sx", label: "Lệnh SX nội bộ" },
  { value: "pxk", label: "LSX + PXK (ẩn giá)" },
  { value: "custom", label: "Tuỳ chỉnh" },
];

export default function LineItemsPdfImportPanel({
  appId,
  tableFields = [],
  lineColumns = [],
  triggerKey: triggerKeyProp,
  onApplyTrigger,
  onApplyPrintConfig,
  editorMetadata,
}: LineItemsPdfImportPanelProps) {
  const [docKind, setDocKind] = useState<PrintDocKind>("bao_gia");
  const [triggerKey, setTriggerKey] = useState(triggerKeyProp || "print_bao_gia");
  const [sampleNote, setSampleNote] = useState("");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [generatedCode, setGeneratedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fieldNames = useMemo(
    () => tableFields.map(f => String(f?.f_name ?? "").trim()).filter(Boolean),
    [tableFields],
  );

  const defaultKeyForKind = useMemo(() => {
    if (docKind === "lenh_sx") return "print_lenh_sx";
    if (docKind === "pxk") return "print_pxk";
    if (docKind === "bao_gia") return "print_bao_gia";
    return "print_custom";
  }, [docKind]);

  const handleDocKindChange = (k: PrintDocKind) => {
    setDocKind(k);
    if (triggerKey === defaultKeyForKind || triggerKey.startsWith("print_")) {
      setTriggerKey(k === "lenh_sx" ? "print_lenh_sx" : k === "pxk" ? "print_pxk" : k === "bao_gia" ? "print_bao_gia" : "print_custom");
    }
  };

  const handleUpload = useCallback(async (file: File) => {
    try {
      const urls = await fileToPreviewDataUrls(file, 2);
      setPreviewUrls(urls);
      message.success(`Đã đọc ${urls.length} trang mẫu`);
    } catch (e: any) {
      message.error(e?.message ?? String(e));
    }
    return false;
  }, []);

  const handleApplyBuiltin = () => {
    const body = getBuiltinPrintTriggerBody(docKind);
    if (!body) {
      message.warning("Không có mẫu built-in cho loại này");
      return;
    }
    const key = triggerKey.trim() || defaultKeyForKind;
    onApplyTrigger?.(key, body);
    onApplyPrintConfig?.(suggestPrintConfig(docKind, key) as LiPrintConfig);
    message.success(`Đã áp trigger "${key}" từ mẫu Phú Sơn`);
  };

  const handleGenerateAi = async () => {
    if (!previewUrls.length) {
      message.warning("Hãy tải lên file PDF hoặc ảnh mẫu trước");
      return;
    }
    const key = triggerKey.trim() || defaultKeyForKind;
    setLoading(true);
    try {
      const code = await generatePrintTriggerFromSample({
        appId,
        docKind,
        triggerKey: key,
        tableFields: fieldNames,
        lineColumns,
        sampleImages: previewUrls,
        sampleNote,
        editorMetadata,
      });
      setGeneratedCode(code);
      setPreviewOpen(true);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const builtin = getBuiltinPrintTriggerBody(docKind);
      const looksTruncated = /thiếu return HTML|không trả về trigger/i.test(msg);
      if (builtin && looksTruncated) {
        Modal.confirm({
          title: "AI chưa sinh đủ trigger in",
          content: `${msg}\n\nÁp mẫu Phú Sơn có sẵn (Báo giá / LSX / PXK) thay thế?`,
          okText: "Áp mẫu Phú Sơn",
          cancelText: "Đóng",
          onOk: () => {
            const key = triggerKey.trim() || defaultKeyForKind;
            onApplyTrigger?.(key, builtin);
            onApplyPrintConfig?.(suggestPrintConfig(docKind, key) as LiPrintConfig);
            message.success(`Đã áp trigger "${key}" từ mẫu Phú Sơn`);
          },
        });
      } else {
        message.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplyGenerated = () => {
    const key = triggerKey.trim() || defaultKeyForKind;
    if (!generatedCode.trim()) return;
    onApplyTrigger?.(key, generatedCode);
    onApplyPrintConfig?.(suggestPrintConfig(docKind, key) as LiPrintConfig);
    setPreviewOpen(false);
    message.success(`Đã áp trigger "${key}" — mở tab Trigger để kiểm tra và Lưu menu`);
  };

  return (
    <Card
      size="small"
      title="Import PDF / ảnh mẫu → trigger in"
      extra={<FilePdfOutlined />}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Quy trình: tải PDF mẫu → AI sinh trigger (hoặc dùng mẫu Phú Sơn) → áp vào tab Trigger → Lưu menu → xem trước trên form đơn hàng."
      />

      <Form layout="vertical" component={false}>
        <Space wrap style={{ width: "100%" }}>
          <Form.Item label="Loại chứng từ" style={{ minWidth: 200 }}>
            <Select
              value={docKind}
              options={DOC_KIND_OPTIONS}
              onChange={handleDocKindChange}
            />
          </Form.Item>
          <Form.Item label="trigger_key" style={{ minWidth: 200 }}>
            <Input
              value={triggerKey}
              onChange={e => setTriggerKey(e.target.value)}
              placeholder={defaultKeyForKind}
            />
          </Form.Item>
        </Space>

        <Form.Item label="Ghi chú cho AI (tuỳ chọn)">
          <Input.TextArea
            rows={2}
            value={sampleNote}
            onChange={e => setSampleNote(e.target.value)}
            placeholder="VD: Giữ đúng 5 ô chữ ký, ẩn cột đơn giá…"
          />
        </Form.Item>

        <Upload
          accept=".pdf,image/*"
          maxCount={1}
          beforeUpload={handleUpload}
          showUploadList={false}
          fileList={[] as UploadFile[]}
        >
          <Button icon={<UploadOutlined />}>Chọn PDF hoặc ảnh mẫu</Button>
        </Upload>

        {previewUrls.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {previewUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Trang ${i + 1}`}
                style={{ maxWidth: 200, maxHeight: 280, border: "1px solid #d9d9d9" }}
              />
            ))}
          </div>
        )}

        <Space wrap style={{ marginTop: 16 }}>
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={loading}
            onClick={handleGenerateAi}
          >
            AI sinh trigger từ mẫu
          </Button>
          <Button icon={<ThunderboltOutlined />} onClick={handleApplyBuiltin}>
            Áp mẫu Phú Sơn (không AI)
          </Button>
        </Space>
      </Form>

      <Modal
        title={`Trigger sinh ra — ${triggerKey}`}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>Đóng</Button>,
          <Button key="apply" type="primary" onClick={handleApplyGenerated}>
            Áp vào tab Trigger
          </Button>,
        ]}
      >
        <Input.TextArea
          rows={22}
          value={generatedCode}
          onChange={e => setGeneratedCode(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Modal>
    </Card>
  );
}
