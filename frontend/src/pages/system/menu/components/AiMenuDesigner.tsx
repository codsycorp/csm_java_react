import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Divider, Input, message, Radio, Space } from "antd";
import type { RadioChangeEvent } from "antd";
import { useTranslation } from "react-i18next";

import type { MenuItemType } from "#src/api/system/menu";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { AI_PROMPTS } from "../ai-prompts/menu-design-system";

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

function createMenuExample(): MenuItemType[] {
  return [
    {
      id: "dm_1",
      label: "Danh mục",
      m_icons: "fa fa-database",
      m_show: true,
      menu_id: "1",
      children: [
        {
          id: "dm_kh",
          parentId: "dm_1",
          label: "Khách hàng",
          m_icons: "fa fa-users",
          m_show: true,
          menu_id: "1.1",
          type_form: 1,
          table_name: "dm_khachhang",
          table_pagesize: 50,
          trigger: {
            before_save: "validate_customer",
            after_save: "update_customer_stats"
          },
          table: [
            { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
            { f_name: "ma_kh", f_header: "Mã KH", f_types: "ed", f_pkid: 1, f_show: 1, f_width: "120" },
            { f_name: "ten_kh", f_header: "Tên KH", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "250" }
          ]
        },
        {
          id: "bh_dh",
          parentId: "dm_1",
          label: "Đơn hàng",
          m_icons: "fa fa-shopping-cart",
          m_show: true,
          menu_id: "1.2",
          type_form: 2,
          table_name: "bh_donhang",
          table_pagesize: 50,
          field_root: "id_don_hang",
          trigger: {
            before_save: "validate_order",
            after_save: "calculate_order_total",
            before_delete: "check_order_status"
          },
          table: [
            { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
            { f_name: "ma_dh", f_header: "Mã ĐH", f_types: "ro", f_pkid: 1, f_show: 1, f_width: "120" },
            { f_name: "ngay_ct", f_header: "Ngày CT", f_types: "date", f_pkid: 0, f_show: 1, f_width: "100" },
            { f_name: "tong_tien", f_header: "Tổng tiền", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 }
          ],
          children: [
            {
              id: "bh_dh_ct",
              parentId: "bh_dh",
              label: "Chi tiết ĐH",
              m_show: true,
              menu_id: "1.2.1",
              table_name: "bh_donhang_ct",
              trigger: {
                after_save: "update_order_total",
                after_delete: "recalculate_order_total"
              },
              table: [
                { f_name: "id", f_header: "ID", f_types: "ed", f_pkid: 0, f_show: 1, f_width: "150" },
                { f_name: "id_sp", f_header: "Sản phẩm", f_types: "co", f_pkid: 1, f_show: 1, f_width: "250", f_cbo_query: "{\"query\":[{\"obj_name\":\"dm_sanpham\",\"fields\":[\"id\",\"ten_sp\"]}]}" },
                { f_name: "so_luong", f_header: "SL", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "100", f_dec: 2 },
                { f_name: "don_gia", f_header: "Đơn giá", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 },
                { f_name: "thanh_tien", f_header: "Thành tiền", f_types: "nummeric", f_pkid: 0, f_show: 1, f_width: "120", f_dec: 2 }
              ]
            }
          ]
        }
      ]
    }
  ];
}

function buildPromptWithRequirement(
  requestText: string,
  scope: "minimal" | "complete" = "minimal",
  currentMenus?: MenuItemType[],
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus.slice(0, 12)
    : createMenuExample();
  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5200);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 2200);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 2200);
  const requestCore = trimToMax(requestText || "", 2800);
  const compactMenuContext = buildCompactMenuContext(referenceMenus, 80);

  const prompt = `${mainPrompt}

${extractorPrompt}

${selectorGuide}

## TRACH NHIEM CUA BAN
1) Phan tich yeu cau khach hang
2) Chon menu type phu hop (${scope === "minimal" ? "uu tien type 1/3" : "co the dung 1/2/3/4"})
3) Tao JSON hop le theo MenuItemType
4) Neu can, ghi chu gia dinh vao notes

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${compactMenuContext}

## YEU CAU KHACH HANG
${requestCore}

## LUU Y TOKEN
Khong lap lai JSON mau dai. Tap trung logic nghiep vu va tra ve JSON menu hoan chinh, dung schema.`;

  return trimToMax(prompt, 18000);
}

