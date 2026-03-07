import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Divider, Input, message, Radio, Space, Tag, Tabs } from "antd";
import type { RadioChangeEvent } from "antd";
import { useTranslation } from "react-i18next";

import type { MenuItemType } from "#src/api/system/menu";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { AI_PROMPTS } from "../ai-prompts/menu-design-system";
import MenuRequirementForm from "./MenuRequirementForm";

const { TextArea } = Input;

type MergeMode = "merge" | "replace";

type AiRequestRecord = {
  id?: string;
  app_id_target: string;
  request_text?: string;
  request_history?: string;
  last_prompt?: string;
  last_result?: string;
  updated_at?: number;
  created_at?: number;
};

type AiMenuDesignerProps = {
  appId?: string;
  currentMenus?: MenuItemType[];
  onApply: (menus: MenuItemType[]) => Promise<void>;
};

const AI_REQUEST_TABLE = "csm_ai_menu_requests";

// Use comprehensive prompts from menu-design-system.ts
// The old MENU_PROMPT_TEMPLATE is replaced by AI_MENU_DESIGN_MAIN_PROMPT which includes
// complete documentation of all 4 menu types with detailed examples and rules
  const handleRequirementSubmit = async (data: any, prompt: string) => {
    if (!appId) {
      message.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn app");
      return;
    }

    setLoading(true);
    setRequirementModalOpen(false);
    setRequirementScope(data.scope || "minimal");
/**
    try {
      const command = recordId ? "update" : "create";
      const fullPrompt = buildPromptWithRequirement(data.description, currentMenus, data.scope);
      
      await saveRequestRecord(
        {
          request_text: data.description,
          last_prompt: fullPrompt,
          updated_at: Date.now(),
        },
        command,
      );
      setStoredRequest(data.description);
 * Build comprehensive prompt with additional context from customer requirements 
      const res = await generateSeoContentWithPrompt(fullPrompt);
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error("AI trả về không đúng JSON");
        setAiResultText(String(res?.message || "AI error"));
        return;
      }
 * Uses AI_MENU_DESIGN_MAIN_PROMPT as the base instruction
      const menuPayload = Array.isArray(payload.menu) ? payload.menu : Array.isArray(payload) ? payload : [];
      if (menuPayload.length === 0) {
        message.warning("AI chưa trả về danh sách menu");
      }
 */
      const normalized = normalizeMenuList(menuPayload);
      const output = {
        menu: normalized,
        notes: Array.isArray(payload.notes) ? payload.notes : [],
      };
function buildPromptWithRequirement(
      setAiMenus(normalized);
      setAiResultText(JSON.stringify(output, null, 2));
  requestText: string, 
      await saveRequestRecord(
        {
          request_text: data.description,
          last_result: JSON.stringify(output),
          updated_at: Date.now(),
        },
        "update",
      );
  currentMenus?: MenuItemType[],
      message.success("Đã tạo menu bằng AI (Form)");
    } catch (error) {
      console.error("AI menu generation failed:", error);
      message.error("Lỗi gọi AI");
    } finally {
      setLoading(false);
    }
  };
  scope: "minimal" | "complete" = "minimal"
): string {
  const menuExample = createMenuExample();
  const menuJson = JSON.stringify(menuExample, null, 2);
  
  // Start with comprehensive main prompt
  let prompt = AI_PROMPTS.AI_MENU_DESIGN_MAIN_PROMPT || "";
  
  // Add responsibility section
  prompt += `

## TRÁCH NHIỆM CỦA BẠN
Bạn cần:
1) Phân tích yêu cầu của khách hàng ở phần YÊUHCẦU KHÁCH HÀNG dưới đây
2) Chọn menu type phù hợp: ${scope === "minimal" ? "Chọn type tối giản (1 hoặc 3)" : "Có thể dùng bất kỳ type nào (1/2/3/4)"}
3) Tạo menu JSON đúng schema MenuItemType
4) Giải thích lý do chọn type trong notes

## MENU HIỆN TẠI (Reference):
\`\`\`json
${menuJson}
\`\`\`

## YÊU CẦU KHÁCH HÀNG:
${requestText}
`;

  return prompt;
}

function stringifyMenu(menus?: MenuItemType[]) {
  if (!menus || menus.length === 0) return "[]";
  try {
    return JSON.stringify(menus, null, 2);
  } catch {
    return "[]";
  }
}

