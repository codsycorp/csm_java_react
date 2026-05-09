import { useState } from "react";
import { Button, Space, Table, Tag, Modal, Form, Input, InputNumber, Select, Switch, Row, Col, message, Card, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, CopyOutlined, DeleteOutlined, ImportOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import type { TableField } from "#src/components/csm-grid/CsmDynamicGrid";
import CodeMirror from "#src/components/editor/CodeMirrorWithAiAssistant";
import { useTranslation } from "react-i18next";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";

interface FieldConfigEditorProps {
  value?: TableField[];
  onChange?: (next: TableField[]) => void;
  appId?: string;
  aiAssistantPName?: string;
  aiAssistantPType?: number;
  aiAssistantEditorMetadata?: Record<string, unknown>;
}

const TYPE_OPTIONS = [
  "ed",
  "price",
  "co",
  "cp",
  "coro",
  "cntr",
  "ch",
  "ra",
  "ro",
  "roprice",
  "ron",
  "link",
  "btn",
  "img",
  "album",
  "file",
  "date",
  "time",
  "datetime",
  "nummeric",
  "numchu",
  "edt",
  "memo",
  "html",
  "codejs",
  "code",
  "password",
];

const TYPE_LABEL_MAP: Record<string, string> = {
  album: "album (media: image/video)",
};

const getTypeLabel = (type: string) => TYPE_LABEL_MAP[type] || type;

const toFlag = (v: any) => (v === undefined || v === null ? v : v ? 1 : 0);

const MODE_OPTIONS = [
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "HTML", value: "html" },
  { label: "XML", value: "xml" },
  { label: "CSS", value: "css" },
  { label: "Python", value: "python" },
  { label: "SQL", value: "sql" },
];

