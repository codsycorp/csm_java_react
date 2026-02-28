import type { MenuItemType } from "#src/api/system/menu";
import { fetchAddMenuItem, fetchUpdateMenuItem } from "#src/api/system/menu";
import { handleTree } from "#src/utils";
import { isMasterDetailMenu, getMenuDisplayConfig } from "../utils/menu-logic";

import {
  ModalForm,
  ProFormCascader,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormInstance, UploadProps } from "antd";
import { Tabs, Alert, Card, Upload, Button, message } from "antd";
import FieldConfigEditor from "./FieldConfigEditor";
import TriggerEditor from "./TriggerEditor";
import type { TableField, TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useUserStore } from "#src/store/user";

import { getMenuTypeOptions } from "../constants";

interface DetailProps {
  title: React.ReactNode;
  flatParentMenus: MenuItemType[];
  open: boolean;
  detailData: Partial<MenuItemType>;
  onCloseChange: () => void;
  refreshTable?: () => void;
  appId?: string; // App ID for saving menu items
  treeData: any[];
  saveMenuApp?: () => Promise<void>;
  fullMenuList?: MenuItemType[];
  setFullMenuList?: (menus: MenuItemType[]) => void;
}

function findMenuById(menus: MenuItemType[], id: string): MenuItemType | undefined {
	for (const menu of menus) {
		if (menu.id === id) return menu;
		if ((menu as any).children && findMenuById((menu as any).children, id)) {
			return findMenuById((menu as any).children, id);
		}
	}
	return undefined;
}

function findParentId(menus: MenuItemType[], id: string, parentId: string = ""): string {
	for (const menu of menus) {
		if (menu.id === id) return parentId;
		if ((menu as any).children) {
			const found = findParentId((menu as any).children, id, menu.id);
			if (found !== "") return found;
		}
	}
	return "";
}

function updateMenuInTree(menus: MenuItemType[], id: string, newData: Partial<MenuItemType>): boolean {
	for (let i = 0; i < menus.length; i++) {
		if (menus[i].id === id) {
			const currentParentId = findParentId(menus, id);
			const newParentId = newData.parentId;
			console.log("Updating menu", id, "currentParentId:", currentParentId, "newParentId:", newParentId);
			if (currentParentId !== newParentId) {
				// Move
				console.log("Moving menu", id, "from", currentParentId, "to", newParentId);
				const menu = menus.splice(i, 1)[0];
				Object.assign(menu, newData);
				// Đảm bảo parentId được set đúng
				menu.parentId = newParentId || "";
				if (!newParentId || newParentId === "") {
					console.log("Moving to root");
					menus.push(menu);
				} else {
					const newParent = findMenuById(menus, newParentId);
					if (newParent) {
						console.log("New parent found:", newParent.id);
						if (!(newParent as any).children) (newParent as any).children = [];
						(newParent as any).children.push(menu);
					} else {
						console.error("Parent not found for", newParentId, "moving to root");
						menus.push(menu); // fallback
					}
				}
			} else {
				Object.assign(menus[i], newData);
				// Đảm bảo parentId được set nếu có trong newData
				if (newData.parentId !== undefined) {
					menus[i].parentId = newData.parentId;
				}
			}
			return true;
		}
		if ((menus[i] as any).children && updateMenuInTree((menus[i] as any).children, id, newData)) {
			return true;
		}
	}
	return false;
}

const UPLOAD_ENDPOINT = "/upload";

function normalizeFileName(originalName: string): string {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? `.${parts.pop()}` : "";
  const base = parts.join(".");
  return base
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9.\-]/g, "")
    .concat(ext ? ext.toLowerCase() : "");
}