/**
 * Tạo mẫu cây menu đơn giản để làm example cho AI hiểu cấu trúc.
 * Không đưa hết currentMenus vì sẽ quá dài và gây confusion.
 */
function createMenuExample(): MenuItemType[] {
  return [
    {
      id: "dm_root",
      parentId: "",
      menuType: 0,
      type_menu: 0,
      type_form: 0,
      row_type_edit: 0,
      path: "/danh-muc",
      component: "CsmGrid",
      order: 1,
      icon: "fa fa-database",
      label: "Danh Mục",
      label_vi: "Danh Mục",
      label_en: "Catalog",
      label_zh: "目录",
      name: "dm_root",
      name_vi: "dm_root",
      name_en: "dm_root",
      name_zh: "dm_root",
      children: [
        {
          id: "dm_khachhang",
          parentId: "dm_root",
          menuType: 1,
          type_menu: 1,
          type_form: 1,
          row_type_edit: 1,
          path: "/danh-muc/khach-hang",
          component: "CsmGrid",
          order: 1,
          icon: "fa fa-users",
          label: "Khách Hàng",
          label_vi: "Khách Hàng",
          label_en: "Customers",
          label_zh: "客户",
          name: "dm_khachhang",
          name_vi: "dm_khachhang",
          name_en: "dm_khachhang",
          name_zh: "dm_khachhang",
          table_name: "dm_khachhang",
          g_readonly: false,
          table_pagesize: 50,
          table: [
            { f_name: "id", f_header: "ID", f_header_vi: "ID", f_header_en: "ID", f_header_zh: "ID", f_types: "txt", f_show: 1, f_stt: 1, f_search: 1, f_report: 1, f_align: "left", f_width: 100, f_dec: 0, f_pkid: 1 },
            { f_name: "ma_kh", f_header: "Mã KH", f_header_vi: "Mã KH", f_header_en: "Code", f_header_zh: "代码", f_types: "txt", f_show: 1, f_stt: 2, f_search: 1, f_report: 1, f_align: "left", f_width: 80, f_dec: 0 },
            { f_name: "ten_kh", f_header: "Tên KH", f_header_vi: "Tên KH", f_header_en: "Name", f_header_zh: "名称", f_types: "txt", f_show: 1, f_stt: 3, f_search: 1, f_report: 1, f_align: "left", f_width: 150, f_dec: 0 }
          ]
        }
      ]
    }
  ];
}

/**
 * Wrapper for backward compatibility - uses new comprehensive prompt system
 */
function buildPrompt(requestText: string, currentMenus?: MenuItemType[]) {
  return buildPromptWithRequirement(requestText, currentMenus, "minimal");
}

function ensureMenuDefaults(menu: MenuItemType): MenuItemType {
  const next: MenuItemType = { ...menu };

  if ((next as any).label_vi && !next.label) next.label = (next as any).label_vi;
  if ((next as any).name_vi && !next.name) next.name = (next as any).name_vi;

  if ((next as any).label_sh && !next.label_zh) next.label_zh = (next as any).label_sh;
  if ((next as any).name_sh && !next.name_zh) next.name_zh = (next as any).name_sh;

  if (Array.isArray((next as any).table)) {
    (next as any).table = (next as any).table.map((field: any) => {
      const f = { ...field };
      if (f.f_header_vi && !f.f_header) f.f_header = f.f_header_vi;
      if (f.f_header_sh && !f.f_header_zh) f.f_header_zh = f.f_header_sh;
      return f;
    });
  }

  if (Array.isArray((next as any).children)) {
    (next as any).children = (next as any).children.map(ensureMenuDefaults);
  }

  return next;
}

function normalizeMenuList(menus: MenuItemType[]) {
  return menus.map(ensureMenuDefaults);
}

function mergeMenus(baseMenus: MenuItemType[], incomingMenus: MenuItemType[]) {
  const byId = new Map<string, MenuItemType>();
  baseMenus.forEach((m) => byId.set(m.id, { ...m }));

  incomingMenus.forEach((incoming) => {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, { ...incoming });
      return;
    }

    const merged: MenuItemType = {
      ...existing,
      ...incoming,
      children: undefined,
    };

    const existingChildren = Array.isArray((existing as any).children)
      ? ((existing as any).children as MenuItemType[])
      : [];
    const incomingChildren = Array.isArray((incoming as any).children)
      ? ((incoming as any).children as MenuItemType[])
      : [];

    if (existingChildren.length > 0 || incomingChildren.length > 0) {
      (merged as any).children = mergeMenus(existingChildren, incomingChildren);
    }

    byId.set(incoming.id, merged);
  });

  return Array.from(byId.values());
}