function buildRefinementPrompt(
  baseRequest: string,
  refineRequest: string,
  previousResultJson: string,
  scope: "minimal" | "complete" = "complete",
  currentMenus?: MenuItemType[],
): string {
  const referenceMenus = Array.isArray(currentMenus) && currentMenus.length > 0
    ? currentMenus.slice(0, 24)
    : createMenuExample();

  const mainPrompt = trimToMax(AI_PROMPTS.MAIN_MENU_DESIGNER || "", 5200);
  const extractorPrompt = trimToMax(AI_PROMPTS.REQUIREMENT_EXTRACTOR || "", 2200);
  const selectorGuide = trimToMax(AI_PROMPTS.TYPE_SELECTION_GUIDE || "", 2200);

  const requestCore = trimToMax(baseRequest || "(khong co)", 2600);
  const refineCore = trimToMax(refineRequest || "", 1800);
  const currentMenuContext = buildCompactMenuContext(referenceMenus, 80);
  const previousMenuContext = buildPreviousResultContext(previousResultJson, 90);
  const strictScope = scope === "minimal" ? "uu tien type 1/3" : "duoc dung day du type 1/2/3/4";

  const prompt = `${mainPrompt}

${extractorPrompt}

${selectorGuide}

## NHIEM VU REFINE (TOI UU TOKEN)
Ban da co ket qua menu lan truoc. Hay cap nhat theo yeu cau moi voi nguyen tac:
1) Giu on dinh phan dung, chi sua phan can thay doi.
2) Van tra ve TOAN BO menu sau khi cap nhat (khong tra ve delta).
3) Dam bao schema MenuItemType hop le va ${strictScope}.
4) Neu thong tin chua du, dua ra gia dinh hop ly va ghi vao warnings.

## YEU CAU GOC (RUT GON)
${requestCore}

## YEU CAU BO SUNG MOI (UU TIEN CAO NHAT)
${refineCore}

## MENU HE THONG HIEN TAI (COMPACT REFERENCE)
${currentMenuContext}

## TOM TAT KET QUA AI LAN TRUOC (COMPACT)
${previousMenuContext}

## DINH DANG DAU RA BAT BUOC
{ "menu": [...], "notes": [...], "warnings": [...] }

## LUU Y TOKEN
Khong lap lai JSON mau dai. Chi tap trung logic nghiep vu va tra ve JSON menu hoan chinh, dung schema.
`;

  return trimToMax(prompt, 22000);
}

function trimToMax(text: string, maxChars: number): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;

  const keepHead = Math.floor(maxChars * 0.65);
  const keepTail = Math.max(0, maxChars - keepHead - 24);
  const head = raw.slice(0, keepHead).trim();
  const tail = raw.slice(Math.max(0, raw.length - keepTail)).trim();
  return `${head}\n...[truncated for token budget]...\n${tail}`;
}

function estimateTokenCount(text: string): number {
  const raw = String(text || "");
  // Practical approximation for mixed Vietnamese/English prompts.
  return Math.ceil(raw.length / 4);
}

function flattenMenuNodes(menus: MenuItemType[], maxNodes: number): MenuItemType[] {
  const out: MenuItemType[] = [];
  const stack = [...menus];

  while (stack.length > 0 && out.length < maxNodes) {
    const node = stack.shift();
    if (!node) continue;
    out.push(node);

    const children = Array.isArray((node as any).children)
      ? ((node as any).children as MenuItemType[])
      : [];
    if (children.length > 0) {
      stack.unshift(...children);
    }
  }

  return out;
}

function compactNodeLine(node: MenuItemType): string {
  const label = node.label_vi || node.label || node.name_vi || node.name || "(unnamed)";
  const tableName = (node as any).table_name || "";
  const hasChildren = Array.isArray((node as any).children) && (node as any).children.length > 0;
  return [
    `id=${node.id}`,
    `parent=${node.parentId || "root"}`,
    `path=${node.path || ""}`,
    `type=${(node as any).type_form ?? (node as any).menuType ?? "?"}`,
    `label=${label}`,
    tableName ? `table=${tableName}` : "",
    hasChildren ? "children=yes" : "",
  ].filter(Boolean).join(" | ");
}

function buildCompactMenuContext(menus: MenuItemType[], maxNodes: number): string {
  const nodes = flattenMenuNodes(menus, maxNodes);
  const lines = nodes.map((node) => `- ${compactNodeLine(node)}`);
  const truncated = nodes.length >= maxNodes ? "\n- ...more nodes omitted for token budget..." : "";
  return `total_nodes_sampled=${nodes.length}${truncated ? " (truncated)" : ""}\n${lines.join("\n")}${truncated}`;
}