function parseTriggerConfig(raw: unknown): TriggerConfig | Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as TriggerConfig | Record<string, any>;
  if (typeof raw !== "string") return {};

  const tryParse = (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct && typeof direct === "object") return direct as TriggerConfig | Record<string, any>;

  let decoded: string | null = null;
  if (raw.includes("%")) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = null;
    }
  }
  if (decoded) {
    const parsedDecoded = tryParse(decoded);
    if (parsedDecoded && typeof parsedDecoded === "object") return parsedDecoded as TriggerConfig | Record<string, any>;
  }

  try {
    const decrypted = csmDecrypt(raw);
    const parsedDecrypted = tryParse(decrypted);
    if (parsedDecrypted && typeof parsedDecrypted === "object") {
      return parsedDecrypted as TriggerConfig | Record<string, any>;
    }
  } catch {
    // Ignore decrypt errors
  }

  if (decoded) {
    try {
      const decryptedDecoded = csmDecrypt(decoded);
      const parsedDecryptedDecoded = tryParse(decryptedDecoded);
      if (parsedDecryptedDecoded && typeof parsedDecryptedDecoded === "object") {
        return parsedDecryptedDecoded as TriggerConfig | Record<string, any>;
      }
    } catch {
      // Ignore decrypt errors
    }
  }

  return {};
}

function addMenuToTree(menus: MenuItemType[], newMenu: MenuItemType): void {
	const parentId = newMenu.parentId;
	if (!parentId || parentId === "") {
		menus.push(newMenu);
	} else {
		const parent = findMenuById(menus, parentId);
		if (parent) {
			if (!(parent as any).children) (parent as any).children = [];
			(parent as any).children.push(newMenu);
		} else {
			menus.push(newMenu); // fallback
		}
	}
}

const ID_TO_I18N_KEY: Record<string, string> = {
	"system": "common.menu.system",
	"user": "common.menu.user",
	"role": "common.menu.role",
	"menu": "common.menu.menu",
	"developer": "common.menu.developer",
	"dept": "common.menu.dept",
};

function getMenuLabel(menu: MenuItemType, lang: string = 'vi', t?: (key: string) => string): string {
	const currentLang = lang.toLowerCase().startsWith('en') ? 'en' : lang.toLowerCase().startsWith('zh') ? 'zh' : 'vi';
	
	if (currentLang === 'en' && menu.label_en) return menu.label_en;
	if (currentLang === 'zh' && menu.label_zh) return menu.label_zh;
	
	// Fallback to VI - check if label is i18n key
	if (menu.label) {
		// If label looks like an i18n key (e.g., "common.menu.system"), translate it
		if (t && menu.label.includes('.')) {
			return t(menu.label);
		}
		return menu.label;
	}
	if (menu.name) {
		// Same for name field
		if (t && menu.name.includes('.')) {
			return t(menu.name);
		}
		return menu.name;
	}
	// Try ID mapping as final fallback
	if (menu.id && t && ID_TO_I18N_KEY[menu.id]) {
		return t(ID_TO_I18N_KEY[menu.id]);
	}
	return menu.id || '';
}

function buildConfigString(data: Partial<MenuItemType> = {}) {
  if (!data) return "";
  if (typeof data.config === "string" && data.config.trim()) return data.config;

  const merged: Record<string, any> = {};
  if (data.table_name) merged.table_name = data.table_name;
  if (data.table) merged.table = data.table;
  if (data.trigger) merged.trigger = data.trigger;

  return Object.keys(merged).length ? JSON.stringify(merged, null, 2) : "";
}

