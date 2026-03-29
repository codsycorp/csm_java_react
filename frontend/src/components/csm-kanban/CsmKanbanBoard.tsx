import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Badge,
	Button,
	Card,
	Col,
	DatePicker,
	Empty,
	Input,
	Modal,
	Row,
	Segmented,
	Space,
	Spin,
	Statistic,
	Table,
	Tag,
	Timeline,
	Tooltip,
	Typography,
	message,
	theme,
} from "antd";
import {
	DeleteOutlined,
	EditOutlined,
	PlusOutlined,
	ReloadOutlined,
	UnorderedListOutlined,
	ProjectOutlined,
	FundProjectionScreenOutlined,
} from "@ant-design/icons";
import {
	DndContext,
	PointerSensor,
	closestCorners,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import dayjs, { type Dayjs } from "dayjs";
import { buildDetailGridSelectEnums, CsmEditModal } from "#src/components/csm-grid/CsmEditModal";
import type { MConfig, TableField } from "#src/components/csm-grid/CsmDynamicGrid";
import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useUserStore } from "#src/store";

const { RangePicker } = DatePicker;

type RowData = Record<string, any>;
type Granularity = "hour" | "day" | "week" | "month" | "year";
type BoardView = "kanban" | "timeline" | "report";

export const KANBAN_CONFIG_TEMPLATE = `{
  "tableName": "crm_tasks",
  "pkField": "id",
  "titleField": "title",
  "stageField": "status",
  "descriptionField": "task_type",
  "assigneeField": "owner_id",
  "priorityField": "priority",
  "dueDateField": "due_at",
  "labelField": "lead_id",
  "defaultView": "kanban",
  "views": {
    "kanban": true,
    "timeline": true,
    "report": true
  },
  "timeline": {
    "primaryDateField": "due_at",
    "defaultGranularity": "day",
    "defaultRangePreset": "30d"
  },
  "stages": [
    { "id": "todo", "label": "Chưa xử lý", "color": "blue" },
    { "id": "in_progress", "label": "Đang xử lý", "color": "orange" },
    { "id": "done", "label": "Hoàn thành", "color": "green" }
  ]
}`;

function makeLabelLookup(t: (k: string) => string, ns: string) {
	return (raw: string | undefined): string => {
		if (!raw) return "";
		const key = `${ns}.${String(raw).toLowerCase()}`;
		const result = t(key);
		return result !== key ? result : String(raw);
	};
}

export interface KanbanStage {
	id: string;
	label: string;
	color?: string;
	limit?: number;
}

export interface TimelineConfig {
	primaryDateField?: string;
	secondaryDateField?: string;
	defaultGranularity?: Granularity;
	defaultRangePreset?: "today" | "7d" | "30d" | "90d" | "year";
}

export interface KanbanConfig {
	tableName?: string;
	appId?: string;
	pkField?: string;
	titleField?: string;
	stageField?: string;
	stages?: KanbanStage[];
	descriptionField?: string;
	assigneeField?: string;
	priorityField?: string;
	dueDateField?: string;
	labelField?: string;
	defaultView?: BoardView;
	views?: Partial<Record<BoardView, boolean>>;
	timeline?: TimelineConfig;
	take?: number;
}

export interface CsmKanbanBoardProps {
	appId?: string;
	menuData?: Record<string, any>;
	database?: Record<string, { rows: any[]; fieldsPK?: string[] }>;
	onDataChange?: () => void;
	config?: KanbanConfig;
	permissions?: number;
	menusPermissions?: Record<string | number, number>;
	menuId?: string | number;
	decrypt?: (s: string) => string;
}

type BoardTriggerContext = {
	appId: string;
	config: KanbanConfig;
	rows: RowData[];
	pkField: string;
	pkFields: string[];
	updateTableData: typeof updateTableData;
};

type BoardSaveContext = BoardTriggerContext & {
	isEdit: boolean;
	previousRecord: RowData | null;
};

type BoardDeleteContext = BoardTriggerContext & {
	row: RowData;
};

type BoardTriggerMap = {
	beforeSave?: (payload: RowData, context: BoardSaveContext) => Promise<RowData | false | void> | RowData | false | void;
	afterAdd?: (payload: RowData, context: BoardSaveContext) => Promise<void> | void;
	afterEdit?: (payload: RowData, context: BoardSaveContext) => Promise<void> | void;
	beforeDelete?: (context: BoardDeleteContext) => Promise<boolean | void> | boolean | void;
	afterDelete?: (context: BoardDeleteContext) => Promise<void> | void;
};

interface TimeBucket {
	key: string;
	label: string;
	start: Dayjs;
	end: Dayjs;
	rows: RowData[];
	overdue: number;
	done: number;
	open: number;
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				opacity: isDragging ? 0.4 : 1,
				cursor: "grab",
			}}
			{...listeners}
			{...attributes}
		>
			{children}
		</div>
	);
}