function buildPreviousResultContext(previousResultJson: string, maxNodes: number): string {
  const raw = String(previousResultJson || "").trim();
  if (!raw) return "(khong co ket qua truoc)";

  try {
    const parsed = JSON.parse(raw);
    const menuList = Array.isArray(parsed?.menu)
      ? parsed.menu
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (!Array.isArray(menuList) || menuList.length === 0) {
      return `khong tim thay mang menu hop le. raw_preview=${trimToMax(raw, 1200)}`;
    }

    const normalized = normalizeMenuList(menuList as MenuItemType[]);
    const compact = buildCompactMenuContext(normalized, maxNodes);
    const notesPreview = Array.isArray((parsed as any)?.notes)
      ? trimToMax(JSON.stringify((parsed as any).notes), 600)
      : "[]";

    return `menu_count=${menuList.length}\n${compact}\nnotes_preview=${notesPreview}`;
  } catch {
    return `khong parse duoc JSON ket qua truoc. raw_preview=${trimToMax(raw, 1200)}`;
  }
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
  const [requestText, setRequestText] = useState("");
  const [storedRequest, setStoredRequest] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiMenus, setAiMenus] = useState<MenuItemType[] | null>(null);
  const [mergeMode, setMergeMode] = useState<MergeMode>("merge");
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const [refineText, setRefineText] = useState("");

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
      request_history: payload.request_history || storedRequest,
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

  const runGenerate = async (
    inputRequest: string,
    scope: "minimal" | "complete" = "minimal",
    promptOverride?: string,
  ) => {
    if (!appId) {
      message.warning(t("system.menu.pleaseSelectApp") || "Vui lòng chọn app");
      return;
    }
    if (!inputRequest.trim()) {
      message.warning(t("system.menu.aiDesigner.enterRequirement") || "Hãy nhập yêu cầu khách hàng");
      return;
    }

    const prompt = promptOverride || buildPromptWithRequirement(inputRequest, scope, currentMenus);
    const estimatedTokens = estimateTokenCount(prompt);
    if (estimatedTokens > 6000) {
      message.warning(
        `Prompt dang lon (~${estimatedTokens} tokens uoc luong). Neu goi mien phi bi gioi han, hay rut gon yeu cau.`,
      );
    }
    setLoading(true);

    try {
      const command = recordId ? "update" : "create";

      await saveRequestRecord(
        {
          request_text: inputRequest,
          last_prompt: prompt,
          updated_at: Date.now(),
        },
        command,
      );
      setStoredRequest(inputRequest);

      const res = await generateSeoContentWithPrompt(prompt);
      const payload = extractAiPayload(res);
      if (!payload) {
        message.error(t("system.menu.aiDesigner.invalidJson") || "AI trả về không đúng JSON");
        setAiResultText(String(res?.message || "AI error"));
        return;
      }

      const menuPayload = Array.isArray(payload.menu) ? payload.menu : Array.isArray(payload) ? payload : [];
      if (menuPayload.length === 0) {
        message.warning(t("system.menu.aiDesigner.emptyMenu") || "AI chưa trả về danh sách menu");
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
          request_text: inputRequest,
          last_result: JSON.stringify(output),
          updated_at: Date.now(),
        },
        "update",
      );

      message.success(t("system.menu.aiDesigner.generateSuccess") || "Đã tạo menu bằng AI");
    } catch (error) {
      console.error("AI menu generation failed:", error);
      message.error(t("system.menu.aiDesigner.generateFailed") || "Lỗi gọi AI");
    } finally {
      setLoading(false);
    }
  };

  const handleRefineGenerate = async () => {
    if (!refineText.trim()) {
      message.warning(t("system.menu.aiDesigner.enterRefine") || "Hãy nhập yêu cầu bổ sung/chỉnh sửa");
      return;
    }

    const prompt = buildRefinementPrompt(
      storedRequest,
      refineText,
      aiResultText,
      "complete",
      currentMenus,
    );

    const combinedRequest = [
      storedRequest || "",
      "\n[Bo sung/chinh sua]\n",
      refineText,
    ].join("\n").trim();

    await runGenerate(combinedRequest, "complete", prompt);
    setRefineText("");
  };

  const handleGenerate = async () => {
    await runGenerate(mergedRequestText, "complete");
  };

  const handleApply = async () => {
    if (!aiMenus || aiMenus.length === 0) {
      message.warning(t("system.menu.aiDesigner.noMenuToApply") || "Không có menu để áp dụng");
      return;
    }

    const baseMenus = Array.isArray(currentMenus) ? currentMenus : [];
    const nextMenus = mergeMode === "merge" ? mergeMenus(baseMenus, aiMenus) : aiMenus;

    try {
      await onApply(normalizeMenuList(nextMenus));
      message.success(t("system.menu.aiDesigner.applySuccess") || "Đã áp dụng menu vào hệ thống");
    } catch (error) {
      console.error("Apply AI menu failed:", error);
      message.error(t("system.menu.aiDesigner.applyFailed") || "Áp dụng menu thất bại");
    }
  };

  const handleMergeModeChange = (evt: RadioChangeEvent) => {
    setMergeMode(evt.target.value as MergeMode);
  };

  return (
    <>
      <Card title={t("system.menu.aiDesigner.panelTitle") || "AI Thiet ke Menu Tu dong"} bordered={false}>
        {!appId && <Alert type="warning" showIcon message={t("system.menu.aiDesigner.selectAppFirst") || "Vui long chon App truoc khi su dung AI."} />}

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("system.menu.aiDesigner.autoAnalyzeTitle") || "AI tự động thiết kế toàn bộ menu theo nghiệp vụ"}
          description={t("system.menu.aiDesigner.autoAnalyzeDesc") || "AI sẽ tự phân tích yêu cầu và tự chọn loại menu phù hợp cho từng chức năng trong toàn bộ cây menu."}
        />

        {hasStoredRequest && (
          <div style={{ marginBottom: 12 }}>
            <Alert
              type="success"
              showIcon
              message={t("system.menu.aiDesigner.hasStoredRequestTitle") || "Da co yeu cau truoc do"}
              description={t("system.menu.aiDesigner.hasStoredRequestDesc") || "Neu nhap them, he thong se ket hop voi yeu cau cu de AI hieu ro hon."}
            />
          </div>
        )}

        <TextArea
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          placeholder={t("system.menu.aiDesigner.singleInputPlaceholder") || "Nhập yêu cầu đầy đủ nghiệp vụ của khách hàng để AI tự động thiết kế toàn bộ menu app..."}
          rows={8}
          style={{ marginBottom: 16 }}
        />

        <Divider />

        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={handleGenerate} loading={loading} disabled={!appId} size="large">
            {loading
              ? (t("system.menu.aiDesigner.generatingAll") || "Đang tạo toàn bộ menu...")
              : (t("system.menu.aiDesigner.generateAll") || "Tạo bằng AI toàn bộ menu")}
          </Button>

          {aiMenus && aiMenus.length > 0 && (
            <>
              <Radio.Group onChange={handleMergeModeChange} value={mergeMode}>
                <Radio value="merge">{t("system.menu.aiDesigner.mergeLabel") || "Merge"}</Radio>
                <Radio value="replace">{t("system.menu.aiDesigner.replaceLabel") || "Replace"}</Radio>
              </Radio.Group>

              <Button
                type="primary"
                onClick={handleApply}
                size="large"
                style={{ background: "#52c41a", borderColor: "#52c41a" }}
              >
                {`${t("system.menu.aiDesigner.applySystem") || "Ap dung vao He thong"} (${aiMenus.length} menu)`}
              </Button>
            </>
          )}
        </Space>

        {aiResultText && (
          <>
            <Divider orientation="left">{t("system.menu.aiDesigner.resultTitle") || "Ket qua tu AI"}</Divider>

            <Space direction="vertical" style={{ width: "100%" }}>
              {aiMenus && aiMenus.length > 0 && (
                <Alert
                  type="success"
                  showIcon
                  message={`${t("system.menu.aiDesigner.generatedCount") || "AI đã tạo thành công"} ${aiMenus.length} ${t("system.menu.aiDesigner.menuFeatures") || "menu/chức năng"}`}
                  description={t("system.menu.aiDesigner.reviewBeforeApply") || "Xem JSON bên dưới và kiểm tra trước khi áp dụng."}
                />
              )}

              <TextArea
                value={aiResultText}
                placeholder={t("system.menu.aiDesigner.resultPlaceholder") || "Kết quả AI sẽ hiển thị ở đây (JSON format)"}
                rows={15}
                readOnly
                style={{ fontFamily: "Monaco, Consolas, monospace", fontSize: 12 }}
              />

              <Divider orientation="left">{t("system.menu.aiDesigner.refineTitle") || "Yêu cầu bổ sung / chỉnh sửa"}</Divider>
              <Alert
                type="info"
                showIcon
                message={t("system.menu.aiDesigner.refineHintTitle") || "Bạn có thể yêu cầu AI chỉnh sửa thêm"}
                description={t("system.menu.aiDesigner.refineHintDesc") || "Nhập thay đổi mong muốn, AI sẽ dựa trên kết quả đã tạo và phân tích lại toàn bộ menu theo đúng nghiệp vụ."}
              />
              <TextArea
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                placeholder={t("system.menu.aiDesigner.refinePlaceholder") || "Ví dụ: Thêm menu báo cáo doanh thu theo tháng, sửa đơn hàng thành Master-Detail có tab lịch sử thanh toán..."}
                rows={4}
              />
              <Button type="primary" onClick={handleRefineGenerate} loading={loading} disabled={!appId}>
                {t("system.menu.aiDesigner.refineButton") || "Phân tích lại theo yêu cầu bổ sung"}
              </Button>
            </Space>
          </>
        )}
      </Card>
    </>
  );
}

export default AiMenuDesigner;