export function Detail({
  title,
  open,
  flatParentMenus,
  onCloseChange,
  detailData,
  refreshTable,
  appId,
  treeData,
  saveMenuApp,
  fullMenuList,
  setFullMenuList,
}: DetailProps) {
  // Log treeData để kiểm tra giá trị truyền vào
  const { t } = useTranslation();
  const formRef = useRef<FormInstance>(null);
  const [tableRows, setTableRows] = useState<TableField[]>([]);
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig | Record<string, any>>({});
  const user = useUserStore();

  const handleReportUpload: UploadProps["customRequest"] = async (options) => {
    const { file, onSuccess, onError } = options;
    if (!appId) {
      message.error(t("system.menu.pleaseSelectApp"));
      onError?.(new Error("Missing appId"));
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const originalName = (file as File).name;
          const normalizedName = normalizeFileName(originalName);

          const uploadData = {
            app_id: appId,
            name: normalizedName,
            src: dataUrl,
          };

          const response = await fetch(UPLOAD_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": user.app_token || "",
            },
            body: JSON.stringify(uploadData),
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }

          const filePath = await response.text();
          const finalPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
          formRef.current?.setFieldsValue({ report_name: finalPath });
          onSuccess?.("ok");
          message.success(`Đã upload ${normalizedName}`);
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          onError?.(uploadErr as Error);
          message.error("Upload thất bại");
        }
      };
      reader.onerror = () => {
        onError?.(new Error("FileReader failed"));
      };
      reader.readAsDataURL(file as File);
    } catch (err) {
      onError?.(err as Error);
      message.error("Đọc file thất bại");
    }
  };

  const onFinish = async (values: MenuItemType) => {
    if (!appId) {
      window.$message?.error(t("system.menu.pleaseSelectApp"));
      return false;
    }

    // Sử dụng parentId từ form values, nếu không có thì từ detailData
    let parentId = values.parentId !== undefined ? values.parentId : detailData.parentId;
    if (parentId === undefined) parentId = ""; // Đảm bảo parentId luôn có giá trị
    parentId = parentId?.trim() || ""; // Trim để tránh space

    const payload: MenuItemType = {
      ...detailData,
      ...values,
      table: tableRows,
      trigger: triggerConfig,
      parentId, // Luôn set parentId
    };

    if (values.config) {
      try {
        const parsed = JSON.parse(values.config);
        if (parsed && typeof parsed === "object") {
          Object.assign(payload, parsed);
        }
      } catch (err) {
        console.warn("Config JSON parse failed, storing raw string", err);
      }
      payload.config = values.config;
    }

    try {
      if (saveMenuApp && fullMenuList && setFullMenuList) {
        // Tree view: update local tree and save
        let success = false;
        if (detailData.id) {
          // Update existing
          success = updateMenuInTree(fullMenuList, detailData.id, payload);
        } else {
          // Add new
          addMenuToTree(fullMenuList, payload as any);
          success = true;
        }
        if (!success) {
          window.$message?.error("Không tìm thấy menu để cập nhật");
          return false;
        }
        setFullMenuList([...fullMenuList]);

        // Save to backend
        await saveMenuApp();

        window.$message?.success(detailData.id ? t("common.updateSuccess") : t("common.addSuccess"));
        onCloseChange();
        return true;
      } else {
        // Table view: use API calls
        if (detailData.id) {
          await fetchUpdateMenuItem(payload, appId);
          window.$message?.success(t("common.updateSuccess"));
        } else {
          await fetchAddMenuItem(payload, appId);
          window.$message?.success(t("common.addSuccess"));
        }
        if (typeof refreshTable === 'function') {
          await refreshTable();
        }
        onCloseChange();
        return true;
      }
    } catch (err) {
      window.$message?.error(t("common.saveFailed"));
      return false;
    }
  };

  useEffect(() => {
    if (formRef.current && detailData) {
      const nextData = { ...detailData } as any;
      const configText = buildConfigString(detailData);
      if (configText) {
        nextData.config = configText;
      }
      
      // Đảm bảo các giá trị được convert về đúng type
      // Select/Dropdown fields - convert to number
      if (nextData.type_form !== undefined && nextData.type_form !== null) {
        nextData.type_form = Number(nextData.type_form);
      }
      if (nextData.row_type_edit !== undefined && nextData.row_type_edit !== null) {
        nextData.row_type_edit = Number(nextData.row_type_edit);
      }
      if (nextData.type_menu !== undefined && nextData.type_menu !== null) {
        nextData.type_menu = Number(nextData.type_menu);
      }
      if (nextData.m_show !== undefined && nextData.m_show !== null) {
        nextData.m_show = Number(nextData.m_show);
      }
      
      // Boolean fields
      if (nextData.dev !== undefined && nextData.dev !== null && typeof nextData.dev === 'string') {
        nextData.dev = nextData.dev === 'true' || nextData.dev === '1' || nextData.dev === true;
      }
      if (nextData.g_readonly !== undefined && nextData.g_readonly !== null && typeof nextData.g_readonly === 'string') {
        nextData.g_readonly = nextData.g_readonly === 'true' || nextData.g_readonly === '1' || nextData.g_readonly === true;
      }
      
      // Numeric fields
      if (nextData.table_pagesize !== undefined && nextData.table_pagesize !== null) {
        nextData.table_pagesize = Number(nextData.table_pagesize);
      }
      if (nextData.p_width !== undefined && nextData.p_width !== null) {
        nextData.p_width = Number(nextData.p_width);
      }
      if (nextData.p_height !== undefined && nextData.p_height !== null) {
        nextData.p_height = Number(nextData.p_height);
      }
      
      setTableRows(Array.isArray(detailData.table) ? detailData.table : []);
      setTriggerConfig(parseTriggerConfig(detailData.trigger));
      // Set fields except parentId since initialValues has it
      const { parentId, ...fieldsToSet } = nextData;
      formRef.current.setFieldsValue(fieldsToSet);
    }
  }, [detailData]);

  useEffect(() => {
    if (!open && formRef.current) {
      formRef.current.resetFields();
      setTableRows([]);
      setTriggerConfig({});
    }
  }, [open]);

  return (
    <ModalForm<MenuItemType>
      title={title}
      open={open}
      onOpenChange={(visible: boolean) => {
        if (!visible) {
          onCloseChange();
          formRef.current?.resetFields();
        }
      }}
      labelCol={{ md: 5, xl: 3 }}
      layout="horizontal"
      labelAlign="left"
      formRef={formRef}
      autoFocusFirstInput
      modalProps={{ destroyOnClose: true }}
      grid
      width={{ xl: 800, md: 500 }}
      onFinish={onFinish}
      key={detailData.id || 'new'}
      initialValues={detailData}
    >

    {/* Group các trường đa ngôn ngữ */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t("system.menu.multilingualGroup") || "Tên & Route đa ngôn ngữ"}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <Tabs
          defaultActiveKey="vi"
          style={{ marginBottom: 0, paddingLeft: 8, paddingRight: 8 }}
          tabBarGutter={32}
          centered
        >
          <Tabs.TabPane tab="Tiếng Việt (VI)" key="vi">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || 'Tên Menu'}
                  <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
                </div>
                <ProFormText
                  name="label"
                  noStyle
                  rules={[{ required: true, message: t("form.required") }]}
                  fieldProps={{
                    placeholder: "Tên menu (Tiếng Việt)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || 'Tên đường dẫn'}
                </div>
                <ProFormText
                  name="name"
                  noStyle
                  fieldProps={{
                    placeholder: "Tên đường dẫn (Tiếng Việt)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="English (EN)" key="en">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || 'Menu Name'}
                </div>
                <ProFormText
                  name="label_en"
                  noStyle
                  fieldProps={{
                    placeholder: "Menu name (English)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || 'Route Name'}
                </div>
                <ProFormText
                  name="name_en"
                  noStyle
                  fieldProps={{
                    placeholder: "Route name (English)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane tab="中文 (ZH)" key="zh">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.name') || '菜单名称'}
                </div>
                <ProFormText
                  name="label_zh"
                  noStyle
                  fieldProps={{
                    placeholder: "菜单名称 (中文)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  {t('system.menu.routeName') || '路由名称'}
                </div>
                <ProFormText
                  name="name_zh"
                  noStyle
                  fieldProps={{
                    placeholder: "路由名称 (中文)",
                    size: 'large',
                    style: { width: '100%' },
                  }}
                />
              </div>
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>

    {/* ...existing code... */}

    {/* Bố cục cài đặt hiển thị dữ liệu */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t('system.menu.dataDisplaySettings') || 'Cài đặt hiển thị dữ liệu'}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          {/* Thêm field type_form để chọn hình thức hiển thị */}
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.typeForm') || 'Thể hiện theo'}
              <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
            </div>
            <ProFormSelect
              name="type_form"
              noStyle
              fieldProps={{
                placeholder: 'Chọn cách hiển thị',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t('system.menu.typeForm.table') || 'Dạng bảng', value: 1 },
                { label: t('system.menu.typeForm.masterDetail') || 'Dạng Form Master-Detail', value: 2 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Cách hiển thị dữ liệu
            </div>
          </div>

          {/* Thêm field row_type_edit để chọn kiểu chỉnh sửa */}
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.rowTypeEdit') || 'Kiểu chỉnh sửa dòng'}
              <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
            </div>
            <ProFormSelect
              name="row_type_edit"
              noStyle
              fieldProps={{
                placeholder: 'Chọn kiểu chỉnh sửa',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t('system.menu.rowTypeEdit.form') || 'Dạng Form', value: 0 },
                { label: t('system.menu.rowTypeEdit.inline') || 'Chỉnh sửa trên dòng', value: 1 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Cách chỉnh sửa dữ liệu trong bảng
            </div>
          </div>

          {/* Thêm field type_menu để chọn kiểu menu */}
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.typeMenu') || 'Kiểu menu'}
              <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
            </div>
            <ProFormSelect
              name="type_menu"
              noStyle
              fieldProps={{
                placeholder: 'Chọn kiểu menu',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t('system.menu.typeMenu.column') || 'Kiểu cột', value: 0 },
                { label: t('system.menu.typeMenu.row') || 'Kiểu dòng', value: 1 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Cách sắp xếp menu con
            </div>
          </div>
        </div>
      </Card>
    </div>

    <ProFormDependency name={["table_name", "type_form"]}>
      {(values: Record<string, any>) => {
        const hasTable = !!values.table_name;
        const isMasterDetail = Number(values.type_form) === 2;
        
        // Hiển thị cảnh báo khi menu là Master-Detail
        if (hasTable && isMasterDetail) {
          return (
            <Alert
              message="Lưu ý: Menu con sẽ không hiển thị trong cây menu"
              description="Các menu con của menu này sẽ được chuyển thành TAB trong Detail Grid của Form Master-Detail. Chúng không sẽ hiển thị riêng lẻ trong menu chính."
              type="info"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }
        return null;
      }}
    </ProFormDependency>

    {/* Cài đặt cơ bản */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t('system.menu.basicSettings') || 'Cài đặt cơ bản'}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.parentMenu') || 'Menu cha'}
            </div>
            <ProFormSelect
              name="parentId"
              noStyle
              fieldProps={{
                placeholder: 'Chọn menu cha (để trống nếu là menu gốc)',
                allowClear: true,
                size: 'large',
                style: { width: '100%' },
                showSearch: true,
                filterOption: (input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase()),
              }}
              options={[
                { label: t("system.menu.root") || "Menu gốc", value: "" },
                ...flatParentMenus
                  .filter(menu => menu.id !== detailData.id) // Loại trừ chính menu đang edit
                  .map(menu => ({
                    label: `${getMenuLabel(menu, 'vi', t)}`,
                    value: menu.id,
                  }))
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Chọn menu cha để tổ chức cấu trúc menu
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.icon') || 'Icon'}
            </div>
            <ProFormText
              name="icon"
              noStyle
              fieldProps={{
                placeholder: 'Nhập tên icon (e.g., AppstoreOutlined)',
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Tên icon từ Ant Design Icons
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.table') || 'Bảng dữ liệu'}
            </div>
            <ProFormText
              name="table_name"
              noStyle
              fieldProps={{
                placeholder: 'Tên bảng dữ liệu',
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Tên bảng trong cơ sở dữ liệu
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.dev') || 'Chỉ hiện với quyền tối cao'}
            </div>
            <ProFormSelect
              name="dev"
              noStyle
              fieldProps={{
                placeholder: 'Chọn',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: 'Không', value: false },
                { label: 'Có', value: true },
              ]}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.prefixPk') || 'Tiếp đầu ngữ khi tạo ID'}
            </div>
            <ProFormText
              name="prefix_pk"
              noStyle
              fieldProps={{
                placeholder: 'e.g., USR, INV',
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Tiền tố cho khóa chính tự động
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.tablePagesize') || 'Dòng trên trang'}
            </div>
            <ProFormDigit
              name="table_pagesize"
              noStyle
              fieldProps={{
                placeholder: 'Số dòng mặc định',
                size: 'large',
                style: { width: '100%' },
                precision: 0,
              }}
              min={1}
              max={1000}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Số dòng hiển thị trên một trang
            </div>
          </div>
        </div>
      </Card>
    </div>

    {/* Cài đặt báo cáo */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t('system.menu.reportSettings') || 'Cài đặt báo cáo'}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.reportName') || 'Mẫu báo cáo'}
            </div>
            <ProFormText
              name="report_name"
              noStyle
              fieldProps={{
                placeholder: 'Tên file mẫu báo cáo',
                size: 'large',
                style: { width: '100%' },
                addonAfter: (
                  <Upload
                    accept=".doc,.docx"
                    showUploadList={false}
                    customRequest={handleReportUpload}
                  >
                    <Button type="default" size="small">
                      {t("common.upload") || "Tải lên"}
                    </Button>
                  </Upload>
                ),
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Tệp Word (.doc, .docx) đã upload lên server
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.orientation') || 'Kiểu in'}
            </div>
            <ProFormSelect
              name="orientation"
              noStyle
              fieldProps={{
                placeholder: 'Chọn kiểu in',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: 'In Dọc', value: 'p' },
                { label: 'In Ngang', value: 'l' },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Chọn kiểu in dọc hay ngang
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.pWidth') || 'Trang In Dài (mm)'}
            </div>
            <ProFormDigit
              name="p_width"
              noStyle
              fieldProps={{
                placeholder: 'Chiều dài trang',
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Mi-li-mét
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.pHeight') || 'Trang In Rộng (mm)'}
            </div>
            <ProFormDigit
              name="p_height"
              noStyle
              fieldProps={{
                placeholder: 'Chiều rộng trang',
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Mi-li-mét
            </div>
          </div>
        </div>
      </Card>
    </div>

    {/* Cài đặt hiển thị nâng cao */}
    <div style={{ marginBottom: 32, width: '100%' }}>
      <Card
        title={t('system.menu.advancedSettings') || 'Cài đặt hiển thị nâng cao'}
        bordered
        style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
        bodyStyle={{ padding: 20 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, width: '100%' }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.fieldRoot') || 'Trường liên kết Master'}
            </div>
            <ProFormText
              name="field_root"
              noStyle
              fieldProps={{
                placeholder: 'Tên trường để liên kết',
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Liên kết với bảng chính
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.mShow') || 'Hiện'}
            </div>
            <ProFormSelect
              name="m_show"
              noStyle
              fieldProps={{
                placeholder: 'Chọn',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: 'Không', value: 0 },
                { label: 'Có', value: 1 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Hiện bảng chi tiết
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.gReadonly') || 'Chỉ được xem'}
            </div>
            <ProFormSelect
              name="g_readonly"
              noStyle
              fieldProps={{
                placeholder: 'Chọn',
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: 'Không', value: false },
                { label: 'Có', value: true },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Khóa chỉnh sửa
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t('system.menu.vLink') || 'Vuejs Component'}
            </div>
            <ProFormText
              name="v_link"
              noStyle
              fieldProps={{
                placeholder: 'Tên component Vue',
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              Component tùy chọn
            </div>
          </div>
        </div>
      </Card>
    </div>

      {/* ...các trường còn lại giữ nguyên... */}
      <div style={{ height: 16 }} />

      <Tabs
        style={{ marginTop: 24, width: "100%" }}
        items={[
          {
            key: "fields",
            label: t('system.menu.tab.fields'),
            children: <FieldConfigEditor value={tableRows} onChange={setTableRows} />,
          },
          {
            key: "trigger",
            label: t('system.menu.tab.trigger'),
            children: <div style={{ width: "100%", minWidth: 0 }}><TriggerEditor value={triggerConfig} onChange={setTriggerConfig} /></div>,
          },
        ]}
      />
    </ModalForm>
  );
}
