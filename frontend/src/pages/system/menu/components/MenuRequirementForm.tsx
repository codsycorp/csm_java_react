import { useState } from "react";
import { Modal, Form, Input, Select, Radio, Button, Space, Alert, Tag, Divider } from "antd";
import { useTranslation } from "react-i18next";
import type { MenuItemType } from "#src/api/system/menu";

const { TextArea } = Input;

type MenuType = 1 | 2 | 3 | 4;

interface MenuRequirementData {
  title: string;
  description: string;
  menuTypes: MenuType[];
  scope: "minimal" | "complete";
  tables?: string[];
  customNotes?: string;
}

interface MenuRequirementFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: MenuRequirementData, prompt: string) => void;
  loading?: boolean;
}

const MENU_TYPE_DESCRIPTIONS = {
  1: {
    name: "Dạng Bảng (Table Grid)",
    description: "Hiển thị & quản lý dữ liệu dạng bảng với CRUD operations",
    icon: "📊",
    examples: "Danh sách khách hàng, sản phẩm, nhân viên"
  },
  2: {
    name: "Master-Detail",
    description: "Dữ liệu phân cấp: Master + nhiều detail records",
    icon: "📑",
    examples: "Đơn hàng + Chi tiết SP, Phiếu nhập + Danh sách hàng"
  },
  3: {
    name: "Liên Kết Động",
    description: "Chuyển hướng tới URL hoặc trang khác",
    icon: "🔗",
    examples: "Link website, trang khác, dashboard ngoài"
  },
  4: {
    name: "Chạy Code Động",
    description: "Thực thi custom JavaScript (analytics, dashboard)",
    icon: "⚙️",
    examples: "Analytics, real-time monitor, custom dashboard"
  }
};

/**
 * Component để user nhập requirement và tạo prompt cho AI
 */
export function MenuRequirementForm({
  open,
  onClose,
  onSubmit,
  loading = false
}: MenuRequirementFormProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [selectedTypes, setSelectedTypes] = useState<MenuType[]>([1]);
  const [scope, setScope] = useState<"minimal" | "complete">("minimal");

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Build comprehensive prompt
      const prompt = buildMenuDesignPrompt(values, selectedTypes, scope);
      
      const data: MenuRequirementData = {
        title: values.title,
        description: values.description,
        menuTypes: selectedTypes,
        scope,
        tables: values.tables?.split("\n").filter(t => t.trim()),
        customNotes: values.customNotes
      };
      
      onSubmit(data, prompt);
    } catch (err) {
      console.error("Form validation failed:", err);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setSelectedTypes([1]);
    setScope("minimal");
  };

  return (
    <Modal
      title={t("system.menu.aiDesigner.requirementForm.title") || "Nhập Yêu Cầu Thiết Kế Menu"}
      open={open}
      onCancel={() => {
        onClose();
        handleReset();
      }}
      footer={[
        <Button key="reset" onClick={handleReset}>
          {t("common.reset", "Đặt lại")}
        </Button>,
        <Button key="close" onClick={onClose}>
          {t("common.close", "Đóng")}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleFormSubmit}
        >
          {t("common.submit", "Gửi")}
        </Button>
      ]}
      width={900}
      bodyStyle={{ maxHeight: "70vh", overflow: "auto" }}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        {/* Title */}
        <Form.Item
          name="title"
          label={t("system.menu.aiDesigner.projectName") || "Tên dự án / Module"}
          rules={[{ required: true, message: "Vui lòng nhập tên" }]}
        >
          <Input placeholder="Ví dụ: Quản lý bán hàng, Kho hàng, v.v" />
        </Form.Item>

        {/* Description */}
        <Form.Item
          name="description"
          label={t("system.menu.aiDesigner.requirement") || "Mô tả yêu cầu (ngắn gọn hoặc chi tiết)"}
          rules={[{ required: true, message: "Vui lòng nhập mô tả" }]}
        >
          <TextArea
            placeholder={`Ví dụ: Cần quản lý khách hàng (tên, email, SĐT, địa chỉ), 
danh sách sản phẩm (mã, tên, giá, tồn kho), 
và quản lý đơn hàng (master + chi tiết sản phẩm).

Có thể viết tự do, không cần format chính thức.`}
            rows={6}
          />
        </Form.Item>

        <Divider>{t("system.menu.aiDesigner.menuType") || "Loại Menu Cần Tạo"}</Divider>

        {/* Menu Type Selection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 12, fontWeight: 500 }}>
            {t("system.menu.aiDesigner.selectMenuTypes") || "Chọn loại menu cần tạo"}
          </div>
          <Space direction="vertical" style={{ width: "100%" }}>
            {(Object.entries(MENU_TYPE_DESCRIPTIONS) as [string, any][]).map(([type, info]) => (
              <div
                key={type}
                onClick={() => {
                  const typeNum = Number(type) as MenuType;
                  setSelectedTypes(
                    selectedTypes.includes(typeNum)
                      ? selectedTypes.filter(t => t !== typeNum)
                      : [...selectedTypes, typeNum]
                  );
                }}
                style={{
                  padding: 12,
                  border: selectedTypes.includes(Number(type) as MenuType) ? "2px solid #1890ff" : "1px solid #d9d9d9",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selectedTypes.includes(Number(type) as MenuType) ? "#f0f5ff" : "#fafafa"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      <span>{info.icon} </span>
                      <span>{info.name}</span>
                      {selectedTypes.includes(Number(type) as MenuType) && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>{t("common.selected") || "Đã chọn"}</Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                      {info.description}
                    </div>
                    <div style={{ fontSize: 12, color: "#999" }}>
                      💡 {info.examples}
                    </div>
                  </div>
                  <div style={{ marginLeft: 16 }}>
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(Number(type) as MenuType)}
                      readOnly
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </Space>
        </div>

        <Divider>{t("system.menu.aiDesigner.options") || "Tùy chọn"}</Divider>

        {/* Scope */}
        <Form.Item
          label={t("system.menu.aiDesigner.scope") || "Phạm vi thiết kế"}
          className="mb-4"
        >
          <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
            <Radio value="minimal" style={{ display: "block", marginBottom: 8 }}>
              <strong>Minimal</strong> - Menu cơ bản, cấu trúc đơn giản
            </Radio>
            <Radio value="complete">
              <strong>Complete</strong> - Menu chi tiết, trigger, combo, validation
            </Radio>
          </Radio.Group>
        </Form.Item>

        {/* Tables */}
        <Form.Item
          name="tables"
          label={t("system.menu.aiDesigner.existingTables") || "Danh sách bảng hiện có (nếu có)"}
          help="Nhập tên bảng, mỗi dòng một bảng. AI sẽ sử dụng nếu phù hợp"
        >
          <TextArea
            placeholder={`dm_khachhang
dm_sanpham
bh_donhang`}
            rows={4}
          />
        </Form.Item>

        {/* Custom Notes */}
        <Form.Item
          name="customNotes"
          label={t("system.menu.aiDesigner.notes") || "Ghi chú thêm"}
          help="Thêm bất kỳ yêu cầu đặc biệt nào"
        >
          <TextArea
            placeholder="Ví dụ: Cần read-only mode, không cho sửa, có báo cáo monthly, v.v"
            rows={3}
          />
        </Form.Item>

        <Alert
          message={t("system.menu.aiDesigner.tip") || "💡 Mẹo"}
          description={`AI sẽ phân tích yêu cầu và tạo menu JSON hoàn chỉnh.
Bạn có thể sửa lại trước khi áp dụng vào hệ thống.`}
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Form>
    </Modal>
  );
}