function DroppableColumn({
	id,
	children,
	baseBg,
	hoverBg,
	borderColor,
}: {
	id: string;
	children: React.ReactNode;
	baseBg: string;
	hoverBg: string;
	borderColor: string;
}) {
	const { setNodeRef, isOver } = useDroppable({ id });
	return (
		<div
			ref={setNodeRef}
			style={{
				minHeight: 180,
				padding: 8,
				borderRadius: 12,
				background: isOver ? hoverBg : baseBg,
				border: `1px solid ${borderColor}`,
				transition: "background-color 0.2s ease",
			}}
		>
			{children}
		</div>
	);
}

const PRIORITY_COLORS: Record<string, string> = {
	urgent: "red",
	high: "orange",
	medium: "blue",
	low: "default",
	"khẩn cấp": "red",
	khẩn: "red",
	cao: "orange",
	"trung bình": "blue",
	thấp: "default",
};

function priorityColor(value: string | undefined): string {
	if (!value) return "default";
	return PRIORITY_COLORS[String(value).toLowerCase()] || "default";
}

function toTimestamp(value: any): number {
	if (!value) return 0;
	if (typeof value === "number") return value > 1e12 ? value : value * 1000;
	const numeric = Number(value);
	if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
	const parsed = dayjs(String(value));
	return parsed.isValid() ? parsed.valueOf() : 0;
}

function isOverdue(value: any, status?: string): boolean {
	const ts = toTimestamp(value);
	return ts > 0 && ts < Date.now() && String(status || "").toLowerCase() !== "done";
}

function formatDate(value: any, lang: string, withTime = false): string {
	const ts = toTimestamp(value);
	if (!ts) return "";
	if (lang.startsWith("en")) return dayjs(ts).format(withTime ? "MM/DD/YYYY HH:mm" : "MM/DD/YY");
	if (lang.startsWith("zh")) return dayjs(ts).format(withTime ? "YYYY/MM/DD HH:mm" : "YY/MM/DD");
	return dayjs(ts).format(withTime ? "DD/MM/YYYY HH:mm" : "DD/MM/YY");
}

function parseConfig(raw: any): KanbanConfig | null {
	if (!raw) return null;
	if (typeof raw === "object" && !Array.isArray(raw)) return raw as KanbanConfig;
	if (typeof raw === "string") {
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}
	return null;
}

function getDefaultStages(t: (key: string) => string): KanbanStage[] {
	return [
		{ id: "todo", label: t("kanban.statusTodo"), color: "blue" },
		{ id: "in_progress", label: t("kanban.statusInProgress"), color: "orange" },
		{ id: "done", label: t("kanban.statusDone"), color: "green" },
	];
}

function getPresetRange(preset: TimelineConfig["defaultRangePreset"]): [Dayjs, Dayjs] {
	const now = dayjs();
	switch (preset) {
		case "today":
			return [now.startOf("day"), now.endOf("day")];
		case "7d":
			return [now.subtract(6, "day").startOf("day"), now.endOf("day")];
		case "90d":
			return [now.subtract(89, "day").startOf("day"), now.endOf("day")];
		case "year":
			return [now.startOf("year"), now.endOf("year")];
		case "30d":
		default:
			return [now.subtract(29, "day").startOf("day"), now.endOf("day")];
	}
}

function startOfWeek(value: Dayjs): Dayjs {
	const weekday = value.day();
	const offset = weekday === 0 ? 6 : weekday - 1;
	return value.subtract(offset, "day").startOf("day");
}

function endOfWeek(value: Dayjs): Dayjs {
	return startOfWeek(value).add(6, "day").endOf("day");
}

function startOfUnit(value: Dayjs, granularity: Granularity): Dayjs {
	switch (granularity) {
		case "hour":
			return value.startOf("hour");
		case "week":
			return startOfWeek(value);
		case "month":
			return value.startOf("month");
		case "year":
			return value.startOf("year");
		case "day":
		default:
			return value.startOf("day");
	}
}

function endOfUnit(value: Dayjs, granularity: Granularity): Dayjs {
	switch (granularity) {
		case "hour":
			return value.endOf("hour");
		case "week":
			return endOfWeek(value);
		case "month":
			return value.endOf("month");
		case "year":
			return value.endOf("year");
		case "day":
		default:
			return value.endOf("day");
	}
}

function addUnit(value: Dayjs, granularity: Granularity): Dayjs {
	switch (granularity) {
		case "hour":
			return value.add(1, "hour");
		case "week":
			return value.add(1, "week");
		case "month":
			return value.add(1, "month");
		case "year":
			return value.add(1, "year");
		case "day":
		default:
			return value.add(1, "day");
	}
}

function formatBucketLabel(bucketStart: Dayjs, granularity: Granularity, lang: string): string {
	if (granularity === "hour") return formatDate(bucketStart.valueOf(), lang, true);
	if (granularity === "week") return `${bucketStart.format("DD/MM")} - ${endOfWeek(bucketStart).format("DD/MM")}`;
	if (granularity === "month") return bucketStart.format("MM/YYYY");
	if (granularity === "year") return bucketStart.format("YYYY");
	return formatDate(bucketStart.valueOf(), lang, false);
}

