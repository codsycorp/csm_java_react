/**
 * CsmLineItemsPage — runtime CRUD shell cho form dòng hàng + in PDF theo m_configs.
 *
 * Menu config (type_form=7 hoặc có line_items_columns):
 *   table_name, table[], line_items_*, trigger, struct.fieldsPK
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Button, Card, Empty, Modal, Space, Spin, Table, Typography, message,
} from "antd";
import {
	DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { resolveRuntimeAppId } from "#src/components/csm-grid/combo-utils";
import { useUserStore } from "#src/store";
import CsmLineItemsEditor from "./CsmLineItemsEditor";
import type { LineItemsEditorConfig, OrderHeader, ProductGroup } from "./types";
import {
	buildLineItemsSavePayload,
	parseLineItemsRecord,
	resolveLineItemsListColumns,
} from "./line-items-storage";
import { resolveTriLangLabel } from "./line-items-label";
import { newGroup, formatNgay } from "./utils";

const { Text } = Typography;

export interface CsmLineItemsPageProps {
	appId: string;
	menuId?: string | number;
	m_configs: LineItemsEditorConfig;
	decrypt?: (s: string) => string;
	onDataChange?: () => void;
}

function generateRecordId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `li-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolvePkFields(config: LineItemsEditorConfig): string[] {
	const fromStruct = config.struct?.fieldsPK;
	if (Array.isArray(fromStruct) && fromStruct.length > 0) {
		return fromStruct.map(item => String(item)).filter(Boolean);
	}
	return ["id"];
}

function emptyDraft(config: LineItemsEditorConfig): { header: OrderHeader; groups: ProductGroup[] } {
	const header: OrderHeader = { ngay: formatNgay(new Date()) };
	for (const field of config.table ?? []) {
		const name = String(field?.f_name ?? "").trim();
		if (!name || name === "ngay") continue;
		if (field?.f_default != null && field.f_default !== "") {
			header[name] = field.f_default;
		}
	}
	const uiDefaults = config.line_items_ui?.default_header;
	if (uiDefaults && typeof uiDefaults === "object") {
		Object.assign(header, uiDefaults);
	}
	return {
		header,
		groups: [newGroup({ vat_default: config.line_items_group?.vat_default ?? 10 })],
	};
}

function rowMatchesListFilter(row: Record<string, any>, filters?: Array<{ field: string; values: string[] }>): boolean {
	if (!filters?.length) return true;
	return filters.every(f => {
		const field = String(f.field ?? "").trim();
		if (!field) return true;
		const val = String(row[field] ?? "");
		return (f.values ?? []).map(v => String(v)).includes(val);
	});
}

export default function CsmLineItemsPage({
	appId,
	menuId,
	m_configs,
	decrypt,
	onDataChange,
}: CsmLineItemsPageProps) {
	const userAppId = useUserStore(state => state.app_id);
	const userAppToken = useUserStore(state => state.app_token);
	const userMenus = useUserStore(state => state.menusPermissions);
	const userDev = useUserStore(state => state.dev);
	const tableName = String(m_configs.table_name || "").trim();
	const userAccess = useMemo(() => ({
		app_id: userAppId,
		app_token: userAppToken,
		menusPermissions: userMenus,
		dev: userDev,
	}), [userAppId, userAppToken, userMenus, userDev]);
	const runtimeAppId = useMemo(
		() => resolveRuntimeAppId(tableName, appId, userAccess, decrypt),
		[tableName, appId, userAccess, decrypt],
	);

	const { i18n } = useTranslation();
	const ui = m_configs.line_items_ui ?? {};
	const menuLabel = resolveTriLangLabel(m_configs, i18n.language, ["label"]) || "Quản lý đơn hàng";
	const backLabel = resolveTriLangLabel(ui, i18n.language, ["back_label"]) || "← Danh sách";
	const createLabel = resolveTriLangLabel(ui, i18n.language, ["create_label"]) || "Tạo mới";
	const editLabel = resolveTriLangLabel(ui, i18n.language, ["edit_label"]) || "Chỉnh sửa";
	const listTitle = resolveTriLangLabel(ui, i18n.language, ["list_title"]) || menuLabel;
	const pkFields = useMemo(() => resolvePkFields(m_configs), [m_configs]);
	const listColumns = useMemo(() => resolveLineItemsListColumns(m_configs), [m_configs]);

	const [loading, setLoading] = useState(false);
	const [rows, setRows] = useState<Record<string, any>[]>([]);
	const [view, setView] = useState<"list" | "edit">("list");
	const [activeRow, setActiveRow] = useState<Record<string, any> | null>(null);
	const [draft, setDraft] = useState<{ header: OrderHeader; groups: ProductGroup[] } | null>(null);
	const [saving, setSaving] = useState(false);

	const loadRows = useCallback(async () => {
		if (!tableName) return;
		setLoading(true);
		try {
			const response = await getTableData<any>({
				app_id: runtimeAppId,
				obj_name: tableName,
			});
			const nextRows = (() => {
				if (Array.isArray(response?.rows)) return response.rows;
				if (Array.isArray(response?.data)) return response.data;
				if (Array.isArray((response as any)?.result?.list)) return (response as any).result.list;
				return [];
			})();
			setRows(nextRows);
		} catch (error: any) {
			message.error(error?.message || "Không tải được danh sách");
		} finally {
			setLoading(false);
		}
	}, [runtimeAppId, tableName]);

	useEffect(() => {
		loadRows();
	}, [loadRows]);

	const openCreate = useCallback(() => {
		setActiveRow(null);
		setDraft(emptyDraft(m_configs));
		setView("edit");
	}, [m_configs]);

	const openEdit = useCallback((row: Record<string, any>) => {
		setActiveRow(row);
		setDraft(parseLineItemsRecord(row, m_configs));
		setView("edit");
	}, [m_configs]);

	const closeEditor = useCallback(() => {
		setView("list");
		setActiveRow(null);
		setDraft(null);
	}, []);

	const handleSave = useCallback(async (data: { header: OrderHeader; groups: ProductGroup[] }) => {
		if (!tableName) {
			message.error("Menu chưa cấu hình table_name");
			return;
		}
		setSaving(true);
		try {
			const isUpdate = Boolean(activeRow);
			const payload = buildLineItemsSavePayload(
				data.header,
				data.groups,
				m_configs,
				activeRow ?? undefined,
			);

			if (!isUpdate) {
				const pkField = pkFields[0] || "id";
				if (!payload[pkField]) payload[pkField] = generateRecordId();
			}

			const where = isUpdate
				? Object.fromEntries(
					pkFields
						.filter(pk => activeRow?.[pk] !== undefined)
						.map(pk => [pk, activeRow![pk]]),
				)
				: undefined;

			await updateTableData({
				app_id: runtimeAppId,
				obj_name: tableName,
				command: isUpdate ? "update" : "create",
				obj_update: payload,
				pk_fields: pkFields,
				where,
			});

			message.success(isUpdate ? "Đã cập nhật" : "Đã tạo mới");
			closeEditor();
			await loadRows();
			onDataChange?.();
		} catch (error: any) {
			message.error(error?.message || "Lưu thất bại");
		} finally {
			setSaving(false);
		}
	}, [activeRow, runtimeAppId, closeEditor, loadRows, m_configs, onDataChange, pkFields, tableName]);

	const handleDelete = useCallback((row: Record<string, any>) => {
		if (!tableName) return;
		Modal.confirm({
			title: "Xóa bản ghi?",
			content: "Thao tác này không thể hoàn tác.",
			okText: "Xóa",
			okType: "danger",
			cancelText: "Huỷ",
			onOk: async () => {
				const where = Object.fromEntries(
					pkFields
						.filter(pk => row[pk] !== undefined)
						.map(pk => [pk, row[pk]]),
				);
				if (Object.keys(where).length === 0) {
					message.error("Không xác định được khóa chính");
					return;
				}
				await updateTableData({
					app_id: runtimeAppId,
					obj_name: tableName,
					command: "delete",
					obj_update: where,
					pk_fields: pkFields,
					where,
				});
				message.success("Đã xóa");
				await loadRows();
				onDataChange?.();
			},
		});
	}, [runtimeAppId, loadRows, onDataChange, pkFields, tableName]);

	const tableColumns = useMemo<ColumnsType<Record<string, any>>>(() => {
		const lang = i18n.language || "vi";
		const dataCols = listColumns.map(col => ({
			title: resolveTriLangLabel(col, lang, ["label", "field"]),
			dataIndex: col.field,
			key: col.field,
			width: col.width,
			ellipsis: true,
		}));
		return [
			...dataCols,
			{
				title: "Thao tác",
				key: "actions",
				width: 140,
				fixed: "right" as const,
				render: (_: unknown, row: Record<string, any>) => (
					<Space size="small">
						<Button
							type="link"
							size="small"
							icon={<EditOutlined />}
							onClick={() => openEdit(row)}
						>
							Sửa
						</Button>
						<Button
							type="link"
							size="small"
							danger
							icon={<DeleteOutlined />}
							onClick={() => handleDelete(row)}
						>
							Xóa
						</Button>
					</Space>
				),
			},
		];
	}, [handleDelete, i18n.language, listColumns, openEdit]);

	const filteredRows = useMemo(
		() => rows.filter(row => rowMatchesListFilter(row, ui.list_filter)),
		[rows, ui.list_filter],
	);

	if (!tableName) {
		return (
			<Card>
				<Empty description="Chưa cấu hình bảng dữ liệu cho menu này" />
			</Card>
		);
	}

	if (!Array.isArray(m_configs.line_items_columns) || m_configs.line_items_columns.length === 0) {
		return (
			<Card>
				<Empty description="Chưa cấu hình cột sản phẩm" />
			</Card>
		);
	}

	if (view === "edit" && draft) {
		return (
			<div style={{ padding: 12 }}>
				<Space style={{ marginBottom: 12 }}>
					<Button onClick={closeEditor}>{backLabel}</Button>
					<Text type="secondary">
						{activeRow ? editLabel : createLabel}
						{menuLabel ? ` · ${menuLabel}` : ""}
					</Text>
				</Space>
				<Spin spinning={saving}>
					<CsmLineItemsEditor
						key={activeRow
							? String(activeRow[pkFields[0]] ?? activeRow.id ?? "edit")
							: "new"}
						m_configs={m_configs}
						appId={runtimeAppId}
						decrypt={decrypt}
						initialValue={draft}
						existingRows={rows}
						recordPk={activeRow ? String(activeRow[pkFields[0]] ?? activeRow.id ?? "") : undefined}
						pkField={pkFields[0] || "id"}
						onSave={handleSave}
					/>
				</Spin>
			</div>
		);
	}

	return (
		<div style={{ padding: 12 }}>
			<Card
				size="small"
				title={listTitle}
				extra={(
					<Space>
						<Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
							Tải lại
						</Button>
						<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
							Thêm mới
						</Button>
					</Space>
				)}
			>
				<Table<Record<string, any>>
					rowKey={(row) => String(row.id ?? row[pkFields[0]] ?? JSON.stringify(row))}
					loading={loading}
					columns={tableColumns}
					dataSource={filteredRows}
					scroll={{ x: "max-content" }}
					pagination={{ pageSize: 20, showSizeChanger: true }}
					locale={{ emptyText: "Chưa có bản ghi" }}
				/>
			</Card>
		</div>
	);
}
