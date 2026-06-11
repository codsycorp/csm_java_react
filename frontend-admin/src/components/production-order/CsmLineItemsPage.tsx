/**
 * CsmLineItemsPage — runtime CRUD shell cho form dòng hàng + in PDF theo m_configs.
 *
 * Menu config (type_form=7 hoặc có line_items_columns):
 *   table_name, table[], line_items_*, trigger, struct.fieldsPK
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	Button, Card, Empty, Modal, Space, Spin, Table, Typography, message,
} from "antd";
import {
	DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import CsmLineItemsEditor from "./CsmLineItemsEditor";
import type { LineItemsEditorConfig, OrderHeader, ProductGroup } from "./types";
import {
	buildLineItemsSavePayload,
	parseLineItemsRecord,
	resolveLineItemsListColumns,
} from "./line-items-storage";
import { newGroup } from "./utils";

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
	const header: OrderHeader = {};
	for (const field of config.table ?? []) {
		const name = String(field?.f_name ?? "").trim();
		if (!name) continue;
		if (field?.f_default != null && field.f_default !== "") {
			header[name] = field.f_default;
		}
	}
	return {
		header,
		groups: [newGroup({ vat_default: config.line_items_group?.vat_default ?? 10 })],
	};
}

export default function CsmLineItemsPage({
	appId,
	menuId,
	m_configs,
	decrypt,
	onDataChange,
}: CsmLineItemsPageProps) {
	const tableName = String(m_configs.table_name || "").trim();
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
				app_id: appId,
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
	}, [appId, tableName]);

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
				app_id: appId,
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
	}, [activeRow, appId, closeEditor, loadRows, m_configs, onDataChange, pkFields, tableName]);

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
					app_id: appId,
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
	}, [appId, loadRows, onDataChange, pkFields, tableName]);

	const tableColumns = useMemo<ColumnsType<Record<string, any>>>(() => {
		const dataCols = listColumns.map(col => ({
			title: col.label || col.field,
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
	}, [handleDelete, listColumns, openEdit]);

	if (!tableName) {
		return (
			<Card>
				<Empty description="Menu type_form=7 cần cấu hình table_name và line_items_columns" />
			</Card>
		);
	}

	if (!Array.isArray(m_configs.line_items_columns) || m_configs.line_items_columns.length === 0) {
		return (
			<Card>
				<Empty description="Chưa cấu hình line_items_columns trong menu config" />
			</Card>
		);
	}

	if (view === "edit" && draft) {
		return (
			<div style={{ padding: 12 }}>
				<Space style={{ marginBottom: 12 }}>
					<Button onClick={closeEditor}>← Danh sách</Button>
					<Text type="secondary">
						{activeRow ? "Chỉnh sửa" : "Tạo mới"}
						{menuId ? ` · menu ${menuId}` : ""}
					</Text>
				</Space>
				<Spin spinning={saving}>
					<CsmLineItemsEditor
						key={activeRow
							? String(activeRow[pkFields[0]] ?? activeRow.id ?? "edit")
							: "new"}
						m_configs={m_configs}
						decrypt={decrypt}
						initialValue={draft}
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
				title={String(m_configs.label || "Quản lý đơn hàng")}
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
					dataSource={rows}
					scroll={{ x: "max-content" }}
					pagination={{ pageSize: 20, showSizeChanger: true }}
					locale={{ emptyText: "Chưa có bản ghi" }}
				/>
			</Card>
		</div>
	);
}