function buildWhereFromRow(row: RowData, pkFields: string[]) {
	const where: Record<string, any> = {};
	for (const field of pkFields) {
		if (row[field] !== undefined && row[field] !== null) where[field] = row[field];
	}
	return where;
}

function inferFieldTypeFromValue(value: any): string {
	if (value == null) return "txt";
	if (typeof value === "number") return "num";
	if (typeof value === "boolean") return "ch";
	const text = String(value);
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return "datetime";
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "date";
	return "txt";
}

function toFallbackField(fieldName: string, index: number, sampleRow?: RowData): TableField {
	const value = sampleRow ? sampleRow[fieldName] : undefined;
	return {
		f_name: fieldName,
		f_header: fieldName,
		f_show: 1,
		f_stt: index + 1,
		f_types: inferFieldTypeFromValue(value),
	};
}

function getRowTimeBounds(row: RowData, primaryField: string, secondaryField?: string) {
	const primary = toTimestamp(row[primaryField]);
	const secondary = secondaryField ? toTimestamp(row[secondaryField]) : 0;
	const start = primary || secondary;
	const end = secondary || primary;
	return {
		start: start > 0 ? start : 0,
		end: end > 0 ? end : start > 0 ? start : 0,
	};
}

export default function CsmKanbanBoard({
	appId: propAppId,
	menuData,
	database,
	onDataChange,
	config: propConfig,
	permissions = -1,
	menusPermissions = {},
	menuId,
	decrypt,
}: CsmKanbanBoardProps) {
	const { token } = theme.useToken();
	const user = useUserStore();
	const { t, i18n } = useTranslation();
	const lang = i18n.language || "vi-VN";
	const effectiveDecrypt = decrypt || csmDecrypt;
	const getPriorityLabel = useCallback(makeLabelLookup(t, "kanban.priority"), [t]);
	const getTaskTypeLabel = useCallback(makeLabelLookup(t, "kanban.taskType"), [t]);

	const rawConfig = useMemo<KanbanConfig | null>(
		() => propConfig || parseConfig(menuData?.kanban_config) || null,
		[propConfig, menuData?.kanban_config],
	);

	const config = useMemo<KanbanConfig>(() => ({
		tableName: rawConfig?.tableName || menuData?.table_name,
		appId: rawConfig?.appId,
		pkField: rawConfig?.pkField || "id",
		titleField: rawConfig?.titleField || "title",
		stageField: rawConfig?.stageField || "status",
		stages: rawConfig?.stages?.length ? rawConfig.stages : getDefaultStages(t),
		descriptionField: rawConfig?.descriptionField,
		assigneeField: rawConfig?.assigneeField,
		priorityField: rawConfig?.priorityField,
		dueDateField: rawConfig?.dueDateField,
		labelField: rawConfig?.labelField,
		defaultView: rawConfig?.defaultView || "kanban",
		views: {
			kanban: true,
			timeline: true,
			report: true,
			...rawConfig?.views,
		},
		timeline: {
			primaryDateField: rawConfig?.timeline?.primaryDateField || rawConfig?.dueDateField || "due_at",
			secondaryDateField: rawConfig?.timeline?.secondaryDateField,
			defaultGranularity: rawConfig?.timeline?.defaultGranularity || "day",
			defaultRangePreset: rawConfig?.timeline?.defaultRangePreset || "30d",
		},
		take: rawConfig?.take || 500,
	}), [menuData?.table_name, rawConfig, t]);

	const effectiveAppId = useMemo(
		() => config.appId || propAppId || (menuData?.app_id as string) || user.app_id || "csm",
		[config.appId, propAppId, menuData?.app_id, user.app_id],
	);

	const pkField = config.pkField || "id";
	const titleField = config.titleField || "title";
	const stageField = config.stageField || "status";
	const stages = config.stages || [];
	const fields = useMemo<TableField[]>(() => {
		if (Array.isArray(menuData?.table) && menuData.table.length > 0) return menuData.table;

		const dbRows = config.tableName && database?.[config.tableName]?.rows
			? database[config.tableName].rows
			: [];
		const sampleRow = Array.isArray(dbRows) && dbRows.length > 0 ? dbRows[0] : undefined;

		const preferred = [
			pkField,
			titleField,
			stageField,
			config.descriptionField,
			config.assigneeField,
			config.priorityField,
			config.dueDateField,
			config.labelField,
		].filter((item): item is string => !!item && String(item).trim().length > 0);

		const fallbackNames = preferred.length > 0
			? Array.from(new Set(preferred))
			: (sampleRow ? Object.keys(sampleRow).slice(0, 12) : []);

		return fallbackNames.map((name, index) => toFallbackField(name, index, sampleRow));
	}, [
		config.assigneeField,
		config.descriptionField,
		config.dueDateField,
		config.labelField,
		config.priorityField,
		config.tableName,
		database,
		menuData?.table,
		pkField,
		stageField,
		titleField,
	]);
	const pkFields = useMemo(() => {
		const fromDatabase = config.tableName ? database?.[config.tableName]?.fieldsPK : undefined;
		if (Array.isArray(fromDatabase) && fromDatabase.length > 0) return fromDatabase;
		const fromStruct = menuData?.struct?.fieldsPK;
		if (Array.isArray(fromStruct) && fromStruct.length) return fromStruct;
		return [pkField];
	}, [config.tableName, database, menuData?.struct?.fieldsPK, pkField]);
	const mConfigs = useMemo<MConfig>(() => ({
		id: String(menuId || menuData?.id || config.tableName || "kanban-board"),
		label: String(menuData?.label || menuData?.title || config.tableName || t("kanban.boardTitle")),
		table_name: String(config.tableName || ""),
		table: fields,
		trigger: menuData?.trigger || {},
		g_readonly: menuData?.g_readonly,
		table_pagesize: menuData?.table_pagesize,
		struct: {
			...(menuData?.struct || {}),
			fieldsPK: pkFields,
		},
		type_form: 6,
		row_type_edit: Number(menuData?.row_type_edit ?? 0),
		nodes: menuData?.nodes,
	}), [config.tableName, fields, menuData, menuId, pkFields, t]);
	const boardTriggers = useMemo<BoardTriggerMap>(() => ((menuData?.trigger || {}) as BoardTriggerMap), [menuData?.trigger]);

	const [rows, setRows] = useState<RowData[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [selectedCardId, setSelectedCardId] = useState<string>("");
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingRecord, setEditingRecord] = useState<RowData | null>(null);
	const [viewMode, setViewMode] = useState<BoardView>(config.defaultView || "kanban");
	const [granularity, setGranularity] = useState<Granularity>(config.timeline?.defaultGranularity || "day");
	const [range, setRange] = useState<[Dayjs, Dayjs]>(getPresetRange(config.timeline?.defaultRangePreset));

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	const loadData = useCallback(async () => {
		if (!config.tableName) return;
		setLoading(true);
		try {
			const resp = await getTableData<any>({
				app_id: effectiveAppId,
				obj_name: config.tableName,
				take: config.take || 500,
			});
			const data = (resp as any)?.rows || (resp as any)?.data || [];
			setRows(Array.isArray(data) ? data : []);
		} catch (err: any) {
			message.error(err?.message || t("kanban.loadError"));
		} finally {
			setLoading(false);
		}
	}, [config.tableName, config.take, effectiveAppId, t]);

	useEffect(() => {
		if (!config.tableName) return;
		const dbEntry = database?.[config.tableName];
		if (dbEntry?.rows) {
			setRows(dbEntry.rows);
		} else {
			loadData();
		}
	}, [config.tableName, database, loadData]);

	useEffect(() => {
		setViewMode((current) => (config.views?.[current] === false ? (config.views?.kanban ? "kanban" : config.views?.timeline ? "timeline" : "report") : current));
	}, [config.views]);

	const selectEnums = useMemo(() => buildDetailGridSelectEnums(fields, database || {}, effectiveDecrypt, {
		appId: effectiveAppId,
		m_configs: mConfigs,
		context: {},
	}), [database, effectiveAppId, effectiveDecrypt, fields, mConfigs]);

	const filteredRows = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) => [
			row[titleField],
			config.descriptionField ? row[config.descriptionField] : undefined,
			config.assigneeField ? row[config.assigneeField] : undefined,
			config.labelField ? row[config.labelField] : undefined,
		]
			.filter((item) => item !== undefined && item !== null)
			.some((item) => String(item).toLowerCase().includes(q)));
	}, [config.assigneeField, config.descriptionField, config.labelField, rows, search, titleField]);

	const byStage = useMemo(() => {
		const map = new Map<string, RowData[]>();
		stages.forEach((stage) => map.set(stage.id, []));
		filteredRows.forEach((row) => {
			const sid = String(row[stageField] ?? stages[0]?.id ?? "");
			if (!map.has(sid)) map.set(sid, []);
			map.get(sid)!.push(row);
		});
		return map;
	}, [filteredRows, stageField, stages]);

	const selectedCard = useMemo(
		() => rows.find((row) => String(row[pkField]) === selectedCardId) || null,
		[pkField, rows, selectedCardId],
	);

	const openCreate = useCallback(() => {
		setEditingRecord(null);
		setEditorOpen(true);
	}, []);

	const openEdit = useCallback((row?: RowData | null) => {
		const target = row || selectedCard;
		if (!target) {
			message.warning(t("kanban.selectCardFirst"));
			return;
		}
		setEditingRecord(target);
		setEditorOpen(true);
	}, [selectedCard, t]);

	const confirmDelete = useCallback((row?: RowData | null) => {
		const target = row || selectedCard;
		if (!target || !config.tableName) {
			message.warning(t("kanban.selectCardFirst"));
			return;
		}
		Modal.confirm({
			title: t("kanban.deleteTitle"),
			content: t("kanban.deleteConfirm"),
			okText: t("kanban.deleteAction"),
			cancelText: t("kanban.cancel"),
			okType: "danger",
			onOk: async () => {
				try {
					const triggerContext: BoardDeleteContext = {
						appId: effectiveAppId,
						config,
						rows,
						pkField,
						pkFields,
						updateTableData,
						row: target,
					};
					if (typeof boardTriggers.beforeDelete === "function") {
						const allowed = await boardTriggers.beforeDelete(triggerContext);
						if (allowed === false) return;
					}
					await updateTableData<RowData>({
						app_id: effectiveAppId,
						obj_name: config.tableName!,
						command: "delete",
						obj_update: buildWhereFromRow(target, pkFields),
						pk_fields: pkFields,
						where: buildWhereFromRow(target, pkFields),
					});
					setRows((prev) => prev.filter((item) => String(item[pkField]) !== String(target[pkField])));
					setSelectedCardId("");
					if (typeof boardTriggers.afterDelete === "function") {
						await boardTriggers.afterDelete(triggerContext);
					}
					onDataChange?.();
					message.success(t("kanban.deleteSuccess"));
				} catch (err: any) {
					message.error(err?.message || t("kanban.deleteError"));
				}
			},
		});
	}, [boardTriggers, config, config.tableName, effectiveAppId, onDataChange, pkField, pkFields, rows, selectedCard, t]);

	const handleSubmit = useCallback(async (values: RowData) => {
		if (!config.tableName) return;
		const isEdit = Boolean(editingRecord);
		let payload = isEdit ? { ...editingRecord, ...values } : { ...values };
		const triggerContext: BoardSaveContext = {
			appId: effectiveAppId,
			config,
			rows,
			pkField,
			pkFields,
			updateTableData,
			isEdit,
			previousRecord: editingRecord,
		};
		if (typeof boardTriggers.beforeSave === "function") {
			const nextPayload = await boardTriggers.beforeSave(payload, triggerContext);
			if (nextPayload === false) return;
			if (nextPayload && typeof nextPayload === "object") payload = nextPayload;
		}
		await updateTableData<RowData>({
			app_id: effectiveAppId,
			obj_name: config.tableName,
			command: isEdit ? "update" : "create",
			obj_update: payload,
			pk_fields: pkFields,
			where: isEdit && editingRecord ? buildWhereFromRow(editingRecord, pkFields) : undefined,
		});
		if (isEdit && typeof boardTriggers.afterEdit === "function") {
			await boardTriggers.afterEdit(payload, triggerContext);
		}
		if (!isEdit && typeof boardTriggers.afterAdd === "function") {
			await boardTriggers.afterAdd(payload, triggerContext);
		}
		setRows((prev) => {
			if (!isEdit) return [...prev, payload];
			return prev.map((row) => (String(row[pkField]) === String(editingRecord?.[pkField]) ? { ...row, ...payload } : row));
		});
		setSelectedCardId(String(payload[pkField] || ""));
		setEditorOpen(false);
		onDataChange?.();
		message.success(isEdit ? t("kanban.saveSuccess") : t("kanban.createSuccess"));
	}, [boardTriggers, config, config.tableName, editingRecord, effectiveAppId, onDataChange, pkField, pkFields, rows, t]);

	const handleDragEnd = useCallback(async (event: DragEndEvent) => {
		const activeId = String(event.active.id || "");
		const overId = String(event.over?.id || "");
		if (!activeId || !overId || activeId === overId || !config.tableName) return;
		const targetRow = rows.find((row) => String(row[pkField]) === activeId);
		const targetStage = stages.find((stage) => stage.id === overId);
		if (!targetRow || !targetStage) return;
		const updated = { ...targetRow, [stageField]: targetStage.id };
		setRows((prev) => prev.map((row) => (String(row[pkField]) === activeId ? updated : row)));
		try {
			await updateTableData({
				app_id: effectiveAppId,
				obj_name: config.tableName,
				command: "update",
				obj_update: { ...buildWhereFromRow(targetRow, pkFields), [stageField]: targetStage.id },
				pk_fields: pkFields,
				where: buildWhereFromRow(targetRow, pkFields),
			});
			onDataChange?.();
		} catch (err: any) {
			setRows((prev) => prev.map((row) => (String(row[pkField]) === activeId ? targetRow : row)));
			message.error(err?.message || t("kanban.updateError"));
		}
	}, [config.tableName, effectiveAppId, onDataChange, pkField, pkFields, rows, stageField, stages, t]);

	const availableViews = useMemo(() => {
		const options: Array<{ value: BoardView; label: React.ReactNode }> = [];
		if (config.views?.kanban !== false) options.push({ value: "kanban", label: <Space size={4}><ProjectOutlined />{t("kanban.viewKanban")}</Space> });
		if (config.views?.timeline !== false) options.push({ value: "timeline", label: <Space size={4}><FundProjectionScreenOutlined />{t("kanban.viewTimeline")}</Space> });
		if (config.views?.report !== false) options.push({ value: "report", label: <Space size={4}><UnorderedListOutlined />{t("kanban.viewReport")}</Space> });
		return options;
	}, [config.views, t]);

	const timelineField = config.timeline?.primaryDateField || config.dueDateField || "due_at";
	const timelineSecondaryField = config.timeline?.secondaryDateField;

	const timelineBuckets = useMemo<TimeBucket[]>(() => {
		const [rawStart, rawEnd] = range;
		const start = startOfUnit(rawStart, granularity);
		const end = endOfUnit(rawEnd, granularity);
		const buckets: TimeBucket[] = [];
		for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end); cursor = addUnit(cursor, granularity)) {
			const bucketStart = startOfUnit(cursor, granularity);
			const bucketEnd = endOfUnit(cursor, granularity);
			const bucketRows = filteredRows.filter((row) => {
				const { start: rowStart, end: rowEnd } = getRowTimeBounds(row, timelineField, timelineSecondaryField);
				if (!rowStart && !rowEnd) return false;
				const compareStart = rowStart || rowEnd;
				const compareEnd = rowEnd || rowStart;
				return compareStart <= bucketEnd.valueOf() && compareEnd >= bucketStart.valueOf();
			});
			buckets.push({
				key: bucketStart.toISOString(),
				label: formatBucketLabel(bucketStart, granularity, lang),
				start: bucketStart,
				end: bucketEnd,
				rows: bucketRows,
				overdue: bucketRows.filter((row) => isOverdue(row[timelineField], row[stageField])).length,
				done: bucketRows.filter((row) => String(row[stageField]).toLowerCase() === "done").length,
				open: bucketRows.filter((row) => String(row[stageField]).toLowerCase() !== "done").length,
			});
			if (granularity === "year" && bucketStart.isSame(end, "year")) break;
		}
		return buckets;
	}, [filteredRows, granularity, lang, range, stageField, timelineField, timelineSecondaryField]);

	const timelineStats = useMemo(() => ({
		totalBuckets: timelineBuckets.length,
		totalRows: timelineBuckets.reduce((sum, bucket) => sum + bucket.rows.length, 0),
		emptyBuckets: timelineBuckets.filter((bucket) => bucket.rows.length === 0).length,
		overdueRows: timelineBuckets.reduce((sum, bucket) => sum + bucket.overdue, 0),
	}), [timelineBuckets]);

	const reportRows = useMemo(() => timelineBuckets.map((bucket) => ({
		key: bucket.key,
		bucket: bucket.label,
		start: formatDate(bucket.start.valueOf(), lang, granularity === "hour"),
		end: formatDate(bucket.end.valueOf(), lang, granularity === "hour"),
		total: bucket.rows.length,
		open: bucket.open,
		done: bucket.done,
		overdue: bucket.overdue,
		tasks: bucket.rows.map((row) => String(row[titleField] || row[pkField] || "")).join(", "),
	})), [granularity, lang, pkField, timelineBuckets, titleField]);

	if (!config.tableName) {
		return (
			<Card style={{ margin: 16 }}>
				<Typography.Text type="secondary">{t("kanban.configMissing")}</Typography.Text>
			</Card>
		);
	}

	const dropBg = token.colorFillAlter;
	const dropHoverBg = token.colorPrimaryBg;

	return (
		<div style={{ padding: 16, height: "100%", overflow: "auto" }}>
			<Spin spinning={loading}>
				<Space direction="vertical" size={12} style={{ width: "100%" }}>
					<Card size="small" style={{ borderRadius: 14 }}>
						<Row gutter={[12, 12]} align="middle">
							<Col flex="auto">
								<Space direction="vertical" size={4}>
									<Typography.Title level={5} style={{ margin: 0 }}>
										{menuData?.label || menuData?.title || config.tableName}
									</Typography.Title>
									<Typography.Text type="secondary">{t("kanban.boardHint")}</Typography.Text>
								</Space>
							</Col>
							<Col>
								<Space wrap>
									<Input.Search
										allowClear
										placeholder={t("kanban.searchPlaceholder")}
										style={{ width: 220 }}
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
									<Segmented value={viewMode} options={availableViews} onChange={(value) => setViewMode(value as BoardView)} />
									<Button icon={<PlusOutlined />} type="primary" onClick={openCreate}>{t("kanban.add")}</Button>
									<Button icon={<EditOutlined />} onClick={() => openEdit()} disabled={!selectedCard}>{t("kanban.edit")}</Button>
									<Button icon={<DeleteOutlined />} danger onClick={() => confirmDelete()} disabled={!selectedCard}>{t("kanban.deleteAction")}</Button>
									<Button icon={<ReloadOutlined />} onClick={loadData}>{t("kanban.refresh")}</Button>
								</Space>
							</Col>
						</Row>
					</Card>

					{(viewMode === "timeline" || viewMode === "report") && (
						<Card size="small" style={{ borderRadius: 14 }}>
							<Row gutter={[12, 12]} align="middle">
								<Col flex="auto">
									<Space wrap>
										<Segmented
											value={granularity}
											onChange={(value) => setGranularity(value as Granularity)}
											options={[
												{ value: "hour", label: t("kanban.granularityHour") },
												{ value: "day", label: t("kanban.granularityDay") },
												{ value: "week", label: t("kanban.granularityWeek") },
												{ value: "month", label: t("kanban.granularityMonth") },
												{ value: "year", label: t("kanban.granularityYear") },
											]}
										/>
										<RangePicker
											showTime={granularity === "hour"}
											value={range}
											onChange={(value) => {
												if (value?.[0] && value?.[1]) setRange([value[0], value[1]]);
											}}
										/>
										<Button onClick={() => setRange(getPresetRange("today"))}>{t("kanban.presetToday")}</Button>
										<Button onClick={() => setRange(getPresetRange("7d"))}>{t("kanban.preset7d")}</Button>
										<Button onClick={() => setRange(getPresetRange("30d"))}>{t("kanban.preset30d")}</Button>
										<Button onClick={() => setRange(getPresetRange("90d"))}>{t("kanban.preset90d")}</Button>
									</Space>
								</Col>
								<Col>
									<Space size={12} wrap>
										<Statistic title={t("kanban.timelineBuckets")} value={timelineStats.totalBuckets} />
										<Statistic title={t("kanban.timelineTasks")} value={timelineStats.totalRows} />
										<Statistic title={t("kanban.timelineEmptyBuckets")} value={timelineStats.emptyBuckets} />
										<Statistic title={t("kanban.timelineOverdue")} value={timelineStats.overdueRows} />
									</Space>
								</Col>
							</Row>
						</Card>
					)}

					{viewMode === "kanban" && (
						<DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
							<Row gutter={[12, 12]} wrap={false} style={{ overflowX: "auto", paddingBottom: 8 }}>
								{stages.map((stage) => {
									const stageRows = byStage.get(stage.id) || [];
									const limitExceeded = stage.limit ? stageRows.length > stage.limit : false;
									return (
										<Col key={stage.id} flex="300px">
											<Card
												size="small"
												style={{ borderRadius: 14 }}
												title={
													<Space>
														<Tag color={limitExceeded ? "red" : stage.color || "blue"}>{stage.label}</Tag>
														<Typography.Text type={limitExceeded ? "danger" : "secondary"} style={{ fontSize: 12 }}>
															{stageRows.length}{stage.limit ? `/${stage.limit}` : ""}{limitExceeded ? ` • ${t("kanban.wipExceeded")}` : ""}
														</Typography.Text>
													</Space>
												}
											>
												<DroppableColumn id={stage.id} baseBg={dropBg} hoverBg={dropHoverBg} borderColor={token.colorBorderSecondary}>
													<Space direction="vertical" size={8} style={{ width: "100%" }}>
														{stageRows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("kanban.empty")} />}
														{stageRows.map((row) => {
															const cardId = String(row[pkField]);
															const selected = selectedCardId === cardId;
															const desc = config.descriptionField ? row[config.descriptionField] : undefined;
															const assignee = config.assigneeField ? row[config.assigneeField] : undefined;
															const priority = config.priorityField ? row[config.priorityField] : undefined;
															const dueAt = config.dueDateField ? row[config.dueDateField] : undefined;
															const label = config.labelField ? row[config.labelField] : undefined;
															const overdue = dueAt ? isOverdue(dueAt, row[stageField]) : false;
															return (
																<DraggableCard id={cardId} key={cardId}>
																	<Card
																		hoverable
																		size="small"
																		onClick={() => setSelectedCardId(cardId)}
																		style={{
																			borderRadius: 12,
																			border: selected
																				? `1px solid ${token.colorPrimary}`
																				: overdue
																					? `1px solid ${token.colorError}`
																					: `1px solid ${token.colorBorderSecondary}`,
																			boxShadow: selected ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
																		}}
																	>
																		<Space direction="vertical" size={6} style={{ width: "100%" }}>
																			<Row gutter={8} justify="space-between" align="top">
																				<Col flex="auto">
																					<Typography.Text strong style={{ fontSize: 13 }}>{String(row[titleField] || t("kanban.noName"))}</Typography.Text>
																				</Col>
																				<Col>
																					<Space size={2}>
																						<Tooltip title={t("kanban.edit")}><Button size="small" type="text" icon={<EditOutlined />} onClick={(event) => { event.stopPropagation(); openEdit(row); }} /></Tooltip>
																						<Tooltip title={t("kanban.deleteAction")}><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(event) => { event.stopPropagation(); confirmDelete(row); }} /></Tooltip>
																					</Space>
																				</Col>
																			</Row>
																			{desc !== undefined && desc !== null && desc !== "" && (
																				<Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: String(desc) }}>
																					{getTaskTypeLabel(String(desc))}
																				</Typography.Text>
																			)}
																			<Space size={4} wrap>
																				{priority && <Badge color={priorityColor(String(priority))} text={<Typography.Text style={{ fontSize: 11 }}>{getPriorityLabel(String(priority))}</Typography.Text>} />}
																				{label && <Tag style={{ fontSize: 11, margin: 0 }}>{String(label)}</Tag>}
																				{dueAt && <Typography.Text type={overdue ? "danger" : "secondary"} style={{ fontSize: 11 }}>{overdue ? `${t("kanban.overdue")} • ` : ""}{formatDate(dueAt, lang, true)}</Typography.Text>}
																				{assignee && <Typography.Text type="secondary" style={{ fontSize: 11 }}>@{String(assignee)}</Typography.Text>}
																			</Space>
																		</Space>
																	</Card>
																</DraggableCard>
															);
														})}
													</Space>
												</DroppableColumn>
											</Card>
										</Col>
									);
								})}
							</Row>
						</DndContext>
					)}

					{viewMode === "timeline" && (
						<Card size="small" style={{ borderRadius: 14 }}>
							{timelineBuckets.length === 0 ? (
								<Empty description={t("kanban.timelineEmpty")} />
							) : (
								<Timeline
									items={timelineBuckets.map((bucket) => ({
										label: bucket.label,
										color: bucket.rows.length === 0 ? "gray" : bucket.overdue > 0 ? "red" : bucket.done === bucket.rows.length ? "green" : "blue",
										children: (
											<Card size="small" style={{ borderRadius: 12, background: bucket.rows.length === 0 ? token.colorBgLayout : token.colorBgContainer }}>
												<Space direction="vertical" size={8} style={{ width: "100%" }}>
													<Row gutter={12}>
														<Col><Statistic title={t("kanban.reportTotal")} value={bucket.rows.length} /></Col>
														<Col><Statistic title={t("kanban.reportOpen")} value={bucket.open} /></Col>
														<Col><Statistic title={t("kanban.reportDone")} value={bucket.done} /></Col>
														<Col><Statistic title={t("kanban.reportOverdue")} value={bucket.overdue} /></Col>
													</Row>
													{bucket.rows.length === 0 ? (
														<Typography.Text type="secondary">{t("kanban.timelineNoTasks")}</Typography.Text>
													) : (
														<Space direction="vertical" size={6} style={{ width: "100%" }}>
															{bucket.rows.map((row) => {
																const rowId = String(row[pkField] || row[titleField]);
																return (
																	<Card key={rowId} size="small" style={{ borderRadius: 10 }}>
																		<Row justify="space-between" gutter={8}>
																			<Col flex="auto">
																				<Space direction="vertical" size={2}>
																					<Typography.Text strong>{String(row[titleField] || t("kanban.noName"))}</Typography.Text>
																					<Typography.Text type="secondary">{formatDate(row[timelineField], lang, true) || t("kanban.noDate")}</Typography.Text>
																				</Space>
																			</Col>
																			<Col>
																				<Space size={4}>
																					<Tag color={priorityColor(String(config.priorityField ? row[config.priorityField] : ""))}>{config.priorityField ? getPriorityLabel(String(row[config.priorityField])) : t("kanban.reportItem")}</Tag>
																					<Tag>{stages.find((stage) => stage.id === String(row[stageField]))?.label || String(row[stageField] || "")}</Tag>
																				</Space>
																			</Col>
																		</Row>
																	</Card>
																);
															})}
														</Space>
													)}
												</Space>
											</Card>
										),
									}))}
								/>
							)}
						</Card>
					)}

					{viewMode === "report" && (
						<Card size="small" style={{ borderRadius: 14 }}>
							<Table
								size="small"
								rowKey="key"
								dataSource={reportRows}
								pagination={{ pageSize: 10 }}
								scroll={{ x: true }}
								locale={{ emptyText: t("kanban.timelineEmpty") }}
								columns={[
									{ title: t("kanban.reportBucket"), dataIndex: "bucket", key: "bucket", width: 180 },
									{ title: t("kanban.reportStart"), dataIndex: "start", key: "start", width: 150 },
									{ title: t("kanban.reportEnd"), dataIndex: "end", key: "end", width: 150 },
									{ title: t("kanban.reportTotal"), dataIndex: "total", key: "total", width: 100 },
									{ title: t("kanban.reportOpen"), dataIndex: "open", key: "open", width: 100 },
									{ title: t("kanban.reportDone"), dataIndex: "done", key: "done", width: 100 },
									{ title: t("kanban.reportOverdue"), dataIndex: "overdue", key: "overdue", width: 100 },
									{ title: t("kanban.reportTasks"), dataIndex: "tasks", key: "tasks", ellipsis: true },
								]}
							/>
						</Card>
					)}

					{fields.length > 0 && (
						<CsmEditModal
							open={editorOpen}
							onOpenChange={setEditorOpen}
							title={editingRecord ? t("kanban.editTitle") : t("kanban.addTitle")}
							m_configs={mConfigs}
							fields={fields}
							record={editingRecord}
							onSubmit={handleSubmit}
							selectEnums={selectEnums}
							database={database}
							appId={effectiveAppId}
							permissions={permissions}
							menusPermissions={menusPermissions}
							decrypt={effectiveDecrypt}
						/>
					)}
				</Space>
			</Spin>
		</div>
	);
}
