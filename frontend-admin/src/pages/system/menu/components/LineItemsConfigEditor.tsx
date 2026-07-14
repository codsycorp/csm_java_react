import { useCallback, useMemo, useState } from "react";
import {
	Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Upload,
	Table, Tabs, message,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { AI_TIMEOUT_MS } from "#src/api/ai";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
import { request } from "#src/utils";
import { useUserStore } from "#src/store";

import type {
  LiColumnDef, LiGroupConfig, LiPrintConfig, LiPrintTableOpts, LiTotalConfig,
  LineItemsEditorConfig, LineItemsListColumn, LineItemsUiConfig, LiFieldSection,
  LineItemsWorkflowConfig, LineItemsListFilter,
} from "#src/components/production-order/types";
import { PHUSON_PANEL_CONFIG, PHUSON_WORKFLOW } from "#src/components/production-order/defaultConfig";
import {
  PHUSON_PRESET_OPTIONS,
  type PhusonMenuPresetId,
} from "#src/components/production-order/line-items-menu-presets";
import { ensureTriLangLabels } from "#src/components/production-order/line-items-label";
import LineItemsPdfImportPanel from "#src/components/production-order/LineItemsPdfImportPanel";
import { readPrintSampleFile, suggestPrintConfig } from "#src/components/production-order/line-items-print-import";
import { inferDocKindFromLayout } from "#src/components/production-order/line-items-pdf-layout";
import {
	createDocxTemplateBuffer,
	arrayBufferToDataUrl,
	type DocxTemplateBlueprint,
} from "#src/components/production-order/line-items-docx-template";
import { probeDocxTemplateUrl } from "#src/components/production-order/line-items-docx-print";

const COLUMN_TYPES = [
	{ value: "text", label: "text" },
	{ value: "number", label: "number" },
	{ value: "price", label: "price" },
	{ value: "select", label: "select" },
	{ value: "formula", label: "formula" },
	{ value: "formula_or_manual", label: "formula_or_manual" },
];

const PRINT_PDF_HINT_EXAMPLE = `Ví dụ: {"format":"a4","orientation":"portrait","margin_mm":[0,0,0,0],"canvas_scale":2,"pagebreak_mode":["css","legacy"],"preview_width_px":820}`;
const UPLOAD_ENDPOINT = "/upload.shtml";

function normalizeUploadFileName(name: string): string {
	const source = String(name || "template.docx").toLowerCase();
	const ext = source.endsWith(".docx") ? ".docx" : "";
	const base = source.replace(/\.docx$/i, "").replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
	return `${base || "template"}${ext || ".docx"}`;
}

function normalizeUploadedTemplatePath(rawPath: string, appId?: string, expectedName?: string): string {
	const raw = String(rawPath || "").trim();
	if (!raw) return "";
	let pathOnly = raw;
	try {
		if (/^https?:\/\//i.test(raw)) {
			const u = new URL(raw);
			pathOnly = `${u.pathname}${u.search || ""}`;
		}
	} catch {
		// Keep original path if URL parsing fails.
	}

	let normalized = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
	normalized = normalized.replace(/\/{2,}/g, "/");

	if (appId && expectedName) {
		const expected = expectedName.startsWith("/") ? expectedName.slice(1) : expectedName;
		if (normalized === `/app_images/${expected}` || normalized === `/app_images//${expected}`) {
			return `/app_images/${appId}/${expected}`;
		}
	}

	return normalized;
}

function extractUploadPathFromResponse(text: string, appId?: string, expectedName?: string): string {
	const raw = String(text || "").trim();
	if (!raw) return "";

	const readCandidate = (candidate: unknown): string => {
		if (typeof candidate !== "string") return "";
		const normalized = normalizeUploadedTemplatePath(candidate, appId, expectedName);
		return normalized.includes("/app_images/") ? normalized : "";
	};

	const walk = (node: any): string => {
		if (!node || typeof node !== "object") return "";
		const direct = readCandidate(node.path) || readCandidate(node.url) || readCandidate(node.file) || readCandidate(node.location);
		if (direct) return direct;
		if (Array.isArray(node.files)) {
			for (const f of node.files) {
				const found = walk(f);
				if (found) return found;
			}
		}
		const nestedKeys = ["data", "result", "payload", "response"];
		for (const key of nestedKeys) {
			const found = walk(node[key]);
			if (found) return found;
		}
		return "";
	};

	try {
		const parsed = JSON.parse(raw);
		const fromJson = walk(parsed);
		if (fromJson) return fromJson;
	} catch {
		// Ignore JSON parse failure and try plain-text extraction below.
	}

	const regexMatch = raw.match(/\/?app_images\/[A-Za-z0-9._\/-]+\.docx(?:\?[^"]*)?/i);
	if (regexMatch?.[0]) {
		return normalizeUploadedTemplatePath(regexMatch[0], appId, expectedName);
	}

	if (!/^<!doctype html>/i.test(raw) && !/^<html/i.test(raw)) {
		const direct = normalizeUploadedTemplatePath(raw, appId, expectedName);
		if (direct.includes("/app_images/")) return direct;
	}

	return "";
}

async function uploadGeneratedDocxTemplate(params: {
	appId: string;
	fileName: string;
	dataUrl: string;
	appToken?: string;
}): Promise<string> {
	const response = await fetch(UPLOAD_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: String(params.appToken || ""),
		},
		body: JSON.stringify({
			app_id: params.appId,
			name: params.fileName,
			src: params.dataUrl,
		}),
	});

	if (!response.ok) {
		throw new Error(`Upload DOCX thất bại: ${response.status} ${response.statusText}`);
	}

	const rawText = await response.text();
	const extracted = extractUploadPathFromResponse(rawText, params.appId, params.fileName);
	if (!extracted) {
		throw new Error("Upload DOCX thành công nhưng response không có đường dẫn hợp lệ");
	}
	return extracted;
}

function tryParseLooseJson(raw: string): Record<string, any> | null {
	const text = String(raw || "").trim();
	if (!text) return null;
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		const fence = text.match(/```(?:json)?\n([\s\S]+?)\n```/i);
		if (fence?.[1]) {
			try {
				const parsed = JSON.parse(fence[1]);
				return parsed && typeof parsed === "object" ? parsed : null;
			} catch {
				return null;
			}
		}
		return null;
	}
}

function extractJsBodyFromAi(raw: string): string {
	const text = String(raw || "").trim();
	if (!text) return "";
	const fencedJs = text.match(/```(?:javascript|js)?\n([\s\S]+?)\n```/i);
	if (fencedJs?.[1]) return fencedJs[1].trim();
	return text;
}

function buildDefaultDocxBlueprint(params: {
	kind: string;
	title?: string;
	subtitle?: string;
	headers?: string[];
	tableHeaders?: string[];
	signatures?: string[];
}): DocxTemplateBlueprint {
	const tableHeaders = (params.tableHeaders || []).filter(Boolean);
	const normalizedTableHeaders = tableHeaders.length
		? tableHeaders.slice(0, 9)
		: Array.from({ length: 6 }).map((_, idx) => `COL_${idx + 1}`);
	const rowPlaceholders = normalizedTableHeaders.map((_, idx) => {
		if (idx === 0) return "{#items_flat}{stt}";
		if (idx === normalizedTableHeaders.length - 1) return `{col_${idx + 1}}{/items_flat}`;
		return `{col_${idx + 1}}`;
	});
	const totalTwip = 9600;
	const rawWidths = normalizedTableHeaders.map((header, idx) => {
		const key = String(header || "").toLowerCase();
		if (idx === 0 || key.includes("stt") || key === "tt" || key === "id") return 0.7;
		return Math.max(1, Math.min(2.1, Math.round((String(header).length / 6) * 10) / 10));
	});
	const widthSum = rawWidths.reduce((acc, v) => acc + v, 0) || normalizedTableHeaders.length;
	const tableColWidthsTwip = rawWidths.map((w) => Math.max(480, Math.floor((w / widthSum) * totalTwip)));
	tableColWidthsTwip[tableColWidthsTwip.length - 1] += totalTwip - tableColWidthsTwip.reduce((acc, v) => acc + v, 0);
	return {
		title: params.title || "MẪU CHỨNG TỪ",
		subtitle: params.subtitle || "Tạo tự động từ PDF mẫu",
		headerLines: (params.headers || []).slice(0, 8).map((h) => String(h || "").trim()).filter(Boolean),
		tableHeaders: normalizedTableHeaders,
		tableRowPlaceholders: rowPlaceholders,
		signatureLabels: (params.signatures || []).slice(0, 6).map((s) => String(s || "").trim()).filter(Boolean),
		noteLines: [
			`template_kind: ${params.kind}`,
			"Tong cong: {totals_value}",
			"Bằng chữ: {bang_chu}",
		],
		pageSizeTwip: { width: 11906, height: 16838 },
		pageMarginsTwip: { top: 920, right: 920, bottom: 920, left: 920 },
		baseFontName: "Times New Roman",
		baseFontSizeHalfPt: 24,
		tableColWidthsTwip,
		titleAlign: "center",
		headerAlign: "left",
	};
}

export interface LineItemsConfigEditorProps {
	value?: Partial<LineItemsEditorConfig>;
	onChange?: (next: Partial<LineItemsEditorConfig>) => void;
	tableFields?: Array<{ f_name?: string; f_header?: string }>;
	/** Full template: table fields + trigger + table_name (from parent detail form) */
	onApplyTemplate?: () => void;
	/** Áp preset menu lá (pm_bao_gia / pm_lsx_nb / pm_lsx_pxk) — gồm trigger in sống */
	onApplyMenuPreset?: (presetId: PhusonMenuPresetId) => void;
	appId?: string;
	onApplyTrigger?: (key: string, body: string) => void;
	editorMetadata?: Record<string, unknown>;
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

function newFieldSection(): LiFieldSection {
	return ensureTriLangLabels({ key: "", label: "", fields: [] }, "label") as LiFieldSection;
}

export default function LineItemsConfigEditor({
	value = {},
	onChange,
	tableFields = [],
	onApplyTemplate,
	onApplyMenuPreset,
	appId,
	onApplyTrigger,
	editorMetadata,
}: LineItemsConfigEditorProps) {
	const { t } = useTranslation();
	const [colModalOpen, setColModalOpen] = useState(false);
	const [colEditing, setColEditing] = useState<LiColumnDef | null>(null);
	const [colForm] = Form.useForm();
	const [totalModalOpen, setTotalModalOpen] = useState(false);
	const [totalEditingIdx, setTotalEditingIdx] = useState<number | null>(null);
	const [totalForm] = Form.useForm();
	const [printModalOpen, setPrintModalOpen] = useState(false);
	const [printEditingIdx, setPrintEditingIdx] = useState<number | null>(null);
	const [printForm] = Form.useForm();
	const [docxSampleFile, setDocxSampleFile] = useState<File | null>(null);
	const [docxTemplateUrl, setDocxTemplateUrl] = useState<string>("");
	const [docxAutoLoading, setDocxAutoLoading] = useState(false);
	const [docxLastAiStatus, setDocxLastAiStatus] = useState<string>("");
	const [docxLastGeneratedTrigger, setDocxLastGeneratedTrigger] = useState<string>("");
	const [docxLastGeneratedTriggerKey, setDocxLastGeneratedTriggerKey] = useState<string>("");
	const user = useUserStore();

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
					line_items_workflow: PHUSON_PANEL_CONFIG.line_items_workflow,
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

	const openTotalEditor = (idx?: number) => {
		const rows = value.line_items_totals ?? [];
		const record = idx != null ? rows[idx] : newTotalCfg();
		setTotalEditingIdx(idx ?? null);
		totalForm.setFieldsValue(record);
		setTotalModalOpen(true);
	};

	const saveTotal = async () => {
		const raw = await totalForm.validateFields();
		const saved = ensureTriLangLabels(raw, "label") as LiTotalConfig;
		const rows = [...(value.line_items_totals ?? [])];
		if (totalEditingIdx != null && totalEditingIdx >= 0) rows[totalEditingIdx] = saved;
		else rows.push(saved);
		patch({ line_items_totals: rows });
		setTotalModalOpen(false);
		setTotalEditingIdx(null);
	};

	const uiCfg: LineItemsUiConfig = value.line_items_ui ?? {};

	const printKeyOptions = useMemo(() => {
		const keys = new Set<string>();
		for (const pc of value.line_items_print ?? []) {
			const k = String(pc.trigger_key ?? "").trim();
			if (k) keys.add(k);
		}
		return Array.from(keys).map(k => ({ label: k, value: k }));
	}, [value.line_items_print]);

	const columnNameOptions = useMemo(
		() => (value.line_items_columns ?? [])
			.map(c => String(c.name ?? "").trim())
			.filter(Boolean)
			.map(n => ({ label: n, value: n })),
		[value.line_items_columns],
	);

	const openPrintEditor = (idx?: number) => {
		const rows = value.line_items_print ?? [];
		const record = idx != null ? rows[idx] : newPrintCfg();
		setPrintEditingIdx(idx ?? null);
		const pt = record.print_table ?? {};
		const pp = (record as any).print_pdf ?? {};
		const pd = (record as any).print_docx ?? {};
		printForm.setFieldsValue({
			...record,
			print_engine: (record as any).print_engine || "html",
			pt_showPrice: pt.showPrice ?? true,
			pt_showGroupSubtotal: pt.showGroupSubtotal ?? true,
			pt_hideColumns: pt.hideColumns ?? [],
			pt_showTotals: pt.showTotals ?? true,
			print_pdf_json: JSON.stringify(pp, null, 2),
			print_docx_template_url: pd.template_url ?? "",
			print_docx_data_trigger_key: pd.data_trigger_key ?? "",
			print_docx_allow_download_docx: Boolean(pd.allow_download_docx),
		});
		setPrintModalOpen(true);
	};

	const savePrint = async () => {
		const raw = await printForm.validateFields();
		let print_pdf: Record<string, any> | undefined;
		const printPdfRaw = String(raw.print_pdf_json ?? "").trim();
		if (printPdfRaw) {
			try {
				const parsed = JSON.parse(printPdfRaw);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					print_pdf = parsed as Record<string, any>;
				}
			} catch {
				message.error("print_pdf JSON không hợp lệ");
				return;
			}
		}
		const print_table: LiPrintTableOpts = {
			showPrice: raw.pt_showPrice,
			showGroupSubtotal: raw.pt_showGroupSubtotal,
			showTotals: raw.pt_showTotals,
			hideColumns: raw.pt_hideColumns?.length ? raw.pt_hideColumns : undefined,
		};
		const print_engine = raw.print_engine || "html";
		const templateUrl = String(raw.print_docx_template_url ?? "").trim();
		const dataTriggerKey = String(raw.print_docx_data_trigger_key ?? "").trim();
		const allowDownloadDocx = Boolean(raw.print_docx_allow_download_docx);
		const print_docx = print_engine === "docx"
			? {
				template_url: templateUrl,
				data_trigger_key: dataTriggerKey || undefined,
				allow_download_docx: allowDownloadDocx,
			}
			: undefined;
		if (print_engine === "docx") {
			if (!templateUrl) {
				message.error("Thiếu print_docx.template_url");
				return;
			}
			try {
				const probe = await probeDocxTemplateUrl(templateUrl, { checkExternalTargets: true, appIdHint: appId });
				if (!probe.ok) {
					message.error(probe.message || "Template DOCX không hợp lệ");
					return;
				}
			} catch (err: any) {
				message.error(`Không kiểm tra được template DOCX: ${err?.message || String(err)}`);
				return;
			}
		}
		const saved = ensureTriLangLabels({
			label: raw.label,
			label_en: raw.label_en,
			label_zh: raw.label_zh,
			trigger_key: raw.trigger_key,
			filename_expr: raw.filename_expr,
			print_engine,
			print_docx,
			print_table,
			print_pdf,
		}, "label") as LiPrintConfig;
		const rows = [...(value.line_items_print ?? [])];
		if (printEditingIdx != null && printEditingIdx >= 0) rows[printEditingIdx] = saved;
		else rows.push(saved);
		const nextPrintKeys = [...(uiCfg.print_keys ?? [])];
		if (saved.trigger_key && !nextPrintKeys.includes(saved.trigger_key)) {
			nextPrintKeys.push(saved.trigger_key);
		}
		patch({
			line_items_print: rows,
			line_items_ui: { ...uiCfg, print_keys: nextPrintKeys },
		});
		setPrintModalOpen(false);
		setPrintEditingIdx(null);
	};

	const applyDocxFromPdfSample = useCallback(async (selectedFile?: File | null) => {
		const sourceFile = selectedFile || docxSampleFile;
		if (!sourceFile) {
			message.warning("Chưa chọn PDF mẫu");
			return;
		}

		setDocxAutoLoading(true);
		setDocxLastAiStatus("");
		setDocxLastGeneratedTrigger("");
		setDocxLastGeneratedTriggerKey("");
		try {
			let aiStatus = "";
			const layoutCfg = (value as any)?.settings?.pdf_layout_extract || (value as any)?.pdf_layout_extract;
			const sample = await readPrintSampleFile(sourceFile, 2, layoutCfg);
			const kind = inferDocKindFromLayout(sample.pdfLayout, layoutCfg) || "bao_gia";

			const byKind: Record<string, { key: string; label: string }> = {
				bao_gia: { key: "print_bao_gia", label: "Xuất Báo giá" },
				lenh_sx: { key: "print_lenh_sx", label: "Xuất Lệnh SX nội bộ" },
				pxk: { key: "print_pxk", label: "Xuất Lệnh SX + PXK" },
				custom: { key: "print_custom_docx", label: "Xuất DOCX từ mẫu" },
			};

			const triggerInfo = byKind[kind] || byKind.custom;
			const suggested = suggestPrintConfig(kind as any, triggerInfo.key, sample.pdfLayout) as any;
			const dataTriggerKey = `${triggerInfo.key}_docx_data`;

			const aiDraft = buildDefaultDocxBlueprint({
				kind,
				title: sample.pdfLayout.docTitle,
				subtitle: sample.pdfLayout.docSubtitle,
				headers: sample.pdfLayout.headerLines,
				tableHeaders: sample.pdfLayout.tableColumnHeaders,
				signatures: sample.pdfLayout.signatureLabels,
			});

			let blueprint = aiDraft;
			try {
				const aiPrompt = [
					"Bạn là AI local chuyên chuẩn hóa template DOCX cho CSM.",
					"Nhiệm vụ: chỉnh JSON blueprint cho DOCX theo layout PDF mẫu.",
					"Chỉ trả về một JSON object hợp lệ, không markdown, không giải thích.",
					"Giữ placeholders Docxtemplater dạng {field}.",
					"",
					`docKind: ${kind}`,
					`pdfLayout: ${JSON.stringify({
						docTitle: sample.pdfLayout.docTitle,
						docSubtitle: sample.pdfLayout.docSubtitle,
						headerLines: sample.pdfLayout.headerLines?.slice(0, 10),
						tableColumnHeaders: sample.pdfLayout.tableColumnHeaders?.slice(0, 12),
						signatureLabels: sample.pdfLayout.signatureLabels?.slice(0, 8),
						showPrice: sample.pdfLayout.showPrice,
					}, null, 2)}`,
					"",
					"Schema JSON:",
					"{",
					"  \"title\": string,",
					"  \"subtitle\": string,",
					"  \"headerLines\": string[],",
					"  \"tableHeaders\": string[],",
					"  \"tableRowPlaceholders\": string[],",
					"  \"signatureLabels\": string[],",
					"  \"noteLines\": string[]",
					"}",
					"",
					`current blueprint: ${JSON.stringify(aiDraft, null, 2)}`,
				].join("\n");

				const response = await request.post("ai-code-stream", {
					json: {
						appId: String(appId || "line_items_docx").trim() || "line_items_docx",
						message: aiPrompt,
						currentCode: JSON.stringify(aiDraft, null, 2),
						flowType: "code_editor",
						taskType: "code_assistant",
						language: "json",
						contextType: "code",
						responseMode: "raw_code",
						editorMetadata: {
							...(editorMetadata || {}),
							source: "LineItemsConfigEditor.docx_blueprint",
							docKind: kind,
							triggerKey: triggerInfo.key,
						},
					},
					timeout: AI_TIMEOUT_MS,
					throwHttpErrors: false,
				});

				if (response.ok && response.body) {
					let completed = false;
					let fullResponse = "";
					await consumeSseStream(response, {
						onEvent: (evt) => {
							const payload = (evt.payload && typeof evt.payload === "object")
								? (evt.payload as Record<string, unknown>)
								: null;
							if (!payload) return;
							const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
								onChunk: (_chunk, accumulated) => { fullResponse = accumulated; },
								onComplete: (p) => {
									if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
									completed = true;
								},
								onError: () => {},
							});
							fullResponse = result.accumulated;
							if (result.completed) completed = true;
						},
					});

					const payload = completed ? tryParseLooseJson(fullResponse) : null;
					if (payload) {
						blueprint = {
							...aiDraft,
							title: String(payload.title || aiDraft.title),
							subtitle: String(payload.subtitle || aiDraft.subtitle || ""),
							headerLines: Array.isArray(payload.headerLines) ? payload.headerLines.map(String).filter(Boolean) : aiDraft.headerLines,
							tableHeaders: Array.isArray(payload.tableHeaders) ? payload.tableHeaders.map(String).filter(Boolean) : aiDraft.tableHeaders,
							tableRowPlaceholders: Array.isArray(payload.tableRowPlaceholders) ? payload.tableRowPlaceholders.map(String).filter(Boolean) : aiDraft.tableRowPlaceholders,
							signatureLabels: Array.isArray(payload.signatureLabels) ? payload.signatureLabels.map(String).filter(Boolean) : aiDraft.signatureLabels,
							noteLines: Array.isArray(payload.noteLines) ? payload.noteLines.map(String).filter(Boolean) : aiDraft.noteLines,
						};
						aiStatus = "AI local đã tinh chỉnh blueprint DOCX";
						setDocxLastAiStatus(aiStatus);
					} else {
						aiStatus = "AI local không trả JSON hợp lệ, dùng blueprint mặc định";
						setDocxLastAiStatus(aiStatus);
					}
				} else {
					aiStatus = "Không gọi được AI local, dùng blueprint mặc định";
					setDocxLastAiStatus(aiStatus);
				}
			} catch {
				aiStatus = "AI local lỗi, dùng blueprint mặc định";
				setDocxLastAiStatus(aiStatus);
			}

			const normalizedName = normalizeUploadFileName(`${triggerInfo.key}_${Date.now()}.docx`);
			const docxBuffer = createDocxTemplateBuffer(blueprint);
			const docxDataUrl = arrayBufferToDataUrl(
				docxBuffer,
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			);

			let effectiveTemplateUrl = docxDataUrl;
			if (appId) {
				try {
					effectiveTemplateUrl = await uploadGeneratedDocxTemplate({
						appId: String(appId).trim(),
						fileName: normalizedName,
						dataUrl: docxDataUrl,
						appToken: String(user?.app_token || ""),
					});
				} catch (uploadErr: any) {
					message.warning(`Không upload được DOCX lên server, dùng tạm data URL: ${uploadErr?.message || String(uploadErr)}`);
				}
			}
			setDocxTemplateUrl(effectiveTemplateUrl);

			try {
				const probe = await probeDocxTemplateUrl(effectiveTemplateUrl, { checkExternalTargets: true, appIdHint: appId });
				if (!probe.ok) {
					throw new Error(probe.message || "Template DOCX không hợp lệ sau khi tạo/upload");
				}
			} catch (probeErr: any) {
				message.error(`DOCX tạo xong nhưng không hợp lệ để dùng: ${probeErr?.message || String(probeErr)}`);
				return;
			}

			const docxPrintCfg = ensureTriLangLabels({
				...suggested,
				label: triggerInfo.label,
				trigger_key: triggerInfo.key,
				print_engine: "docx",
				print_docx: {
					template_url: effectiveTemplateUrl,
					data_trigger_key: dataTriggerKey,
					allow_download_docx: true,
				},
			}, "label") as LiPrintConfig;

			const rows = [...(value.line_items_print ?? [])];
			const idx = rows.findIndex(r => String(r.trigger_key || "") === triggerInfo.key);
			if (idx >= 0) rows[idx] = { ...rows[idx], ...docxPrintCfg };
			else rows.push(docxPrintCfg);

			const keys = new Set([...(uiCfg.print_keys ?? []), triggerInfo.key]);
			patch({
				line_items_print: rows,
				line_items_ui: { ...uiCfg, print_keys: Array.from(keys) },
			});

			const defaultTriggerBody = [
				"const cfg = utils.settings || {};",
				"const wordsKey = (Array.isArray(utils.totalConfigs) ? utils.totalConfigs.find((x)=>x && x.show_words)?.key : undefined) || 'D';",
				"const totalsObj = (calc && calc.totals && typeof calc.totals === 'object') ? calc.totals : {};",
				"const wordsVal = (typeof totalsObj[wordsKey] === 'number') ? totalsObj[wordsKey] : 0;",
				"const numericTotalCandidates = Object.values(totalsObj).filter((v) => typeof v === 'number' && Number.isFinite(v));",
				"const totals_value = Number.isFinite(wordsVal) && wordsVal !== 0 ? wordsVal : (numericTotalCandidates.length ? Number(numericTotalCandidates[0]) : 0);",
				"const items_flat = [];",
				"let stt = 1;",
				"for (const g of (groups || [])) {",
				"  for (const it of (g?.items || [])) {",
				"    items_flat.push({ ...it, stt });",
				"    stt += 1;",
				"  }",
				"}",
				"const noteLines = utils.parseNoteLines ? utils.parseNoteLines(cfg.ghi_chu_bao_gia, []) : [];",
				"return {",
				"  order,",
				"  groups,",
				"  items_flat,",
				"  calc,",
				"  totals: totalsObj,",
				"  totals_value,",
				"  bang_chu: utils.soThanhChu ? utils.soThanhChu(wordsVal) : '',",
				"  note_lines: noteLines,",
				"  settings: cfg,",
				`  template_kind: ${JSON.stringify(String(kind || ""))},`,
				`  template_title: ${JSON.stringify(String(sample.pdfLayout.docTitle || ""))},`,
				"};",
			].join("\n");

			let finalTriggerBody = defaultTriggerBody;
			let triggerAiStatus = "";
			try {
				const triggerPrompt = [
					"Bạn là AI local chuyên viết JS trigger data cho Docxtemplater trong CSM.",
					"Mục tiêu: tạo body function JavaScript hợp lệ cho new Function('order','groups','calc','utils', body).",
					"Yêu cầu bắt buộc:",
					"1) Chỉ trả về JSON object hợp lệ, không markdown, không giải thích.",
					"2) JSON schema: { \"triggerBody\": string }",
					"3) triggerBody phải là JS body an toàn, có return object.",
					"4) Không dùng import/require/await/top-level return ngoài body function.",
					"5) Ưu tiên mapping theo placeholders trong DOCX blueprint.",
					"6) Giữ các key chuẩn: order, groups, items_flat, calc, totals, bang_chu, note_lines, settings, template_kind, template_title.",
					"",
					`docKind: ${kind}`,
					`triggerKey: ${triggerInfo.key}`,
					`dataTriggerKey: ${dataTriggerKey}`,
					`docTitle: ${JSON.stringify(String(sample.pdfLayout.docTitle || ""))}`,
					`docxBlueprint: ${JSON.stringify(blueprint, null, 2)}`,
					"",
					`fallbackTriggerBody: ${JSON.stringify(defaultTriggerBody)}`,
				].join("\n");

				const triggerResponse = await request.post("ai-code-stream", {
					json: {
						appId: String(appId || "line_items_docx").trim() || "line_items_docx",
						message: triggerPrompt,
						currentCode: defaultTriggerBody,
						flowType: "code_editor",
						taskType: "code_assistant",
						language: "javascript",
						contextType: "code",
						responseMode: "raw_code",
						editorMetadata: {
							...(editorMetadata || {}),
							source: "LineItemsConfigEditor.docx_data_trigger",
							docKind: kind,
							triggerKey: triggerInfo.key,
							dataTriggerKey,
						},
					},
					timeout: AI_TIMEOUT_MS,
					throwHttpErrors: false,
				});

				if (triggerResponse.ok && triggerResponse.body) {
					let completed = false;
					let fullResponse = "";
					await consumeSseStream(triggerResponse, {
						onEvent: (evt) => {
							const payload = (evt.payload && typeof evt.payload === "object")
								? (evt.payload as Record<string, unknown>)
								: null;
							if (!payload) return;
							const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
								onChunk: (_chunk, accumulated) => { fullResponse = accumulated; },
								onComplete: (p) => {
									if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
									completed = true;
								},
								onError: () => {},
							});
							fullResponse = result.accumulated;
							if (result.completed) completed = true;
						},
					});

					const payload = completed ? tryParseLooseJson(fullResponse) : null;
					const candidateRaw = typeof payload?.triggerBody === "string" ? payload.triggerBody : fullResponse;
					const candidateBody = extractJsBodyFromAi(candidateRaw);
					if (candidateBody) {
						// Compile-check trigger body to avoid runtime "Invalid or unexpected token".
						// eslint-disable-next-line no-new-func
						new Function("order", "groups", "calc", "utils", candidateBody);
						finalTriggerBody = candidateBody;
						triggerAiStatus = "AI local đã tạo trigger data cho DOCX";
					}
				}
			} catch {
				triggerAiStatus = "AI trigger lỗi, dùng trigger mặc định";
			}

			onApplyTrigger?.(dataTriggerKey, finalTriggerBody);
			setDocxLastGeneratedTrigger(finalTriggerBody);
			setDocxLastGeneratedTriggerKey(dataTriggerKey);
			const aiMsg = [aiStatus, triggerAiStatus].filter(Boolean).join(" | ");
			const storageMode = String(effectiveTemplateUrl || "").startsWith("/app_images/") ? "[đã upload]" : "[data-url fallback]";
			message.success(`Đã tạo cấu hình DOCX từ PDF mẫu (${kind}) ${storageMode}${aiMsg ? ` — ${aiMsg}` : ""}`);
		} catch (err: any) {
			message.error(`Không thể tạo cấu hình DOCX từ PDF: ${err?.message || String(err)}`);
		} finally {
			setDocxAutoLoading(false);
		}
	}, [appId, docxSampleFile, docxTemplateUrl, editorMetadata, onApplyTrigger, patch, uiCfg, user?.app_token, value]);

	const patchUi = (partial: Partial<LineItemsUiConfig>) => {
		patch({ line_items_ui: { ...uiCfg, ...partial } });
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
					"Tab Trường bảng: f_li_auto + f_li_auto_format/f_li_auto_parse (hoặc JS fn). Tab Dòng hàng: cột, tổng, field_sections.",
				)}
			/>

			<Space wrap>
				<Button onClick={applyTemplate}>
					{t("system.menu.lineItemsLoadTemplate", "Nạp mẫu Phú Sơn (cột + tổng chung)")}
				</Button>
				{PHUSON_PRESET_OPTIONS.map(opt => (
					<Button
						key={opt.value}
						onClick={() => {
							if (onApplyMenuPreset) {
								onApplyMenuPreset(opt.value);
								return;
							}
							Modal.confirm({
								title: `Áp preset「${opt.label}」?`,
								content: "Cần handler onApplyMenuPreset từ form menu cha.",
								okText: t("common.confirm", "Xác nhận"),
								cancelText: t("common.cancel", "Huỷ"),
							});
						}}
					>
						Preset: {opt.label}
					</Button>
				))}
			</Space>

			<Row gutter={16}>
				<Col xs={24} md={12}>
					<Card size="small" title={t("system.menu.lineItemsStorageTitle", "Lưu trữ JSON")}>
						<Form layout="vertical" component={false}>
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
						<Form layout="vertical" component={false}>
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
							<Form.Item label={t("system.menu.lineItemsSubtotalLabel", "Mẫu dòng cộng nhóm")}>
								<Input
									value={groupCfg.subtotal_label ?? "Cộng nhóm {{group}} – chưa VAT {{vat}}%"}
									onChange={e => patch({
										line_items_group: { ...groupCfg, subtotal_label: e.target.value },
									})}
									placeholder="Cộng nhóm {{group}} – chưa VAT {{vat}}%"
								/>
							</Form.Item>
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
									rowKey={(r) => r.name || "col-new"}
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
									rowKey={(r) => r.field || "list-new"}
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
								<Alert
									type="info"
									showIcon
									style={{ marginBottom: 12 }}
									message={t("system.menu.lineItemsTotalsFormulaHint", "Công thức dòng tổng")}
									description="Biến: groupSum, vatSum(8), vatSum(10), A, B, C… (tham chiếu dòng trên). VD: vatSum(8)*0.08, A+B+C. Form nhập và phiếu in dùng chung line_items_totals."
								/>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => openTotalEditor()}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddTotal", "Thêm dòng tổng")}
								</Button>
								<Table
									size="small"
									rowKey={(r) => r.key || "tot-new"}
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
											render: (v) => (v ? "✓" : ""),
										},
										{
											title: "words",
											dataIndex: "show_words",
											render: (v) => (v ? "✓" : ""),
										},
										{
											title: t("common.action", "Thao tác"),
											width: 100,
											render: (_, __, idx) => (
												<Space>
													<Button type="link" size="small" icon={<EditOutlined />} onClick={() => openTotalEditor(idx)} />
													<Button
														type="link"
														size="small"
														danger
														icon={<DeleteOutlined />}
														onClick={() => patch({
															line_items_totals: (value.line_items_totals ?? []).filter((_, i) => i !== idx),
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
						key: "ui",
						label: t("system.menu.lineItemsTabUi", "Nhãn form"),
						children: (
							<Card size="small" title={t("system.menu.lineItemsUiTitle", "Nhãn giao diện runtime")}>
								<Alert
									type="info"
									showIcon
									style={{ marginBottom: 12 }}
									message={t("system.menu.lineItemsUiHint", "Tuỳ chọn — để trống dùng mặc định theo ngôn ngữ UI")}
								/>
								<Form layout="vertical" component={false}>
									{([
										["header_title", "Tiêu đề block header"],
										["list_title", "Tiêu đề danh sách"],
										["create_label", "Nhãn tạo mới"],
										["edit_label", "Nhãn chỉnh sửa"],
										["back_label", "Nút quay danh sách"],
									] as const).map(([key, hint]) => (
										<Row gutter={12} key={key}>
											<Col span={8}>
												<Form.Item label={`${hint} (VI)`}>
													<Input
														value={(uiCfg as any)[key] ?? ""}
														onChange={e => patch({
															line_items_ui: { ...uiCfg, [key]: e.target.value },
														})}
													/>
												</Form.Item>
											</Col>
											<Col span={8}>
												<Form.Item label={`${hint} (EN)`}>
													<Input
														value={(uiCfg as any)[`${key}_en`] ?? ""}
														onChange={e => patch({
															line_items_ui: { ...uiCfg, [`${key}_en`]: e.target.value },
														})}
													/>
												</Form.Item>
											</Col>
											<Col span={8}>
												<Form.Item label={`${hint} (ZH)`}>
													<Input
														value={(uiCfg as any)[`${key}_zh`] ?? ""}
														onChange={e => patch({
															line_items_ui: { ...uiCfg, [`${key}_zh`]: e.target.value },
														})}
													/>
												</Form.Item>
											</Col>
										</Row>
									))}
									<Form.Item label={t("system.menu.lineItemsDateRef", "Trường ngày tham chiếu (auto số)")}>
										<Select
											allowClear
											showSearch
											style={{ width: "100%" }}
											value={uiCfg.date_ref_field ?? undefined}
											options={fieldOptions}
											onChange={v => patch({
												line_items_ui: { ...uiCfg, date_ref_field: v || undefined },
											})}
											placeholder="ngay"
										/>
									</Form.Item>
									<Card size="small" title={t("system.menu.lineItemsFieldSections", "Nhóm field header (field_sections)")} style={{ marginTop: 12 }}>
										<Button
											type="dashed"
											icon={<PlusOutlined />}
											style={{ marginBottom: 12 }}
											onClick={() => patch({
												line_items_ui: {
													...uiCfg,
													field_sections: [...(uiCfg.field_sections ?? []), newFieldSection()],
												},
											})}
										>
											{t("system.menu.lineItemsAddSection", "Thêm nhóm")}
										</Button>
										<Table
											size="small"
											rowKey={(r) => r.key || "sec-new"}
											dataSource={uiCfg.field_sections ?? []}
											pagination={false}
											columns={[
												{
													title: "key",
													dataIndex: "key",
													width: 100,
													render: (v, _, idx) => (
														<Input
															value={v}
															onChange={e => {
																const secs = [...(uiCfg.field_sections ?? [])];
																secs[idx] = { ...secs[idx], key: e.target.value };
																patch({ line_items_ui: { ...uiCfg, field_sections: secs } });
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
																const secs = [...(uiCfg.field_sections ?? [])];
																secs[idx] = { ...secs[idx], label: e.target.value };
																patch({ line_items_ui: { ...uiCfg, field_sections: secs } });
															}}
														/>
													),
												},
												{
													title: "fields",
													dataIndex: "fields",
													render: (v: string[], _, idx) => (
														<Select
															mode="multiple"
															style={{ width: "100%" }}
															value={v ?? []}
															options={fieldOptions}
															onChange={vals => {
																const secs = [...(uiCfg.field_sections ?? [])];
																secs[idx] = { ...secs[idx], fields: vals };
																patch({ line_items_ui: { ...uiCfg, field_sections: secs } });
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
																line_items_ui: {
																	...uiCfg,
																	field_sections: (uiCfg.field_sections ?? []).filter((_, i) => i !== idx),
																},
															})}
														/>
													),
												},
											]}
										/>
									</Card>
									<Card size="small" title="Lọc danh sách (list_filter)" style={{ marginTop: 12 }}>
										<Button
											type="dashed"
											icon={<PlusOutlined />}
											style={{ marginBottom: 12 }}
											onClick={() => patchUi({
												list_filter: [...(uiCfg.list_filter ?? []), { field: "giai_doan", values: [] }],
											})}
										>
											Thêm bộ lọc
										</Button>
										<Table
											size="small"
											rowKey={(r) => r.field || "lf-new"}
											dataSource={uiCfg.list_filter ?? []}
											pagination={false}
											columns={[
												{
													title: "field",
													dataIndex: "field",
													width: 160,
													render: (v, _, idx) => (
														<Select
															style={{ width: "100%" }}
															showSearch
															value={v}
															options={fieldOptions}
															onChange={val => {
																const list = [...(uiCfg.list_filter ?? [])] as LineItemsListFilter[];
																list[idx] = { ...list[idx], field: val };
																patchUi({ list_filter: list });
															}}
														/>
													),
												},
												{
													title: "values",
													dataIndex: "values",
													render: (v: string[], _, idx) => (
														<Select
															mode="tags"
															style={{ width: "100%" }}
															value={v ?? []}
															placeholder="bao_gia, lenh_sx_nb…"
															onChange={vals => {
																const list = [...(uiCfg.list_filter ?? [])] as LineItemsListFilter[];
																list[idx] = { ...list[idx], values: vals };
																patchUi({ list_filter: list });
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
															onClick={() => patchUi({
																list_filter: (uiCfg.list_filter ?? []).filter((_, i) => i !== idx),
															})}
														/>
													),
												},
											]}
										/>
									</Card>
									<Card size="small" title="Mặc định khi tạo mới (default_header)" style={{ marginTop: 12 }}>
										<Button
											type="dashed"
											icon={<PlusOutlined />}
											style={{ marginBottom: 12 }}
											onClick={() => {
												const first = fieldOptions[0]?.value;
												if (!first) return;
												patchUi({
													default_header: { ...(uiCfg.default_header ?? {}), [first]: "" },
												});
											}}
										>
											Thêm field mặc định
										</Button>
										<Table
											size="small"
											rowKey={(r) => `dh-${r.field}`}
											dataSource={Object.entries(uiCfg.default_header ?? {}).map(([field, val]) => ({ field, val }))}
											pagination={false}
											columns={[
												{
													title: "field",
													dataIndex: "field",
													width: 160,
													render: (v) => <span>{v}</span>,
												},
												{
													title: "value",
													dataIndex: "val",
													render: (v, record) => (
														<Input
															value={String(v ?? "")}
															onChange={e => patchUi({
																default_header: {
																	...(uiCfg.default_header ?? {}),
																	[record.field]: e.target.value,
																},
															})}
														/>
													),
												},
												{
													title: "",
													width: 48,
													render: (_, record) => (
														<Button
															type="text"
															danger
															icon={<DeleteOutlined />}
															onClick={() => {
																const next = { ...(uiCfg.default_header ?? {}) };
																delete next[record.field];
																patchUi({ default_header: next });
															}}
														/>
													),
												},
											]}
										/>
									</Card>
									<Form.Item label="print_keys — nút in hiện trên form" style={{ marginTop: 12 }}>
										<Select
											mode="multiple"
											style={{ width: "100%" }}
											value={uiCfg.print_keys ?? []}
											options={printKeyOptions}
											placeholder="Chọn trigger_key hiển thị (vd. print_bao_gia)"
											onChange={vals => patchUi({ print_keys: vals })}
										/>
									</Form.Item>
								</Form>
							</Card>
						),
					},
					{
						key: "workflow",
						label: t("system.menu.lineItemsTabWorkflow", "Quy trình"),
						children: (
							<Card size="small" title={t("system.menu.lineItemsWorkflowTitle", "line_items_workflow")}>
								<Alert
									type="info"
									showIcon
									style={{ marginBottom: 12 }}
									message="Cấu hình bước chuyển giai đoạn (BG → LSXNB → PXK). JSON edit — hoặc nạp mẫu Phú Sơn."
								/>
								<Space style={{ marginBottom: 12 }}>
									<Button onClick={() => patch({ line_items_workflow: PHUSON_WORKFLOW })}>
										Nạp quy trình Phú Sơn
									</Button>
								</Space>
								<Input.TextArea
									rows={16}
									value={JSON.stringify(value.line_items_workflow ?? {}, null, 2)}
									onChange={(e) => {
										try {
											const parsed = JSON.parse(e.target.value || "{}") as LineItemsWorkflowConfig;
											patch({ line_items_workflow: parsed });
										} catch { /* ignore while typing */ }
									}}
									style={{ fontFamily: "monospace", fontSize: 12 }}
								/>
							</Card>
						),
					},
					{
						key: "print",
						label: t("system.menu.lineItemsTabPrint", "Nút in PDF"),
						children: (
							<>
								<Alert
									type="info"
									showIcon
									style={{ marginBottom: 12 }}
									message="Đã tối giản: chỉ dùng 1 chỗ tạo DOCX + trigger từ PDF trong Report settings (tab chung), không tạo ở tab Nút in này."
								/>
								<Alert
									type="warning"
									showIcon
									style={{ marginBottom: 12, marginTop: 16 }}
									message={t(
										"system.menu.lineItemsPrintTriggerHint",
										"Mỗi trigger_key cần có function body tương ứng trong tab Trigger (VD: print_bao_gia).",
									)}
								/>
								<Button
									type="dashed"
									icon={<PlusOutlined />}
									onClick={() => openPrintEditor()}
									style={{ marginBottom: 12 }}
								>
									{t("system.menu.lineItemsAddPrint", "Thêm nút in")}
								</Button>
								<Table
									size="small"
									rowKey={(r) => r.trigger_key || "print-new"}
									dataSource={value.line_items_print ?? []}
									pagination={false}
									columns={[
										{ title: "trigger_key", dataIndex: "trigger_key", width: 140 },
										{ title: "VI", dataIndex: "label" },
										{ title: "filename_expr", dataIndex: "filename_expr", ellipsis: true },
										{
											title: "print_table",
											width: 120,
											render: (_, r) => {
												const pt = r.print_table;
												if (!pt) return "—";
												return pt.showPrice === false ? "ẩn giá" : "đủ cột";
											},
										},
										{
											title: t("common.action", "Thao tác"),
											width: 100,
											render: (_, __, idx) => (
												<Space>
													<Button type="link" size="small" icon={<EditOutlined />} onClick={() => openPrintEditor(idx)} />
													<Button
														type="link"
														size="small"
														danger
														icon={<DeleteOutlined />}
														onClick={() => patch({
															line_items_print: (value.line_items_print ?? []).filter((_, i) => i !== idx),
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
						<Input.TextArea rows={2} placeholder="(field_a ?? 0) * (field_b ?? 0)" />
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

			<Modal
				open={totalModalOpen}
				title={totalEditingIdx != null
					? t("system.menu.lineItemsEditTotal", "Sửa dòng tổng")
					: t("system.menu.lineItemsAddTotal", "Thêm dòng tổng")}
				onCancel={() => setTotalModalOpen(false)}
				onOk={saveTotal}
				width={640}
				destroyOnClose
			>
				<Form form={totalForm} layout="vertical">
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="key" label="key" rules={[{ required: true }]}>
								<Input placeholder="A" />
							</Form.Item>
						</Col>
						<Col span={16}>
							<Form.Item name="formula" label="formula" rules={[{ required: true }]}>
								<Input placeholder="groupSum | vatSum(8)*0.08 | A+B+C" />
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="label" label="VI" rules={[{ required: true }]}>
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_en" label="EN">
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_zh" label="ZH">
								<Input />
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={12}>
							<Form.Item name="highlight" label="highlight" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="show_words" label="show_words (Bằng chữ)" valuePropName="checked">
								<Switch />
							</Form.Item>
						</Col>
					</Row>
				</Form>
			</Modal>

			<Modal
				open={printModalOpen}
				title={printEditingIdx != null ? "Sửa nút in PDF" : "Thêm nút in PDF"}
				onCancel={() => setPrintModalOpen(false)}
				onOk={savePrint}
				width={720}
				destroyOnClose
			>
				<Form form={printForm} layout="vertical">
					<Form.Item name="print_engine" label="print_engine" initialValue="html">
						<Select options={[{ label: "html", value: "html" }, { label: "docx", value: "docx" }]} />
					</Form.Item>
					<Row gutter={12}>
						<Col span={12}>
							<Form.Item name="trigger_key" label="trigger_key" rules={[{ required: true }]}>
								<Input placeholder="print_bao_gia" />
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="filename_expr" label="filename_expr">
								<Input placeholder="`BaoGia_${order.so_bao_gia}.pdf`" />
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="label" label="VI" rules={[{ required: true }]}>
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_en" label="EN">
								<Input />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="label_zh" label="ZH">
								<Input />
							</Form.Item>
						</Col>
					</Row>
					<Card size="small" title="print_table — tuỳ chọn cột bảng in">
						<Row gutter={12}>
							<Col span={8}>
								<Form.Item name="pt_showPrice" label="showPrice" valuePropName="checked">
									<Switch />
								</Form.Item>
							</Col>
							<Col span={8}>
								<Form.Item name="pt_showGroupSubtotal" label="showGroupSubtotal" valuePropName="checked">
									<Switch />
								</Form.Item>
							</Col>
							<Col span={8}>
								<Form.Item name="pt_showTotals" label="showTotals" valuePropName="checked">
									<Switch />
								</Form.Item>
							</Col>
						</Row>
						<Form.Item name="pt_hideColumns" label="hideColumns">
							<Select
								mode="multiple"
								allowClear
								options={columnNameOptions}
								placeholder="field_a, field_b, field_c..."
							/>
						</Form.Item>
					</Card>
					<Card size="small" title="print_pdf — cấu hình PDF động (JSON)" style={{ marginTop: 12 }}>
						<Alert
							type="info"
							showIcon
							style={{ marginBottom: 8 }}
							message={PRINT_PDF_HINT_EXAMPLE}
						/>
						<Form.Item name="print_pdf_json" label="print_pdf (JSON object)">
							<Input.TextArea rows={7} placeholder="{}" style={{ fontFamily: "monospace" }} />
						</Form.Item>
					</Card>
					<Card size="small" title="print_docx — cấu hình DOCX template" style={{ marginTop: 12 }}>
						<Form.Item name="print_docx_template_url" label="template_url">
							<Input placeholder="/reports/bao_gia_template.docx" />
						</Form.Item>
						<Row gutter={12}>
							<Col span={16}>
								<Form.Item name="print_docx_data_trigger_key" label="data_trigger_key">
									<Input placeholder="print_bao_gia_docx_data" />
								</Form.Item>
							</Col>
							<Col span={8}>
								<Form.Item name="print_docx_allow_download_docx" label="allow_download_docx" valuePropName="checked">
									<Switch />
								</Form.Item>
							</Col>
						</Row>
					</Card>
				</Form>
			</Modal>
		</div>
	);
}
