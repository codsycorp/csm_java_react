import React, { useState } from "react";
import { Button, Modal, Table, Input, Select, Switch, Space, Popconfirm, Form, InputNumber, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, CodeOutlined } from "@ant-design/icons";
import CodeMirror from '#src/components/editor/CodeMirrorWithAiAssistant';
import { javascript } from '@codemirror/lang-javascript';

const fTypeOptions = [
  { value: "ed", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "DateTime" },
  { value: "time", label: "Time" },
  { value: "cbo", label: "Select" },
  { value: "bool", label: "Switch" },
  { value: "textarea", label: "Textarea" },
  { value: "password", label: "Password" },
  { value: "image", label: "Image" },
  { value: "album", label: "Album (Image/Video)" },
  { value: "image_inline", label: "Image (Inline Upload)" },
  { value: "album_inline", label: "Album (Inline Upload)" },
  { value: "video", label: "Video" },
  { value: "video_inline", label: "Video (Inline Upload)" },
  { value: "album_video_inline", label: "Album Video (Inline Upload)" },
];

const defaultField = {
  f_name: "",
  f_header: "",
  f_show: 1,
  f_stt: 1,
  f_types: "ed",
  f_cbo_query: "",
  f_align: "left",
  width: 120,
  permission: "", // quyền
  group: "",      // nhóm/section
  show_if: "",    // trigger điều kiện hiển thị
  validate: ""    // trigger validate
};