/**
 * Build comprehensive prompt for AI based on form data
 */
function buildMenuDesignPrompt(
  data: any,
  menuTypes: MenuType[],
  scope: "minimal" | "complete"
): string {
  const typeDescriptions = menuTypes
    .map(type => {
      const info = MENU_TYPE_DESCRIPTIONS[type];
      return `- Type ${type}: ${info.name} (${info.description})`;
    })
    .join("\n");

  const prompt = `
## YÊU CẦU THIẾT KẾ MENU

### Thông tin dự án
- **Tên**: ${data.title}
- **Phạm vi**: ${scope === "minimal" ? "Minimal (cấu trúc cơ bản)" : "Complete (chi tiết đầy đủ)"}

### Chi tiết requirements
${data.description}

### Loại menu cần tạo
${typeDescriptions}

${data.tables ? `
### Bảng hiện có
${data.tables
  .split("\n")
  .filter((t: string) => t.trim())
  .map((t: string) => `- ${t.trim()}`)
  .join("\n")}
` : ""}

${data.customNotes ? `
### Ghi chú đặc biệt
${data.customNotes}
` : ""}

### Yêu cầu đầu ra
1. Tạo cây menu JSON hoàn chỉnh theo cấu trúc MenuItemType
2. Nếu scope=minimal: Cấu trúc cơ bản, không cần trigger phức tạp
3. Nếu scope=complete: Chi tiết đầy đủ, trigger, combo, validation
4. Loại menu sử dụng: ${menuTypes.join(", ")}
5. Trả về format: { "menu": [...], "notes": [...], "warnings": [...] }

### HƯỚNG DẪN CHI TIẾT
Xem phần "LOẠI MENU HỖ TRỢ", "MENUITEMTYPE SCHEMA", "QUY TẮC THIẾT KẾ" trong prompt chính.
`;

  return prompt;
}

export default MenuRequirementForm;