const getLanguageExtension = (mode: string) => {
  switch (mode) {
    case "json": return json();
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

function CodeArea({
  value,
  onChange,
  placeholder,
  defaultMode = "javascript",
  aiAssistantAppId,
  aiAssistantPName,
  aiAssistantPType,
  aiAssistantEditorMetadata,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  defaultMode?: string;
  aiAssistantAppId?: string;
  aiAssistantPName?: string;
  aiAssistantPType?: number;
  aiAssistantEditorMetadata?: Record<string, unknown>;
}) {
  const [codeMode, setCodeMode] = useState<string>(defaultMode);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontWeight: 500, minWidth: 60 }}>Ngôn ngữ:</label>
        <Select
          value={codeMode}
          onChange={setCodeMode}
          options={MODE_OPTIONS}
          style={{ width: 120 }}
          size="small"
        />
      </div>
      <div style={{ border: "1px solid var(--ant-colorBorder)", borderRadius: 4, overflow: "hidden" }}>
        <CodeMirror
          value={value || ""}
          height="200px"
          theme={vscodeDark}
          extensions={[getLanguageExtension(codeMode)]}
          aiAssistantAppId={aiAssistantAppId}
          aiAssistantLanguage={codeMode as any}
          aiAssistantContextType="code"
          aiAssistantCurrentCode={value || ""}
          aiAssistantPName={aiAssistantPName}
          aiAssistantPType={aiAssistantPType}
          aiAssistantEditorMetadata={aiAssistantEditorMetadata}
          onChange={(val) => onChange?.(val)}
          placeholder={placeholder}
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

export function FieldConfigEditor({ value, onChange, appId, aiAssistantPName, aiAssistantPType, aiAssistantEditorMetadata }: FieldConfigEditorProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<TableField | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<TableField>();
  const [pasteFieldsText, setPasteFieldsText] = useState<string>("");
  const [showPasteModal, setShowPasteModal] = useState(false);

  const data = value || [];

  // Helper: Sinh tên duy nhất cho copy hoặc trường mới
  const generateUniqueName = (baseName: string, existingNames: Set<string>): string => {
    let newName = `${baseName}_copy`;
    let counter = 1;
    while (existingNames.has(newName)) {
      newName = `${baseName}_copy${counter}`;
      counter++;
    }
    return newName;
  };

  const handlePasteFields = () => {
    if (!pasteFieldsText.trim()) {
      message.warning(t("form.required") || "Vui lòng nhập dữ liệu");
      return;
    }

    try {
      // Parse CSV dạng "field1, field2, field3"
      const fieldNames = pasteFieldsText
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      if (fieldNames.length === 0) {
        message.warning("Không có trường nào được phân tích");
        return;
      }

      const existingNames = new Set(data.map((f) => f.f_name));
      const newFields: TableField[] = [];

      fieldNames.forEach((fieldName) => {
        if (!existingNames.has(fieldName)) {
          newFields.push({
            f_stt: undefined, // Sẽ được chuẩn hóa tự động
            f_name: fieldName,
            f_header: fieldName,
            f_types: "ed",
            f_show: 1,
            f_required: 0,
            f_search: 0,
            f_report: 0,
            f_fixcol: 0,
            f_pkid: 0,
          } as TableField);
          existingNames.add(fieldName);
        }
      });

      if (newFields.length === 0) {
        message.info("Tất cả các trường đã tồn tại");
        return;
      }

      // Chuẩn hóa STT tự động
      const nextData = [...data, ...newFields];
      const normalized = normalizeSTT(nextData);
      console.log('[FieldConfigEditor] Paste fields:', newFields.map(f => f.f_name).join(', '), 'Total fields:', normalized.length);
      onChange?.(normalized);
      message.success(`Đã thêm ${newFields.length} trường mới`);
      setPasteFieldsText("");
      setShowPasteModal(false);
    } catch (err) {
      message.error("Lỗi phân tích dữ liệu: " + (err as any).message);
    }
  };

  const openEdit = (record?: TableField) => {
    setEditing(record || null);
    setOpen(true);
    setTimeout(() => {
      form.setFieldsValue(record || { f_show: 1, f_required: 0, f_stt: (data.length || 0) + 1, f_types: "ed" });
    }, 0);
  };

  // Helper: Chuẩn hóa STT liên tục từ 1 cho tất cả trường
  const normalizeSTT = (fields: TableField[]): TableField[] => {
    return fields
      .sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0))
      .map((f, idx) => ({
        ...f,
        f_stt: idx + 1
      }));
  };

  const handleSave = async () => {
    const vals = await form.validateFields();
    const next: TableField = {
      ...editing,
      ...vals,
      f_show: toFlag(vals.f_show),
      f_required: toFlag((vals as any).f_required),
      f_search: toFlag(vals.f_search),
      f_report: toFlag(vals.f_report),
      f_fixcol: toFlag(vals.f_fixcol),
      f_pkid: toFlag(vals.f_pkid),
    } as TableField;
    
    let nextData: TableField[] = [];
    
    if (editing) {
      // Kiểm tra tên trường có bị thay đổi hay không
      if (editing.f_name !== next.f_name) {
        // Kiểm tra xem tên mới đã tồn tại chưa
        const existingNames = data.map(r => r.f_name).filter(name => name !== editing.f_name);
        if (existingNames.includes(next.f_name)) {
          message.error(`Tên trường "${next.f_name}" đã tồn tại`);
          return;
        }
      }
      // Cập nhật trường hiện tại (không thay đổi STT khi sửa)
      nextData = data.map(r => (r.f_name === editing.f_name ? next : r));
    } else {
      // Kiểm tra tên trường mới không trùng
      const existingNames = new Set(data.map(r => r.f_name));
      if (existingNames.has(next.f_name)) {
        message.error(`Tên trường "${next.f_name}" đã tồn tại`);
        return;
      }
      // Thêm trường mới vào cuối
      nextData = [...data, next];
    }
    
    // Chuẩn hóa STT tự động cho tất cả trường
    const normalized = normalizeSTT(nextData);
    console.log('[FieldConfigEditor] Save field:', editing?.f_name || 'new', 'Total fields:', normalized.length);
    onChange?.(normalized);
    setOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleDelete = (f_name: string) => {
    const remaining = data.filter(r => r.f_name !== f_name);
    // Chuẩn hóa STT tự động
    const normalized = normalizeSTT(remaining);
    console.log('[FieldConfigEditor] Delete field:', f_name, 'Remaining:', normalized.length);
    onChange?.(normalized);
    message.success(`Đã xoá trường "${f_name}"`);
  };

  // Hàm di chuyển trường lên (dựa trên STT, không phải index)
  const handleMoveUp = (currentStt: number) => {
    const sorted = [...data].sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0));
    const currentIdx = sorted.findIndex(f => Number(f.f_stt) === currentStt);
    if (currentIdx <= 0) return;
    
    // Swap với field trước đó
    [sorted[currentIdx - 1], sorted[currentIdx]] = [sorted[currentIdx], sorted[currentIdx - 1]];
    
    // Chuẩn hóa STT
    const normalized = sorted.map((f, idx) => ({
      ...f,
      f_stt: idx + 1
    }));
    console.log('[FieldConfigEditor] Move up field:', normalized[currentIdx - 1].f_name, 'to position', currentIdx);
    onChange?.(normalized);
  };

  // Hàm di chuyển trường xuống (dựa trên STT, không phải index)
  const handleMoveDown = (currentStt: number) => {
    const sorted = [...data].sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0));
    const currentIdx = sorted.findIndex(f => Number(f.f_stt) === currentStt);
    if (currentIdx >= sorted.length - 1) return;
    
    // Swap với field tiếp theo
    [sorted[currentIdx], sorted[currentIdx + 1]] = [sorted[currentIdx + 1], sorted[currentIdx]];
    
    // Chuẩn hóa STT
    const normalized = sorted.map((f, idx) => ({
      ...f,
      f_stt: idx + 1
    }));
    console.log('[FieldConfigEditor] Move down field:', normalized[currentIdx + 1].f_name, 'to position', currentIdx + 2);
    onChange?.(normalized);
  };

  // Hàm tự động chuẩn hóa STT
  const normalizeFieldsSTT = () => {
    const normalized = normalizeSTT(data);
    onChange?.(normalized);
    message.success('Đã chuẩn hóa STT cho tất cả trường');
  };

  const columns = [
    // ...existing code...
    {
      title: t('system.menu.field.stt'),
      dataIndex: "f_stt",
      width: 60,
      sorter: (a: TableField, b: TableField) => Number(a.f_stt || 0) - Number(b.f_stt || 0),
    },
    {
      title: t('system.menu.field.name'),
      dataIndex: "f_name",
      width: 140,
    },
    {
      title: t('system.menu.field.header'),
      dataIndex: "f_header",
      width: 160,
    },
    {
      title: t('system.menu.field.type'),
      dataIndex: "f_types",
      width: 110,
      render: (val: string) => <Tag>{getTypeLabel(val)}</Tag>,
    },
    {
      title: t('system.menu.field.grid'),
      dataIndex: "f_grid",
      width: 120,
      ellipsis: true,
    },
    {
      title: t('system.menu.field.cbo_query'),
      dataIndex: "f_cbo_query",
      ellipsis: true,
    },
    {
      title: t('system.menu.field.pk'),
      dataIndex: "f_pkid",
      width: 60,
      render: (v: any) => (Number(v) === 1 ? t('system.menu.field.yes') : ""),
    },
    {
      title: t('system.menu.field.search'),
      dataIndex: "f_search",
      width: 60,
      render: (v: any) => (Number(v) === 1 ? t('system.menu.field.yes') : ""),
    },
    {
      title: t('system.menu.field.report'),
      dataIndex: "f_report",
      width: 60,
      render: (v: any) => (Number(v) === 1 ? t('system.menu.field.yes') : ""),
    },
    {
      title: t('system.menu.field.sort'),
      dataIndex: "f_sort",
      width: 70,
    },
    {
      title: t('system.menu.field.group'),
      dataIndex: "f_group_index",
      width: 70,
    },
    {
      title: t('system.menu.field.dec'),
      dataIndex: "f_dec",
      width: 90,
    },
    {
      title: t('system.menu.field.width'),
      dataIndex: "f_width",
      width: 80,
    },
    {
      title: t('system.menu.field.show'),
      dataIndex: "f_show",
      width: 60,
      render: (v: any) => (Number(v) === 1 ? t('system.menu.field.yes') : t('system.menu.field.no')),
    },
    {
      title: "Bắt buộc",
      dataIndex: "f_required",
      width: 80,
      render: (v: any) => (Number(v) === 1 ? t('system.menu.field.yes') : t('system.menu.field.no')),
    },
    {
      title: t('system.menu.field.action'),
      width: 160,
      render: (_: any, record: TableField, index: number) => {
        const sorted = [...data].sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0));
        const currentStt = Number(record.f_stt || 0);
        const isFirst = currentStt === 1;
        const isLast = currentStt === sorted.length;
        const existingNames = new Set(data.map(f => f.f_name));
        
        return (
          <Space size="small">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                const uniqueName = generateUniqueName(record.f_name, existingNames);
                const cloned = { 
                  ...record, 
                  f_name: uniqueName,
                  f_header: `${record.f_header} (copy)`,
                  f_stt: undefined // Sẽ được chuẩn hóa tự động
                };
                const nextData = [...data, cloned];
                // Chuẩn hóa STT tự động
                const normalized = normalizeSTT(nextData);
                console.log('[FieldConfigEditor] Clone field:', cloned.f_name, 'Total fields:', normalized.length);
                onChange?.(normalized);
                message.success(`Đã nhân bản trường: ${uniqueName}`);
              }}
            />
            <Tooltip title="Di chuyển lên">
              <Button 
                size="small" 
                icon={<ArrowUpOutlined />} 
                disabled={isFirst}
                onClick={() => handleMoveUp(currentStt)} 
              />
            </Tooltip>
            <Tooltip title="Di chuyển xuống">
              <Button 
                size="small" 
                icon={<ArrowDownOutlined />} 
                disabled={isLast}
                onClick={() => handleMoveDown(currentStt)} 
              />
            </Tooltip>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.f_name)} />
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
          {t('system.menu.addField', 'Thêm trường')}
        </Button>
        <Button icon={<ImportOutlined />} onClick={() => setShowPasteModal(true)}>
          Dán trường từ CSV
        </Button>
        <Button onClick={normalizeFieldsSTT} title="Tự động cập nhật STT liên tục từ 1">
          ⚙️ Chuẩn hóa STT
        </Button>
      </Space>
      <Table
        key={`table-${data.length}`}
        size="small"
        rowKey="f_name"
        dataSource={[...data].sort((a, b) => Number(a.f_stt || 0) - Number(b.f_stt || 0))}
        columns={columns as any}
        pagination={false}
        scroll={{ x: true, y: 360 }}
      />

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        title={editing ? t('system.menu.editField', 'Sửa trường') : t('system.menu.addField', 'Thêm trường')}
        width={900}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="f_stt" label="STT" rules={[{ required: true }]}> 
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="f_header" label="Mô tả" rules={[{ required: true }]}> 
                <Input />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item name="f_name" label="Tên trường" rules={[{ required: true }]}> 
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="f_types" label="Loại data" rules={[{ required: true }]}> 
                <Select options={TYPE_OPTIONS.map(v => ({ label: getTypeLabel(v), value: v }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="f_align" label="Canh lề"> 
                <Select allowClear options={[{value:"left",label:"Trái"},{value:"center",label:"Giữa"},{value:"right",label:"Phải"}]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="f_width" label="Độ rộng"> 
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="f_group_index" label="Vị trí tạo nhóm"> 
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_dec" label="Số thập phân"> 
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_pkid" label="Là khóa chính" valuePropName="checked"> 
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_sort" label="Cách sắp xếp"> 
                <Select allowClear options={[{ label: "asc", value: "asc" }, { label: "desc", value: "desc" }]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="f_show" label="Hiện" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_required" label="Bắt buộc nhập" valuePropName="checked" initialValue={false}>
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_search" label="Tìm kiếm" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_report" label="Báo cáo" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="f_fixcol" label="Cố định cột" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="f_grid" label="Lưới chọn">
                <Input placeholder="Tên bảng lookup" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="f_grid_fields" label="Các cột trên lưới chọn">
                <Input placeholder="VD: ma,ten" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="f_cbo_query" label="Query cho combobox">
            <CodeArea
              placeholder='{"query":[],"options":[]}'
              defaultMode="json"
              aiAssistantAppId={appId}
              aiAssistantPName={aiAssistantPName}
              aiAssistantPType={aiAssistantPType}
              aiAssistantEditorMetadata={{
                ...(aiAssistantEditorMetadata || {}),
                activeSection: "combo_query",
                activeFieldName: String(form.getFieldValue("f_name") || editing?.f_name || "").trim(),
                activeFieldType: String(form.getFieldValue("f_types") || editing?.f_types || "").trim(),
              }}
            />
          </Form.Item>

          <Form.Item name="f_group_header_template" label="Hàm tạo Mẫu nhóm ở đầu">
            <CodeArea
              aiAssistantAppId={appId}
              aiAssistantPName={aiAssistantPName}
              aiAssistantPType={aiAssistantPType}
              aiAssistantEditorMetadata={{
                ...(aiAssistantEditorMetadata || {}),
                activeSection: "group_header_template",
                activeFieldName: String(form.getFieldValue("f_name") || editing?.f_name || "").trim(),
                activeFieldType: String(form.getFieldValue("f_types") || editing?.f_types || "").trim(),
              }}
            />
          </Form.Item>

          <Form.Item name="f_group_footer_template" label="Hàm tạo Mẫu nhóm ở cuối">
            <CodeArea
              aiAssistantAppId={appId}
              aiAssistantPName={aiAssistantPName}
              aiAssistantPType={aiAssistantPType}
              aiAssistantEditorMetadata={{
                ...(aiAssistantEditorMetadata || {}),
                activeSection: "group_footer_template",
                activeFieldName: String(form.getFieldValue("f_name") || editing?.f_name || "").trim(),
                activeFieldType: String(form.getFieldValue("f_types") || editing?.f_types || "").trim(),
              }}
            />
          </Form.Item>

          <Form.Item name="f_alert_query" label="Alert query / tính toán cảnh báo">
            <CodeArea
              placeholder="return ..."
              aiAssistantAppId={appId}
              aiAssistantPName={aiAssistantPName}
              aiAssistantPType={aiAssistantPType}
              aiAssistantEditorMetadata={{
                ...(aiAssistantEditorMetadata || {}),
                activeSection: "alert_query",
                activeFieldName: String(form.getFieldValue("f_name") || editing?.f_name || "").trim(),
                activeFieldType: String(form.getFieldValue("f_types") || editing?.f_types || "").trim(),
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={showPasteModal}
        onCancel={() => {
          setShowPasteModal(false);
          setPasteFieldsText("");
        }}
        onOk={handlePasteFields}
        title="Dán các trường từ CSV"
        width={600}
        okText="Thêm trường"
        cancelText="Hủy"
      >
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ant-colorTextSecondary)', marginBottom: 12 }}>
            Nhập tên các trường ngăn cách nhau bởi dấu phẩy (,). Ví dụ:
            <br />
            <code>id, name, email, phone, created_at</code>
          </div>
          <Form layout="vertical">
            <Form.Item label="Danh sách trường" required>
              <Input.TextArea
                rows={6}
                placeholder="Nhập tên các trường ngăn cách bởi dấu phẩy..."
                value={pasteFieldsText}
                onChange={(e) => setPasteFieldsText(e.target.value)}
              />
            </Form.Item>
          </Form>
        </Card>
      </Modal>
    </div>
  );
}

export default FieldConfigEditor;