export default function DynamicConfigBuilder({
  value,
  onChange,
  visible,
  onClose,
}: {
  value?: any;
  onChange?: (v: any) => void;
  visible: boolean;
  onClose: () => void;
}): JSX.Element {
  const [config, setConfig] = useState<any>(value || {
    id: "",
    label: "",
    table_name: "",
    table: [],
    trigger: {},
    g_readonly: false,
    table_pagesize: 20,
  });

  // Đồng bộ khi prop value thay đổi từ ngoài vào
  React.useEffect(() => {
    if (value) setConfig(value);
  }, [value]);
  const [editing, setEditing] = useState<any | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [fieldModal, setFieldModal] = useState(false);
  const [form] = Form.useForm();

  // Field CRUD
  const openEdit = (field: any, idx: number) => {
    setEditing(field);
    setEditIdx(idx);
    setFieldModal(true);
    form.setFieldsValue(field);
  };
  const openAdd = () => {
    setEditing({ ...defaultField, f_stt: (config.table?.length || 0) + 1 });
    setEditIdx(null);
    setFieldModal(true);
    form.resetFields();
  };
  const saveField = () => {
    form.validateFields().then((values) => {
      let table = [...(config.table || [])];
      if (editIdx != null) table[editIdx] = values;
      else table.push(values);
      setConfig({ ...config, table });
      setFieldModal(false);
      setEditing(null);
      setEditIdx(null);
      onChange?.({ ...config, table });
    });
  };
  const deleteField = (idx: number) => {
    const table = [...(config.table || [])];
    table.splice(idx, 1);
    setConfig({ ...config, table });
    onChange?.({ ...config, table });
  };

  // Import/Export
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dynamicConfig.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const obj = JSON.parse(evt.target?.result as string);
        setConfig(obj);
        onChange?.(obj);
      } catch {}
    };
    reader.readAsText(file);
  };

  // Trigger code (simple textarea, can replace with CodeMirror/Monaco)
  const handleTriggerChange = (k: string, v: string) => {
    setConfig((prev: any) => {
      const trigger = { ...prev.trigger, [k]: v };
      const next = { ...prev, trigger };
      onChange?.(next);
      return next;
    });
  };

  // Global config change
  const handleGlobalChange = (k: string, v: any) => {
    setConfig((prev: any) => {
      const next = { ...prev, [k]: v };
      onChange?.(next);
      return next;
    });
  };

  return (
    <>
      {/* Main Config Modal */}
      <Modal
        visible={visible}
        onCancel={onClose}
        onOk={onClose}
        width={900}
        title="Cấu hình động (UI Builder)"
        footer={null}
      >
        <div>
          <Space style={{ marginBottom: 16 }}>
            <Button icon={<PlusOutlined />} onClick={openAdd}>Thêm trường</Button>
            <Button icon={<ImportOutlined />}>
              <label style={{ cursor: "pointer", margin: 0 }}>
                Import
                <input type="file" accept="application/json" style={{ display: "none" }} onChange={handleImport} />
              </label>
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              Export
            </Button>
          </Space>
          <Table
            dataSource={config.table}
            rowKey="f_name"
            size="small"
            pagination={false}
            columns={[
              { title: "STT", dataIndex: "f_stt", width: 60 },
              { title: "Tên trường", dataIndex: "f_name", width: 120 },
              { title: "Tiêu đề", dataIndex: "f_header", width: 120 },
              {
                title: "Loại",
                dataIndex: "f_types",
                width: 100,
                render: (v: any) => fTypeOptions.find((o) => o.value === v)?.label || v
              },
              {
                title: "Hiện",
                dataIndex: "f_show",
                width: 60,
                render: (v: any) => (v ? "✔" : "")
              },
              { title: "Align", dataIndex: "f_align", width: 80 },
              { title: "Width", dataIndex: "width", width: 80 },
              {
                title: "Thao tác",
                key: "action",
                width: 120,
                render: (_: any, r: any, idx: number) => (
                  <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(r, idx)} />
                    <Popconfirm title="Xóa trường này?" onConfirm={() => deleteField(idx)}>
                      <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                  </Space>
                )
              }
            ]}
            scroll={{ x: 700, y: 200 }}
          />
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="ID" style={{ display: "inline-block", width: 120 }}>
              <Input value={config.id} onChange={e => handleGlobalChange("id", e.target.value)} />
            </Form.Item>
            <Form.Item label="Tên bảng" style={{ display: "inline-block", width: 180, marginLeft: 8 }}>
              <Input value={config.table_name} onChange={e => handleGlobalChange("table_name", e.target.value)} />
            </Form.Item>
            <Form.Item label="Label" style={{ display: "inline-block", width: 180, marginLeft: 8 }}>
              <Input value={config.label} onChange={e => handleGlobalChange("label", e.target.value)} />
            </Form.Item>
            <Form.Item label="Readonly" style={{ display: "inline-block", width: 120, marginLeft: 8 }}>
              <Switch checked={!!config.g_readonly} onChange={v => handleGlobalChange("g_readonly", v)} />
            </Form.Item>
            <Form.Item label="Page size" style={{ display: "inline-block", width: 120, marginLeft: 8 }}>
              <InputNumber min={1} value={config.table_pagesize} onChange={v => handleGlobalChange("table_pagesize", v)} />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 16 }}>
            <Space>
              <Tooltip title="JS code, return array">
                <span>Trigger: load_db</span>
              </Tooltip>
              <div style={{ width: 350 }}>
                <CodeMirror
                  value={config.trigger?.load_db || ""}
                  height="80px"
                  extensions={[javascript()]}
                  onChange={v => handleTriggerChange("load_db", v)}
                  placeholder="return db['table']?.rows || []"
                  basicSetup={{ lineNumbers: true, autocompletion: true }}
                />
              </div>
            </Space>
            <Space style={{ marginLeft: 16 }}>
              <Tooltip title="JS code, return boolean">
                <span>Trigger: filter</span>
              </Tooltip>
              <div style={{ width: 350 }}>
                <CodeMirror
                  value={config.trigger?.filter || ""}
                  height="80px"
                  extensions={[javascript()]}
                  onChange={v => handleTriggerChange("filter", v)}
                  placeholder="return obj.status === true"
                  basicSetup={{ lineNumbers: true, autocompletion: true }}
                />
              </div>
            </Space>
            <Space style={{ marginLeft: 16 }}>
              <Tooltip title="JS code, return columns">
                <span>Trigger: datacolumntemplate</span>
              </Tooltip>
              <div style={{ width: 350 }}>
                <CodeMirror
                  value={config.trigger?.datacolumntemplate || ""}
                  height="80px"
                  extensions={[javascript()]}
                  onChange={v => handleTriggerChange("datacolumntemplate", v)}
                  placeholder="return columns"
                  basicSetup={{ lineNumbers: true, autocompletion: true }}
                />
              </div>
            </Space>
          </div>
        </div>
      </Modal>
      <Modal
        open={fieldModal}
        onCancel={() => setFieldModal(false)}
        onOk={saveField}
        title={editIdx != null ? "Sửa trường" : "Thêm trường"}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="f_name" label="Tên trường" rules={[{ required: true }]}> <Input /> </Form.Item>
          <Form.Item name="f_header" label="Tiêu đề" rules={[{ required: true }]}> <Input /> </Form.Item>
          <Form.Item name="f_types" label="Loại" rules={[{ required: true }]}> 
            <Select options={fTypeOptions} />
          </Form.Item>
          <Form.Item name="f_show" label="Hiện" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="f_stt" label="STT"> <InputNumber min={1} /> </Form.Item>
          <Form.Item name="f_cbo_query" label="Query cho select"> <Input /> </Form.Item>
          <Form.Item name="f_align" label="Align"> <Select options={[{ value: "left" }, { value: "center" }, { value: "right" }]} /> </Form.Item>
          <Form.Item name="width" label="Width"> <InputNumber min={40} /> </Form.Item>
          <Form.Item name="permission" label="Quyền (role) cho trường">
            <Input placeholder="admin, user, ..." />
          </Form.Item>
          <Form.Item name="group" label="Nhóm/Section">
            <Input placeholder="Tên nhóm hoặc section" />
          </Form.Item>
          <Form.Item name="show_if" label="Trigger điều kiện hiển thị">
            <CodeMirror
              value={editing?.show_if || ""}
              height="60px"
              extensions={[javascript()]}
              onChange={v => form.setFieldsValue({ show_if: v })}
              placeholder="return obj.status === true"
              basicSetup={{ lineNumbers: true, autocompletion: true }}
            />
          </Form.Item>
          <Form.Item name="validate" label="Trigger validate">
            <CodeMirror
              value={editing?.validate || ""}
              height="60px"
              extensions={[javascript()]}
              onChange={v => form.setFieldsValue({ validate: v })}
              placeholder="return value.length > 0"
              basicSetup={{ lineNumbers: true, autocompletion: true }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
