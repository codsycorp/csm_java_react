import { useCallback, useMemo, useState } from "react";
import {
	Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch,
	Table, Tabs, message,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import type {
	LiColumnDef, LiGroupConfig, LiPrintConfig, LiTotalConfig,
	LineItemsEditorConfig, LineItemsListColumn,
} from "#src/components/production-order/types";
import { PHUSON_PANEL_CONFIG } from "#src/components/production-order/defaultConfig";
import { ensureTriLangLabels } from "#src/components/production-order/line-items-label";

const COLUMN_TYPES = [
	{ value: "text", label: "text" },
	{ value: "number", label: "number" },
	{ value: "price", label: "price" },
	{ value: "select", label: "select" },
	{ value: "formula", label: "formula" },
	{ value: "formula_or_manual", label: "formula_or_manual" },
];

export interface LineItemsConfigEditorProps {
	value?: Partial<LineItemsEditorConfig>;
	onChange?: (next: Partial<LineItemsEditorConfig>) => void;
	tableFields?: Array<{ f_name?: string; f_header?: string }>;
	/** Full template: table fields + trigger + table_name (from parent detail form) */
	onApplyTemplate?: () => void;
}

function newColumn(): LiColumnDef {
	return ensureTriLangLabels({
		name: "",
		label: "",
		type: "text",
		width: 100,
		align: "left",
	}, "label") as LiColumnDef;
}

function newListCol(): LineItemsListColumn {
	return ensureTriLangLabels({ field: "", label: "" }, "label") as LineItemsListColumn;
}

function newPrintCfg(): LiPrintConfig {
	return ensureTriLangLabels({
		label: "",
		trigger_key: "",
		filename_expr: "",
	}, "label") as LiPrintConfig;
}

function newTotalCfg(): LiTotalConfig {
	return ensureTriLangLabels({
		key: "",
		label: "",
		formula: "groupSum",
	}, "label") as LiTotalConfig;
}

export default function LineItemsConfigEditor({
	value = {},
	onChange,
	tableFields = [],
	onApplyTemplate,
}: LineItemsConfigEditorProps) {
	const { t } = useTranslation();
	const [colModalOpen, setColModalOpen] = useState(false);
	const [colEditing, setColEditing] = useState<LiColumnDef | null>(null);
	const [colForm] = Form.useForm();

	const patch = useCallback((partial: Partial<LineItemsEditorConfig>) => {
		onChange?.({ ...value, ...partial });
	}, [onChange, value]);

	const fieldOptions = useMemo(
		() => (tableFields || [])
			.map(f => String(f.f_name || "").trim())
			.filter(Boolean)
			.map(name => ({ label: name, value: name })),
		[tableFields],
	);

	const applyTemplate = () => {
		if (onApplyTemplate) {
			onApplyTemplate();
			return;
		}
		Modal.confirm({
			title: t("system.menu.lineItemsApplyTemplateTitle", "Áp dụng mẫu Phú Sơn?"),
			content: t(
				"system.menu.lineItemsApplyTemplateDesc",
				"Ghi đè cấu hình dòng hàng / tổng / in PDF bằng mẫu Báo giá - Lệnh SX - PXK. Trigger in nằm ở tab Trigger.",
			),
			okText: t("common.confirm", "Xác nhận"),
			cancelText: t("common.cancel", "Huỷ"),
			onOk: () => {
				onChange?.({
					...value,
					line_items_data_field: PHUSON_PANEL_CONFIG.line_items_data_field,
					line_items_list: PHUSON_PANEL_CONFIG.line_items_list,
					line_items_columns: PHUSON_PANEL_CONFIG.line_items_columns,
					line_items_group: PHUSON_PANEL_CONFIG.line_items_group,
					line_items_totals: PHUSON_PANEL_CONFIG.line_items_totals,
					line_items_print: PHUSON_PANEL_CONFIG.line_items_print,
				});
				message.success(t("system.menu.lineItemsTemplateApplied", "Đã áp dụng mẫu"));
			},
		});
	};

	const openColEditor = (record?: LiColumnDef) => {
		const next = record ? { ...record } : newColumn();
		setColEditing(next);
		colForm.setFieldsValue(next);
		setColModalOpen(true);
	};

	const saveColumn = async () => {
		const raw = await colForm.validateFields();
		const saved = ensureTriLangLabels(raw, "label") as LiColumnDef;
		const cols = [...(value.line_items_columns ?? [])];
		const idx = cols.findIndex(c => c.name === colEditing?.name && colEditing?.name);
		if (idx >= 0) cols[idx] = saved;
		else cols.push(saved);
		patch({ line_items_columns: cols });
		setColModalOpen(false);
		setColEditing(null);
	};

	const groupCfg: LiGroupConfig = value.line_items_group ?? {};

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<Alert
				type="info"
				showIcon
				message={t("system.menu.lineItemsConfigHintTitle", "Form dòng hàng + in PDF (type_form=7)")}
				description={t(
					"system.menu.lineItemsConfigHintDesc",
					"Cấu hình header ở tab Trường bảng (f_header / f_header_en / f_header_zh). HTML in PDF khai báo trigger_key ở tab Trigger.",
				)}
			/>

			<Space wrap>
				<Button onClick={applyTemplate}>
					{t("system.menu.lineItemsLoadTemplate", "Nạp mẫu Phú Sơn (Báo giá / Lệnh SX / PXK)")}
				</Button>
			</Space>

			<Row gutter={16}>
				<Col xs={24} md={12}>
					<Card size="small" title={t("system.menu.lineItemsStorageTitle", "Lưu trữ JSON")}>
						<Form layout="vertical">
							<Form.Item label={t("system.menu.lineItemsDataField", "Cột JSON payload")}>
								<Input
									value={value.line_items_data_field ?? "payload_json"}
									onChange={e => patch({ line_items_data_field: e.target.value })}
									placeholder="payload_json"
								/>
							</Form.Item>
							<Form.Item label={t("system.menu.lineItemsGroupsKey", "Key mảng nhóm trong JSON")}>
								<Input
									value={value.line_items_groups_key ?? "groups"}
									onChange={e => patch({ line_items_groups_key: e.target.value })}
									placeholder="groups"
								/>
							</Form.Item>
						</Form>
					</Card>
				</Col>
				<Col xs={24} md={12}>
					<Card size="small" title={t("system.menu.lineItemsGroupTitle", "Nhóm sản phẩm")}>
						<Form layout="vertical">
							<Row gutter={12}>
								<Col span={12}>
									<Form.Item label="spec_field">
										<Input
											value={groupCfg.spec_field ?? "spec"}
											onChange={e => patch({
												line_items_group: { ...groupCfg, spec_field: e.target.value },
											})}
										/>
									</Form.Item>
								</Col>
								<Col span={12}>
									<Form.Item label="vat_default">
										<InputNumber
											style={{ width: "100%" }}
											value={groupCfg.vat_default ?? 10}
											onChange={v => patch({
												line_items_group: { ...groupCfg, vat_default: Number(v) || 10 },
											})}
										/>
									</Form.Item>
								</Col>
							</Row>
						</Form>
					</Card>
				</Col>
			</Row>

			<Tabs
				items={[
					{
						key: "columns",
						label: t("system.menu.lineItemsTabColumns", "Cột dòng hàng"),
						children: (
							<>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => openColEditor()}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddColumn", "Thêm cột")}
								</Button>
								<Table
									size="small"
									rowKey={(r, i) => r.name || `col-${i}`}
									dataSource={value.line_items_columns ?? []}
									pagination={false}
									scroll={{ x: true }}
									columns={[
										{ title: "name", dataIndex: "name", width: 120 },
										{ title: "VI", dataIndex: "label", ellipsis: true },
										{ title: "EN", dataIndex: "label_en", ellipsis: true },
										{ title: "ZH", dataIndex: "label_zh", ellipsis: true },
										{ title: "type", dataIndex: "type", width: 120 },
										{
											title: t("common.action", "Thao tác"),
											width: 120,
											render: (_, record) => (
												<Space>
													<Button type="link" size="small" icon={<EditOutlined />} onClick={() => openColEditor(record)} />
													<Button
														type="link"
														size="small"
														danger
														icon={<DeleteOutlined />}
														onClick={() => patch({
															line_items_columns: (value.line_items_columns ?? []).filter(c => c !== record),
														})}
													/>
												</Space>
											),
										},
									]}
								/>
							</>
						),
					},
					{
						key: "list",
						label: t("system.menu.lineItemsTabList", "Cột danh sách"),
						children: (
							<>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => patch({
										line_items_list: [...(value.line_items_list ?? []), newListCol()],
									})}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddListCol", "Thêm cột list")}
								</Button>
								<Table
									size="small"
									rowKey={(_, i) => `list-${i}`}
									dataSource={value.line_items_list ?? []}
									pagination={false}
									columns={[
										{
											title: "field",
											dataIndex: "field",
											render: (v, _, idx) => (
												<Select
													style={{ width: "100%" }}
													value={v}
													showSearch
													options={fieldOptions}
													onChange={val => {
														const list = [...(value.line_items_list ?? [])];
														list[idx] = { ...list[idx], field: val };
														patch({ line_items_list: list });
													}}
												/>
											),
										},
										{
											title: "VI",
											dataIndex: "label",
											render: (v, _, idx) => (
												<Input
													value={v}
													onChange={e => {
														const list = [...(value.line_items_list ?? [])];
														list[idx] = { ...list[idx], label: e.target.value };
														patch({ line_items_list: list });
													}}
												/>
											),
										},
										{
											title: "EN",
											dataIndex: "label_en",
											render: (v, _, idx) => (
												<Input
													value={v}
													onChange={e => {
														const list = [...(value.line_items_list ?? [])];
														list[idx] = { ...list[idx], label_en: e.target.value };
														patch({ line_items_list: list });
													}}
												/>
											),
										},
										{
											title: "ZH",
											dataIndex: "label_zh",
											render: (v, _, idx) => (
												<Input
													value={v}
													onChange={e => {
														const list = [...(value.line_items_list ?? [])];
														list[idx] = { ...list[idx], label_zh: e.target.value };
														patch({ line_items_list: list });
													}}
												/>
											),
										},
										{
											title: "",
											width: 48,
											render: (_, __, idx) => (
												<Button
													type="text"
													danger
													icon={<DeleteOutlined />}
													onClick={() => patch({
														line_items_list: (value.line_items_list ?? []).filter((_, i) => i !== idx),
													})}
												/>
											),
										},
									]}
								/>
							</>
						),
					},
					{
						key: "totals",
						label: t("system.menu.lineItemsTabTotals", "Dòng tổng"),
						children: (
							<>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => patch({
										line_items_totals: [...(value.line_items_totals ?? []), newTotalCfg()],
									})}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddTotal", "Thêm dòng tổng")}
								</Button>
								<Table
									size="small"
									rowKey={(_, i) => `tot-${i}`}
									dataSource={value.line_items_totals ?? []}
									pagination={false}
									columns={[
										{ title: "key", dataIndex: "key", width: 60 },
										{ title: "formula", dataIndex: "formula", ellipsis: true },
										{ title: "VI", dataIndex: "label" },
										{ title: "EN", dataIndex: "label_en" },
										{ title: "ZH", dataIndex: "label_zh" },
										{
											title: "highlight",
											dataIndex: "highlight",
											render: (v, _, idx) => (
												<Switch
													checked={Boolean(v)}
													onChange={checked => {
														const rows = [...(value.line_items_totals ?? [])];
														rows[idx] = { ...rows[idx], highlight: checked };
														patch({ line_items_totals: rows });
													}}
												/>
											),
										},
										{
											title: "",
											width: 48,
											render: (_, __, idx) => (
												<Button
													type="text"
													danger
													icon={<DeleteOutlined />}
													onClick={() => patch({
														line_items_totals: (value.line_items_totals ?? []).filter((_, i) => i !== idx),
													})}
												/>
											),
										},
									]}
								/>
							</>
						),
					},
					{
						key: "print",
						label: t("system.menu.lineItemsTabPrint", "Nút in PDF"),
						children: (
							<>
								<Alert
									type="warning"
									showIcon
									style={{ marginBottom: 12 }}
									message={t(
										"system.menu.lineItemsPrintTriggerHint",
										"Mỗi trigger_key cần có function body tương ứng trong tab Trigger (VD: print_bao_gia).",
									)}
								/>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => patch({
										line_items_print: [...(value.line_items_print ?? []), newPrintCfg()],
									})}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddPrint", "Thêm nút in")}
								</Button>
								<Table
									size="small"
									rowKey={(_, i) => `print-${i}`}
									dataSource={value.line_items_print ?? []}
									pagination={false}
									columns={[
										{ title: "trigger_key", dataIndex: "trigger_key", width: 140 },
										{ title: "VI", dataIndex: "label" },
										{ title: "EN", dataIndex: "label_en" },
										{ title: "ZH", dataIndex: "label_zh" },
										{ title: "filename_expr", dataIndex: "filename_expr", ellipsis: true },
										{
											title: "",
											width: 48,
											render: (_, __, idx) => (
												<Button
													type="text"
													danger
													icon={<DeleteOutlined />}
													onClick={() => patch({
														line_items_print: (value.line_items_print ?? []).filter((_, i) => i !== idx),
													})}
												/>
											),
										},
									]}
								/>
							</>
						),
					},
				]}
			/>

			<Modal
				open={colModalOpen}
				title={colEditing?.name
					? t("system.menu.lineItemsEditColumn", "Sửa cột dòng hàng")
					: t("system.menu.lineItemsAddColumn", "Thêm cột")}
				onCancel={() => setColModalOpen(false)}
				onOk={saveColumn}
				width={720}
				destroyOnClose
			>
				<Form form={colForm} layout="vertical">
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="name" label="name" rules={[{ required: true }]}>
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="type" label="type" rules={[{ required: true }]}>
								<Select options={COLUMN_TYPES} />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="width" label="width">
								<InputNumber style={{ width: "100%" }} min={40} />
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="label" label={t("system.menu.labelVi", "Nhãn (VI)")} rules={[{ required: true }]}>
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_en" label={t("system.menu.labelEn", "Nhãn (EN)")}>
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_zh" label={t("system.menu.labelZh", "Nhãn (ZH)")}>
								<Input />
							</Form.Item>
						</Col>
					</Row>
					<Form.Item name="options" label="options (select)">
						<Input placeholder="m2|m|cái" />
					</Form.Item>
					<Form.Item name="formula" label="formula">
						<Input.TextArea rows={2} placeholder="(khoi_luong ?? 0) * (don_gia ?? 0)" />
					</Form.Item>
					<Form.Item name="manual_condition" label="manual_condition">
						<Input placeholder="chieu_dai == null && so_tam == null" />
					</Form.Item>
					<Form.Item name="align" label="align">
						<Select allowClear options={[
							{ value: "left", label: "left" },
							{ value: "center", label: "center" },
							{ value: "right", label: "right" },
						]} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
