import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Badge,
	Button,
	Calendar,
	Card,
	Col,
	DatePicker,
	Divider,
	Empty,
	Form,
	Input,
	InputNumber,
	List,
	Modal,
	Popconfirm,
	Row,
	Segmented,
	Select,
	Space,
	Spin,
	Statistic,
	Table,
	Tabs,
	Tag,
	Typography,
	message,
	theme,
} from "antd";
import dayjs from "dayjs";
import { CSS } from "@dnd-kit/utilities";
import { DndContext, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTranslation } from "react-i18next";
import {
	addContactHistory,
	getTableData,
	updateCustomerStatus,
	updateTableData,
} from "#src/components/csm-grid/CsmApi";
import { useUserStore } from "#src/store";
import {
	DEFAULT_CRM_STAGES,
	parseCrmConfig,
	type CrmConfig,
	type CrmDataSourceConfig,
	type CrmSectionKey,
} from "./crm-config";

type RowData = Record<string, any>;
type Database = Record<string, { rows: RowData[]; fieldsPK?: string[] }>;

interface CsmCrmWorkspaceProps {
	appId?: string;
	menuData: Record<string, any>;
	database: Database;
	onDataChange?: () => void;
}

const defaultInventoryStatuses = [
	{ id: "available", label: "Trống", color: "green" },
	{ id: "booking", label: "Đang giữ chỗ", color: "orange" },
	{ id: "sold", label: "Đã bán", color: "red" },
];

const defaultActivityTypes = ["call", "meeting", "site_visit", "email"];
const defaultTaskStatuses = ["todo", "in_progress", "done"];

type CrmLocale = "vi" | "en" | "zh";

function normalizeCrmLanguage(raw: string | undefined): CrmLocale {
	const lang = String(raw || "").toLowerCase();
	if (lang.startsWith("en")) return "en";
	if (lang.startsWith("zh")) return "zh";
	return "vi";
}

function pickCrmText(locale: CrmLocale, vi: string, en: string, zh: string) {
	if (locale === "en") return en;
	if (locale === "zh") return zh;
	return vi;
}

function resolveIntlLocale(locale?: string) {
	if (locale) return locale;
	if (typeof document !== "undefined" && document.documentElement.lang) return document.documentElement.lang;
	return "vi-VN";
}

function toNumber(value: any): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (typeof value === "string") {
		const normalized = value.replace(/,/g, "").trim();
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function toTimestamp(value: any): number | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value === "number") {
		if (value > 1000000000000) return value;
		if (value > 1000000000) return value * 1000;
		return value;
	}
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric) && numeric > 0) return toTimestamp(numeric);
		const parsed = dayjs(value);
		return parsed.isValid() ? parsed.valueOf() : null;
	}
	if (dayjs.isDayjs(value)) return value.valueOf();
	return null;
}

function formatCurrency(value: any, locale?: string) {
	const amount = toNumber(value);
	if (!amount) return "0";
	return new Intl.NumberFormat(resolveIntlLocale(locale), {
		style: "currency",
		currency: "VND",
		maximumFractionDigits: 0,
	}).format(amount);
}

function formatDateTime(value: any, locale?: string, emptyText: string = "Chưa có") {
	const timestamp = toTimestamp(value);
	if (!timestamp) return emptyText;
	const currentLocale = resolveIntlLocale(locale).toLowerCase();
	if (currentLocale.startsWith("en")) return dayjs(timestamp).format("MM/DD/YYYY HH:mm");
	if (currentLocale.startsWith("zh")) return dayjs(timestamp).format("YYYY/MM/DD HH:mm");
	return dayjs(timestamp).format("DD/MM/YYYY HH:mm");
}

function compareUserIdentity(user: Record<string, any>, value: any) {
	const normalized = String(value || "").trim().toLowerCase();
	if (!normalized) return false;
	const candidates = [user.userId, user.username, user.email, user.full_name, user.phoneNumber]
		.filter(Boolean)
		.map((item) => String(item).trim().toLowerCase());
	return candidates.includes(normalized);
}

function parseLinkedIds(raw: any): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.map((item) => String(item));
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return [];
		if (trimmed.startsWith("[")) {
			try {
				return JSON.parse(trimmed).map((item: any) => String(item));
			}
			catch {
				return [];
			}
		}
		return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
	}
	return [];
}

function stringifyLinkedIds(ids: string[]) {
	return JSON.stringify(Array.from(new Set(ids)));
}

function getPrimaryKey(row: RowData, source?: CrmDataSourceConfig) {
	const keyField = source?.pkField || "id";
	const value = row[keyField] ?? row.id ?? row.phone;
	return value === undefined || value === null ? "" : String(value);
}

function pickWhere(source: CrmDataSourceConfig | undefined, row: RowData): Record<string, any> {
	const keyField = source?.pkField || "id";
	if (row[keyField] !== undefined) return { [keyField]: row[keyField] };
	if (row.id !== undefined) return { id: row.id };
	if (row.phone !== undefined) return { phone: row.phone };
	return {};
}

function buildDateBadgeItems(rows: RowData[], source?: CrmDataSourceConfig) {
	const fieldName = source?.scheduledAtField || source?.dueDateField || source?.completedAtField;
	const byDate = new Map<string, number>();
	if (!fieldName) return byDate;
	rows.forEach((row) => {
		const timestamp = toTimestamp(row[fieldName]);
		if (!timestamp) return;
		const key = dayjs(timestamp).format("YYYY-MM-DD");
		byDate.set(key, (byDate.get(key) || 0) + 1);
	});
	return byDate;
}

function DraggableLeadCard({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		opacity: isDragging ? 0.4 : 1,
		cursor: "grab",
	};
	return (
		<div ref={setNodeRef} style={style} {...listeners} {...attributes}>
			{children}
		</div>
	);
}

function DroppableStageColumn({
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
				minHeight: 120,
				padding: 8,
				borderRadius: 16,
				background: isOver ? hoverBg : baseBg,
				border: `1px solid ${borderColor}`,
				transition: "background-color 0.2s ease",
			}}
		>
			{children}
		</div>
	);
}

