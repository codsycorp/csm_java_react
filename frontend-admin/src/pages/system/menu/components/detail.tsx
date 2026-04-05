import type { MenuItemType } from "#src/api/system/menu";
import { fetchAddMenuItem, fetchUpdateMenuItem, saveMenuStruct } from "#src/api/system/menu";
import { handleTree } from "#src/utils";
import { isMasterDetailMenu, getMenuDisplayConfig } from "../utils/menu-logic";
import { getTableData, andWhere } from "#src/components/csm-grid/CsmApi";

import {
  ModalForm,
  ProFormCascader,
  ProFormDependency,
  ProFormDigit,
  ProFormSelect,
  ProFormText,
  ProFormTextArea,
} from "@ant-design/pro-components";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormInstance, UploadProps } from "antd";
import { Tabs, Alert, Card, Upload, Button, message, Spin, Input, Modal } from "antd";
import FieldConfigEditor from "./FieldConfigEditor";
import TriggerEditor from "./TriggerEditor";
import type { TableField, TriggerConfig } from "#src/components/csm-grid/CsmDynamicGrid";
import { KANBAN_CONFIG_TEMPLATE } from "#src/components/csm-kanban";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useUserStore } from "#src/store/user";
import { getDefaultSystemUserModeConfig, parseSystemUserModes, type SystemUserMenuModeConfig } from "#src/pages/system/admin/system-user-menu-config";

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

const UPLOAD_ENDPOINT = "/upload.shtml";

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

function parseKanbanConfig(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string") return null;

  const text = raw.trim();
  if (!text) return null;

  if (text === "KANBAN_CONFIG_TEMPLATE" || text === "#sym:KANBAN_CONFIG_TEMPLATE") {
    try {
      const parsedTemplate = JSON.parse(KANBAN_CONFIG_TEMPLATE);
      return parsedTemplate && typeof parsedTemplate === "object" ? parsedTemplate : null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string" && (parsed === "KANBAN_CONFIG_TEMPLATE" || parsed === "#sym:KANBAN_CONFIG_TEMPLATE")) {
      const parsedTemplate = JSON.parse(KANBAN_CONFIG_TEMPLATE);
      return parsedTemplate && typeof parsedTemplate === "object" ? parsedTemplate : null;
    }
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const KANBAN_STAGE_COLORS = ["blue", "orange", "green", "red", "purple", "cyan", "gold"];

function pickExistingFieldName(fields: TableField[], candidates: string[], fallback = ""): string {
  if (!Array.isArray(fields) || fields.length === 0) return fallback;
  const mapByLower = new Map<string, string>();
  fields.forEach((field) => {
    const name = String((field as any).f_name || "").trim();
    if (name) mapByLower.set(name.toLowerCase(), name);
  });

  for (const candidate of candidates) {
    const key = String(candidate || "").toLowerCase().trim();
    if (!key) continue;
    if (mapByLower.has(key)) return mapByLower.get(key)!;
  }

  return fallback;
}

function extractStagesFromTableFields(fields: TableField[], stageField: string): Array<{ id: string; label: string; color: string }> {
  if (!Array.isArray(fields) || fields.length === 0 || !stageField) return [];
  const stageFieldMeta = fields.find((field) => String((field as any).f_name || "").trim().toLowerCase() === stageField.toLowerCase());
  if (!stageFieldMeta) return [];
  const rawQuery = String((stageFieldMeta as any).f_cbo_query || "").trim();
  if (!rawQuery) return [];

  const stageItems: Array<{ id: string; label: string; color: string }> = [];
  const addStage = (idRaw: any, labelRaw: any) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const label = String(labelRaw ?? id).trim() || id;
    if (stageItems.some((item) => item.id === id)) return;
    const color = KANBAN_STAGE_COLORS[(stageItems.length % KANBAN_STAGE_COLORS.length)];
    stageItems.push({ id, label, color });
  };

  if (rawQuery.startsWith("{") || rawQuery.startsWith("[")) {
    try {
      const parsed = JSON.parse(rawQuery);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          if (item && typeof item === "object") {
            addStage(item.ma ?? item.value ?? item.id, item.ten ?? item.label ?? item.name);
          } else {
            addStage(item, item);
          }
        });
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).options)) {
        (parsed as any).options.forEach((item: any) => {
          if (item && typeof item === "object") {
            addStage(item.ma ?? item.value ?? item.id, item.ten ?? item.label ?? item.name);
          } else {
            addStage(item, item);
          }
        });
      }
    } catch {
      // Ignore malformed combo JSON and fallback to existing config stages.
    }
  }

  return stageItems;
}

function tightenKanbanConfig(
  inputConfig: Record<string, any> | null,
  tableName: string,
  fields: TableField[]
): Record<string, any> {
  const baseFromInput = inputConfig && typeof inputConfig === "object" ? inputConfig : {};
  const baseTemplate = parseKanbanConfig(KANBAN_CONFIG_TEMPLATE) || {};
  const nextConfig: Record<string, any> = {
    ...baseTemplate,
    ...baseFromInput,
  };

  const resolvedTableName = String(tableName || nextConfig.tableName || nextConfig.table_name || "").trim();
  if (resolvedTableName) {
    nextConfig.tableName = resolvedTableName;
    delete nextConfig.table_name;
  }

  const resolvedPkField = pickExistingFieldName(fields, [
    String(nextConfig.pkField || ""),
    "id",
    "pk",
  ], String(nextConfig.pkField || "id") || "id");
  nextConfig.pkField = resolvedPkField || "id";

  const resolvedStageField = pickExistingFieldName(fields, [
    String(nextConfig.stageField || ""),
    "status",
    "stage",
    "trang_thai",
  ], String(nextConfig.stageField || "status") || "status");
  nextConfig.stageField = resolvedStageField || "status";

  const resolvedTitleField = pickExistingFieldName(fields, [
    String(nextConfig.titleField || ""),
    "title",
    "name",
    "ten",
    "subject",
  ], String(nextConfig.titleField || "title") || "title");
  nextConfig.titleField = resolvedTitleField || "title";

  const resolvedDueField = pickExistingFieldName(fields, [
    String(nextConfig.dueDateField || ""),
    "due_at",
    "deadline",
    "han_xu_ly",
    "ngay_het_han",
  ], String(nextConfig.dueDateField || "due_at") || "due_at");
  nextConfig.dueDateField = resolvedDueField || "due_at";

  nextConfig.assigneeField = pickExistingFieldName(fields, [
    String(nextConfig.assigneeField || ""),
    "owner_id",
    "assignee_id",
    "user_id",
  ], String(nextConfig.assigneeField || ""));

  nextConfig.priorityField = pickExistingFieldName(fields, [
    String(nextConfig.priorityField || ""),
    "priority",
    "muc_do",
  ], String(nextConfig.priorityField || ""));

  nextConfig.descriptionField = pickExistingFieldName(fields, [
    String(nextConfig.descriptionField || ""),
    "description",
    "task_type",
    "ghi_chu",
  ], String(nextConfig.descriptionField || ""));

  if (!nextConfig.timeline || typeof nextConfig.timeline !== "object") {
    nextConfig.timeline = {};
  }
  nextConfig.timeline = {
    ...nextConfig.timeline,
    primaryDateField: pickExistingFieldName(fields, [
      String(nextConfig.timeline?.primaryDateField || ""),
      String(nextConfig.dueDateField || ""),
      "due_at",
      "start_at",
      "created_at",
    ], String(nextConfig.timeline?.primaryDateField || nextConfig.dueDateField || "due_at") || "due_at"),
  };

  if (!nextConfig.kpi || typeof nextConfig.kpi !== "object") {
    nextConfig.kpi = {};
  }
  nextConfig.kpi = {
    enabled: nextConfig.kpi.enabled ?? true,
    doneStageIds: Array.isArray(nextConfig.kpi.doneStageIds) ? nextConfig.kpi.doneStageIds : ["done"],
    createdAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.createdAtField || ""),
      "created_at",
      "ngay_tao",
    ], String(nextConfig.kpi.createdAtField || "created_at") || "created_at"),
    startedAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.startedAtField || ""),
      "start_at",
      "ngay_bat_dau",
    ], String(nextConfig.kpi.startedAtField || "start_at") || "start_at"),
    completedAtField: pickExistingFieldName(fields, [
      String(nextConfig.kpi.completedAtField || ""),
      "completed_at",
      "ngay_hoan_thanh",
    ], String(nextConfig.kpi.completedAtField || "completed_at") || "completed_at"),
  };

  const stageFromCombo = extractStagesFromTableFields(fields, String(nextConfig.stageField || ""));
  if (stageFromCombo.length > 0) {
    nextConfig.stages = stageFromCombo;
  } else if (!Array.isArray(nextConfig.stages) || nextConfig.stages.length === 0) {
    nextConfig.stages = [
      { id: "todo", label: "Chưa xử lý", color: "blue" },
      { id: "in_progress", label: "Đang xử lý", color: "orange" },
      { id: "done", label: "Hoàn thành", color: "green" },
    ];
  }

  return nextConfig;
}

function parseDoneStageIdsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(raw || "").trim();
  if (!text) return [];
  return text
    .split(/[\n,;]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function buildProgressByStage(
  stages: Array<{ id: string; label?: string; color?: string }>,
  doneStageIds: string[]
): Record<string, number> {
  const doneSet = new Set((doneStageIds || []).map((item) => String(item || "").trim()).filter(Boolean));
  const nonDone = stages.filter((stage) => !doneSet.has(String(stage.id || "").trim()));
  const result: Record<string, number> = {};
  const step = nonDone.length > 0 ? (90 / Math.max(nonDone.length, 1)) : 0;

  nonDone.forEach((stage, index) => {
    const value = Math.min(90, Math.max(0, Math.round((index + 1) * step)));
    result[String(stage.id || "")] = value;
  });
  (doneStageIds || []).forEach((stageId) => {
    result[String(stageId || "")] = 100;
  });

  return result;
}

function buildProgressTrackingDefaults(fields: TableField[]): Record<string, string> {
  return {
    taskRefField: pickExistingFieldName(fields, ["task_id", "id_task", "task_ref", "id_congviec"], "task_id"),
    stageField: pickExistingFieldName(fields, ["status", "stage", "trang_thai"], "status"),
    progressField: pickExistingFieldName(fields, ["progress_percent", "progress", "tien_do"], "progress_percent"),
    changedAtField: pickExistingFieldName(fields, ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"], "updated_at"),
    noteField: pickExistingFieldName(fields, ["note", "notes", "ghi_chu"], "note"),
    actorField: pickExistingFieldName(fields, ["updated_by", "actor_id", "user_id", "nguoi_cap_nhat"], "updated_by"),
  };
}

function buildFieldNameSet(fields: TableField[]): Set<string> {
  return new Set(
    (fields || [])
      .map((field) => String((field as any).f_name || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function fieldExistsInSet(fieldSet: Set<string>, fieldName: string): boolean {
  const normalized = String(fieldName || "").trim().toLowerCase();
  if (!normalized) return false;
  return fieldSet.has(normalized);
}

function shouldAutofillField(fieldSet: Set<string>, currentValue: unknown): boolean {
  const normalized = String(currentValue || "").trim();
  if (!normalized) return true;
  return !fieldExistsInSet(fieldSet, normalized);
}

function linkedMenuFieldsEqual(left: TableField[], right: TableField[]): boolean {
  const leftNames = (left || []).map((field) => String((field as any).f_name || "").trim()).filter(Boolean);
  const rightNames = (right || []).map((field) => String((field as any).f_name || "").trim()).filter(Boolean);
  if (leftNames.length !== rightNames.length) return false;
  return leftNames.every((name, index) => name === rightNames[index]);
}

type KanbanFieldSpec = {
  name: string;
  header: string;
  type: string;
  required?: number;
  search?: number;
  report?: number;
  cboQuery?: string;
};

function createKanbanTableField(spec: KanbanFieldSpec, stt: number): TableField {
  return {
    f_stt: stt,
    f_name: spec.name,
    f_header: spec.header,
    f_types: spec.type,
    f_show: 1,
    f_required: spec.required ?? 0,
    f_search: spec.search ?? 0,
    f_report: spec.report ?? 0,
    f_fixcol: 0,
    f_pkid: 0,
    ...(spec.cboQuery ? { f_cbo_query: spec.cboQuery } : {}),
  } as TableField;
}

function mergeMissingFields(existingFields: TableField[], specs: KanbanFieldSpec[]): { fields: TableField[]; addedNames: string[] } {
  const fields = Array.isArray(existingFields) ? [...existingFields] : [];
  const fieldSet = buildFieldNameSet(fields);
  const addedNames: string[] = [];
  let nextStt = fields.reduce((maxValue, field) => Math.max(maxValue, Number((field as any).f_stt || 0)), 0);

  specs.forEach((spec) => {
    if (fieldExistsInSet(fieldSet, spec.name)) return;
    nextStt += 1;
    fields.push(createKanbanTableField(spec, nextStt));
    fieldSet.add(String(spec.name || "").trim().toLowerCase());
    addedNames.push(spec.name);
  });

  return { fields, addedNames };
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
	"menu": "common.menu.menu",
	"developer": "common.menu.developer",
	"dept": "common.menu.permissionGroup",
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
  const { t, i18n } = useTranslation();
  const formRef = useRef<FormInstance>(null);
  const autoSyncingRef = useRef(false);
  const [applyingLinkedFieldFix, setApplyingLinkedFieldFix] = useState(false);
  const [tableRows, setTableRows] = useState<TableField[]>([]);
  const [progressTableRows, setProgressTableRows] = useState<TableField[]>([]);
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig | Record<string, any>>({});
  const [subUserModeConfig, setSubUserModeConfig] = useState<SystemUserMenuModeConfig>(() => getDefaultSystemUserModeConfig("sub", t));
  const user = useUserStore();
  const [autoCodeOptions, setAutoCodeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [loadingAutoCode, setLoadingAutoCode] = useState(false);

  const relatedDataMenuOptions = useMemo(() => {
    return (flatParentMenus || [])
      .filter((menu) => String((menu as any).table_name || "").trim())
      .map((menu) => ({
        label: `${getMenuLabel(menu, i18n.language, t)} [${String((menu as any).table_name || "").trim()}]`,
        value: menu.id,
      }));
  }, [flatParentMenus, i18n.language, t]);

  const progressDataMenuOptions = useMemo(() => {
    return (flatParentMenus || [])
      .filter((menu) => String((menu as any).table_name || "").trim())
      .map((menu) => ({
        label: `${getMenuLabel(menu, i18n.language, t)} [${String((menu as any).table_name || "").trim()}]`,
        value: menu.id,
      }));
  }, [flatParentMenus, i18n.language, t]);

  const kanbanFieldOptions = useMemo(() => {
    return (tableRows || [])
      .map((field) => String((field as any).f_name || "").trim())
      .filter(Boolean)
      .map((name) => ({ label: name, value: name }));
  }, [tableRows]);

  const kanbanProgressFieldOptions = useMemo(() => {
    return (progressTableRows || [])
      .map((field) => String((field as any).f_name || "").trim())
      .filter(Boolean)
      .map((name) => ({ label: name, value: name }));
  }, [progressTableRows]);

  const buildKanbanFieldAdvice = (depValues: Record<string, any>): string[] => {
    const advices: string[] = [];
    const mode = String(depValues.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const autoProgressRaw = depValues.kanban_auto_update_progress;
    const autoProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);

    const taskFieldSet = buildFieldNameSet(tableRows);
    const progressFieldSet = buildFieldNameSet(progressTableRows);

    const linkedTaskMenuId = String(depValues.linked_data_menu_id || "").trim();
    if (!linkedTaskMenuId) {
      advices.push(t("system.menu.kanbanSmartAdviceTaskMenuMissing"));
    }

    const taskMissing: string[] = [];
    const taskCandidates: string[] = [];
    const taskChecks = [
      {
        label: t("system.menu.kanbanStageFieldLabel"),
        selected: String(depValues.kanban_stage_field || "").trim(),
        candidates: ["status", "stage", "trang_thai"],
      },
      {
        label: t("system.menu.kanbanTitleFieldLabel"),
        selected: String(depValues.kanban_title_field || "").trim(),
        candidates: ["title", "name", "ten", "subject"],
      },
      {
        label: t("system.menu.kanbanDueDateFieldLabel"),
        selected: String(depValues.kanban_due_date_field || "").trim(),
        candidates: ["due_at", "deadline", "han_xu_ly"],
      },
      {
        label: t("system.menu.kanbanProgressFieldLabel"),
        selected: String(depValues.kanban_progress_field || "").trim(),
        candidates: ["progress_percent", "progress", "tien_do"],
        enabled: autoProgress,
      },
    ];

    taskChecks.forEach((check) => {
      if (check.enabled === false) return;
      if (check.selected && fieldExistsInSet(taskFieldSet, check.selected)) return;
      const suggested = pickExistingFieldName(tableRows, [check.selected, ...check.candidates], "");
      if (suggested && fieldExistsInSet(taskFieldSet, suggested)) return;
      taskMissing.push(check.label);
      taskCandidates.push(...check.candidates);
    });

    if (taskMissing.length > 0) {
      advices.push(
        `${t("system.menu.kanbanSmartAdviceTaskFieldsMissing")}: ${taskMissing.join(", ")}. ${t("system.menu.kanbanSmartAdviceCandidatePrefix")}: ${Array.from(new Set(taskCandidates)).join(", ")}`
      );
    }

    if (mode === "separate_table") {
      const linkedProgressMenuId = String(depValues.linked_progress_menu_id || "").trim();
      if (!linkedProgressMenuId) {
        advices.push(t("system.menu.kanbanSmartAdviceProgressMenuMissing"));
      }

      const progressMissing: string[] = [];
      const progressCandidates: string[] = [];
      const progressChecks = [
        {
          label: t("system.menu.kanbanProgressTaskRefFieldLabel"),
          selected: String(depValues.kanban_progress_task_ref_field || "").trim(),
          candidates: ["task_id", "id_task", "task_ref", "id_congviec"],
        },
        {
          label: t("system.menu.kanbanProgressStageLogFieldLabel"),
          selected: String(depValues.kanban_progress_stage_log_field || "").trim(),
          candidates: ["status", "stage", "trang_thai"],
        },
        {
          label: t("system.menu.kanbanProgressPercentLogFieldLabel"),
          selected: String(depValues.kanban_progress_percent_log_field || "").trim(),
          candidates: ["progress_percent", "progress", "tien_do"],
        },
        {
          label: t("system.menu.kanbanProgressTimeFieldLabel"),
          selected: String(depValues.kanban_progress_time_field || "").trim(),
          candidates: ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"],
        },
      ];

      progressChecks.forEach((check) => {
        if (check.selected && fieldExistsInSet(progressFieldSet, check.selected)) return;
        const suggested = pickExistingFieldName(progressTableRows, [check.selected, ...check.candidates], "");
        if (suggested && fieldExistsInSet(progressFieldSet, suggested)) return;
        progressMissing.push(check.label);
        progressCandidates.push(...check.candidates);
      });

      if (progressMissing.length > 0) {
        advices.push(
          `${t("system.menu.kanbanSmartAdviceProgressFieldsMissing")}: ${progressMissing.join(", ")}. ${t("system.menu.kanbanSmartAdviceCandidatePrefix")}: ${Array.from(new Set(progressCandidates)).join(", ")}`
        );
      }
    }

    return advices;
  };

  const getMissingKanbanFieldPlan = (depValues?: Record<string, any>) => {
    const values = depValues || formRef.current?.getFieldsValue?.() || {};
    const mode = String(values.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const autoProgressRaw = values.kanban_auto_update_progress;
    const autoProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);
    const defaultStageQuery = JSON.stringify([
      { ma: "todo", ten: "Chua xu ly" },
      { ma: "in_progress", ten: "Dang xu ly" },
      { ma: "done", ten: "Hoan thanh" },
    ]);

    const taskMenuId = String(values.linked_data_menu_id || "").trim();
    const taskMenu = (flatParentMenus || []).find((menu) => menu.id === taskMenuId) as any;
    const taskFields = Array.isArray(taskMenu?.table) ? taskMenu.table : tableRows;
    const taskFieldSet = buildFieldNameSet(taskFields);
    const taskSpecs: KanbanFieldSpec[] = [];
    const pushTaskSpecIfMissing = (selected: string, candidates: string[], spec: KanbanFieldSpec) => {
      const matched = pickExistingFieldName(taskFields, [selected, ...candidates], "");
      if (matched && fieldExistsInSet(taskFieldSet, matched)) return;
      taskSpecs.push(spec);
    };

    if (taskMenuId) {
      pushTaskSpecIfMissing(String(values.kanban_stage_field || "").trim(), ["status", "stage", "trang_thai"], {
        name: "status",
        header: "Trang thai",
        type: "co",
        required: 1,
        search: 1,
        report: 1,
        cboQuery: defaultStageQuery,
      });
      pushTaskSpecIfMissing(String(values.kanban_title_field || "").trim(), ["title", "name", "ten", "subject"], {
        name: "title",
        header: "Tieu de",
        type: "ed",
        required: 1,
        search: 1,
        report: 1,
      });
      pushTaskSpecIfMissing(String(values.kanban_due_date_field || "").trim(), ["due_at", "deadline", "han_xu_ly"], {
        name: "due_at",
        header: "Han xu ly",
        type: "datetime",
        report: 1,
      });
      if (autoProgress) {
        pushTaskSpecIfMissing(String(values.kanban_progress_field || "").trim(), ["progress_percent", "progress", "tien_do"], {
          name: "progress_percent",
          header: "Tien do (%)",
          type: "nummeric",
          report: 1,
        });
      }
    }

    const progressMenuId = String(values.linked_progress_menu_id || "").trim();
    const progressMenu = (flatParentMenus || []).find((menu) => menu.id === progressMenuId) as any;
    const progressFields = Array.isArray(progressMenu?.table) ? progressMenu.table : progressTableRows;
    const progressFieldSet = buildFieldNameSet(progressFields);
    const progressSpecs: KanbanFieldSpec[] = [];
    const pushProgressSpecIfMissing = (selected: string, candidates: string[], spec: KanbanFieldSpec) => {
      const matched = pickExistingFieldName(progressFields, [selected, ...candidates], "");
      if (matched && fieldExistsInSet(progressFieldSet, matched)) return;
      progressSpecs.push(spec);
    };

    if (mode === "separate_table" && progressMenuId) {
      pushProgressSpecIfMissing(String(values.kanban_progress_task_ref_field || "").trim(), ["task_id", "id_task", "task_ref", "id_congviec"], {
        name: "task_id",
        header: "Ma cong viec",
        type: "ed",
        required: 1,
        search: 1,
        report: 1,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_stage_log_field || "").trim(), ["status", "stage", "trang_thai"], {
        name: "status",
        header: "Trang thai",
        type: "co",
        required: 1,
        search: 1,
        report: 1,
        cboQuery: defaultStageQuery,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_percent_log_field || "").trim(), ["progress_percent", "progress", "tien_do"], {
        name: "progress_percent",
        header: "Tien do (%)",
        type: "nummeric",
        report: 1,
      });
      pushProgressSpecIfMissing(String(values.kanban_progress_time_field || "").trim(), ["updated_at", "changed_at", "created_at", "thoi_gian_cap_nhat"], {
        name: "updated_at",
        header: "Thoi diem cap nhat",
        type: "datetime",
        required: 1,
        search: 1,
        report: 1,
      });
    }

    return {
      taskMenu,
      taskSpecs,
      progressMenu,
      progressSpecs,
      mode,
    };
  };

  const syncLinkedTaskMenuFields = (options?: { silent?: boolean; force?: boolean; linkedMenuId?: string; linkedMenu?: any }) => {
    const linkedMenuId = String(options?.linkedMenuId || formRef.current?.getFieldValue("linked_data_menu_id") || "").trim();
    if (!linkedMenuId) return;

    const linkedMenu = (options?.linkedMenu || (flatParentMenus || []).find((menu) => menu.id === linkedMenuId)) as any;
    if (!linkedMenu) return;

    const linkedTableName = String(linkedMenu.table_name || "").trim();
    const linkedTableFields = Array.isArray(linkedMenu.table) ? linkedMenu.table : [];
    const taskFieldSet = buildFieldNameSet(linkedTableFields);
    const currentValues = formRef.current?.getFieldsValue?.() || {};
    const currentKanban = parseKanbanConfig(currentValues.kanban_config);
    const nextKanban = tightenKanbanConfig(currentKanban, linkedTableName, linkedTableFields);
    nextKanban.linkedDataMenuId = linkedMenuId;

    if (linkedMenuFieldsEqual(tableRows, linkedTableFields) === false) {
      setTableRows(linkedTableFields);
    }

    if (linkedMenu.trigger && typeof linkedMenu.trigger === "object") {
      setTriggerConfig((prev) => {
        if (JSON.stringify(prev || {}) === JSON.stringify(linkedMenu.trigger || {})) return prev;
        return linkedMenu.trigger;
      });
    }

    const updates: Record<string, any> = {};
    const force = options?.force === true;
    if (linkedTableName && (force || !String(currentValues.table_name || "").trim())) {
      updates.table_name = linkedTableName;
    }

    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_stage_field)) {
      updates.kanban_stage_field = nextKanban.stageField;
    }
    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_title_field)) {
      updates.kanban_title_field = nextKanban.titleField;
    }
    if (force || shouldAutofillField(taskFieldSet, currentValues.kanban_due_date_field)) {
      updates.kanban_due_date_field = nextKanban.dueDateField;
    }

    const nextProgressField = String(nextKanban?.kpi?.progressField || "").trim();
    if (nextProgressField && (force || shouldAutofillField(taskFieldSet, currentValues.kanban_progress_field))) {
      updates.kanban_progress_field = nextProgressField;
    }

    if (force || !String(currentValues.kanban_done_stage_ids || "").trim()) {
      const doneStageIds = Array.isArray(nextKanban?.kpi?.doneStageIds) ? nextKanban.kpi.doneStageIds : [];
      updates.kanban_done_stage_ids = doneStageIds.join(",");
    }

    const strictModeSelection = currentValues.kanban_strict_mode;
    if (strictModeSelection !== undefined && strictModeSelection !== null && strictModeSelection !== "inherit") {
      nextKanban.governance = {
        ...(nextKanban.governance || {}),
        strictMode: strictModeSelection === true || strictModeSelection === "true" || strictModeSelection === 1,
      };
    }

    const autoProgressSelection = currentValues.kanban_auto_update_progress;
    if (autoProgressSelection !== undefined && autoProgressSelection !== null && autoProgressSelection !== "inherit") {
      nextKanban.kpi = {
        ...(nextKanban.kpi || {}),
        autoUpdateProgressOnStageChange: autoProgressSelection === true || autoProgressSelection === "true" || autoProgressSelection === 1,
      };
    }

    const mergedConfig = {
      ...nextKanban,
      stageField: updates.kanban_stage_field || currentValues.kanban_stage_field || nextKanban.stageField,
      titleField: updates.kanban_title_field || currentValues.kanban_title_field || nextKanban.titleField,
      dueDateField: updates.kanban_due_date_field || currentValues.kanban_due_date_field || nextKanban.dueDateField,
      kpi: {
        ...(nextKanban.kpi || {}),
        progressField: updates.kanban_progress_field || currentValues.kanban_progress_field || nextKanban?.kpi?.progressField,
        doneStageIds: parseDoneStageIdsInput(updates.kanban_done_stage_ids || currentValues.kanban_done_stage_ids || nextKanban?.kpi?.doneStageIds),
      },
    };

    updates.kanban_config = JSON.stringify(mergedConfig, null, 2);

    if (Object.keys(updates).length > 0) {
      autoSyncingRef.current = true;
      formRef.current?.setFieldsValue(updates);
      queueMicrotask(() => {
        autoSyncingRef.current = false;
      });
    }

    if (!options?.silent) {
      message.success(t("system.menu.kanbanAutoFilledFromLinkedMenus"));
    }
  };

  const syncLinkedProgressMenuFields = (options?: { silent?: boolean; force?: boolean; linkedProgressMenuId?: string; mode?: string; linkedMenu?: any }) => {
    const currentValues = formRef.current?.getFieldsValue?.() || {};
    const mode = String(options?.mode || currentValues.kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    if (mode !== "separate_table") return;

    const linkedProgressMenuId = String(options?.linkedProgressMenuId || currentValues.linked_progress_menu_id || "").trim();
    if (!linkedProgressMenuId) return;

    const progressMenu = (options?.linkedMenu || (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId)) as any;
    if (!progressMenu) return;

    const progressFields = Array.isArray(progressMenu.table) ? progressMenu.table : [];
    const progressFieldSet = buildFieldNameSet(progressFields);
    const defaults = buildProgressTrackingDefaults(progressFields);
    const currentKanban = parseKanbanConfig(currentValues.kanban_config);
    const nextKanban = { ...(currentKanban || {}) } as Record<string, any>;

    if (linkedMenuFieldsEqual(progressTableRows, progressFields) === false) {
      setProgressTableRows(progressFields);
    }

    const force = options?.force === true;
    const updates: Record<string, any> = {};
    const mappingPairs = [
      ["kanban_progress_task_ref_field", defaults.taskRefField],
      ["kanban_progress_stage_log_field", defaults.stageField],
      ["kanban_progress_percent_log_field", defaults.progressField],
      ["kanban_progress_time_field", defaults.changedAtField],
      ["kanban_progress_note_field", defaults.noteField],
      ["kanban_progress_actor_field", defaults.actorField],
    ] as const;

    mappingPairs.forEach(([formKey, suggestedValue]) => {
      if (!suggestedValue) return;
      if (force || shouldAutofillField(progressFieldSet, currentValues[formKey])) {
        updates[formKey] = suggestedValue;
      }
    });

    nextKanban.linkedProgressMenuId = linkedProgressMenuId;
    nextKanban.progressTracking = {
      ...(nextKanban.progressTracking || {}),
      mode: "separate_table",
      progressTableName: String(progressMenu.table_name || "").trim(),
      taskRefField: updates.kanban_progress_task_ref_field || currentValues.kanban_progress_task_ref_field || defaults.taskRefField,
      stageField: updates.kanban_progress_stage_log_field || currentValues.kanban_progress_stage_log_field || defaults.stageField,
      progressField: updates.kanban_progress_percent_log_field || currentValues.kanban_progress_percent_log_field || defaults.progressField,
      changedAtField: updates.kanban_progress_time_field || currentValues.kanban_progress_time_field || defaults.changedAtField,
      noteField: updates.kanban_progress_note_field || currentValues.kanban_progress_note_field || defaults.noteField,
      actorField: updates.kanban_progress_actor_field || currentValues.kanban_progress_actor_field || defaults.actorField,
      appendOnly: true,
      writeBackMainTable: true,
    };

    updates.kanban_config = JSON.stringify(nextKanban, null, 2);

    if (Object.keys(updates).length > 0) {
      autoSyncingRef.current = true;
      formRef.current?.setFieldsValue(updates);
      queueMicrotask(() => {
        autoSyncingRef.current = false;
      });
    }

    if (!options?.silent) {
      message.success(t("system.menu.kanbanAutoFilledFromLinkedMenus"));
    }

    const unresolved = [
      nextKanban.progressTracking.taskRefField,
      nextKanban.progressTracking.stageField,
      nextKanban.progressTracking.progressField,
      nextKanban.progressTracking.changedAtField,
    ].filter((fieldName) => !fieldExistsInSet(progressFieldSet, String(fieldName || "")));

    if (unresolved.length > 0) {
      message.warning(
        `${t("system.menu.kanbanSmartAutoMappedWithGaps")} ${Array.from(new Set(unresolved)).join(", ")}`
      );
    }
  };

  const applyMissingFieldsToLinkedMenus = async (depValues?: Record<string, any>) => {
    if (!appId) {
      message.error(t("system.menu.pleaseSelectApp"));
      return;
    }

    const plan = getMissingKanbanFieldPlan(depValues);
    const taskUpdate = plan.taskMenu && plan.taskSpecs.length > 0
      ? { menu: plan.taskMenu, merged: mergeMissingFields(Array.isArray(plan.taskMenu.table) ? plan.taskMenu.table : [], plan.taskSpecs) }
      : null;
    const progressUpdate = plan.progressMenu && plan.progressSpecs.length > 0
      ? { menu: plan.progressMenu, merged: mergeMissingFields(Array.isArray(plan.progressMenu.table) ? plan.progressMenu.table : [], plan.progressSpecs) }
      : null;

    if (!taskUpdate && !progressUpdate) {
      message.info(t("system.menu.kanbanAutoCreateNoMissingFields"));
      return;
    }

    setApplyingLinkedFieldFix(true);
    try {
      if (fullMenuList && setFullMenuList) {
        const nextMenuTree = JSON.parse(JSON.stringify(fullMenuList)) as MenuItemType[];
        if (taskUpdate) {
          updateMenuInTree(nextMenuTree, taskUpdate.menu.id, { table: taskUpdate.merged.fields });
        }
        if (progressUpdate) {
          updateMenuInTree(nextMenuTree, progressUpdate.menu.id, { table: progressUpdate.merged.fields });
        }
        setFullMenuList(nextMenuTree);
        await saveMenuStruct(appId, nextMenuTree);
      } else {
        if (taskUpdate) {
          await fetchUpdateMenuItem({ ...taskUpdate.menu, table: taskUpdate.merged.fields }, appId);
        }
        if (progressUpdate) {
          await fetchUpdateMenuItem({ ...progressUpdate.menu, table: progressUpdate.merged.fields }, appId);
        }
        if (typeof refreshTable === "function") {
          await refreshTable();
        }
      }

      if (taskUpdate) {
        taskUpdate.menu.table = taskUpdate.merged.fields;
        setTableRows(taskUpdate.merged.fields);
        syncLinkedTaskMenuFields({
          silent: true,
          force: true,
          linkedMenuId: taskUpdate.menu.id,
          linkedMenu: taskUpdate.menu,
        });
      }
      if (progressUpdate) {
        progressUpdate.menu.table = progressUpdate.merged.fields;
        setProgressTableRows(progressUpdate.merged.fields);
        syncLinkedProgressMenuFields({
          silent: true,
          force: true,
          linkedProgressMenuId: progressUpdate.menu.id,
          mode: plan.mode,
          linkedMenu: progressUpdate.menu,
        });
      }

      const addedNames = [
        ...(taskUpdate?.merged.addedNames || []),
        ...(progressUpdate?.merged.addedNames || []),
      ];
      message.success(`${t("system.menu.kanbanAutoCreateSuccess")} ${addedNames.join(", ")}`);
    } catch (error) {
      console.error("Failed to auto-create linked menu fields:", error);
      message.error(t("system.menu.kanbanAutoCreateFailed"));
    } finally {
      setApplyingLinkedFieldFix(false);
    }
  };

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

          const responseText = await response.text();
          let finalPath = "";

          try {
            const parsed = JSON.parse(responseText);
            const candidate = typeof parsed?.path === "string"
              ? parsed.path
              : (typeof parsed?.url === "string" ? parsed.url : "");
            if (candidate) {
              finalPath = candidate.startsWith("/") ? candidate : `/${candidate}`;
            }
          } catch {
            const trimmed = responseText.trim();
            if (trimmed && !/^<!doctype html>/i.test(trimmed)) {
              finalPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
            }
          }

          if (!finalPath) {
            throw new Error("Upload response invalid path");
          }

          formRef.current?.setFieldsValue({ report_name: finalPath });
          onSuccess?.("ok");
          message.success(t("system.menu.uploadReportSuccess", { file: normalizedName }));
        } catch (uploadErr) {
          console.error("Upload error:", uploadErr);
          onError?.(uploadErr as Error);
          message.error(t("system.menu.uploadReportFailed"));
        }
      };
      reader.onerror = () => {
        onError?.(new Error("FileReader failed"));
      };
      reader.readAsDataURL(file as File);
    } catch (err) {
      onError?.(err as Error);
      message.error(t("system.menu.readFileFailed"));
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

    const isKanbanMenu = Number(values.type_form ?? detailData.type_form ?? payload.type_form ?? 0) === 6;
    const linkedDataMenuIdRaw = String((values as any).linked_data_menu_id || "").trim();
    const progressTrackingMode = String((values as any).kanban_progress_tracking_mode || "single_table").trim() || "single_table";
    const linkedProgressMenuIdRaw = String((values as any).linked_progress_menu_id || "").trim();
    const progressTaskRefFieldRaw = String((values as any).kanban_progress_task_ref_field || "").trim();
    const stageFieldRaw = String((values as any).kanban_stage_field || "").trim();
    const progressFieldRaw = String((values as any).kanban_progress_field || "").trim();
    const autoProgressRaw = (values as any).kanban_auto_update_progress;
    const autoUpdateProgress = autoProgressRaw === undefined || autoProgressRaw === null || autoProgressRaw === "inherit"
      ? true
      : (autoProgressRaw === true || autoProgressRaw === "true" || autoProgressRaw === 1);

    if (isKanbanMenu && !linkedDataMenuIdRaw) {
      window.$message?.error(t("system.menu.kanbanLinkedMenuRequired"));
      return false;
    }

    if (isKanbanMenu && autoUpdateProgress) {
      if (!stageFieldRaw) {
        window.$message?.error(t("system.menu.kanbanStageFieldRequired"));
        return false;
      }
      if (!progressFieldRaw) {
        window.$message?.error(t("system.menu.kanbanProgressFieldRequired"));
        return false;
      }
    }

    if (isKanbanMenu && progressTrackingMode === "separate_table") {
      if (!linkedProgressMenuIdRaw) {
        window.$message?.error(t("system.menu.kanbanProgressLinkedMenuRequired") || "Vui lòng chọn menu bảng tiến độ");
        return false;
      }
      if (!progressTaskRefFieldRaw) {
        window.$message?.error(t("system.menu.kanbanProgressTaskRefFieldRequired") || "Vui lòng chọn field tham chiếu công việc ở bảng tiến độ");
        return false;
      }
    }

    const isSystemUserMenu = (values.path || detailData.path) === "/system/user";
    if (isSystemUserMenu) {
      payload.system_user_modes = {
        main: {
          table_name: payload.table_name,
          table: tableRows,
          trigger: triggerConfig,
          type_form: payload.type_form,
          row_type_edit: payload.row_type_edit,
          g_readonly: payload.g_readonly,
        },
        sub: {
          ...subUserModeConfig,
          table_name: String(subUserModeConfig.table_name || "csm_group_members").trim() || "csm_group_members",
          table: Array.isArray(subUserModeConfig.table) ? subUserModeConfig.table : [],
          trigger: subUserModeConfig.trigger && typeof subUserModeConfig.trigger === "object" ? subUserModeConfig.trigger : {},
          type_form: subUserModeConfig.type_form ?? payload.type_form ?? 1,
          row_type_edit: subUserModeConfig.row_type_edit ?? payload.row_type_edit ?? 0,
          g_readonly: subUserModeConfig.g_readonly ?? false,
        },
      };
    }

    if (typeof values.kanban_config === "string") {
      const trimmed = values.kanban_config.trim();
      if (trimmed) {
        const parsedKanban = parseKanbanConfig(trimmed);
        if (!parsedKanban) {
          window.$message?.error(t("system.menu.kanbanConfigInvalidJson"));
          return false;
        }

        const sourceTableName = String(values.table_name || payload.table_name || parsedKanban.tableName || "").trim();
        const normalizedKanban = tightenKanbanConfig(parsedKanban, sourceTableName, tableRows);

        const strictModeSelection = (values as any).kanban_strict_mode;
        if (strictModeSelection !== undefined && strictModeSelection !== null && strictModeSelection !== "inherit") {
          normalizedKanban.governance = {
            ...(normalizedKanban.governance || {}),
            strictMode: strictModeSelection === true || strictModeSelection === "true" || strictModeSelection === 1,
          };
        }

        const stageFieldOverride = String((values as any).kanban_stage_field || "").trim();
        if (stageFieldOverride) {
          normalizedKanban.stageField = pickExistingFieldName(tableRows, [stageFieldOverride], stageFieldOverride);
        }

        const titleFieldOverride = String((values as any).kanban_title_field || "").trim();
        if (titleFieldOverride) {
          normalizedKanban.titleField = pickExistingFieldName(tableRows, [titleFieldOverride], titleFieldOverride);
        }

        const dueDateFieldOverride = String((values as any).kanban_due_date_field || "").trim();
        if (dueDateFieldOverride) {
          normalizedKanban.dueDateField = pickExistingFieldName(tableRows, [dueDateFieldOverride], dueDateFieldOverride);
          normalizedKanban.timeline = {
            ...(normalizedKanban.timeline || {}),
            primaryDateField: normalizedKanban.dueDateField,
          };
        }

        const progressFieldOverride = String((values as any).kanban_progress_field || "").trim();
        if (!normalizedKanban.kpi || typeof normalizedKanban.kpi !== "object") {
          normalizedKanban.kpi = {};
        }
        const autoProgressSelection = (values as any).kanban_auto_update_progress;
        if (autoProgressSelection !== undefined && autoProgressSelection !== null && autoProgressSelection !== "inherit") {
          normalizedKanban.kpi.autoUpdateProgressOnStageChange = autoProgressSelection === true || autoProgressSelection === "true" || autoProgressSelection === 1;
        } else if (normalizedKanban.kpi.autoUpdateProgressOnStageChange == null) {
          normalizedKanban.kpi.autoUpdateProgressOnStageChange = true;
        }
        if (progressFieldOverride) {
          normalizedKanban.kpi.progressField = pickExistingFieldName(tableRows, [progressFieldOverride], progressFieldOverride);
        }

        if (normalizedKanban.kpi.autoUpdateProgressOnStageChange && !normalizedKanban.kpi.progressField) {
          window.$message?.error(t("system.menu.kanbanProgressFieldRequired"));
          return false;
        }

        const doneStageIds = parseDoneStageIdsInput((values as any).kanban_done_stage_ids);
        if (doneStageIds.length > 0) {
          normalizedKanban.kpi.doneStageIds = doneStageIds;
        }

        const refreshedStages = extractStagesFromTableFields(tableRows, String(normalizedKanban.stageField || ""));
        if (refreshedStages.length > 0) {
          normalizedKanban.stages = refreshedStages;
        }
        if (Array.isArray(normalizedKanban.stages) && normalizedKanban.stages.length > 0) {
          const doneIds = Array.isArray(normalizedKanban.kpi.doneStageIds) ? normalizedKanban.kpi.doneStageIds : [];
          normalizedKanban.kpi.progressByStage = buildProgressByStage(normalizedKanban.stages, doneIds);
        }

        const linkedDataMenuId = String((values as any).linked_data_menu_id || "").trim();
        if (linkedDataMenuId) {
          normalizedKanban.linkedDataMenuId = linkedDataMenuId;
        }

        const progressTracking: Record<string, any> = {
          mode: progressTrackingMode === "separate_table" ? "separate_table" : "single_table",
          writeBackMainTable: true,
          appendOnly: true,
        };

        if (progressTracking.mode === "separate_table") {
          const linkedProgressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuIdRaw) as any;
          const linkedProgressTableName = String(linkedProgressMenu?.table_name || (values as any).kanban_progress_table_name || "").trim();
          if (linkedProgressMenuIdRaw) normalizedKanban.linkedProgressMenuId = linkedProgressMenuIdRaw;
          if (linkedProgressTableName) progressTracking.progressTableName = linkedProgressTableName;

          const fallbackProgressFields = Array.isArray(progressTableRows) ? progressTableRows : [];
          const defaults = buildProgressTrackingDefaults(fallbackProgressFields);
          progressTracking.taskRefField = String((values as any).kanban_progress_task_ref_field || defaults.taskRefField || "task_id").trim() || "task_id";
          progressTracking.stageField = String((values as any).kanban_progress_stage_log_field || defaults.stageField || "status").trim() || "status";
          progressTracking.progressField = String((values as any).kanban_progress_percent_log_field || defaults.progressField || "progress_percent").trim() || "progress_percent";
          progressTracking.changedAtField = String((values as any).kanban_progress_time_field || defaults.changedAtField || "updated_at").trim() || "updated_at";
          progressTracking.noteField = String((values as any).kanban_progress_note_field || defaults.noteField || "note").trim() || "note";
          progressTracking.actorField = String((values as any).kanban_progress_actor_field || defaults.actorField || "updated_by").trim() || "updated_by";

          if (!normalizedKanban.kpi?.progressField && progressTracking.progressField) {
            normalizedKanban.kpi.progressField = progressTracking.progressField;
          }
        }

        normalizedKanban.progressTracking = progressTracking;

        payload.kanban_config = normalizedKanban;
      }
      else {
        payload.kanban_config = undefined;
      }
    }

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
          window.$message?.error(t("system.menu.menuNotFoundForUpdate"));
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
      const parsedKanbanOnLoad = parseKanbanConfig(nextData.kanban_config);
      if (parsedKanbanOnLoad) {
        const sourceFields = Array.isArray(nextData.table) ? nextData.table : [];
        const tightenedKanbanOnLoad = tightenKanbanConfig(
          parsedKanbanOnLoad,
          String(nextData.table_name || parsedKanbanOnLoad.tableName || "").trim(),
          sourceFields,
        );
        if (tightenedKanbanOnLoad?.governance && typeof tightenedKanbanOnLoad.governance === "object") {
          nextData.kanban_strict_mode = tightenedKanbanOnLoad.governance.strictMode;
        }
        if (tightenedKanbanOnLoad?.linkedDataMenuId) {
          nextData.linked_data_menu_id = tightenedKanbanOnLoad.linkedDataMenuId;
        }
        nextData.kanban_auto_update_progress = tightenedKanbanOnLoad?.kpi?.autoUpdateProgressOnStageChange;
        nextData.kanban_stage_field = tightenedKanbanOnLoad.stageField;
        nextData.kanban_title_field = tightenedKanbanOnLoad.titleField;
        nextData.kanban_due_date_field = tightenedKanbanOnLoad.dueDateField;
        nextData.kanban_progress_field = tightenedKanbanOnLoad?.kpi?.progressField;
        nextData.kanban_progress_tracking_mode = tightenedKanbanOnLoad?.progressTracking?.mode || "single_table";
        nextData.linked_progress_menu_id = tightenedKanbanOnLoad?.linkedProgressMenuId;
        nextData.kanban_progress_task_ref_field = tightenedKanbanOnLoad?.progressTracking?.taskRefField;
        nextData.kanban_progress_stage_log_field = tightenedKanbanOnLoad?.progressTracking?.stageField;
        nextData.kanban_progress_percent_log_field = tightenedKanbanOnLoad?.progressTracking?.progressField;
        nextData.kanban_progress_time_field = tightenedKanbanOnLoad?.progressTracking?.changedAtField;
        nextData.kanban_progress_note_field = tightenedKanbanOnLoad?.progressTracking?.noteField;
        nextData.kanban_progress_actor_field = tightenedKanbanOnLoad?.progressTracking?.actorField;
        nextData.kanban_done_stage_ids = Array.isArray(tightenedKanbanOnLoad?.kpi?.doneStageIds)
          ? tightenedKanbanOnLoad.kpi.doneStageIds.join(",")
          : "";
        nextData.kanban_config = JSON.stringify(tightenedKanbanOnLoad, null, 2);

        const linkedProgressMenuId = String(tightenedKanbanOnLoad?.linkedProgressMenuId || nextData.linked_progress_menu_id || "").trim();
        if (linkedProgressMenuId) {
          const linkedProgressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId) as any;
          if (linkedProgressMenu && Array.isArray(linkedProgressMenu.table)) {
            setProgressTableRows(linkedProgressMenu.table);
          }
        }
      }

      const systemUserModes = parseSystemUserModes(detailData);
      setSubUserModeConfig({
        ...getDefaultSystemUserModeConfig("sub", t),
        ...(systemUserModes.sub || {}),
      });
      
      setTableRows(Array.isArray(detailData.table) ? detailData.table : []);
      setTriggerConfig(parseTriggerConfig(detailData.trigger));
      // Set fields except parentId since initialValues has it
      const { parentId, ...fieldsToSet } = nextData;
      formRef.current.setFieldsValue(fieldsToSet);
    }
  }, [detailData, flatParentMenus]);

  useEffect(() => {
    if (!open && formRef.current) {
      formRef.current.resetFields();
      setTableRows([]);
      setProgressTableRows([]);
      setTriggerConfig({});
      setSubUserModeConfig(getDefaultSystemUserModeConfig("sub", t));
    }
  }, [open, t]);

  // Load sys_autos (dynamic code templates) when modal opens
  useEffect(() => {
    if (!open) return;
    
    const loadAutoCode = async () => {
      try {
        setLoadingAutoCode(true);
        const where = andWhere([
          { field: "p_type", type: "eq", value: 0 } // Only load p_type=0 (code templates)
        ]);
        
        const response = await getTableData<any>({
          app_id: "csm",
          obj_name: "sys_autos",
          where,
          take: 100
        });
        
        const rows = (response as any)?.rows || (response as any)?.data || [];
        const options = rows
          .filter((r: any) => r?.p_name)
          .map((r: any) => ({
            label: r.p_name,
            value: r.p_name
          }));
        
        setAutoCodeOptions(options);
      } catch (err) {
        console.error("Failed to load auto code templates:", err);
        setAutoCodeOptions([]);
      } finally {
        setLoadingAutoCode(false);
      }
    };
    
    loadAutoCode();
  }, [open]);

  const linkRelatedDataMenu = () => {
    const linkedMenuId = String(formRef.current?.getFieldValue("linked_data_menu_id") || "").trim();
    if (!linkedMenuId) {
      message.warning(t("system.menu.kanbanSelectLinkedMenu"));
      return;
    }

    const linkedMenu = (flatParentMenus || []).find((menu) => menu.id === linkedMenuId) as any;
    if (!linkedMenu) {
      message.error(t("system.menu.kanbanLinkedMenuNotFound"));
      return;
    }

    syncLinkedTaskMenuFields({ force: true });

    message.success(t("system.menu.kanbanGeneratedFromLinkedMenu"));
  };

  const linkProgressDataMenu = () => {
    const linkedProgressMenuId = String(formRef.current?.getFieldValue("linked_progress_menu_id") || "").trim();
    if (!linkedProgressMenuId) {
      message.warning(t("system.menu.kanbanProgressSelectLinkedMenu") || "Vui lòng chọn menu bảng tiến độ");
      return;
    }

    const progressMenu = (flatParentMenus || []).find((menu) => menu.id === linkedProgressMenuId) as any;
    if (!progressMenu) {
      message.error(t("system.menu.kanbanProgressLinkedMenuNotFound") || "Không tìm thấy menu bảng tiến độ");
      return;
    }

    formRef.current?.setFieldsValue({
      kanban_progress_tracking_mode: "separate_table",
    });
    syncLinkedProgressMenuFields({ force: true });

    message.success(t("system.menu.kanbanProgressGeneratedFromLinkedMenu") || "Đã liên kết bảng cập nhật tiến độ");
  };

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
      onValuesChange={(changedValues) => {
        if (autoSyncingRef.current) return;

        if (Object.prototype.hasOwnProperty.call(changedValues, "linked_data_menu_id")) {
          syncLinkedTaskMenuFields({ silent: true });
        }

        if (
          Object.prototype.hasOwnProperty.call(changedValues, "linked_progress_menu_id") ||
          Object.prototype.hasOwnProperty.call(changedValues, "kanban_progress_tracking_mode")
        ) {
          syncLinkedProgressMenuFields({ silent: true });
        }
      }}
      onFinish={onFinish}
      key={detailData.id || 'new'}
      initialValues={{ data_scope_override: "NONE", ...detailData }}
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
                    placeholder: t("system.menu.labelViPlaceholder"),
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
                    placeholder: t("system.menu.nameViPlaceholder"),
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
                    placeholder: t("system.menu.labelEnPlaceholder"),
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
                    placeholder: t("system.menu.nameEnPlaceholder"),
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
                    placeholder: t("system.menu.labelZhPlaceholder"),
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
                    placeholder: t("system.menu.nameZhPlaceholder"),
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
                placeholder: t("system.menu.typeFormPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t('system.menu.typeForm.table') || 'Dạng bảng (Table)', value: 1 },
                { label: t('system.menu.typeForm.masterDetail') || 'Dạng Form Master-Detail', value: 2 },
                { label: t('system.menu.typeForm.dynamicLink') || 'Liên kết động (Dynamic Link)', value: 3 },
                { label: t('system.menu.typeForm.dynamicCode') || 'Chạy code động (Dynamic Code)', value: 4 },
                { label: t('system.menu.typeForm.kanbanBoard') || 'Kanban Board', value: 6 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.typeFormHint")}
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
                placeholder: t("system.menu.rowTypeEditPlaceholder"),
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
              {t("system.menu.rowTypeEditHint")}
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
                placeholder: t("system.menu.typeMenuPlaceholder"),
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
              {t("system.menu.typeMenuHint")}
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
              message={t("system.menu.masterDetailAlertTitle")}
              description={t("system.menu.masterDetailAlertDesc")}
              type="info"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }
        
        // Hiển thị cảnh báo khi menu là Dynamic Code
        const typeForm = Number(values.type_form || 1);
        if (typeForm === 4) {
          return (
            <Alert
              message={t("system.menu.dynamicCodeAlertTitle")}
              description={t("system.menu.dynamicCodeAlertDesc")}
              type="warning"
              showIcon
              style={{ marginBottom: 16, marginTop: 16 }}
              closable
            />
          );
        }

    if (typeForm === 6) {
      return (
        <Alert
          message={t("system.menu.kanbanAlertTitle")}
          description={t("system.menu.kanbanAlertDesc")}
          type="success"
          showIcon
          style={{ marginBottom: 16, marginTop: 16 }}
          closable
        />
      );
    }

        // Hiển thị cảnh báo khi menu là Dynamic Link
        if (typeForm === 3) {
          return (
            <Alert
              message={t("system.menu.dynamicLinkAlertTitle")}
              description={t("system.menu.dynamicLinkAlertDesc")}
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

  <ProFormDependency name={["path"]}>
    {(values: Record<string, any>) => {
      const currentPath = values.path || detailData.path;
      if (currentPath !== "/system/user") return null;

      return (
        <div style={{ marginBottom: 32, width: '100%' }}>
          <Card
            title={t('common.menu.userSub') || 'Cấu hình Sub-user'}
            bordered
            style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
            bodyStyle={{ padding: 20 }}
          >
            <Alert
              type="info"
              showIcon
              message={t("system.menu.systemUserDualConfigTitle")}
              description={t("system.menu.systemUserDualConfigDesc")}
              style={{ marginBottom: 16 }}
            />
            <Tabs
              defaultActiveKey="sub"
              items={[
                {
                  key: 'main',
                  label: t("system.menu.systemUserMainTab"),
                  children: (
                    <Alert
                      type="success"
                      showIcon
                      message={t("system.menu.systemUserMainConfigTitle")}
                      description={t("system.menu.systemUserMainConfigDesc")}
                    />
                  ),
                },
                {
                  key: 'sub',
                  label: t("system.menu.systemUserSubTab"),
                  children: (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                          {t('system.menu.table') || 'Bảng dữ liệu'}
                        </div>
                        <Input
                          value={String(subUserModeConfig.table_name || '')}
                          placeholder="csm_group_members"
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setSubUserModeConfig((prev) => ({ ...prev, table_name: nextValue }));
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                          {t("system.menu.fieldConfigLabel")}
                        </div>
                        <FieldConfigEditor
                          value={Array.isArray(subUserModeConfig.table) ? subUserModeConfig.table : []}
                          onChange={(nextTable) => {
                            setSubUserModeConfig((prev) => ({ ...prev, table: nextTable }));
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                          {t("system.menu.triggerConfigLabel")}
                        </div>
                        <div style={{ width: '100%', minWidth: 0 }}>
                          <TriggerEditor
                            value={subUserModeConfig.trigger && typeof subUserModeConfig.trigger === 'object' ? subUserModeConfig.trigger : {}}
                            onChange={(nextTrigger) => {
                              setSubUserModeConfig((prev) => ({ ...prev, trigger: nextTrigger }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      );
    }}
  </ProFormDependency>

  <ProFormDependency name={["type_form"]}>
  {(values: Record<string, any>) => {
    const typeForm = Number(values.type_form || 1);
    if (typeForm !== 6) return null;

    return (
      <div style={{ marginBottom: 32, width: '100%' }}>
        <Card
          title={t('system.menu.kanbanConfigTitle') || 'Cấu hình Kanban Board'}
          bordered
          style={{ borderRadius: 10, boxShadow: '0 2px 8px #f0f1f2', padding: 0, width: '100%' }}
          bodyStyle={{ padding: 20 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanLinkedDataMenuLabel') || 'Menu dữ liệu liên quan'}
              </div>
              <ProFormSelect
                name="linked_data_menu_id"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanLinkedDataMenuPlaceholder') || "Chọn menu có cấu hình bảng liên quan",
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const linkedMenuId = String(value || "").trim();
                    if (!linkedMenuId) return;
                    queueMicrotask(() => {
                      syncLinkedTaskMenuFields({ silent: true, force: true, linkedMenuId });
                    });
                  },
                }}
                options={relatedDataMenuOptions}
              />
              <div style={{ marginTop: 8 }}>
                <Button type="primary" onClick={linkRelatedDataMenu}>{t('system.menu.kanbanGenerateFromLinkedMenu') || 'Tạo config từ menu liên kết'}</Button>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {t('system.menu.kanbanGenerateFromLinkedMenuHint') || 'Không dùng template cứng. Cấu hình Kanban sẽ sinh trực tiếp từ bảng của menu liên kết.'}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanProgressLinkedMenuLabel') || 'Menu bảng cập nhật tiến độ'}
              </div>
              <ProFormSelect
                name="linked_progress_menu_id"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressLinkedMenuPlaceholder') || "Chọn menu lưu lịch sử tiến độ",
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const linkedProgressMenuId = String(value || "").trim();
                    if (!linkedProgressMenuId) return;
                    queueMicrotask(() => {
                      syncLinkedProgressMenuFields({
                        silent: true,
                        force: true,
                        linkedProgressMenuId,
                        mode: String(formRef.current?.getFieldValue("kanban_progress_tracking_mode") || "single_table"),
                      });
                    });
                  },
                }}
                options={progressDataMenuOptions}
              />
              <div style={{ marginTop: 8 }}>
                <Button onClick={linkProgressDataMenu}>{t('system.menu.kanbanProgressLinkButton') || 'Liên kết bảng tiến độ'}</Button>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanProgressTrackingModeLabel') || 'Mô hình theo dõi tiến độ'}
              </div>
              <ProFormSelect
                name="kanban_progress_tracking_mode"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressTrackingModePlaceholder') || 'Chọn mô hình',
                  allowClear: false,
                  size: 'large',
                  style: { width: '100%' },
                  onChange: (value) => {
                    const mode = String(value || "single_table").trim() || "single_table";
                    if (mode !== "separate_table") return;
                    queueMicrotask(() => {
                      syncLinkedProgressMenuFields({
                        silent: true,
                        force: true,
                        mode,
                        linkedProgressMenuId: String(formRef.current?.getFieldValue("linked_progress_menu_id") || ""),
                      });
                    });
                  },
                }}
                options={[
                  { label: t('system.menu.kanbanProgressTrackingModeSingle') || 'Một bảng (task tự mang tiến độ)', value: 'single_table' },
                  { label: t('system.menu.kanbanProgressTrackingModeSeparate') || 'Hai bảng (task + log tiến độ)', value: 'separate_table' },
                ]}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanStrictModeLabel') || 'Chế độ kiểm soát luồng'}
              </div>
              <ProFormSelect
                name="kanban_strict_mode"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={[
                  { label: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON', value: 'inherit' },
                  { label: t('system.menu.kanbanStrictModeOn') || 'Bật strict mode', value: true },
                  { label: t('system.menu.kanbanStrictModeOff') || 'Tắt strict mode', value: false },
                ]}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {t('system.menu.kanbanStrictModeHint') || 'Strict mode sẽ kiểm soát transition trạng thái và trường bắt buộc theo stage.'}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanAutoProgressLabel') || 'Tự cập nhật tiến độ theo stage'}
              </div>
              <ProFormSelect
                name="kanban_auto_update_progress"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={[
                  { label: t('system.menu.kanbanInheritJson') || 'Kế thừa từ JSON', value: 'inherit' },
                  { label: t('system.menu.kanbanAutoProgressOn') || 'Bật tự cập nhật', value: true },
                  { label: t('system.menu.kanbanAutoProgressOff') || 'Tắt tự cập nhật', value: false },
                ]}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {t('system.menu.kanbanAutoProgressHint') || 'Khi bật: đổi stage sẽ tự cập nhật field tiến độ (%) và mốc thời gian KPI.'}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanStageFieldLabel') || 'Field trạng thái (stage)'}
              </div>
              <ProFormSelect
                name="kanban_stage_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanStageFieldPlaceholder') || 'status / trang_thai',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanTitleFieldLabel') || 'Field tiêu đề'}
              </div>
              <ProFormSelect
                name="kanban_title_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanTitleFieldPlaceholder') || 'title / ten',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanDueDateFieldLabel') || 'Field hạn xử lý'}
              </div>
              <ProFormSelect
                name="kanban_due_date_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanDueDateFieldPlaceholder') || 'due_at / deadline',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanProgressFieldLabel') || 'Field cập nhật tiến độ (%)'}
              </div>
              <ProFormSelect
                name="kanban_progress_field"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanProgressFieldPlaceholder') || 'progress_percent',
                  allowClear: true,
                  size: 'large',
                  style: { width: '100%' },
                }}
                options={kanbanFieldOptions}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                {t('system.menu.kanbanDoneStagesLabel') || 'Stage hoàn thành (doneStageIds)'}
              </div>
              <ProFormText
                name="kanban_done_stage_ids"
                noStyle
                fieldProps={{
                  placeholder: t('system.menu.kanbanDoneStagesPlaceholder') || 'done,completed',
                  size: 'large',
                  style: { width: '100%' },
                }}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                {t('system.menu.kanbanDoneStagesHint') || 'Nhập danh sách stage hoàn thành, phân tách bằng dấu phẩy. Ví dụ: done,completed'}
              </div>
            </div>

            <ProFormDependency
              name={[
                "linked_data_menu_id",
                "linked_progress_menu_id",
                "kanban_progress_tracking_mode",
                "kanban_auto_update_progress",
                "kanban_stage_field",
                "kanban_title_field",
                "kanban_due_date_field",
                "kanban_progress_field",
                "kanban_progress_task_ref_field",
                "kanban_progress_stage_log_field",
                "kanban_progress_percent_log_field",
                "kanban_progress_time_field",
              ]}
            >
              {(depValues: Record<string, any>) => {
                const mode = String(depValues.kanban_progress_tracking_mode || "single_table");
                const advices = buildKanbanFieldAdvice(depValues);
                const missingPlan = getMissingKanbanFieldPlan(depValues);
                const canAutoCreate = Boolean(
                  (missingPlan.taskMenu && missingPlan.taskSpecs.length > 0) ||
                  (missingPlan.progressMenu && missingPlan.progressSpecs.length > 0)
                );
                return (
                  <>
                    {advices.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Alert
                          type="warning"
                          showIcon
                          message={t("system.menu.kanbanSmartAdviceTitle")}
                          description={
                            <div>
                              {advices.map((advice, index) => (
                                <div key={`kanban-advice-${index}`}>- {advice}</div>
                              ))}
                              {canAutoCreate && (
                                <div style={{ marginTop: 12 }}>
                                  <Button
                                    type="primary"
                                    loading={applyingLinkedFieldFix}
                                    onClick={() => {
                                      Modal.confirm({
                                        title: t("system.menu.kanbanAutoCreateConfirmTitle"),
                                        content: (
                                          <div>
                                            <div>{t("system.menu.kanbanAutoCreateConfirmDesc")}</div>
                                            {missingPlan.taskMenu && missingPlan.taskSpecs.length > 0 && (
                                              <div style={{ marginTop: 8 }}>
                                                {t("system.menu.kanbanAutoCreateTaskMenuPlan")}: {missingPlan.taskSpecs.map((spec) => spec.name).join(", ")}
                                              </div>
                                            )}
                                            {missingPlan.progressMenu && missingPlan.progressSpecs.length > 0 && (
                                              <div style={{ marginTop: 8 }}>
                                                {t("system.menu.kanbanAutoCreateProgressMenuPlan")}: {missingPlan.progressSpecs.map((spec) => spec.name).join(", ")}
                                              </div>
                                            )}
                                          </div>
                                        ),
                                        okText: t("system.menu.kanbanAutoCreateButton"),
                                        cancelText: t("common.cancel") || "Cancel",
                                        onOk: async () => {
                                          await applyMissingFieldsToLinkedMenus(depValues);
                                        },
                                      });
                                    }}
                                  >
                                    {t("system.menu.kanbanAutoCreateButton")}
                                  </Button>
                                </div>
                              )}
                            </div>
                          }
                        />
                      </div>
                    )}
                    {mode !== "separate_table" ? null : (
                      <>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressTaskRefFieldLabel') || 'Field tham chiếu công việc'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_task_ref_field"
                        noStyle
                        fieldProps={{ placeholder: 'task_id', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressStageLogFieldLabel') || 'Field stage trong log'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_stage_log_field"
                        noStyle
                        fieldProps={{ placeholder: 'status', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressPercentLogFieldLabel') || 'Field % tiến độ trong log'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_percent_log_field"
                        noStyle
                        fieldProps={{ placeholder: 'progress_percent', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressTimeFieldLabel') || 'Field thời điểm cập nhật'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_time_field"
                        noStyle
                        fieldProps={{ placeholder: 'updated_at', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressNoteFieldLabel') || 'Field ghi chú tiến độ'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_note_field"
                        noStyle
                        fieldProps={{ placeholder: 'note', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                    <div>
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.kanbanProgressActorFieldLabel') || 'Field người cập nhật'}
                      </div>
                      <ProFormSelect
                        name="kanban_progress_actor_field"
                        noStyle
                        fieldProps={{ placeholder: 'updated_by', allowClear: true, size: 'large', style: { width: '100%' } }}
                        options={kanbanProgressFieldOptions}
                      />
                    </div>
                      </>
                    )}
                  </>
                );
              }}
            </ProFormDependency>
          </div>

          <ProFormTextArea
            name="kanban_config"
            fieldProps={{
              rows: 20,
              style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
              placeholder: KANBAN_CONFIG_TEMPLATE,
              readOnly: true,
            }}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c', whiteSpace: 'pre-line' }}>
            {t('system.menu.kanbanConfigHint') || 'Khai báo JSON cho board độc lập: bảng nguồn, khóa chính, cột trạng thái, các stage hiển thị, chế độ kanban, timeline và báo cáo theo thời gian.'}
          </div>
        </Card>
      </div>
    );
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
                placeholder: t("system.menu.parentMenuPlaceholder"),
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
                    label: (() => {
                      const baseLabel = getMenuLabel(menu, i18n.language, t);
                      const extra: string[] = [];
                      if (menu.label_en) extra.push(`EN: ${menu.label_en}`);
                      if (menu.label_zh) extra.push(`ZH: ${menu.label_zh}`);
                      return extra.length > 0 ? `${baseLabel} (${extra.join(" | ")})` : baseLabel;
                    })(),
                    value: menu.id,
                  }))
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.parentMenuHint")}
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
                placeholder: t("system.menu.iconPlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.iconHint")}
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
                placeholder: t("system.menu.tablePlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.tableHint")}
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {t("system.menu.dataScopeTitle")}
            </div>
            <ProFormSelect
              name="data_scope_override"
              noStyle
              fieldProps={{
                placeholder: t("system.menu.dataScopePlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t("system.menu.dataScope.none"), value: 'NONE' },
                { label: t("system.menu.dataScope.all"), value: 'ALL' },
                { label: t("system.menu.dataScope.owner"), value: 'OWNER' },
                { label: t("system.menu.dataScope.department"), value: 'DEPARTMENT' },
                { label: t("system.menu.dataScope.branch"), value: 'BRANCH' },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.dataScopeHint")}
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
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t("system.menu.no"), value: false },
                { label: t("system.menu.yes"), value: true },
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
                placeholder: t("system.menu.prefixPkPlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.prefixPkHint")}
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
                placeholder: t("system.menu.tablePagesizePlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 0,
              }}
              min={1}
              max={1000}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.tablePagesizeHint")}
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
                placeholder: t("system.menu.reportNamePlaceholder"),
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
              {t("system.menu.reportNameHint")}
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
                placeholder: t("system.menu.orientationPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t("system.menu.orientationPortrait"), value: 'p' },
                { label: t("system.menu.orientationLandscape"), value: 'l' },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.orientationHint")}
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
                placeholder: t("system.menu.pWidthPlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.mmUnit")}
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
                placeholder: t("system.menu.pHeightPlaceholder"),
                size: 'large',
                style: { width: '100%' },
                precision: 2,
              }}
              min={0}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.mmUnit")}
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
                placeholder: t("system.menu.fieldRootPlaceholder"),
                size: 'large',
                style: { width: '100%' },
              }}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.fieldRootHint")}
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
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t("system.menu.no"), value: 0 },
                { label: t("system.menu.yes"), value: 1 },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.mShowHint")}
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
                placeholder: t("system.menu.selectPlaceholder"),
                allowClear: false,
                size: 'large',
                style: { width: '100%' },
              }}
              options={[
                { label: t("system.menu.no"), value: false },
                { label: t("system.menu.yes"), value: true },
              ]}
            />
            <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
              {t("system.menu.gReadonlyHint")}
            </div>
          </div>

          <ProFormDependency name={["type_form"]}>
            {(values: Record<string, any>) => {
              const typeForm = Number(values.type_form || 1);

              if (typeForm === 3) {
                return (
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                      {t("system.menu.vLink") || "Đường dẫn fallback"}
                    </div>
                    <ProFormText
                      name="v_link"
                      noStyle
                      fieldProps={{
                        placeholder: t("system.menu.vLinkFallbackPlaceholder"),
                        size: "large",
                        style: { width: "100%" },
                      }}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: "#8c8c8c" }}>
                      {t("system.menu.vLinkFallbackHint")}
                    </div>
                  </div>
                );
              }

              return (
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                    {t("system.menu.vLink") || "Component hiển thị"}
                  </div>
                  <ProFormText
                    name="v_link"
                    noStyle
                    fieldProps={{
                      placeholder: t("system.menu.vLinkComponentPlaceholder"),
                      size: "large",
                      style: { width: "100%" },
                    }}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: "#8c8c8c" }}>
                    {t("system.menu.vLinkComponentHint")}
                  </div>
                </div>
              );
            }}
          </ProFormDependency>

          {/* Auto Code Selector - chỉ hiện khi type_form === 4 (Dynamic Code) */}
          <ProFormDependency name={["type_form"]}>
            {(values: Record<string, any>) => {
              const typeForm = Number(values.type_form || 1);
              
              if (typeForm === 4) {
                return (
                  <div style={{ position: 'relative' }}>
                    <Spin spinning={loadingAutoCode} size="small">
                      <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                        {t('system.menu.autoCodeTemplate') || 'Template Code Động'}
                        <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>
                      </div>
                      <ProFormSelect
                        name="auto_code_name"
                        noStyle
                        rules={[{ required: true, message: t("form.required") }]}
                        fieldProps={{
                          placeholder: t("system.menu.autoCodeTemplatePlaceholder"),
                          allowClear: true,
                          size: 'large',
                          style: { width: '100%' },
                          loading: loadingAutoCode,
                        }}
                        options={autoCodeOptions}
                      />
                      <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                        {t("system.menu.autoCodeTemplateHint")}
                      </div>
                    </Spin>
                  </div>
                );
              }
              
              if (typeForm === 3) {
                return (
                  <div>
                    <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                      {t('system.menu.dynamicLinkUrl') || 'Đường dẫn Link Động'}
                    </div>
                    <ProFormText
                      name="dynamic_link_url"
                      noStyle
                      fieldProps={{
                        placeholder: t("system.menu.dynamicLinkUrlPlaceholder"),
                        size: 'large',
                        style: { width: '100%' },
                      }}
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
                      {t("system.menu.dynamicLinkUrlHint")}
                    </div>
                  </div>
                );
              }
              
              return null;
            }}
          </ProFormDependency>
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
