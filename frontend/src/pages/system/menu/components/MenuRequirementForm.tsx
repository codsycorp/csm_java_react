import { useState } from "react";
import { Modal, Form, Input, Radio, Button, Alert, Divider } from "antd";
import { useTranslation } from "react-i18next";
import { AI_PROMPTS } from "../ai-prompts/menu-design-system";

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

const ALL_MENU_TYPES: MenuType[] = [1, 2, 3, 4];

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
  const [scope, setScope] = useState<"minimal" | "complete">("complete");

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Build comprehensive prompt with system context
      const prompt = buildMenuDesignPrompt(values, ALL_MENU_TYPES, scope);
      
      const data: MenuRequirementData = {
        title: values.title,
        description: values.description,
        menuTypes: ALL_MENU_TYPES,
        scope,
        tables: values.tables?.split("\n").filter((t: string) => t.trim()),
        customNotes: values.customNotes
      };
      
      onSubmit(data, prompt);
    } catch (err) {
      console.error("Form validation failed:", err);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setScope("complete");
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
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("system.menu.aiDesigner.autoAnalyzeTitle") || "AI tự động thiết kế toàn bộ menu theo nghiệp vụ"}
          description={
            t("system.menu.aiDesigner.autoAnalyzeDesc") ||
            "Hệ thống sẽ tự phân tích yêu cầu và tự gán loại menu (Type 1/2/3/4) cho từng chức năng trong toàn bộ cây menu, không cần chọn từng loại thủ công."
          }
        />

        <Divider>{t("system.menu.aiDesigner.options") || "Tùy chọn"}</Divider>

        {/* Scope */}
        <Form.Item
          label={t("system.menu.aiDesigner.scope") || "Phạm vi thiết kế"}
          className="mb-4"
        >
          <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
            <Radio value="minimal" style={{ display: "block", marginBottom: 8 }}>
              <strong>Minimal</strong> - Sinh nhanh cấu trúc khung
            </Radio>
            <Radio value="complete">
              <strong>Complete</strong> - Sinh đầy đủ toàn bộ menu theo nghiệp vụ (khuyến nghị)
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
  const typeDescriptions = "- Type 1: Table Grid\n- Type 2: Master-Detail\n- Type 3: Dynamic Link\n- Type 4: Dynamic Code";

  const prompt = `${AI_PROMPTS.MAIN_MENU_DESIGNER}

${AI_PROMPTS.REQUIREMENT_EXTRACTOR}

${AI_PROMPTS.TYPE_SELECTION_GUIDE}

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
1. Tạo cây menu JSON đầy đủ cho TOÀN BỘ nghiệp vụ khách hàng trong 1 lần
2. AI tự phân rã chức năng thành nhiều menu con hợp lý (root/group/action)
3. AI tự chọn type_form phù hợp cho từng menu (1/2/3/4), không làm từng menu rời rạc
4. Nếu scope=minimal: Cấu trúc khung cho toàn bộ module
5. Nếu scope=complete: Chi tiết đầy đủ bảng/field/trigger/combo/logic
6. Trả về format: { "menu": [...], "notes": [...], "warnings": [...] }
7. Ưu tiên bám đúng nghiệp vụ khách hàng, không sinh menu dư thừa

### HƯỚNG DẪN CHI TIẾT
Xem phần "LOẠI MENU HỖ TRỢ", "MENUITEMTYPE SCHEMA", "QUY TẮC THIẾT KẾ" trong prompt chính.
`;

  return prompt;
}

export default MenuRequirementForm;