export default function CsmCrmWorkspace({ appId, menuData, database, onDataChange }: CsmCrmWorkspaceProps) {
	const [activityForm] = Form.useForm();
	const [taskForm] = Form.useForm();
	const [leadForm] = Form.useForm();
	const [inventoryForm] = Form.useForm();
	const { i18n } = useTranslation();
	const { token } = theme.useToken();
	const user = useUserStore();
	const resolvePopupContainer = useCallback((node?: HTMLElement) => node?.parentElement || document.body, []);
	const language = useMemo<CrmLocale>(() => normalizeCrmLanguage(i18n.language), [i18n.language]);
	const localeCode = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "vi-VN";
	const text = useMemo(() => {
		const tr = (vi: string, en: string, zh: string) => pickCrmText(language, vi, en, zh);
		return {
			pipeline: tr("Phễu bán hàng", "Pipeline", "销售漏斗"),
			inventory: tr("Kho hàng", "Inventory", "库存"),
			activities: tr("Hoạt động", "Activities", "活动"),
			analytics: tr("Phân tích", "Analytics", "分析"),
			noData: tr("Chưa có", "No data", "暂无"),
			uncategorized: tr("Chưa phân loại", "Uncategorized", "未分类"),
			other: tr("Khác", "Other", "其他"),
			selectLeadFirst: tr("Chọn một lead trước khi đính kèm sản phẩm", "Select a lead before linking a product", "请先选择线索再关联产品"),
			attachInventoryOk: tr("Đã đính kèm sản phẩm quan tâm cho lead", "Linked the product to the selected lead", "已将产品关联到所选线索"),
			attachInventoryFail: tr("Không thể đính kèm sản phẩm cho lead", "Unable to link the product to the lead", "无法将产品关联到线索"),
			activityLogged: tr("Đã ghi nhận tương tác", "Interaction logged", "互动已记录"),
			activitySaveFail: tr("Không thể lưu lịch sử tương tác", "Unable to save interaction history", "无法保存互动记录"),
			taskCreated: tr("Đã tạo task theo dõi", "Follow-up task created", "已创建跟进任务"),
			taskCreateFail: tr("Không thể tạo task", "Unable to create task", "无法创建任务"),
			statusUpdateFail: tr("Không thể cập nhật trạng thái khách hàng", "Unable to update customer status", "无法更新客户状态"),
			pipelineTitle: tr("Sales Pipeline", "Sales Pipeline", "销售流程"),
			searchLead: tr("Tìm khách, số điện thoại, dự án", "Search customer, phone, or project", "搜索客户、电话或项目"),
			phoneMaskHint: tr("Ẩn số điện thoại khi chưa đến bước hợp đồng", "Phone is masked before contract stage", "合同阶段前隐藏手机号"),
			noLeadYet: tr("Chưa có lead", "No leads yet", "暂无线索"),
			unnamedLead: tr("Khách chưa đặt tên", "Unnamed lead", "未命名线索"),
			stale: tr("Quá hạn xử lý", "Overdue", "超时未处理"),
			project: tr("Dự án", "Project", "项目"),
			lastContact: tr("Liên hệ gần nhất", "Last contact", "最近联系"),
			phone: tr("SĐT", "Phone", "电话"),
			sales: tr("Sales", "Sales", "销售"),
			expectedValue: tr("Giá trị dự kiến", "Expected value", "预估价值"),
			inventoryTitle: tr("Kho hàng thời gian thực", "Live inventory", "实时库存"),
			statusPlaceholder: tr("Trạng thái", "Status", "状态"),
			directionPlaceholder: tr("Hướng", "Direction", "朝向"),
			bedroomPlaceholder: tr("Phòng ngủ", "Bedrooms", "卧室"),
			priceFrom: tr("Giá từ", "Price from", "价格从"),
			to: tr("đến", "to", "到"),
			areaFrom: tr("Diện tích từ", "Area from", "面积从"),
			emptyInventory: tr("Không có sản phẩm phù hợp bộ lọc", "No products match the filters", "没有符合筛选条件的产品"),
			productFallback: tr("Sản phẩm", "Product", "产品"),
			code: tr("Mã", "Code", "编号"),
			attachCurrentLead: tr("Đính kèm vào lead đang chọn", "Link to selected lead", "关联到当前线索"),
			linkedCurrentLead: tr("Đã gắn với lead đang chọn", "Linked to selected lead", "已关联当前线索"),
			activeLead: tr("Lead đang tư vấn", "Active lead", "当前跟进线索"),
			targetValue: tr("Giá trị mục tiêu", "Target value", "目标价值"),
			interestedProducts: tr("Sản phẩm quan tâm", "Interested products", "意向产品"),
			pickLeadKanban: tr("Chọn một lead từ Kanban để ghép sản phẩm", "Choose a lead from Kanban to match products", "从看板中选择线索以匹配产品"),
			todayCalls: tr("Cuộc gọi hôm nay", "Calls today", "今日通话"),
			successMeetings: tr("Lịch hẹn thành công", "Successful meetings", "成功预约"),
			bookingLeads: tr("Lead đặt cọc", "Booked leads", "订金线索"),
			closeRate: tr("Tỷ lệ chốt", "Close rate", "成交率"),
			quickActions: tr("Thao tác nhanh", "Quick actions", "快捷操作"),
			logInteraction: tr("Ghi log cuộc gọi / ghi chú", "Log call / note", "记录通话 / 备注"),
			createTask: tr("Tạo task nhắc việc", "Create follow-up task", "创建提醒任务"),
			exportWarningTitle: tr("Cảnh báo xuất dữ liệu số lượng lớn", "Large export warning", "大量导出警告"),
			exportWarningDesc: tr("Có {{count}} bản ghi export trong 24h gần nhất, vượt ngưỡng {{threshold}}.", "There were {{count}} export records in the last 24 hours, exceeding {{threshold}}.", "最近 24 小时内有 {{count}} 条导出记录，超过阈值 {{threshold}}。"),
			activityCalendar: tr("Lịch hoạt động", "Activity calendar", "活动日历"),
			noCalendarToday: tr("Không có lịch trong ngày", "No schedule for today", "今天没有日程"),
			recentInteractions: tr("Tương tác gần đây", "Recent interactions", "最近互动"),
			noInteractionLog: tr("Chưa có log tương tác", "No interaction logs", "暂无互动记录"),
			followupTasks: tr("Task theo dõi", "Follow-up tasks", "跟进任务"),
			noTaskPending: tr("Chưa có task cần xử lý", "No pending tasks", "暂无待处理任务"),
			due: tr("Hạn", "Due", "截止"),
			funnelChart: tr("Biểu đồ phễu bán hàng", "Sales funnel chart", "销售漏斗图"),
			salesDimension: tr("Doanh số theo chiều phân tích", "Sales by dimension", "按维度统计销售额"),
			dimensionAssigned: tr("Cá nhân", "Assignee", "人员"),
			dimensionProject: tr("Dự án", "Project", "项目"),
			dimensionSource: tr("Nguồn khách", "Lead source", "线索来源"),
			source: tr("Nguồn", "Source", "来源"),
			lead: tr("Lead", "Lead", "线索"),
			closed: tr("Đã chốt", "Closed", "成交"),
			rate: tr("Tỷ lệ", "Rate", "转化率"),
			workspaceTag: tr("CRM Workspace", "CRM Workspace", "CRM 工作台"),
			headerTitle: tr("CRM bất động sản", "Real estate CRM", "房地产 CRM"),
			headerDesc: tr("Biến dữ liệu lead, kho hàng và tương tác thành hành động có thể đo lường ngay trên admin frontend.", "Turn lead, inventory, and interaction data into measurable actions directly inside the admin frontend.", "将线索、库存与互动数据转化为管理后台中可衡量的行动。"),
			activeLeads: tr("Lead đang xử lý", "Active leads", "跟进中的线索"),
			availableProducts: tr("Sản phẩm trống", "Available products", "可售产品"),
			openTasks: tr("Task mở", "Open tasks", "进行中任务"),
			closedLeads: tr("Lead chốt", "Closed leads", "成交线索"),
			exportLimitTitle: tr("Log xuất dữ liệu vượt ngưỡng kiểm soát", "Export log threshold exceeded", "导出日志超过控制阈值"),
			exportLimitDesc: tr("Đã ghi nhận {{count}} lượt export trong 24 giờ gần nhất. Kiểm tra quyền export và nhật ký {{threshold}} bản ghi/ngày.", "Detected {{count}} exports in the last 24 hours. Review export permissions and the {{threshold}} records/day audit threshold.", "最近 24 小时检测到 {{count}} 次导出，请检查导出权限和每日 {{threshold}} 条记录的审计阈值。"),
			activityModalTitle: tr("Ghi log tương tác", "Log interaction", "记录互动"),
			taskModalTitle: tr("Tạo task theo dõi", "Create follow-up task", "创建跟进任务"),
			leadLabel: tr("Lead", "Lead", "线索"),
			chooseLead: tr("Chọn lead", "Choose a lead", "请选择线索"),
			activityType: tr("Loại tương tác", "Interaction type", "互动类型"),
			chooseActivityType: tr("Chọn loại tương tác", "Choose interaction type", "请选择互动类型"),
			time: tr("Thời điểm", "Time", "时间"),
			chooseTime: tr("Chọn thời điểm", "Choose a time", "请选择时间"),
			result: tr("Kết quả", "Result", "结果"),
			notes: tr("Tóm tắt nội dung", "Summary", "内容摘要"),
			enterNotes: tr("Nhập nội dung trao đổi", "Enter interaction details", "请输入互动内容"),
			taskTitle: tr("Tiêu đề task", "Task title", "任务标题"),
			enterTaskTitle: tr("Nhập tiêu đề task", "Enter task title", "请输入任务标题"),
			dueAt: tr("Hạn xử lý", "Due time", "截止时间"),
			chooseDueAt: tr("Chọn hạn xử lý", "Choose due time", "请选择截止时间"),
			status: tr("Trạng thái", "Status", "状态"),
			// CRUD
			addLead: tr("+ Thêm khách", "+ Add lead", "+ 新增线索"),
			editLead: tr("Sửa khách hàng", "Edit lead", "编辑线索"),
			addInventory: tr("+ Thêm sản phẩm", "+ Add product", "+ 新增房源"),
			editInventory: tr("Sửa sản phẩm", "Edit product", "编辑房源"),
			confirmDelete: tr("Xác nhận xóa bản ghi này?", "Confirm delete this record?", "确认删除此记录？"),
			deleteOk: tr("Đã xóa", "Deleted", "已删除"),
			deleteFail: tr("Không thể xóa", "Delete failed", "删除失败"),
			saveOk: tr("Đã lưu", "Saved", "已保存"),
			saveFail: tr("Không thể lưu", "Save failed", "无法保存"),
			refresh: tr("Làm mới", "Refresh", "刷新"),
			customerName: tr("Tên khách hàng", "Customer name", "客户姓名"),
			enterName: tr("Nhập tên", "Enter name", "请输入姓名"),
			enterPhone: tr("Nhập số điện thoại", "Enter phone", "请输入手机号"),
			sourceLead: tr("Nguồn khách", "Lead source", "线索来源"),
			assignedTo: tr("Nhân viên phụ trách", "Assigned to", "负责人"),
			teamId: tr("Nhóm", "Team", "团队"),
			productCode: tr("Mã sản phẩm", "Product code", "产品编号"),
			productName: tr("Tên sản phẩm", "Product name", "产品名称"),
			areaM2: tr("Diện tích (m²)", "Area (m²)", "面积（m²）"),
			bedrooms: tr("Số phòng ngủ", "Bedrooms", "卧室"),
			direction: tr("Hướng", "Direction", "朝向"),
			interactionTitle: tr("Tiêu đề", "Title", "标题"),
			delete: tr("Xóa", "Delete", "删除"),
			edit: tr("Sửa", "Edit", "编辑"),
		};
	}, [language]);
	const workspaceTheme = useMemo(() => {
		const danger = (token as any).colorError || "#ff4d4f";
		const warning = (token as any).colorWarning || "#faad14";
		const success = (token as any).colorSuccess || "#52c41a";
		const info = (token as any).colorInfo || token.colorPrimary;
		return {
			danger,
			warning,
			success,
			info,
			mutedBg: (token as any).colorFillSecondary || token.colorBgContainer,
			softBg: (token as any).colorFillTertiary || token.colorBgContainer,
			activeBg: (token as any).colorPrimaryBg || token.colorBgElevated,
			dropBg: (token as any).colorFillQuaternary || token.colorBgContainer,
			dropHoverBg: (token as any).colorPrimaryBgHover || (token as any).colorPrimaryBg || token.colorBgElevated,
			border: token.colorBorder,
			headlineText: (token as any).colorTextLightSolid || "#ffffff",
			headlineSubText: (token as any).colorTextLabel || "rgba(255,255,255,0.85)",
			headerGradient: `linear-gradient(135deg, ${token.colorBgContainer} 0%, ${(token as any).colorPrimaryBg || token.colorBgElevated} 52%, ${(token as any).colorInfoBg || token.colorBgContainer} 100%)`,
		};
	}, [token]);

	const resolveTagColor = useCallback((color?: string) => {
		if (!color) return token.colorBorder;
		const normalized = String(color).toLowerCase();
		if (["green", "success"].includes(normalized)) return workspaceTheme.success;
		if (["orange", "gold", "warning", "yellow"].includes(normalized)) return workspaceTheme.warning;
		if (["red", "danger", "error"].includes(normalized)) return workspaceTheme.danger;
		if (["blue", "cyan", "info"].includes(normalized)) return workspaceTheme.info;
		return color;
	}, [token.colorBorder, workspaceTheme.danger, workspaceTheme.info, workspaceTheme.success, workspaceTheme.warning]);

	const workspaceCss = useMemo(() => `
		.crm-workspace-theme {
			color: ${token.colorText};
			background: ${token.colorBgLayout};
		}
		.crm-workspace-theme .ant-typography,
		.crm-workspace-theme .ant-statistic,
		.crm-workspace-theme .ant-statistic-content,
		.crm-workspace-theme .ant-statistic-title,
		.crm-workspace-theme .ant-empty-description,
		.crm-workspace-theme .ant-form-item-label > label {
			color: ${token.colorText};
		}
		.crm-workspace-theme .ant-card,
		.crm-workspace-theme .ant-card .ant-card-head,
		.crm-workspace-theme .ant-card .ant-card-body,
		.crm-workspace-theme .ant-segmented,
		.crm-workspace-theme .ant-list,
		.crm-workspace-theme .ant-list-item {
			background: ${token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme .ant-tabs,
		.crm-workspace-theme .ant-tabs-nav,
		.crm-workspace-theme .ant-tabs-content,
		.crm-workspace-theme .ant-tabs-tabpane,
		.crm-workspace-theme .ant-divider,
		.crm-workspace-theme .ant-segmented-item,
		.crm-workspace-theme .ant-calendar,
		.crm-workspace-theme .ant-picker-panel,
		.crm-workspace-theme .ant-picker-content th,
		.crm-workspace-theme .ant-picker-cell,
		.crm-workspace-theme .ant-picker-cell-inner {
			background: ${token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme .ant-tabs-tab,
		.crm-workspace-theme .ant-tabs-tab-btn,
		.crm-workspace-theme .ant-radio-button-wrapper,
		.crm-workspace-theme .ant-segmented-item-label {
			color: ${token.colorTextSecondary};
		}
		.crm-workspace-theme .ant-tabs-tab {
			background: ${token.colorBgContainer};
		}
		.crm-workspace-theme .ant-segmented {
			background: ${(token as any).colorFillTertiary || token.colorBgContainer};
			border: 1px solid ${token.colorBorder};
		}
		.crm-workspace-theme .ant-segmented-item {
			background: transparent;
		}
		.crm-workspace-theme .ant-radio-group,
		.crm-workspace-theme .ant-radio-group-solid {
			background: ${(token as any).colorFillTertiary || token.colorBgContainer};
			color: ${token.colorText};
		}
		.crm-workspace-theme .ant-radio-button-wrapper {
			background: ${token.colorBgContainer};
			color: ${token.colorTextSecondary};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme .ant-tabs-tab-active .ant-tabs-tab-btn,
		.crm-workspace-theme .ant-tabs-tab-active,
		.crm-workspace-theme .ant-segmented-item-selected,
		.crm-workspace-theme .ant-segmented-item-selected .ant-segmented-item-label,
		.crm-workspace-theme .ant-radio-group-solid .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled),
		.crm-workspace-theme .ant-radio-button-wrapper-checked:not(.ant-radio-button-wrapper-disabled) {
			color: ${token.colorText};
			background: ${(token as any).colorFillSecondary || token.colorBgContainer};
			border-color: ${(token as any).colorPrimaryBorder || token.colorPrimary};
			box-shadow: none;
		}
		.crm-workspace-theme .ant-table-wrapper .ant-table,
		.crm-workspace-theme .ant-table-wrapper .ant-table-container,
		.crm-workspace-theme .ant-table-wrapper .ant-table-content,
		.crm-workspace-theme .ant-table-wrapper .ant-table-cell,
		.crm-workspace-theme .ant-table-wrapper .ant-table-tbody > tr > td,
		.crm-workspace-theme .ant-table-wrapper .ant-table-thead > tr > th {
			background: ${token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme .ant-table-wrapper .ant-table-thead > tr > th {
			background: ${(token as any).colorFillTertiary || token.colorBgContainer};
			color: ${token.colorTextSecondary};
		}
		.crm-workspace-theme .ant-input,
		.crm-workspace-theme .ant-input-affix-wrapper,
		.crm-workspace-theme .ant-input-number,
		.crm-workspace-theme .ant-input-number-input,
		.crm-workspace-theme .ant-select-selector,
		.crm-workspace-theme .ant-picker,
		.crm-workspace-theme textarea {
			background: ${(token as any).colorFillSecondary || token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme .ant-input::placeholder,
		.crm-workspace-theme textarea::placeholder,
		.crm-workspace-theme .ant-select-selection-placeholder {
			color: ${(token as any).colorTextTertiary || token.colorTextSecondary};
		}
		.crm-workspace-theme-modal .ant-modal-content,
		.crm-workspace-theme-modal .ant-modal-header,
		.crm-workspace-theme-modal .ant-modal-body,
		.crm-workspace-theme-modal .ant-modal-footer,
		.crm-workspace-theme-modal .ant-modal-title,
		.crm-workspace-theme-modal .ant-typography,
		.crm-workspace-theme-modal .ant-form-item-label > label,
		.crm-workspace-theme-modal .ant-form-item-explain,
		.crm-workspace-theme-modal .ant-form-item-extra {
			background: ${token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme-modal .ant-modal-content {
			box-shadow: ${token.boxShadowSecondary};
		}
		.crm-workspace-theme-modal .ant-modal-close,
		.crm-workspace-theme-modal .ant-modal-close-x {
			color: ${token.colorTextSecondary};
		}
		.crm-workspace-theme-modal .ant-input,
		.crm-workspace-theme-modal .ant-input-affix-wrapper,
		.crm-workspace-theme-modal .ant-input-number,
		.crm-workspace-theme-modal .ant-input-number-input,
		.crm-workspace-theme-modal .ant-select-selector,
		.crm-workspace-theme-modal .ant-picker,
		.crm-workspace-theme-modal textarea {
			background: ${(token as any).colorFillSecondary || token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme-modal .ant-input::placeholder,
		.crm-workspace-theme-modal textarea::placeholder,
		.crm-workspace-theme-modal .ant-select-selection-placeholder {
			color: ${(token as any).colorTextTertiary || token.colorTextSecondary};
		}
		.crm-workspace-theme-modal .ant-select-selection-item,
		.crm-workspace-theme-modal .ant-picker-input > input,
		.crm-workspace-theme-modal .ant-input-number-input {
			color: ${token.colorText};
		}
		.crm-workspace-theme-modal .ant-btn-default,
		.crm-workspace-theme-modal .ant-btn-dashed,
		.crm-workspace-theme-modal .ant-btn-text {
			background: ${(token as any).colorFillSecondary || token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme-modal .ant-btn-default:hover,
		.crm-workspace-theme-modal .ant-btn-dashed:hover,
		.crm-workspace-theme-modal .ant-btn-text:hover {
			background: ${(token as any).colorFillTertiary || token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${(token as any).colorPrimaryBorder || token.colorPrimary};
		}
		.crm-workspace-theme-modal .ant-select-dropdown,
		.crm-workspace-theme-modal .ant-select-item,
		.crm-workspace-theme-modal .ant-picker-dropdown .ant-picker-panel-container,
		.crm-workspace-theme-modal .ant-picker-panel,
		.crm-workspace-theme-modal .ant-picker-header,
		.crm-workspace-theme-modal .ant-picker-content th,
		.crm-workspace-theme-modal .ant-picker-cell,
		.crm-workspace-theme-modal .ant-picker-cell-inner {
			background: ${token.colorBgContainer};
			color: ${token.colorText};
			border-color: ${token.colorBorder};
		}
		.crm-workspace-theme-modal .ant-select-item-option-active:not(.ant-select-item-option-disabled),
		.crm-workspace-theme-modal .ant-select-item-option-selected:not(.ant-select-item-option-disabled),
		.crm-workspace-theme-modal .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner,
		.crm-workspace-theme-modal .ant-picker-cell-in-view.ant-picker-cell-range-start .ant-picker-cell-inner,
		.crm-workspace-theme-modal .ant-picker-cell-in-view.ant-picker-cell-range-end .ant-picker-cell-inner {
			background: ${(token as any).colorPrimaryBg || token.colorBgElevated};
			color: ${token.colorText};
		}
	`, [token]);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
	const crmConfig = useMemo<CrmConfig>(() => parseCrmConfig(menuData.crm_config), [menuData.crm_config]);
	const sections = crmConfig.sections || {};
	const dataSources = crmConfig.dataSources || {};
	const leadSource = dataSources.leads;
	const inventorySource = dataSources.inventory;
	const activitySource = dataSources.activities;
	const taskSource = dataSources.tasks;
	const exportSource = dataSources.exports;
	const leadStatusField = leadSource?.statusField || "status";
	const leadTitleField = leadSource?.titleField || "name";
	const leadPhoneField = leadSource?.phoneField || "phone";
	const leadProjectField = leadSource?.projectField || "project_name";
	const leadValueField = leadSource?.valueField || "expected_value";
	const leadAssignedField = leadSource?.assignedToField || "assigned_to";
	const leadTeamField = leadSource?.teamField || "team_id";
	const leadUpdatedField = leadSource?.updatedAtField || "updated_at";
	const leadCreatedField = leadSource?.createdAtField || "created_at";
	const leadLastInteractionField = leadSource?.lastInteractionField || "last_contact_at";
	const pipelineStages = crmConfig.pipeline?.stages?.length ? crmConfig.pipeline.stages : DEFAULT_CRM_STAGES;
	const warningStageIds = crmConfig.pipeline?.warningStageIds?.length
		? crmConfig.pipeline.warningStageIds
		: [pipelineStages[0]?.id].filter(Boolean) as string[];
	const security = crmConfig.security || {};
	const phoneMask = security.phoneMask || {};
	const inventoryStatuses = crmConfig.inventory?.statuses?.length ? crmConfig.inventory.statuses : defaultInventoryStatuses;
	const activityTypes = crmConfig.activities?.activityTypes?.length ? crmConfig.activities.activityTypes : defaultActivityTypes;
	const taskStatuses = crmConfig.activities?.taskStatuses?.length ? crmConfig.activities.taskStatuses : defaultTaskStatuses;
	const [activeSection, setActiveSection] = useState<CrmSectionKey>(crmConfig.defaultSection || "pipeline");
	const [searchText, setSearchText] = useState("");
	const [selectedLeadId, setSelectedLeadId] = useState<string>("");
	const [inventoryStatusFilter, setInventoryStatusFilter] = useState<string>("");
	const [directionFilter, setDirectionFilter] = useState<string>("");
	const [bedroomFilter, setBedroomFilter] = useState<string>("");
	const [priceRange, setPriceRange] = useState<[number | null, number | null]>([null, null]);
	const [areaRange, setAreaRange] = useState<[number | null, number | null]>([null, null]);
	const [analyticsDimension, setAnalyticsDimension] = useState<"assigned" | "project" | "source">("assigned");
	const [calendarDate, setCalendarDate] = useState(dayjs());
	const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
	const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [leadRows, setLeadRows] = useState<RowData[]>([]);
	const [inventoryRows, setInventoryRows] = useState<RowData[]>([]);
	const [activityRows, setActivityRows] = useState<RowData[]>([]);
	const [taskRows, setTaskRows] = useState<RowData[]>([]);
	const [exportRows, setExportRows] = useState<RowData[]>([]);
	// CRUD & Refresh state
	const [fetchLoading, setFetchLoading] = useState(false);
	const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
	const [editingLead, setEditingLead] = useState<RowData | null>(null);
	const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
	const [editingInventory, setEditingInventory] = useState<RowData | null>(null);

	const sectionItems = useMemo(() => {
		const items: Array<{ label: string; value: CrmSectionKey }> = [];
		if (sections.pipeline !== false) items.push({ label: text.pipeline, value: "pipeline" });
		if (sections.inventory !== false) items.push({ label: text.inventory, value: "inventory" });
		if (sections.activities !== false) items.push({ label: text.activities, value: "activities" });
		if (sections.analytics !== false) items.push({ label: text.analytics, value: "analytics" });
		return items;
	}, [sections, text]);

	useEffect(() => {
		if (!sectionItems.some((item) => item.value === activeSection)) {
			setActiveSection(sectionItems[0]?.value || "pipeline");
		}
	}, [activeSection, sectionItems]);

	useEffect(() => {
		setLeadRows(leadSource?.tableName ? database[leadSource.tableName]?.rows || [] : []);
	}, [database, leadSource?.tableName]);

	useEffect(() => {
		setInventoryRows(inventorySource?.tableName ? database[inventorySource.tableName]?.rows || [] : []);
	}, [database, inventorySource?.tableName]);

	useEffect(() => {
		setActivityRows(activitySource?.tableName ? database[activitySource.tableName]?.rows || [] : []);
	}, [database, activitySource?.tableName]);

	useEffect(() => {
		setTaskRows(taskSource?.tableName ? database[taskSource.tableName]?.rows || [] : []);
	}, [database, taskSource?.tableName]);

	useEffect(() => {
		setExportRows(exportSource?.tableName ? database[exportSource.tableName]?.rows || [] : []);
	}, [database, exportSource?.tableName]);

	const isAdmin = useMemo(() => {
		const adminRoles = security.adminRoles?.length ? security.adminRoles : ["admin", "dev"];
		return adminRoles.some((role) => user.roles?.includes(role));
	}, [security.adminRoles, user.roles]);

	const isLeader = useMemo(() => {
		const leaderRoles = security.leaderRoles?.length ? security.leaderRoles : ["leader", "manager", "team_leader"];
		return leaderRoles.some((role) => user.roles?.includes(role));
	}, [security.leaderRoles, user.roles]);

	const canAccessLead = (row: RowData) => {
		if (security.visibilityMode === "all" || isAdmin) return true;
		if (compareUserIdentity(user, row[leadAssignedField])) return true;
		if (security.visibilityMode === "owner-admin") return false;
		if (isLeader) {
			if (!leadTeamField) return true;
			const currentUserTeam = (user as Record<string, any>)[leadTeamField];
			if (currentUserTeam === undefined || currentUserTeam === null || currentUserTeam === "") return true;
			return row[leadTeamField] === currentUserTeam;
		}
		return false;
	};

	const visibleLeadRows = useMemo(() => leadRows.filter(canAccessLead), [leadRows]);

	const selectedLead = useMemo(() => visibleLeadRows.find((row) => getPrimaryKey(row, leadSource) === selectedLeadId) || null, [visibleLeadRows, selectedLeadId, leadSource]);

	useEffect(() => {
		if (!selectedLeadId && visibleLeadRows.length > 0) {
			setSelectedLeadId(getPrimaryKey(visibleLeadRows[0], leadSource));
		}
	}, [selectedLeadId, visibleLeadRows, leadSource]);

	const filteredLeadRows = useMemo(() => {
		if (!searchText.trim()) return visibleLeadRows;
		const keyword = searchText.trim().toLowerCase();
		return visibleLeadRows.filter((row) => [
			row[leadTitleField],
			row[leadPhoneField],
			row[leadProjectField],
			row[leadSource?.sourceField || "source"],
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword)));
	}, [visibleLeadRows, searchText, leadTitleField, leadPhoneField, leadProjectField, leadSource?.sourceField]);

	const pipelineByStage = useMemo(() => {
		const map = new Map<string, RowData[]>();
		pipelineStages.forEach((stage) => map.set(stage.id, []));
		filteredLeadRows.forEach((row) => {
			const stageId = String(row[leadStatusField] || pipelineStages[0]?.id || "lead");
			if (!map.has(stageId)) map.set(stageId, []);
			map.get(stageId)?.push(row);
		});
		return map;
	}, [filteredLeadRows, pipelineStages, leadStatusField]);

	const inventoryDirections = useMemo(() => {
		const field = inventorySource?.directionField || "direction";
		return Array.from(new Set(inventoryRows.map((row) => row[field]).filter(Boolean))).map((value) => ({ label: String(value), value: String(value) }));
	}, [inventoryRows, inventorySource?.directionField]);

	const inventoryBedrooms = useMemo(() => {
		const field = inventorySource?.bedroomField || "bedrooms";
		return Array.from(new Set(inventoryRows.map((row) => row[field]).filter((value) => value !== undefined && value !== null))).map((value) => ({ label: String(value), value: String(value) }));
	}, [inventoryRows, inventorySource?.bedroomField]);

	const filteredInventoryRows = useMemo(() => {
		const statusField = inventorySource?.statusField || "status";
		const directionField = inventorySource?.directionField || "direction";
		const bedroomField = inventorySource?.bedroomField || "bedrooms";
		const priceField = inventorySource?.priceField || "price";
		const areaField = inventorySource?.areaField || "area_m2";
		return inventoryRows.filter((row) => {
			if (inventoryStatusFilter && String(row[statusField]) !== inventoryStatusFilter) return false;
			if (directionFilter && String(row[directionField]) !== directionFilter) return false;
			if (bedroomFilter && String(row[bedroomField]) !== bedroomFilter) return false;
			const price = toNumber(row[priceField]);
			const area = toNumber(row[areaField]);
			if (priceRange[0] !== null && price < priceRange[0]) return false;
			if (priceRange[1] !== null && price > priceRange[1]) return false;
			if (areaRange[0] !== null && area < areaRange[0]) return false;
			if (areaRange[1] !== null && area > areaRange[1]) return false;
			return true;
		});
	}, [inventoryRows, inventorySource, inventoryStatusFilter, directionFilter, bedroomFilter, priceRange, areaRange]);

	const today = dayjs().startOf("day");
	const callCountToday = useMemo(() => activityRows.filter((row) => {
		const typeField = activitySource?.contactTypeField || "activity_type";
		const completedField = activitySource?.completedAtField || activitySource?.scheduledAtField || "completed_at";
		const timestamp = toTimestamp(row[completedField]);
		if (!timestamp) return false;
		return String(row[typeField] || "") === "call" && dayjs(timestamp).isSame(today, "day");
	}).length, [activityRows, activitySource, today]);

	const successfulMeetings = useMemo(() => activityRows.filter((row) => {
		const typeField = activitySource?.contactTypeField || "activity_type";
		const resultField = activitySource?.resultField || "result";
		const completedField = activitySource?.completedAtField || activitySource?.scheduledAtField || "completed_at";
		const timestamp = toTimestamp(row[completedField]);
		if (!timestamp || !dayjs(timestamp).isSame(today, "day")) return false;
		const type = String(row[typeField] || "");
		const result = String(row[resultField] || "");
		return ["meeting", "site_visit"].includes(type) && result === (activitySource?.appointmentSuccessValue || "success");
	}).length, [activityRows, activitySource, today]);

	const bookingStageIds = crmConfig.analytics?.bookingStageIds?.length ? crmConfig.analytics.bookingStageIds : ["booking"];
	const closedStageIds = crmConfig.analytics?.closedStageIds?.length ? crmConfig.analytics.closedStageIds : ["contract", "after_sale"];
	const bookingCount = filteredLeadRows.filter((row) => bookingStageIds.includes(String(row[leadStatusField] || ""))).length;
	const closedCount = filteredLeadRows.filter((row) => closedStageIds.includes(String(row[leadStatusField] || ""))).length;
	const conversionRate = filteredLeadRows.length > 0 ? Math.round((closedCount / filteredLeadRows.length) * 100) : 0;

	const salesByDimension = useMemo(() => {
		const fieldMap = {
			assigned: leadAssignedField,
			project: leadProjectField,
			source: leadSource?.sourceField || "source",
		};
		const field = fieldMap[analyticsDimension];
		const totals = new Map<string, number>();
		filteredLeadRows.forEach((row) => {
			if (!closedStageIds.includes(String(row[leadStatusField] || ""))) return;
			const key = String(row[field] || text.uncategorized);
			totals.set(key, (totals.get(key) || 0) + toNumber(row[leadValueField]));
		});
		return Array.from(totals.entries())
			.map(([name, value]) => ({ name, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 10);
	}, [filteredLeadRows, analyticsDimension, closedStageIds, leadAssignedField, leadProjectField, leadSource?.sourceField, leadStatusField, leadValueField, text.uncategorized]);

	const sourceConversionRows = useMemo(() => {
		const sourceField = leadSource?.sourceField || "source";
		const sourceMap = new Map<string, { total: number; closed: number }>();
		filteredLeadRows.forEach((row) => {
			const source = String(row[sourceField] || text.other);
			const current = sourceMap.get(source) || { total: 0, closed: 0 };
			current.total += 1;
			if (closedStageIds.includes(String(row[leadStatusField] || ""))) current.closed += 1;
			sourceMap.set(source, current);
		});
		return Array.from(sourceMap.entries()).map(([source, stat]) => ({
			source,
			total: stat.total,
			closed: stat.closed,
			rate: stat.total > 0 ? Math.round((stat.closed / stat.total) * 100) : 0,
		})).sort((a, b) => b.rate - a.rate);
	}, [filteredLeadRows, closedStageIds, leadSource?.sourceField, leadStatusField, text.other]);

	const funnelOption = useMemo<EChartsOption>(() => ({
		tooltip: { trigger: "item" },
		series: [
			{
				type: "funnel",
				left: "5%",
				top: 16,
				bottom: 16,
				width: "90%",
				sort: "descending",
				gap: 4,
				label: { show: true, formatter: "{b}: {c}" },
				data: pipelineStages.map((stage) => ({
					name: stage.label,
					value: pipelineByStage.get(stage.id)?.length || 0,
					itemStyle: { color: stage.color || workspaceTheme.info },
				})),
			},
		],
	}), [pipelineStages, pipelineByStage, workspaceTheme.info]);

	const salesOption = useMemo<EChartsOption>(() => ({
		tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
		xAxis: { type: "category", data: salesByDimension.map((item) => item.name), axisLabel: { rotate: 18 } },
		yAxis: { type: "value" },
		series: [
			{
				type: "bar",
				data: salesByDimension.map((item) => item.value),
				itemStyle: { color: workspaceTheme.info, borderRadius: [8, 8, 0, 0] },
			},
		],
	}), [salesByDimension, workspaceTheme.info]);

	const activitiesByDate = useMemo(() => {
		const map = buildDateBadgeItems(activityRows, activitySource);
		for (const [key, value] of buildDateBadgeItems(taskRows, taskSource)) {
			map.set(key, (map.get(key) || 0) + value);
		}
		return map;
	}, [activityRows, taskRows, activitySource, taskSource]);

	const calendarRows = useMemo(() => {
		const target = calendarDate.format("YYYY-MM-DD");
		const activityDateField = activitySource?.scheduledAtField || activitySource?.completedAtField || "scheduled_at";
		const taskDateField = taskSource?.dueDateField || "due_at";
		const rows = [
			...activityRows.map((row) => ({
				kind: "activity",
				title: `${String(row[activitySource?.contactTypeField || "activity_type"] || "Hoạt động").toUpperCase()} - ${row[activitySource?.notesField || "notes"] || "Không có ghi chú"}`,
				date: dayjs(toTimestamp(row[activityDateField]) || 0).format("YYYY-MM-DD"),
				status: row[activitySource?.resultField || "result"] || "pending",
			})),
			...taskRows.map((row) => ({
				kind: "task",
				title: row[taskSource?.titleKeyField || "title"] || "Task",
				date: dayjs(toTimestamp(row[taskDateField]) || 0).format("YYYY-MM-DD"),
				status: row[taskSource?.statusField || "status"] || "todo",
			})),
		];
		return rows.filter((row) => row.date === target);
	}, [calendarDate, activityRows, taskRows, activitySource, taskSource]);

	const exportAlert = useMemo(() => {
		const threshold = security.exportAlertThreshold || 100;
		const last24h = exportRows.filter((row) => {
			const field = exportSource?.createdAtField || "created_at";
			const timestamp = toTimestamp(row[field]);
			return timestamp ? dayjs().diff(dayjs(timestamp), "hour") <= 24 : false;
		});
		const count = last24h.length;
		return {
			count,
			threshold,
			triggered: count >= threshold,
		};
	}, [exportRows, exportSource?.createdAtField, security.exportAlertThreshold]);

	const maskPhone = (row: RowData) => {
		const rawPhone = String(row[leadPhoneField] || "");
		if (!rawPhone) return text.noData;
		if (!phoneMask.enabled || isAdmin) return rawPhone;
		const stageId = String(row[leadStatusField] || "");
		if (phoneMask.unmaskedStages?.includes(stageId)) return rawPhone;
		const visibleDigits = phoneMask.visibleDigits || 3;
		const tail = rawPhone.slice(-visibleDigits);
		return `${phoneMask.placeholder || "***"}${tail}`;
	};

	const saveRecord = async (options: {
		source?: CrmDataSourceConfig;
		row: RowData;
		command?: "create" | "update" | "delete";
		where?: Record<string, any>;
	}) => {
		if (!options.source?.tableName) return;
		await updateTableData({
			app_id: options.source.appId || appId || menuData.app_id || user.app_id || "csm",
			obj_name: options.source.tableName,
			command: options.command || "update",
			obj_update: options.row,
			pk_fields: [options.source.pkField || "id"],
			where: options.where,
		});
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const activeId = String(event.active.id || "");
		const overId = String(event.over?.id || "");
		if (!activeId || !overId || activeId === overId) return;
		const targetLead = leadRows.find((row) => getPrimaryKey(row, leadSource) === activeId);
		if (!targetLead) return;
		const nextStage = pipelineStages.find((stage) => stage.id === overId);
		if (!nextStage) return;

		const nextRow = {
			...targetLead,
			[leadStatusField]: nextStage.id,
			[leadUpdatedField]: Date.now(),
		};

		setLeadRows((current) => current.map((row) => getPrimaryKey(row, leadSource) === activeId ? nextRow : row));
		try {
			if (leadSource?.useCrmApi && targetLead[leadPhoneField]) {
				await updateCustomerStatus(String(targetLead[leadPhoneField]), appId || menuData.app_id || user.app_id || "csm", nextStage.id);
			}
			else {
				await saveRecord({
					source: leadSource,
					row: nextRow,
					where: pickWhere(leadSource, targetLead),
				});
			}
			message.success(`Đã chuyển khách sang bước ${nextStage.label}`);
			onDataChange?.();
		}
		catch (error: any) {
			setLeadRows((current) => current.map((row) => getPrimaryKey(row, leadSource) === activeId ? targetLead : row));
			message.error(error?.message || text.statusUpdateFail);
		}
	};

	const handleAttachInventory = async (inventoryRow: RowData) => {
		if (!selectedLead || !leadSource || !inventorySource) {
			message.warning(text.selectLeadFirst);
			return;
		}
		const leadPk = getPrimaryKey(selectedLead, leadSource);
		const inventoryPk = getPrimaryKey(inventoryRow, inventorySource);
		const productIdsField = leadSource.productIdsField || "interested_product_ids";
		const currentIds = parseLinkedIds(selectedLead[productIdsField]);
		const nextIds = Array.from(new Set([...currentIds, inventoryPk]));
		const nextLead = { ...selectedLead, [productIdsField]: stringifyLinkedIds(nextIds), [leadUpdatedField]: Date.now() };
		const linkField = crmConfig.inventory?.leadLinkField || inventorySource.leadRefField || "lead_id";
		const nextInventory = { ...inventoryRow, [linkField]: leadPk };

		setLeadRows((current) => current.map((row) => getPrimaryKey(row, leadSource) === leadPk ? nextLead : row));
		setInventoryRows((current) => current.map((row) => getPrimaryKey(row, inventorySource) === inventoryPk ? nextInventory : row));

		try {
			await Promise.all([
				saveRecord({ source: leadSource, row: nextLead, where: pickWhere(leadSource, selectedLead) }),
				saveRecord({ source: inventorySource, row: nextInventory, where: pickWhere(inventorySource, inventoryRow) }),
			]);
			message.success(text.attachInventoryOk);
			onDataChange?.();
		}
		catch (error: any) {
			message.error(error?.message || text.attachInventoryFail);
		}
	};

	const createActivity = async () => {
		if (!activitySource?.tableName) return;
		const values = await activityForm.validateFields();
		const leadForActivity = visibleLeadRows.find((row) => getPrimaryKey(row, leadSource) === values.lead_id);
		const row = {
			id: `act_${Date.now()}`,
			[activitySource.leadRefField || "lead_id"]: values.lead_id,
			[activitySource.contactTypeField || "activity_type"]: values.activity_type,
			[activitySource.notesField || "notes"]: values.notes,
			[activitySource.scheduledAtField || "scheduled_at"]: values.scheduled_at?.valueOf?.() || Date.now(),
			[activitySource.completedAtField || "completed_at"]: values.scheduled_at?.valueOf?.() || Date.now(),
			[activitySource.resultField || "result"]: values.result,
			[activitySource.assignedToField || "owner_id"]: user.userId || user.username,
		};
		setSaving(true);
		try {
			await saveRecord({ source: activitySource, row, command: "create" });
			setActivityRows((current) => [row, ...current]);
			if (leadSource?.useCrmApi && leadForActivity?.[leadPhoneField]) {
				await addContactHistory({
					phone: String(leadForActivity[leadPhoneField]),
					appId: appId || menuData.app_id || user.app_id || "csm",
					staffId: user.userId || user.username,
					contactType: values.activity_type,
					notes: values.notes,
				});
			}
			message.success(text.activityLogged);
			setIsActivityModalOpen(false);
			activityForm.resetFields();
			onDataChange?.();
		}
		catch (error: any) {
			message.error(error?.message || text.activitySaveFail);
		}
		finally {
			setSaving(false);
		}
	};

	const createTask = async () => {
		if (!taskSource?.tableName) return;
		const values = await taskForm.validateFields();
		const row = {
			id: `task_${Date.now()}`,
			[taskSource.titleKeyField || "title"]: values.title,
			[taskSource.leadRefField || "lead_id"]: values.lead_id,
			[taskSource.statusField || "status"]: values.status,
			[taskSource.dueDateField || "due_at"]: values.due_at?.valueOf?.() || Date.now(),
			[taskSource.assignedToField || "owner_id"]: user.userId || user.username,
		};
		setSaving(true);
		try {
			await saveRecord({ source: taskSource, row, command: "create" });
			setTaskRows((current) => [row, ...current]);
			message.success(text.taskCreated);
			setIsTaskModalOpen(false);
			taskForm.resetFields();
			onDataChange?.();
		}
		catch (error: any) {
			message.error(error?.message || text.taskCreateFail);
		}
		finally {
			setSaving(false);
		}
	};

	// ── Refresh from API ──────────────────────────────────────────────────────
	const refreshData = useCallback(async () => {
		const resolvedAppId = appId || menuData.app_id || (user as any).app_id || "csm";
		const sources = [
			{ source: leadSource, setter: setLeadRows },
			{ source: inventorySource, setter: setInventoryRows },
			{ source: activitySource, setter: setActivityRows },
			{ source: taskSource, setter: setTaskRows },
			{ source: exportSource, setter: setExportRows },
		].filter((item) => item.source?.tableName);
		if (!sources.length) return;
		setFetchLoading(true);
		// Clear in-memory cache so we always get fresh data
		try { (window as any).__csm_getTableDataCache?.clear(); } catch { /* ignore */ }
		try {
			await Promise.all(sources.map(async ({ source, setter }) => {
				const res = await getTableData({ app_id: resolvedAppId, obj_name: source!.tableName!, take: 2000 });
				const rows: RowData[] = (res as any)?.rows ?? (res as any)?.data ?? [];
				setter(rows);
			}));
		} catch {
			// silently ignore refresh failures
		} finally {
			setFetchLoading(false);
		}
	}, [appId, menuData.app_id, (user as any).app_id, leadSource?.tableName, inventorySource?.tableName, activitySource?.tableName, taskSource?.tableName, exportSource?.tableName]);

	// ── Lead CRUD ─────────────────────────────────────────────────────────────
	const openCreateLead = useCallback(() => {
		setEditingLead(null);
		leadForm.resetFields();
		leadForm.setFieldsValue({
			[leadStatusField]: pipelineStages[0]?.id || "lead",
			[leadSource?.sourceField || "source"]: "sales_self",
			[leadAssignedField]: (user as any).userId || (user as any).username || "",
		});
		setIsLeadModalOpen(true);
	}, [leadForm, leadStatusField, pipelineStages, leadSource?.sourceField, leadAssignedField, user]);

	const openEditLead = useCallback((row: RowData) => {
		setEditingLead(row);
		leadForm.setFieldsValue(row);
		setIsLeadModalOpen(true);
	}, [leadForm]);

	const saveLead = async () => {
		if (!leadSource?.tableName) return;
		const values = await leadForm.validateFields();
		const isCreate = !editingLead;
		const existingPk = isCreate ? "" : getPrimaryKey(editingLead, leadSource);
		const row: RowData = {
			...(editingLead || {}),
			...values,
			[leadSource.pkField || "id"]: existingPk || `LEAD_${Date.now()}`,
			[leadUpdatedField]: Date.now(),
			...(isCreate ? { [leadCreatedField]: Date.now() } : {}),
		};
		setSaving(true);
		try {
			await saveRecord({ source: leadSource, row, command: isCreate ? "create" : "update", where: isCreate ? undefined : pickWhere(leadSource, editingLead!) });
			if (isCreate) {
				setLeadRows((current) => [row, ...current]);
			} else {
				const pk = getPrimaryKey(row, leadSource);
				setLeadRows((current) => current.map((r) => getPrimaryKey(r, leadSource) === pk ? row : r));
			}
			message.success(text.saveOk);
			setIsLeadModalOpen(false);
			setEditingLead(null);
			leadForm.resetFields();
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.saveFail);
		} finally {
			setSaving(false);
		}
	};

	const deleteLead = useCallback(async (row: RowData) => {
		if (!leadSource?.tableName) return;
		try {
			await saveRecord({ source: leadSource, row, command: "delete", where: pickWhere(leadSource, row) });
			const pk = getPrimaryKey(row, leadSource);
			setLeadRows((current) => current.filter((r) => getPrimaryKey(r, leadSource) !== pk));
			message.success(text.deleteOk);
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.deleteFail);
		}
	}, [leadSource, text.deleteOk, text.deleteFail, onDataChange]);

	// ── Inventory CRUD ───────────────────────────────────────────────────────
	const openCreateInventory = useCallback(() => {
		setEditingInventory(null);
		inventoryForm.resetFields();
		inventoryForm.setFieldsValue({ [inventorySource?.statusField || "status"]: "available" });
		setIsInventoryModalOpen(true);
	}, [inventoryForm, inventorySource?.statusField]);

	const openEditInventory = useCallback((row: RowData) => {
		setEditingInventory(row);
		inventoryForm.setFieldsValue(row);
		setIsInventoryModalOpen(true);
	}, [inventoryForm]);

	const saveInventory = async () => {
		if (!inventorySource?.tableName) return;
		const values = await inventoryForm.validateFields();
		const isCreate = !editingInventory;
		const existingPk = isCreate ? "" : getPrimaryKey(editingInventory, inventorySource);
		const row: RowData = {
			...(editingInventory || {}),
			...values,
			[inventorySource.pkField || "id"]: existingPk || `INV_${Date.now()}`,
			updated_at: Date.now(),
			...(isCreate ? { created_at: Date.now() } : {}),
		};
		setSaving(true);
		try {
			await saveRecord({ source: inventorySource, row, command: isCreate ? "create" : "update", where: isCreate ? undefined : pickWhere(inventorySource, editingInventory!) });
			if (isCreate) {
				setInventoryRows((current) => [row, ...current]);
			} else {
				const pk = getPrimaryKey(row, inventorySource);
				setInventoryRows((current) => current.map((r) => getPrimaryKey(r, inventorySource) === pk ? row : r));
			}
			message.success(text.saveOk);
			setIsInventoryModalOpen(false);
			setEditingInventory(null);
			inventoryForm.resetFields();
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.saveFail);
		} finally {
			setSaving(false);
		}
	};

	const deleteInventory = useCallback(async (row: RowData) => {
		if (!inventorySource?.tableName) return;
		try {
			await saveRecord({ source: inventorySource, row, command: "delete", where: pickWhere(inventorySource, row) });
			const pk = getPrimaryKey(row, inventorySource);
			setInventoryRows((current) => current.filter((r) => getPrimaryKey(r, inventorySource) !== pk));
			message.success(text.deleteOk);
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.deleteFail);
		}
	}, [inventorySource, text.deleteOk, text.deleteFail, onDataChange]);

	// ── Activity & Task delete ────────────────────────────────────────────────
	const deleteActivity = useCallback(async (row: RowData) => {
		if (!activitySource?.tableName) return;
		try {
			await saveRecord({ source: activitySource, row, command: "delete", where: pickWhere(activitySource, row) });
			const pk = getPrimaryKey(row, activitySource);
			setActivityRows((current) => current.filter((r) => getPrimaryKey(r, activitySource) !== pk));
			message.success(text.deleteOk);
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.deleteFail);
		}
	}, [activitySource, text.deleteOk, text.deleteFail, onDataChange]);

	const deleteTask = useCallback(async (row: RowData) => {
		if (!taskSource?.tableName) return;
		try {
			await saveRecord({ source: taskSource, row, command: "delete", where: pickWhere(taskSource, row) });
			const pk = getPrimaryKey(row, taskSource);
			setTaskRows((current) => current.filter((r) => getPrimaryKey(r, taskSource) !== pk));
			message.success(text.deleteOk);
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || text.deleteFail);
		}
	}, [taskSource, text.deleteOk, text.deleteFail, onDataChange]);

	const pipelineSection = (
		<Card
			title={text.pipelineTitle}
			style={{ borderRadius: 16 }}
			styles={{ body: { padding: 14 } }}
			extra={
				<Space wrap>
					<Input.Search
						allowClear
						placeholder={text.searchLead}
						style={{ width: 240 }}
						value={searchText}
						onChange={(event) => setSearchText(event.target.value)}
					/>
					<Button loading={fetchLoading} onClick={refreshData} size="small">{text.refresh}</Button>
					<Button type="primary" size="small" onClick={openCreateLead}>{text.addLead}</Button>
					{security.phoneMask?.enabled && (
						<Tag color={workspaceTheme.warning}>{text.phoneMaskHint}</Tag>
					)}
				</Space>
			}
		>
			<DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
				<Row gutter={[12, 12]} wrap={false} style={{ overflowX: "auto", paddingBottom: 4 }}>
					{pipelineStages.map((stage) => {
						const stageRows = pipelineByStage.get(stage.id) || [];
						return (
							<Col key={stage.id} flex="288px">
								<Card
									style={{ borderRadius: 14 }}
									styles={{ body: { padding: 10 } }}
									headStyle={{ borderBottom: 0 }}
									title={
										<Space direction="vertical" size={0}>
											<Space>
												<Tag color={stage.color || workspaceTheme.info}>{stage.label}</Tag>
												<Typography.Text type="secondary">{stageRows.length} {text.lead.toLowerCase()}</Typography.Text>
											</Space>
											<Typography.Text type="secondary">{text.expectedValue}: {stage.probability || 0}%</Typography.Text>
										</Space>
									}
								>
									<DroppableStageColumn
										id={stage.id}
										baseBg={workspaceTheme.dropBg}
										hoverBg={workspaceTheme.dropHoverBg}
										borderColor={workspaceTheme.border}
									>
										<Space direction="vertical" size={10} style={{ width: "100%" }}>
											{stageRows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text.noLeadYet} />}
											{stageRows.map((row) => {
												const leadId = getPrimaryKey(row, leadSource);
												const updatedAt = toTimestamp(row[leadUpdatedField] || row[leadLastInteractionField] || row[leadCreatedField]);
												const staleHours = stage.staleAfterHours || crmConfig.pipeline?.defaultStaleHours || 24;
												const isWarning = warningStageIds.includes(stage.id)
													&& updatedAt !== null
													&& dayjs().diff(dayjs(updatedAt), "hour") >= staleHours;
												return (
													<DraggableLeadCard id={leadId} key={leadId}>
														<Card
															hoverable
															onClick={() => setSelectedLeadId(leadId)}
															styles={{ body: { padding: 14 } }}
															style={{
																borderRadius: 14,
																border: selectedLeadId === leadId
																	? `1px solid ${workspaceTheme.info}`
																	: isWarning
																		? `1px solid ${workspaceTheme.danger}`
																		: `1px solid ${workspaceTheme.border}`,
																boxShadow: selectedLeadId === leadId
																	? `0 10px 20px ${(token as any).colorPrimaryBorder || workspaceTheme.info}33`
																	: isWarning
																		? `0 12px 24px ${workspaceTheme.danger}33`
																		: "none",
															}}
														>
															<Space direction="vertical" size={8} style={{ width: "100%" }}>
																<Space style={{ justifyContent: "space-between", width: "100%" }}>
																	<Typography.Text strong>{row[leadTitleField] || text.unnamedLead}</Typography.Text>
																	{isWarning && <Badge status="error" text={text.stale} />}
																</Space>
																<Typography.Text type="secondary">{text.project}: {row[leadProjectField] || text.noData}</Typography.Text>
																<Typography.Text>{text.expectedValue}: {formatCurrency(row[leadValueField], localeCode)}</Typography.Text>
																<Typography.Text type="secondary">{text.lastContact}: {formatDateTime(row[leadLastInteractionField] || row[leadUpdatedField], localeCode, text.noData)}</Typography.Text>
																<Typography.Text type="secondary">{text.phone}: {maskPhone(row)}</Typography.Text>
																<Typography.Text type="secondary">{text.sales}: {row[leadAssignedField] || text.noData}</Typography.Text>
																<Space size={4} style={{ justifyContent: "flex-end", width: "100%" }}>
																	<Button
																		size="small"
																		onClick={(e) => { e.stopPropagation(); openEditLead(row); }}
																	>{text.edit}</Button>
																	<Popconfirm
																		title={text.confirmDelete}
																		onConfirm={(e) => { e?.stopPropagation(); deleteLead(row); }}
																		onCancel={(e) => e?.stopPropagation()}
																	>
																		<Button
																			size="small"
																			danger
																			onClick={(e) => e.stopPropagation()}
																		>{text.delete}</Button>
																	</Popconfirm>
																</Space>
															</Space>
														</Card>
													</DraggableLeadCard>
												);
											})}
										</Space>
									</DroppableStageColumn>
								</Card>
							</Col>
						);
					})}
				</Row>
			</DndContext>
		</Card>
	);

	const inventorySection = (
		<Row gutter={[16, 16]}>
			<Col xs={24} lg={17}>
				<Card
					title={text.inventoryTitle}
					style={{ borderRadius: 16 }}
					styles={{ body: { padding: 14 } }}
					extra={
						<Space wrap>
							<Select
								allowClear
								placeholder={text.statusPlaceholder}
								style={{ width: 160 }}
								value={inventoryStatusFilter || undefined}
								onChange={(value) => setInventoryStatusFilter(value || "")}
								options={inventoryStatuses.map((item) => ({ label: item.label, value: item.id }))}
							/>
							<Select
								allowClear
								placeholder={text.directionPlaceholder}
								style={{ width: 140 }}
								value={directionFilter || undefined}
								onChange={(value) => setDirectionFilter(value || "")}
								options={inventoryDirections}
							/>
							<Select
								allowClear
								placeholder={text.bedroomPlaceholder}
								style={{ width: 140 }}
								value={bedroomFilter || undefined}
								onChange={(value) => setBedroomFilter(value || "")}
								options={inventoryBedrooms}
							/>
							<Button type="primary" size="small" onClick={openCreateInventory}>{text.addInventory}</Button>
						</Space>
					}
				>
					<Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
						<Col xs={24} md={12}>
							<Space>
								<Typography.Text type="secondary">{text.priceFrom}</Typography.Text>
								<InputNumber value={priceRange[0] ?? undefined} onChange={(value) => setPriceRange([value, priceRange[1]])} style={{ width: 130 }} />
								<Typography.Text type="secondary">{text.to}</Typography.Text>
								<InputNumber value={priceRange[1] ?? undefined} onChange={(value) => setPriceRange([priceRange[0], value])} style={{ width: 130 }} />
							</Space>
						</Col>
						<Col xs={24} md={12}>
							<Space>
								<Typography.Text type="secondary">{text.areaFrom}</Typography.Text>
								<InputNumber value={areaRange[0] ?? undefined} onChange={(value) => setAreaRange([value, areaRange[1]])} style={{ width: 100 }} />
								<Typography.Text type="secondary">{text.to}</Typography.Text>
								<InputNumber value={areaRange[1] ?? undefined} onChange={(value) => setAreaRange([areaRange[0], value])} style={{ width: 100 }} />
							</Space>
						</Col>
					</Row>
					<Row gutter={[16, 16]}>
						{filteredInventoryRows.length === 0 && (
							<Col span={24}>
								<Empty description={text.emptyInventory} />
							</Col>
						)}
						{filteredInventoryRows.map((row) => {
							const pk = getPrimaryKey(row, inventorySource);
							const statusValue = String(row[inventorySource?.statusField || "status"] || "available");
							const statusConfig = inventoryStatuses.find((item) => item.id === statusValue);
							const leadLinkField = crmConfig.inventory?.leadLinkField || inventorySource?.leadRefField || "lead_id";
							const isLinked = selectedLead && String(row[leadLinkField] || "") === getPrimaryKey(selectedLead, leadSource);
							return (
								<Col xs={24} md={12} xl={8} key={pk}>
									<Card
										hoverable
										style={{ borderRadius: 18, minHeight: 220 }}
										styles={{ body: { padding: 16 } }}
									>
										<Space direction="vertical" size={10} style={{ width: "100%" }}>
											<Space style={{ justifyContent: "space-between", width: "100%" }}>
												<Typography.Text strong>{row[inventorySource?.titleField || "product_name"] || text.productFallback}</Typography.Text>
												<Tag color={resolveTagColor(statusConfig?.color)}>{statusConfig?.label || statusValue}</Tag>
											</Space>
											<Typography.Text type="secondary">{text.code}: {row[inventorySource?.productCodeField || "product_code"] || pk}</Typography.Text>
											<Typography.Text type="secondary">{text.project}: {row[inventorySource?.projectField || "project_name"] || text.noData}</Typography.Text>
											<Typography.Text>{text.priceFrom}: {formatCurrency(row[inventorySource?.priceField || "price"], localeCode)}</Typography.Text>
											<Typography.Text type="secondary">{text.areaFrom}: {row[inventorySource?.areaField || "area_m2"] || 0} m2</Typography.Text>
											<Typography.Text type="secondary">{text.directionPlaceholder}: {row[inventorySource?.directionField || "direction"] || "-"}</Typography.Text>
											<Typography.Text type="secondary">{text.bedroomPlaceholder}: {row[inventorySource?.bedroomField || "bedrooms"] || 0}</Typography.Text>
											<Button type={isLinked ? "default" : "primary"} block onClick={() => handleAttachInventory(row)}>
												{isLinked ? text.linkedCurrentLead : text.attachCurrentLead}
											</Button>
											<Space size={4} style={{ justifyContent: "flex-end", width: "100%" }}>
												<Button size="small" onClick={() => openEditInventory(row)}>{text.edit}</Button>
												<Popconfirm title={text.confirmDelete} onConfirm={() => deleteInventory(row)}>
													<Button size="small" danger>{text.delete}</Button>
												</Popconfirm>
											</Space>
										</Space>
									</Card>
								</Col>
							);
						})}
					</Row>
				</Card>
			</Col>
			<Col xs={24} lg={7}>
				<Card title={text.activeLead} style={{ borderRadius: 16 }} styles={{ body: { padding: 14 } }}>
					{selectedLead ? (
						<Space direction="vertical" size={10} style={{ width: "100%" }}>
							<Typography.Title level={5} style={{ margin: 0 }}>{selectedLead[leadTitleField]}</Typography.Title>
							<Typography.Text type="secondary">{text.phone}: {maskPhone(selectedLead)}</Typography.Text>
							<Typography.Text type="secondary">{text.project}: {selectedLead[leadProjectField] || text.noData}</Typography.Text>
							<Typography.Text>{text.targetValue}: {formatCurrency(selectedLead[leadValueField], localeCode)}</Typography.Text>
							<Tag color={workspaceTheme.info}>{selectedLead[leadStatusField] || "lead"}</Tag>
							<Divider style={{ margin: "8px 0" }} />
							<Typography.Text strong>{text.interestedProducts}</Typography.Text>
							<Space direction="vertical" size={8} style={{ width: "100%" }}>
								{parseLinkedIds(selectedLead[leadSource?.productIdsField || "interested_product_ids"]).map((id) => {
									const inventory = inventoryRows.find((row) => getPrimaryKey(row, inventorySource) === id);
									return <Tag key={id}>{inventory?.[inventorySource?.titleField || "product_name"] || id}</Tag>;
								})}
							</Space>
						</Space>
					) : (
						<Empty description={text.pickLeadKanban} />
					)}
				</Card>
			</Col>
		</Row>
	);

	const activitiesSection = (
		<Row gutter={[16, 16]}>
			<Col xs={24} xl={7}>
				<Space direction="vertical" size={16} style={{ width: "100%" }}>
					<Card style={{ borderRadius: 16 }} styles={{ body: { padding: 14 } }}>
						<Row gutter={[12, 12]}>
							<Col span={12}><Statistic title={text.todayCalls} value={callCountToday} /></Col>
							<Col span={12}><Statistic title={text.successMeetings} value={successfulMeetings} /></Col>
							<Col span={12}><Statistic title={text.bookingLeads} value={bookingCount} /></Col>
							<Col span={12}><Statistic title={text.closeRate} value={conversionRate} suffix="%" /></Col>
						</Row>
					</Card>
					<Card title={text.quickActions} style={{ borderRadius: 16 }} styles={{ body: { padding: 14 } }}>
						<Space direction="vertical" style={{ width: "100%" }}>
							<Button type="primary" block onClick={() => setIsActivityModalOpen(true)}>{text.logInteraction}</Button>
							<Button block onClick={() => setIsTaskModalOpen(true)}>{text.createTask}</Button>
						</Space>
					</Card>
					{exportAlert.triggered && (
						<Alert
							showIcon
							type="warning"
							message={text.exportWarningTitle}
							description={text.exportWarningDesc.replace("{{count}}", String(exportAlert.count)).replace("{{threshold}}", String(exportAlert.threshold))}
						/>
					)}
				</Space>
			</Col>
			<Col xs={24} xl={9}>
				<Card title={text.activityCalendar} style={{ borderRadius: 16 }} styles={{ body: { padding: 14 } }}>
					<Calendar
						fullscreen={false}
						value={calendarDate}
						onSelect={(value) => setCalendarDate(value)}
						cellRender={(current, info) => {
							if (info.type !== "date") return info.originNode;
							const count = activitiesByDate.get(current.format("YYYY-MM-DD")) || 0;
							if (!count) return info.originNode;
							return (
								<div style={{ position: "relative", height: "100%" }}>
									{info.originNode}
									<Badge count={count} size="small" style={{ position: "absolute", top: 2, right: 2 }} />
								</div>
							);
						}}
					/>
					<Divider style={{ margin: "12px 0" }} />
					<List
						size="small"
						dataSource={calendarRows}
						renderItem={(item) => (
							<List.Item>
								<Space direction="vertical" size={0} style={{ width: "100%" }}>
									<Typography.Text>{item.title}</Typography.Text>
									<Typography.Text type="secondary">{item.kind} - {item.status}</Typography.Text>
								</Space>
							</List.Item>
						)}
							locale={{ emptyText: text.noCalendarToday }}
					/>
				</Card>
			</Col>
			<Col xs={24} xl={8}>
				<Tabs
					style={{ background: token.colorBgContainer, borderRadius: 16, padding: 12 }}
					items={[
						{
							key: "activities",
							label: text.recentInteractions,
							children: (
								<List
									dataSource={activityRows.slice(0, 20)}
									renderItem={(row) => (
										<List.Item
											actions={[
												<Popconfirm key="del" title={text.confirmDelete} onConfirm={() => deleteActivity(row)}>
													<Button size="small" danger>{text.delete}</Button>
												</Popconfirm>,
											]}
										>
											<Space direction="vertical" size={0} style={{ width: "100%" }}>
												<Typography.Text>{String(row[activitySource?.contactTypeField || "activity_type"] || text.activities).toUpperCase()} - {row[activitySource?.notesField || "notes"] || text.noData}</Typography.Text>
												<Typography.Text type="secondary">{formatDateTime(row[activitySource?.completedAtField || "completed_at"] || row[activitySource?.scheduledAtField || "scheduled_at"], localeCode, text.noData)} - {row[activitySource?.resultField || "result"] || "pending"}</Typography.Text>
											</Space>
										</List.Item>
									)}
									locale={{ emptyText: text.noInteractionLog }}
								/>
							),
						},
						{
							key: "tasks",
							label: text.followupTasks,
							children: (
								<List
									dataSource={taskRows.slice(0, 20)}
									renderItem={(row) => (
										<List.Item
											actions={[
												<Popconfirm key="del" title={text.confirmDelete} onConfirm={() => deleteTask(row)}>
													<Button size="small" danger>{text.delete}</Button>
												</Popconfirm>,
											]}
										>
											<Space direction="vertical" size={0} style={{ width: "100%" }}>
												<Typography.Text>{row[taskSource?.titleKeyField || "title"] || text.followupTasks}</Typography.Text>
												<Typography.Text type="secondary">{text.due}: {formatDateTime(row[taskSource?.dueDateField || "due_at"], localeCode, text.noData)} - {row[taskSource?.statusField || "status"] || "todo"}</Typography.Text>
											</Space>
										</List.Item>
									)}
									locale={{ emptyText: text.noTaskPending }}
								/>
							),
						},
					]}
				/>
			</Col>
		</Row>
	);

	const analyticsSection = (
		<Row gutter={[16, 16]}>
			<Col xs={24} lg={9}>
				<Card title={text.funnelChart} style={{ borderRadius: 16 }} styles={{ body: { padding: 14 } }}>
					<ReactECharts option={funnelOption} style={{ height: 420 }} />
				</Card>
			</Col>
			<Col xs={24} lg={15}>
				<Card
					title={text.salesDimension}
					extra={
						<Segmented
							value={analyticsDimension}
							onChange={(value) => setAnalyticsDimension(value as "assigned" | "project" | "source")}
							options={[
								{ label: text.dimensionAssigned, value: "assigned" },
								{ label: text.dimensionProject, value: "project" },
								{ label: text.dimensionSource, value: "source" },
							]}
						/>
					}
					style={{ borderRadius: 16 }}
					styles={{ body: { padding: 14 } }}
				>
					<ReactECharts option={salesOption} style={{ height: 260 }} />
					<Table
						rowKey="source"
						pagination={false}
						size="small"
						style={{ marginTop: 12 }}
						dataSource={sourceConversionRows}
						columns={[
							{ title: text.source, dataIndex: "source" },
							{ title: text.lead, dataIndex: "total", width: 90 },
							{ title: text.closed, dataIndex: "closed", width: 90 },
							{
								title: text.rate,
								dataIndex: "rate",
								width: 90,
								render: (value: number) => (
									<Tag color={value >= 30 ? workspaceTheme.success : value >= 15 ? workspaceTheme.warning : workspaceTheme.danger}>
										{value}%
									</Tag>
								),
							},
						]}
					/>
				</Card>
			</Col>
		</Row>
	);

	return (
		<div className="crm-workspace-theme" style={{ padding: 12, background: token.colorBgLayout, minHeight: "100%" }}>
			<style>{workspaceCss}</style>
			<Space direction="vertical" size={12} style={{ width: "100%" }}>
				<Card style={{ borderRadius: 18, overflow: "hidden", background: workspaceTheme.headerGradient, borderColor: token.colorBorder }} styles={{ body: { padding: 18 } }}>
					<Row gutter={[16, 16]} align="middle">
						<Col xs={24} lg={16}>
							<Space direction="vertical" size={6}>
								<Tag color={workspaceTheme.info}>{text.workspaceTag}</Tag>
								<Typography.Title level={3} style={{ color: workspaceTheme.headlineText, margin: 0 }}>{crmConfig.title || menuData.label || text.headerTitle}</Typography.Title>
								<Typography.Text style={{ color: workspaceTheme.headlineSubText, maxWidth: 760 }}>
									{crmConfig.description || text.headerDesc}
								</Typography.Text>
							</Space>
						</Col>
						<Col xs={24} lg={8}>
							<Row gutter={[10, 10]}>
								<Col span={12}><Card style={{ borderRadius: 14 }} styles={{ body: { padding: 12 } }}><Statistic title={text.activeLeads} value={filteredLeadRows.length} /></Card></Col>
								<Col span={12}><Card style={{ borderRadius: 14 }} styles={{ body: { padding: 12 } }}><Statistic title={text.availableProducts} value={inventoryRows.filter((row) => String(row[inventorySource?.statusField || "status"] || "available") === "available").length} /></Card></Col>
								<Col span={12}><Card style={{ borderRadius: 14 }} styles={{ body: { padding: 12 } }}><Statistic title={text.openTasks} value={taskRows.filter((row) => !["done", "completed"].includes(String(row[taskSource?.statusField || "status"] || "todo"))).length} /></Card></Col>
								<Col span={12}><Card style={{ borderRadius: 14 }} styles={{ body: { padding: 12 } }}><Statistic title={text.closedLeads} value={closedCount} /></Card></Col>
							</Row>
						</Col>
					</Row>
				</Card>

				{exportAlert.triggered && (
					<Alert
						type="warning"
						showIcon
						message={text.exportLimitTitle}
						description={text.exportLimitDesc.replace("{{count}}", String(exportAlert.count)).replace("{{threshold}}", String(security.exportAlertThreshold || 100))}
					/>
				)}

				<Card style={{ borderRadius: 16 }} styles={{ body: { padding: 10 } }}>
					<Segmented block options={sectionItems} value={activeSection} onChange={(value) => setActiveSection(value as CrmSectionKey)} />
				</Card>

				{activeSection === "pipeline" && pipelineSection}
				{activeSection === "inventory" && inventorySection}
				{activeSection === "activities" && activitiesSection}
				{activeSection === "analytics" && analyticsSection}
			</Space>

			<Modal
				open={isActivityModalOpen}
				onCancel={() => setIsActivityModalOpen(false)}
				onOk={createActivity}
				confirmLoading={saving}
				title={text.activityModalTitle}
				className="crm-workspace-theme-modal"
				wrapClassName="crm-workspace-theme-modal"
			>
				<Form form={activityForm} layout="vertical" initialValues={{ lead_id: selectedLead ? getPrimaryKey(selectedLead, leadSource) : undefined, phone: selectedLead?.[leadPhoneField], activity_type: activityTypes[0], result: activitySource?.appointmentSuccessValue || "success", scheduled_at: dayjs() }}>
					<Form.Item name="lead_id" label={text.leadLabel} rules={[{ required: true, message: text.chooseLead }]}>
						<Select
							getPopupContainer={resolvePopupContainer}
							showSearch
							optionFilterProp="label"
							options={visibleLeadRows.map((row) => ({ label: `${row[leadTitleField] || text.lead} - ${maskPhone(row)}`, value: getPrimaryKey(row, leadSource) }))}
						/>
					</Form.Item>
					<Form.Item name="phone" hidden><Input /></Form.Item>
					<Form.Item name="activity_type" label={text.activityType} rules={[{ required: true, message: text.chooseActivityType }]}>
						<Select getPopupContainer={resolvePopupContainer} options={activityTypes.map((type) => ({ label: type, value: type }))} />
					</Form.Item>
					<Form.Item name="scheduled_at" label={text.time} rules={[{ required: true, message: text.chooseTime }]}>
						<DatePicker getPopupContainer={resolvePopupContainer} showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
					</Form.Item>
					<Form.Item name="result" label={text.result}>
						<Select getPopupContainer={resolvePopupContainer} options={[{ label: "success", value: "success" }, { label: "pending", value: "pending" }, { label: "failed", value: "failed" }]} />
					</Form.Item>
					<Form.Item name="notes" label={text.notes} rules={[{ required: true, message: text.enterNotes }]}>
						<Input.TextArea rows={4} placeholder={text.enterNotes} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				open={isTaskModalOpen}
				onCancel={() => setIsTaskModalOpen(false)}
				onOk={createTask}
				confirmLoading={saving}
				title={text.taskModalTitle}
				className="crm-workspace-theme-modal"
				wrapClassName="crm-workspace-theme-modal"
			>
				<Form form={taskForm} layout="vertical" initialValues={{ lead_id: selectedLead ? getPrimaryKey(selectedLead, leadSource) : undefined, status: taskStatuses[0], due_at: dayjs().add(1, "day") }}>
					<Form.Item name="lead_id" label={text.leadLabel} rules={[{ required: true, message: text.chooseLead }]}>
						<Select
							getPopupContainer={resolvePopupContainer}
							showSearch
							optionFilterProp="label"
							options={visibleLeadRows.map((row) => ({ label: `${row[leadTitleField] || text.lead} - ${row[leadProjectField] || ""}`, value: getPrimaryKey(row, leadSource) }))}
						/>
					</Form.Item>
					<Form.Item name="title" label={text.taskTitle} rules={[{ required: true, message: text.enterTaskTitle }]}> 
						<Input placeholder={text.enterTaskTitle} />
					</Form.Item>
					<Form.Item name="status" label={text.status}>
						<Select getPopupContainer={resolvePopupContainer} options={taskStatuses.map((status) => ({ label: status, value: status }))} />
					</Form.Item>
					<Form.Item name="due_at" label={text.dueAt} rules={[{ required: true, message: text.chooseDueAt }]}> 
						<DatePicker getPopupContainer={resolvePopupContainer} showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
					</Form.Item>
				</Form>
			</Modal>

			{/* ── Lead Create/Edit Modal ─────────────────────────────────── */}
			<Modal
				open={isLeadModalOpen}
				onCancel={() => { setIsLeadModalOpen(false); setEditingLead(null); leadForm.resetFields(); }}
				onOk={saveLead}
				confirmLoading={saving}
				title={editingLead ? text.editLead : text.addLead}
				width={640}
				className="crm-workspace-theme-modal"
				wrapClassName="crm-workspace-theme-modal"
			>
				<Spin spinning={saving}>
					<Form form={leadForm} layout="vertical">
						<Row gutter={12}>
							<Col xs={24} md={12}>
								<Form.Item name={leadTitleField} label={text.customerName} rules={[{ required: true, message: text.enterName }]}>
									<Input placeholder={text.enterName} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadPhoneField} label={text.phone} rules={[{ required: true, message: text.enterPhone }]}>
									<Input placeholder={text.enterPhone} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadSource?.sourceField || "source"} label={text.sourceLead}>
									<Select getPopupContainer={resolvePopupContainer} options={[
										{ value: "facebook", label: "Facebook" },
										{ value: "google", label: "Google" },
										{ value: "website", label: "Website" },
										{ value: "sales_self", label: "Sales tự khai thác" },
										{ value: "external_floor", label: "Sàn / đối tác" },
										{ value: "other", label: text.other },
									]} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadStatusField} label={text.status}>
									<Select getPopupContainer={resolvePopupContainer} options={pipelineStages.map((stage) => ({ label: stage.label, value: stage.id }))} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadProjectField} label={text.project}>
									<Input placeholder={text.project} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadValueField} label={text.expectedValue}>
									<InputNumber style={{ width: "100%" }} min={0} step={100000000} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadAssignedField} label={text.assignedTo}>
									<Input placeholder={text.assignedTo} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={leadTeamField} label={text.teamId}>
									<Input placeholder={text.teamId} />
								</Form.Item>
							</Col>
							<Col xs={24}>
								<Form.Item name={leadSource?.notesField || "notes"} label={text.notes}>
									<Input.TextArea rows={3} placeholder={text.enterNotes} />
								</Form.Item>
							</Col>
						</Row>
					</Form>
				</Spin>
			</Modal>

			{/* ── Inventory Create/Edit Modal ───────────────────────────── */}
			<Modal
				open={isInventoryModalOpen}
				onCancel={() => { setIsInventoryModalOpen(false); setEditingInventory(null); inventoryForm.resetFields(); }}
				onOk={saveInventory}
				confirmLoading={saving}
				title={editingInventory ? text.editInventory : text.addInventory}
				width={640}
				className="crm-workspace-theme-modal"
				wrapClassName="crm-workspace-theme-modal"
			>
				<Spin spinning={saving}>
					<Form form={inventoryForm} layout="vertical">
						<Row gutter={12}>
							<Col xs={24} md={12}>
								<Form.Item name={inventorySource?.titleField || "product_name"} label={text.productName} rules={[{ required: true }]}>
									<Input />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={inventorySource?.productCodeField || "product_code"} label={text.productCode}>
									<Input />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={inventorySource?.projectField || "project_name"} label={text.project}>
									<Input />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={inventorySource?.statusField || "status"} label={text.status}>
									<Select getPopupContainer={resolvePopupContainer} options={inventoryStatuses.map((item) => ({ label: item.label, value: item.id }))} />
								</Form.Item>
							</Col>
							<Col xs={24} md={12}>
								<Form.Item name={inventorySource?.priceField || "price"} label={text.priceFrom}>
									<InputNumber style={{ width: "100%" }} min={0} step={100000000} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} />
								</Form.Item>
							</Col>
							<Col xs={24} md={8}>
								<Form.Item name={inventorySource?.areaField || "area_m2"} label={text.areaM2}>
									<InputNumber style={{ width: "100%" }} min={0} />
								</Form.Item>
							</Col>
							<Col xs={24} md={8}>
								<Form.Item name={inventorySource?.bedroomField || "bedrooms"} label={text.bedrooms}>
									<InputNumber style={{ width: "100%" }} min={0} />
								</Form.Item>
							</Col>
							<Col xs={24} md={8}>
								<Form.Item name={inventorySource?.directionField || "direction"} label={text.direction}>
									<Input />
								</Form.Item>
							</Col>
						</Row>
					</Form>
				</Spin>
			</Modal>
		</div>
	);
}