function extractAiPayload(response: any) {
  let payload = response?.result ?? response?.data ?? response;
  if (payload?.result) payload = payload.result;

  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  return payload && typeof payload === "object" ? payload : null;
}

export function AiMenuDesigner({ appId, currentMenus, onApply }: AiMenuDesignerProps) {
  const { t } = useTranslation();
  const [requestText, setRequestText] = useState<string>("");
  const [storedRequest, setStoredRequest] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiMenus, setAiMenus] = useState<MenuItemType[] | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const [requirementModalOpen, setRequirementModalOpen] = useState(false);
  const [requirementScope, setRequirementScope] = useState<"minimal" | "complete">("minimal");

  const hasStoredRequest = storedRequest.trim().length > 0;

  const mergedRequestText = useMemo(() => {
    if (!requestText.trim()) return storedRequest;
    if (!storedRequest.trim()) return requestText;
    return `${storedRequest}\n---\n${requestText}`;
  }, [requestText, storedRequest]);

  useEffect(() => {
    if (!appId) return;
    const loadRequest = async () => {
      try {
        const res = await getTableData<AiRequestRecord>({
          app_id: "csm",
          obj_name: AI_REQUEST_TABLE,
          where: {
            field: "app_id_target",
            type: "eq",
            value: appId,
          },
        });
        const rows = (res as any)?.rows || (res as any)?.data || [];
        const item = rows[0];
        if (item) {
          setStoredRequest(item.request_text || "");
          setRecordId(item.id);
        } else {
          setStoredRequest("");
          setRecordId(undefined);
        }
      } catch (error) {
        console.warn("Failed to load AI menu request:", error);
      }
    };

    loadRequest();
  }, [appId]);

  const saveRequestRecord = async (payload: Partial<AiRequestRecord>, mode: "create" | "update") => {
    if (!appId) return;
    const now = Date.now();
    const objUpdate: AiRequestRecord = {
      id: recordId || `ai_menu_${appId}`,
      app_id_target: appId,
      request_text: storedRequest,
      updated_at: now,
      created_at: payload.created_at || now,
      ...payload,
    };

    await updateTableData<AiRequestRecord>({
      app_id: "csm",
      obj_name: AI_REQUEST_TABLE,
      command: mode,
      obj_update: objUpdate,
      pk_fields: ["app_id_target"],
    });

    if (!recordId) setRecordId(objUpdate.id);
  };

  const handleGenerate = async () => {
    if (!appId) {
      message.warning(t("system.menu.pleaseSelectApp") || "Vui long chon app");
      return;
    }
    if (!requestText.trim() && !storedRequest.trim()) {
      message.warning("Hay nhap yeu cau khach hang");
      return;
    }

    const prompt = buildPrompt(mergedRequestText, currentMenus);
    setLoading(true);

    try {
      const command = recordId ? "update" : "create";
      await saveRequestRecord(
        {
          request_text: mergedRequestText,
          last_prompt: prompt,
          updated_at: Date.now(),
        },
        command,
      );
      setStoredRequest(mergedRequestText);

      const res = await generateSeoContentWithPrompt(prompt);
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error("AI tra ve khong dung JSON");
        setAiResultText(String(res?.message || "AI error"));
        return;
      }

      const menuPayload = Array.isArray(payload.menu) ? payload.menu : Array.isArray(payload) ? payload : [];
      if (menuPayload.length === 0) {
        message.warning("AI chua tra ve danh sach menu");
      }

      const normalized = normalizeMenuList(menuPayload);
      const output = {
        menu: normalized,
        notes: Array.isArray(payload.notes) ? payload.notes : [],
      };

      setAiMenus(normalized);
      setAiResultText(JSON.stringify(output, null, 2));

      await saveRequestRecord(
        {
          request_text: mergedRequestText,
          last_result: JSON.stringify(output),
          updated_at: Date.now(),
        },
        "update",
      );

      message.success("Da tao menu bang AI");
    } catch (error) {
      console.error("AI menu generation failed:", error);
      message.error("Loi goi AI");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!aiMenus || aiMenus.length === 0) {
      message.warning("Khong co menu de ap dung");
      return;
    }

    const baseMenus = Array.isArray(currentMenus) ? currentMenus : [];
    const nextMenus = mergeMode === "merge" ? mergeMenus(baseMenus, aiMenus) : aiMenus;

    try {
      await onApply(normalizeMenuList(nextMenus));
      message.success("Da ap dung menu vao he thong");
    } catch (error) {
      console.error("Apply AI menu failed:", error);
      message.error("Ap dung menu that bai");
    }
  };

  const handleMergeModeChange = (evt: RadioChangeEvent) => {
    setMergeMode(evt.target.value as MergeMode);
  };

  // Mẫu yêu cầu nhanh
  const quickTemplates = [
    {
      label: "Danh mục đơn giản",
      value: `Tạo menu Danh mục khách hàng.
Các trường: Mã KH (tự động), Họ tên, Giới tính (combo Nam/Nữ), Ngày sinh, Số điện thoại, Email, Địa chỉ.
Cho phép thêm/sửa/xóa, phân trang 50 dòng.`
    },
    {
      label: "Master-Detail (Đơn hàng)",
      value: `Tạo menu Quản lý đơn hàng dạng Master-Detail.
Master: Số ĐH (tự động), Ngày ĐH, Khách hàng (combo từ dm_khachhang), Tổng tiền (tự tính).
Tab Chi tiết SP: Mã SP (combo từ dm_sanpham), Số lượng, Đơn giá, Thành tiền (tự động = số lượng × đơn giá).
Tab Lịch sử thanh toán: Ngày TT, Số tiền, Ghi chú.
Master cho phép sửa/xóa, các tab cho phép inline edit.`
    },
    {
      label: "Nghiệp vụ kho",
      value: `Tạo 3 menu:
1. Danh mục sản phẩm: Mã SP, Tên SP, Đơn vị (combo: Cái/Thùng/Kg), Giá bán, Tồn kho.
2. Phiếu nhập kho (Master-Detail): Số phiếu, Ngày nhập, Nhà cung cấp. Tab chi tiết: SP, SL, Đơn giá, Thành tiền.
3. Phiếu xuất kho (Master-Detail): Số phiếu, Ngày xuất, Khách hàng. Tab chi tiết: SP, SL, Đơn giá, Thành tiền.`
    },
    {
      label: "Quản lý nhân sự",
      value: `Tạo module quản lý nhân sự với 4 menu:
1. Danh mục phòng ban: Mã PB, Tên PB, Ghi chú.
2. Danh mục chức vụ: Mã CV, Tên CV, Hệ số lương.
3. Danh mục nhân viên: Mã NV, Họ tên, Giới tính, Ngày sinh, Năm sinh, Tuổi (tự tính), Phòng ban (combo), Chức vụ (combo), Lương cơ bản.
4. Bảng lương (Master-Detail): Tháng, Năm. Tab chi tiết: NV, Lương cơ bản, Phụ cấp, Thưởng, Tổng lương (tự tính).`
    }
  ];

  const handleQuickTemplate = (template: string) => {
    setRequestText(template);
    message.success("Đã chọn mẫu yêu cầu");
  };

  return (
    <Card title="AI Thiết kế Menu Tự động" bordered={false}>
      {!appId && (
        <Alert type="warning" showIcon message="Vui lòng chọn App trước khi sử dụng AI." />
      )}

      {/* Hướng dẫn sử dụng */}
      <Alert
        type="info"
        showIcon
        message="Hướng dẫn nhập yêu cầu"
        description={
          <div>
            <p><strong>Mô tả càng chi tiết, AI sinh menu càng chính xác:</strong></p>
            <ol style={{ paddingLeft: 20, marginBottom: 0 }}>
              <li><strong>Tên chức năng:</strong> "Quản lý nhân viên", "Danh mục khách hàng", "Báo cáo doanh thu"...</li>
              <li><strong>Các trường dữ liệu:</strong> "Cần các trường: Mã NV, Họ tên, Giới tính (Nam/Nữ), Ngày sinh, Lương, Phòng ban"</li>
              <li><strong>Combo/Dropdown:</strong> "Giới tính là combo chọn Nam/Nữ", "Phòng ban lấy từ bảng dm_phongban"</li>
              <li><strong>Tính toán tự động:</strong> "Tự động tính tuổi từ năm sinh", "Tính thành tiền = số lượng × đơn giá"</li>
              <li><strong>Định dạng:</strong> "Lương hiển thị dạng tiền tệ", "Ngày sinh dạng dd/mm/yyyy"</li>
              <li><strong>Phân quyền:</strong> "Chỉ đọc cho user thường", "Cho phép thêm/sửa/xóa"</li>
            </ol>
            <p style={{ marginTop: 8, marginBottom: 0 }}><strong>Ví dụ yêu cầu tốt:</strong></p>
            <p style={{ fontStyle: 'italic', marginBottom: 0 }}>
              "Tạo menu Quản lý nhân viên. Các trường: Mã NV (tự động), Họ tên, Giới tính (combo Nam/Nữ), 
              Ngày sinh (kiểu date), Năm sinh (số), Tuổi (tự tính từ năm sinh), Phòng ban (combo lấy từ bảng dm_phongban), 
              Lương (dạng tiền). Cho phép thêm/sửa/xóa, phân trang 50 dòng."
            </p>
          </div>
        }
        style={{ marginBottom: 16 }}
        closable
      />

      {hasStoredRequest && (
        <div className="mb-3">
          <Alert
            type="success"
            showIcon
            message="Đã có yêu cầu trước đó"
            description="Nếu nhập thêm yêu cầu mới, hệ thống sẽ tự động kết hợp với yêu cầu cũ để AI hiểu rõ hơn."
            closable
          />
        </div>
      )}

      {/* Mẫu yêu cầu nhanh */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Hoặc chọn mẫu yêu cầu nhanh:</div>
        <Space wrap>
          {quickTemplates.map((template, idx) => (
            <Button
              key={idx}
              size="small"
              type="dashed"
              onClick={() => handleQuickTemplate(template.value)}
            >
              {template.label}
            </Button>
          ))}
        </Space>
      </div>

      <TextArea
        value={requestText}
        onChange={(e) => setRequestText(e.target.value)}
        placeholder="Nhập yêu cầu của bạn (càng chi tiết càng tốt)...&#10;&#10;Ví dụ: Tạo menu Quản lý hóa đơn. Các trường: Số CT (tự động), Ngày CT, Khách hàng (combo), Tổng tiền (tự tính). Chi tiết hóa đơn gồm: STT, Mã hàng (combo), Tên hàng, Số lượng, Đơn giá, Thành tiền (tự tính = SL × ĐG)."
        rows={8}
        style={{ marginBottom: 16 }}
      />

      <Divider />

      <Space wrap style={{ marginBottom: 16 }}>
        <Button 
          type="primary" 
          onClick={handleGenerate} 
          loading={loading} 
          disabled={!appId}
          size="large"
        >
          {loading ? "Đang tạo menu..." : "🤖 Tạo Menu bằng AI"}
        </Button>
        
        {aiMenus && aiMenus.length > 0 && (
          <>
            <Radio.Group onChange={handleMergeModeChange} value={mergeMode}>
              <Radio value="merge">
                <span title="Giữ menu cũ, chỉ cập nhật/thêm menu mới theo ID">
                  Merge (Kết hợp)
                </span>
              </Radio>
              <Radio value="replace">
                <span title="Xóa toàn bộ menu cũ, thay thế bằng menu AI tạo">
                  Replace (Thay thế hoàn toàn)
                </span>
              </Radio>
            </Radio.Group>
            
            <Button 
              type="primary" 
              onClick={handleApply}
              size="large"
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              ✓ Áp dụng vào Hệ thống ({aiMenus.length} menu)
            </Button>
          </>
        )}
      </Space>

      {aiResultText && (
        <>
          <Divider orientation="left">Kết quả từ AI</Divider>
          
          <Space direction="vertical" style={{ width: '100%' }}>
            {aiMenus && aiMenus.length > 0 && (
              <Alert
                type="success"
                showIcon
                message={`AI đã tạo thành công ${aiMenus.length} menu/chức năng`}
                description="Xem chi tiết JSON bên dưới. Kiểm tra kỹ trước khi áp dụng vào hệ thống."
              />
            )}
            
            <TextArea
              value={aiResultText}
              placeholder="Kết quả AI sẽ hiển thị ở đây (JSON format)"
              rows={15}
              readOnly
              style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: 12 }}
            />
          </Space>
        </>
      )}
    </Card>
  );
}

export default AiMenuDesigner;
