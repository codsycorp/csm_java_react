import { AI_TIMEOUT_MS } from "#src/api/ai";
import { extractCodeBlocks, extractLatestOpenCodeBlock } from "#src/pages/system/developer/codeUtils";
import { validateCode, collectWorkspaceDiagnostics, CodeDiagnostic } from "#src/pages/system/developer/useCodeEditor";
import { request } from "#src/utils";
import {
	BgColorsOutlined,
	ClearOutlined,
	CloseOutlined,
	CopyOutlined,
	DeleteOutlined,
	DislikeOutlined,
	FileImageOutlined,
	LikeOutlined,
	PaperClipOutlined,
	SendOutlined,
	ThunderboltOutlined,
	UndoOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Input, message, Popconfirm, Space, Spin, Tag, Tooltip } from "antd";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./AiAssistantChat.module.css";

export interface AiAssistantAttachment {
	id: string
	name: string
	mimeType: string
	size: number
	kind: "text" | "json" | "image"
	contextRole?: "system_requirement" | "legacy_json" | "business_logic" | "reference_code" | "general_text"
	authoritative?: boolean
	summary: string
	textContent?: string
	dataUrl?: string
	previewUrl?: string
	/** When true the entire file content is injected instead of snippet-based RAG */
	fullContext?: boolean
}

export interface AiAssistantUserMessagePayload {
	message: string
	attachments: AiAssistantAttachment[]
}

interface ChatMessage {
	id: string
	serverTurnId?: string
	requestId?: string
	appId?: string
	feedbackRating?: number
	role: "user" | "assistant" | "system"
	messageType?: "response" | "debug" | "compacted_context"
	responseMode?: ResponseMode
	content: string
	timestamp: number
	codeBlocks?: CodeBlock[]
	attachments?: Array<Pick<AiAssistantAttachment, "id" | "name" | "mimeType" | "size" | "kind" | "summary" | "previewUrl">>
	/** For compacted_context divider: chars saved by orchestration */
	compactedSavedChars?: number
	compactedCharsBefore?: number
	compactedCharsAfter?: number
	compactedRoutingTier?: string
	compactedPlanStepCount?: number
}

interface CodeBlock {
	language: string
	code: string
	index: number
}

type ResponseMode = "analyze" | "edit";

interface PatchValidatorMeta {
	inputCount?: number
	normalizedCount?: number
	acceptedCount?: number
	rejectedCount?: number
	rejectionReason?: string
}

interface PatchDryRunMeta {
	inputCount?: number
	acceptedCount?: number
	rejectedCount?: number
	conflictCount?: number
	rejectionReason?: string
	conflicts?: Array<{
		class?: string
		startLine?: number
		endLine?: number
		action?: string
	}>
}

interface QuickFixSuggestion {
	id: string
	title: string
	description?: string
	action: string
	payload: Record<string, any>
}

interface EditCandidate {
	id: string
	title: string
	description?: string
	textEdits: any[]
	lineRanges?: any[]
	riskLevel?: "low" | "medium" | "high"
	confidence?: number
	rationale?: string
	feedbackScore?: number
	ops?: {
		add?: number
		edit?: number
		delete?: number
	}
}

interface AgenticStep {
	id: string
	stage: string
	icon: string
	label: string
	detail?: string
	qualityScore?: number
	lowConfidence?: boolean
	riskScore?: number
	riskLevel?: "low" | "medium" | "high"
	approvalRequired?: boolean
	approvalReasons?: string[]
	approvalState?: "pending" | "approved" | "rejected"
	pendingTextEdits?: any[]
	stepIndex?: number
	stepTotal?: number
	patchValidator?: PatchValidatorMeta
	patchDryRun?: PatchDryRunMeta
	status: "planned" | "running" | "done"
	timestamp: number
}

interface OrchestrationPreviewResult {
	enabled: boolean
	totalCharsBefore: number
	totalCharsAfter: number
	savedChars: number
	routingTier: string
	preferredModelHint: string
	speculativeExecuted: boolean
	speculativeOperation: string
	planSteps: string[]
	toolStats: Record<string, number>
	compressedContextBlock: string
}

interface FileScope {
	filePath: string
	fileName: string
	language?: string
	description?: string
}

interface ScopedPatch {
	fileScope: FileScope
	patches: any[]
	status: "pending" | "applied" | "rejected"
	error?: string
}

interface StructuredAssistantPayload {
	summary: string
	code: string
	changes: string[]
}

interface AiAssistantStageEvent {
	id: string
	stage: string
	status?: string
	traceStatus?: string
	toolName?: string
	retryCount?: number
	errorClass?: string
	errorCode?: string
	model?: string
	requestId?: string
	scopeMask?: number
	scopeSummary?: string
	scopeTags?: string[]
	queueState?: string
	dynamicSource?: string
	prunedSources?: number
	tokens?: string[]
	message: string
	messageKey?: string
	messageArgs?: Record<string, any>
	detail?: string
	detailKey?: string
	detailArgs?: Record<string, any>
	orchestrationPhase?: string
	orchestrationPhaseKey?: string
	overallPercent?: number
	percent?: number
	current?: number
	total?: number
	rangeLabel?: string
	patchValidator?: PatchValidatorMeta
	patchDryRun?: PatchDryRunMeta
	riskScore?: number
	riskLevel?: string
	approvalRequired?: boolean
	approvalReasons?: string[]
	retrievalChars?: number
	minChars?: number
	deficit?: number
	retryApplied?: boolean
	timestamp: number
}

function normalizePatchValidatorMeta(raw: unknown): PatchValidatorMeta | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		return undefined;
	const input = raw as Record<string, unknown>;
	const toSafeInt = (value: unknown): number | undefined => {
		const num = Number(value);
		if (!Number.isFinite(num))
			return undefined;
		return Math.max(0, Math.floor(num));
	};
	const rejectionReason = String(input.rejectionReason || "").trim();
	const meta: PatchValidatorMeta = {
		inputCount: toSafeInt(input.inputCount),
		normalizedCount: toSafeInt(input.normalizedCount),
		acceptedCount: toSafeInt(input.acceptedCount),
		rejectedCount: toSafeInt(input.rejectedCount),
		rejectionReason: rejectionReason || undefined,
	};
	if (meta.inputCount == null && meta.normalizedCount == null && meta.acceptedCount == null && meta.rejectedCount == null && !meta.rejectionReason) {
		return undefined;
	}
	return meta;
}

function normalizePatchDryRunMeta(raw: unknown): PatchDryRunMeta | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		return undefined;
	const input = raw as Record<string, unknown>;
	const toSafeInt = (value: unknown): number | undefined => {
		const num = Number(value);
		if (!Number.isFinite(num))
			return undefined;
		return Math.max(0, Math.floor(num));
	};
	const conflicts = Array.isArray(input.conflicts)
		? input.conflicts
			.map((item) => {
				if (!item || typeof item !== "object" || Array.isArray(item))
					return null;
				const obj = item as Record<string, unknown>;
				return {
					class: String(obj.class || "").trim() || undefined,
					startLine: toSafeInt(obj.startLine),
					endLine: toSafeInt(obj.endLine),
					action: String(obj.action || "").trim() || undefined,
				};
			})
			.filter(Boolean) as PatchDryRunMeta["conflicts"]
		: undefined;
	const rejectionReason = String(input.rejectionReason || "").trim();
	const meta: PatchDryRunMeta = {
		inputCount: toSafeInt(input.inputCount),
		acceptedCount: toSafeInt(input.acceptedCount),
		rejectedCount: toSafeInt(input.rejectedCount),
		conflictCount: toSafeInt(input.conflictCount),
		rejectionReason: rejectionReason || undefined,
		conflicts,
	};
	if (meta.inputCount == null
		&& meta.acceptedCount == null
		&& meta.rejectedCount == null
		&& meta.conflictCount == null
		&& !meta.rejectionReason
		&& (!meta.conflicts || meta.conflicts.length === 0)) {
		return undefined;
	}
	return meta;
}

function isPatchValidatorRejected(meta?: PatchValidatorMeta): boolean {
	if (!meta)
		return false;
	const reason = String(meta.rejectionReason || "").trim().toLowerCase();
	if (reason && reason !== "none" && reason !== "validator_disabled")
		return true;
	const rejected = Number(meta.rejectedCount || 0);
	const accepted = Number(meta.acceptedCount || 0);
	return rejected > 0 && accepted <= 0;
}

function isPatchDryRunRejected(meta?: PatchDryRunMeta): boolean {
	if (!meta)
		return false;
	const reason = String(meta.rejectionReason || "").trim().toLowerCase();
	if (reason && reason !== "none" && reason !== "partial_conflicted")
		return true;
	const accepted = Number(meta.acceptedCount || 0);
	const rejected = Number(meta.rejectedCount || 0);
	return rejected > 0 && accepted <= 0;
}

function normalizeQuickFixSuggestions(raw: unknown): QuickFixSuggestion[] {
	if (!Array.isArray(raw))
		return [];
	const out: QuickFixSuggestion[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object" || Array.isArray(item))
			continue;
		const obj = item as Record<string, unknown>;
		const id = String(obj.id || "").trim();
		const title = String(obj.title || "").trim();
		const action = String(obj.action || "").trim().toLowerCase();
		const payload = obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
			? (obj.payload as Record<string, any>)
			: {};
		if (!id || !title || !action)
			continue;
		out.push({
			id,
			title,
			description: String(obj.description || "").trim() || undefined,
			action,
			payload,
		});
	}
	return out;
}

function normalizeEditCandidates(raw: unknown): EditCandidate[] {
	if (!Array.isArray(raw))
		return [];
	const out: EditCandidate[] = [];
	for (let i = 0; i < raw.length; i += 1) {
		const item = raw[i];
		if (!item || typeof item !== "object" || Array.isArray(item))
			continue;
		const obj = item as Record<string, unknown>;
		const textEdits = Array.isArray(obj.textEdits) ? obj.textEdits : [];
		if (textEdits.length === 0)
			continue;
		const id = String(obj.id || `candidate_${i + 1}`).trim();
		const title = String(obj.title || `Candidate ${i + 1}`).trim();
		const opsRaw = obj.ops && typeof obj.ops === "object" && !Array.isArray(obj.ops)
			? (obj.ops as Record<string, unknown>)
			: undefined;
		out.push({
			id,
			title,
			description: String(obj.description || "").trim() || undefined,
			textEdits,
			lineRanges: Array.isArray(obj.lineRanges) ? obj.lineRanges : undefined,
			riskLevel: ["low", "medium", "high"].includes(String(obj.riskLevel || "").trim().toLowerCase())
				? (String(obj.riskLevel || "").trim().toLowerCase() as "low" | "medium" | "high")
				: undefined,
			confidence: Number.isFinite(Number(obj.confidence)) ? Number(obj.confidence) : undefined,
			rationale: String(obj.rationale || "").trim() || undefined,
			feedbackScore: Number.isFinite(Number(obj.feedbackScore)) ? Number(obj.feedbackScore) : undefined,
			ops: opsRaw
				? {
					add: Number.isFinite(Number(opsRaw.add)) ? Number(opsRaw.add) : undefined,
					edit: Number.isFinite(Number(opsRaw.edit)) ? Number(opsRaw.edit) : undefined,
					delete: Number.isFinite(Number(opsRaw.delete)) ? Number(opsRaw.delete) : undefined,
				}
				: undefined,
		});
	}
	return out;
}

function parsePreviewCitationSources(block: string): Array<{
	title: string
	path?: string
	scope?: string
	score?: string
	summary?: string
	content?: string
}> {
	const text = String(block || "").trim();
	if (!text) {
		return [];
	}

	const sources: Array<{
		title: string
		path?: string
		scope?: string
		score?: string
		summary?: string
		content?: string
	}> = [];
	const sections = text.split(/\n(?=###\s+Hit\s+\d+)/g);
	for (const section of sections) {
		if (!/###\s+Hit\s+/i.test(section)) {
			continue;
		}
		const path = (section.match(/\npath:\s*(.+)$/im)?.[1] || "").trim();
		const scope = (section.match(/\nscope:\s*(.+)$/im)?.[1] || "").trim();
		const score = (section.match(/\nscore:\s*(.+)$/im)?.[1] || "").trim();
		const summary = (section.match(/\nsummary:\s*(.+)$/im)?.[1] || "").trim();
		const content = (section.match(/\ncontent:\s*\n([\s\S]*)$/im)?.[1] || "").trim();
		sources.push({
			title: path || summary || `Source ${sources.length + 1}`,
			path: path || undefined,
			scope: scope || undefined,
			score: score || undefined,
			summary: summary || undefined,
			content: content || undefined,
		});
		if (sources.length >= 6) {
			break;
		}
	}
	return sources;
}

function parseCitationLocation(raw: string): { path?: string; line?: number } {
	const text = String(raw || "").trim();
	if (!text) {
		return {};
	}

	const hashLineMatch = text.match(/^(.*?)(?:#L|:)(\d+)(?::\d+)?$/i);
	if (hashLineMatch) {
		return {
			path: hashLineMatch[1]?.trim() || undefined,
			line: Number(hashLineMatch[2]),
		};
	}

	const lineLabelMatch = text.match(/^(.*?)[\s,]+line\s+(\d+)$/i);
	if (lineLabelMatch) {
		return {
			path: lineLabelMatch[1]?.trim() || undefined,
			line: Number(lineLabelMatch[2]),
		};
	}

	return { path: text || undefined };
}

interface AiUsageSummary {
	enabled: boolean
	model: string
	promptTokens: number
	completionTokens: number
	totalTokens: number
	estimatedCostUsd: number
	currency?: string
}

interface CompletionMetrics {
	elapsedMs?: number
	outputChars?: number
	streamedChars?: number
	streamChunkCount?: number
	streamAssemblyMismatch?: boolean
	promptOriginalChars?: number
	promptFinalChars?: number
	promptCapChars?: number
	promptTruncatedByCharCap?: boolean
	menuShrinkGuard?: boolean
	menuShrinkRatio?: number
	patchFallbackNoOp?: boolean
	patchFallbackReasonCode?: string
}

interface ModelDecisionTrace {
	id: string
	step: "primary" | "fallback" | "final"
	model: string
	reason?: string
	timestamp: number
}

interface AiStreamPartsManifest {
	jobId: string
	totalParts: number
	totalChars?: number
	status?: string
	createdAt?: number
	updatedAt?: number
}

interface AiStreamPartMeta {
	partIndex: number
	label: string
	chars: number
}

interface AiStreamPartsMetaPage {
	jobId: string
	page: number
	size: number
	totalParts: number
	totalPages: number
	items: AiStreamPartMeta[]
}

interface LocalFlowOperationSummary {
	verified: boolean
	flow: "code" | "menu_json" | ""
	addCount: number
	editCount: number
	deleteCount: number
	reason?: string
}

interface LocalFlowOperationLine {
	action: "add" | "edit" | "delete"
	lineLabel: string
	snippet: string
}

type LocalFlowOperationFilter = "all" | "add" | "edit" | "delete";
type CompletionState = "idle" | "done" | "review_required" | "stream_closed" | "error" | "cancelled";

interface ChatRuntimeSnapshot {
	agenticSteps: AgenticStep[]
	completionState: CompletionState
	streamRequestId?: string
	updatedAt: number
}

interface AiAssistantChatProps {
	appId: string
	currentCode?: string
	language?: "javascript" | "html" | "python" | "java" | "css" | "sql" | "json"
	contextType?: "code" | "menu_json"
	targetPName?: string
	targetPType?: number
	editorMetadata?: Record<string, unknown>
	onCodeInsert?: (code: string) => void
	/** Called immediately for each individual line-range edit — enables precise CodeMirror dispatch instead of full-file replacement */
	onApplyLineEdit?: (edit: { startLine: number; endLine: number; replacement: string; action: string }) => void
	onCitationNavigate?: (location: { path?: string; line?: number; token: string }) => void
	onUserMessage?: (payload: AiAssistantUserMessagePayload) => void
	autoApplyCodeBlock?: boolean
	autoApplyPreferenceKey?: string
	onAutoApplyChange?: (enabled: boolean) => void
}

const CHAT_HISTORY_KEY = "codeeditor.aiassistant.chat.v1";
const LEGACY_CHAT_HISTORY_KEY = "codeeditor.copilot.chat.v1";
const CHAT_RUNTIME_KEY_PREFIX = "codeeditor.aiassistant.runtime.v1";
const PROMPT_HISTORY_KEY_PREFIX = "codeeditor.aiassistant.promptHistory.v1";
const PROMPT_HISTORY_LIMIT = 50;
const CHAT_STORAGE_LIMIT = 20;
const MAX_ATTACHMENTS = 8;
const MAX_TEXT_ATTACHMENT_CHARS = 800000;
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
const STREAM_UI_FLUSH_MS = 48;
const STREAM_CODEBLOCK_PARSE_MS = 240;
const MAX_CHAT_INPUT_CHARS = 20000;
const MAX_STRUCTURED_TEXT_EDITS = 160;
const MAX_STRUCTURED_REPLACEMENT_CHARS = 800000;
const SHOW_DETAILED_PROGRESS_TIMELINE = true;
const COMPACT_STAGE_EVENTS = 4;
const COMPACT_MODEL_TRACE = 1;
const DONE_DOCK_AUTO_COLLAPSE_MS = 3500;
const DONE_USAGE_DOCK_AUTO_HIDE_MS = 6500;
const PROGRESS_WATCHDOG_SILENCE_MS = 15_000;
const PROGRESS_WATCHDOG_TICK_MS = 3_000;
const PROGRESS_WATCHDOG_ALERT_INTERVAL_MS = 30_000;
const PROGRESS_EVENT_AGE_TICK_MS = 2_000;

const SLASH_COMMANDS = [
	{ command: "/analyze", label: "Analyze", description: "Analyze current code or selection" },
	{ command: "/edit", label: "Edit", description: "Request an immediately applicable patch" },
	{ command: "/local-plan", label: "Local Plan", description: "Preview local orchestration plan" },
	{ command: "/fix", label: "Fix", description: "Focus on current errors or diagnostics" },
	{ command: "/help", label: "Help", description: "Show available assistant commands" },
];
const TEXT_FILE_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"json",
	"js",
	"ts",
	"tsx",
	"jsx",
	"java",
	"sql",
	"css",
	"scss",
	"less",
	"html",
	"xml",
	"yml",
	"yaml",
	"csv",
	"py",
	"properties",
	"env",
	"log",
	"ini",
]);

function sanitizeHistoryMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages.slice(-CHAT_STORAGE_LIMIT).map(msg => ({
		...msg,
		attachments: Array.isArray(msg.attachments)
			? msg.attachments.map(attachment => ({
				id: attachment.id,
				name: attachment.name,
				mimeType: attachment.mimeType,
				size: attachment.size,
				kind: attachment.kind,
				summary: attachment.summary,
			}))
			: undefined,
	}));
}

function normalizeMessageContentKey(content: string): string {
	return String(content || "").replace(/\s+/g, " ").trim();
}

function buildChatMessageDedupeKey(message: ChatMessage): string {
	const serverTurnId = String(message.serverTurnId || "").trim();
	if (serverTurnId) {
		return `turn:${serverTurnId}:${message.role}:${message.messageType || "response"}`;
	}

	const normalizedContent = normalizeMessageContentKey(message.content);
	const attachmentKey = Array.isArray(message.attachments)
		? message.attachments.map(attachment => `${attachment.name}:${attachment.kind}:${attachment.size}`).join("|")
		: "";
	const timestampBucket = Number.isFinite(message.timestamp)
		? Math.floor(message.timestamp / 1000)
		: 0;

	if (normalizedContent || attachmentKey) {
		return `snapshot:${message.role}:${message.messageType || "response"}:${message.responseMode || "none"}:${timestampBucket}:${normalizedContent}:${attachmentKey}`;
	}

	return `id:${message.id}`;
}

function mergeChatMessages(previous: ChatMessage, next: ChatMessage): ChatMessage {
	const previousContent = String(previous.content || "");
	const nextContent = String(next.content || "");
	const preferNextContent = nextContent.length >= previousContent.length;

	return {
		...previous,
		...next,
		id: next.id || previous.id,
		serverTurnId: next.serverTurnId || previous.serverTurnId,
		requestId: next.requestId || previous.requestId,
		appId: next.appId || previous.appId,
		content: preferNextContent ? nextContent : previousContent,
		timestamp: Math.max(previous.timestamp || 0, next.timestamp || 0),
		codeBlocks: Array.isArray(next.codeBlocks) && next.codeBlocks.length > 0 ? next.codeBlocks : previous.codeBlocks,
		attachments: Array.isArray(next.attachments) && next.attachments.length > 0 ? next.attachments : previous.attachments,
		feedbackRating: typeof next.feedbackRating === "number" ? next.feedbackRating : previous.feedbackRating,
		responseMode: next.responseMode || previous.responseMode,
		messageType: next.messageType || previous.messageType,
	};
}

function dedupeChatMessages(messages: ChatMessage[]): ChatMessage[] {
	const orderedKeys: string[] = [];
	const deduped = new Map<string, ChatMessage>();

	for (const message of messages) {
		const key = buildChatMessageDedupeKey(message);
		const existing = deduped.get(key);
		if (!existing) {
			orderedKeys.push(key);
			deduped.set(key, message);
			continue;
		}
		deduped.set(key, mergeChatMessages(existing, message));
	}

	return orderedKeys.map(key => deduped.get(key)!).filter(Boolean);
}

function getFileExtension(name: string): string {
	const normalized = String(name || "").trim().toLowerCase();
	const idx = normalized.lastIndexOf(".");
	return idx >= 0 ? normalized.slice(idx + 1) : "";
}

function isMarkdownLikeName(name: string): boolean {
	const normalized = String(name || "").trim().toLowerCase();
	return normalized.endsWith(".md")
	  || normalized.endsWith(".markdown")
	  || normalized.endsWith(".txt")
	  || normalized.includes("prompt")
	  || normalized.includes("requirement")
	  || normalized.includes("spec")
	  || normalized.includes("architecture")
	  || normalized.includes("system");
}

function isCodeLikeName(name: string): boolean {
	const ext = getFileExtension(name);
	return new Set(["js", "jsx", "ts", "tsx", "java", "sql", "html", "css", "scss", "less", "xml", "yml", "yaml", "py", "properties"]).has(ext);
}

function classifyAttachmentContext(name: string, mimeType: string, kind: AiAssistantAttachment["kind"], contextType: AiAssistantChatProps["contextType"]): {
	contextRole: NonNullable<AiAssistantAttachment["contextRole"]>
	authoritative: boolean
	defaultFullContext: boolean
} {
	const normalizedName = String(name || "").trim().toLowerCase();
	const normalizedMimeType = String(mimeType || "").trim().toLowerCase();
	const menuFlow = contextType === "menu_json";

	if (kind === "json" || normalizedName.endsWith(".json") || normalizedName.startsWith("untitled-")) {
		return {
			contextRole: menuFlow ? "legacy_json" : "reference_code",
			authoritative: menuFlow,
			defaultFullContext: true,
		};
	}

	if (isMarkdownLikeName(normalizedName) || normalizedMimeType.includes("markdown")) {
		return {
			contextRole: "system_requirement",
			authoritative: true,
			defaultFullContext: true,
		};
	}

	if (isCodeLikeName(normalizedName) || normalizedMimeType.includes("javascript") || normalizedMimeType.includes("typescript") || normalizedMimeType.includes("java") || normalizedMimeType.includes("sql")) {
		return {
			contextRole: menuFlow ? "business_logic" : "reference_code",
			authoritative: menuFlow,
			defaultFullContext: menuFlow,
		};
	}

	return {
		contextRole: "general_text",
		authoritative: false,
		defaultFullContext: false,
	};
}

function isTextLikeFile(file: File): boolean {
	if (file.type.startsWith("text/"))
		return true;
	if (["application/json", "application/xml"].includes(file.type))
		return true;
	return TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

function summarizeAttachmentText(text: string, maxLength = 180): string {
	const compact = String(text || "").replace(/\s+/g, " ").trim();
	if (!compact)
		return "";
	return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}

function summarizeFileContent(file: File, textContent: string): string {
	const ext = getFileExtension(file.name);
	if (ext === "json") {
		try {
			const parsed = JSON.parse(textContent);
			if (Array.isArray(parsed))
				return `JSON array (${parsed.length} items)`;
			if (parsed && typeof parsed === "object")
				return `JSON object (${Object.keys(parsed).length} keys)`;
		}
		catch {
			return summarizeAttachmentText(textContent);
		}
	}
	return summarizeAttachmentText(textContent);
}

function createAttachmentId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const menuEditorApplyFetchInflight = new Map<string, Promise<string>>();

async function fetchMenuEditorApplyPayload(requestId: string): Promise<string> {
	const safeRequestId = String(requestId || "").trim();
	if (!safeRequestId)
		return "";
	const inflight = menuEditorApplyFetchInflight.get(safeRequestId);
	if (inflight)
		return inflight;
	const task = (async () => {
		try {
			const response = await request.get("ai-code-stream/menu-editor-apply", {
				searchParams: { requestId: safeRequestId },
				timeout: AI_TIMEOUT_MS,
			});
			const payload = await response.json() as { success?: boolean; menuJson?: string };
			if (!payload?.success)
				return "";
			return String(payload.menuJson || "").trim();
		} catch {
			return "";
		} finally {
			menuEditorApplyFetchInflight.delete(safeRequestId);
		}
	})();
	menuEditorApplyFetchInflight.set(safeRequestId, task);
	return task;
}

function extractMenuDraftForEditor(raw: unknown): string {
	const text = String(raw || "").trim();
	if (!text)
		return "";

	const parseMenuPayload = (candidate: string): string => {
		const value = String(candidate || "").trim();
		if (!value)
			return "";
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return JSON.stringify({ menu: parsed }, null, 2);
			}
			if (parsed && typeof parsed === "object") {
				const obj = parsed as Record<string, unknown>;

				if (typeof obj.code === "string" && obj.code.trim()) {
					const fromCode = parseMenuPayload(obj.code);
					if (fromCode)
						return fromCode;
				}

				if (Array.isArray(obj.menu)) {
					// Editor expects menu payload only, not summary/code wrapper keys.
					return JSON.stringify({ menu: obj.menu }, null, 2);
				}
				if (Array.isArray(obj.menus)) {
					return JSON.stringify({ menu: obj.menus }, null, 2);
				}

				if (obj.data && typeof obj.data === "object") {
					const nested = obj.data as Record<string, unknown>;
					if (Array.isArray(nested.menu)) {
						return JSON.stringify({ menu: nested.menu }, null, 2);
					}
				}

				const maybeNode = Boolean(typeof obj.id === "string" && obj.id.trim())
				  && ("children" in obj || "table" in obj || "type_form" in obj || "table_name" in obj);
				if (maybeNode) {
					return JSON.stringify({ menu: [obj] }, null, 2);
				}
			}
		}
		catch {
			return "";
		}
		return "";
	};

	const direct = parseMenuPayload(text);
	if (direct)
		return direct;

	const strippedFence = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();
	const stripped = parseMenuPayload(strippedFence);
	if (stripped)
		return stripped;

	const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
	let match: RegExpExecArray | null;
	while ((match = fenceRegex.exec(text)) !== null) {
		const fromFence = parseMenuPayload(match[1]);
		if (fromFence)
			return fromFence;
	}

	try {
		// Fallback: locate the first JSON object in mixed text and attempt parse.
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start >= 0 && end > start) {
			return parseMenuPayload(text.slice(start, end + 1));
		}
	}
	catch {
		return "";
	}
	return "";
}

function extractValidJsonCandidate(rawText: string): string | null {
	const text = String(rawText || "").trim();
	if (!text)
		return null;
	const candidates: string[] = [text];
	const pushCandidate = (raw: string) => {
		const candidate = String(raw || "").trim();
		if (!candidate)
			return;
		if (!candidates.includes(candidate)) {
			candidates.push(candidate);
		}
	};

	for (const fenceMatch of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
		if (fenceMatch?.[1]) {
			pushCandidate(String(fenceMatch[1]));
		}
	}

	const objectStarts: number[] = [];
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "{") {
			objectStarts.push(i);
		}
	}
	for (const start of objectStarts.slice(0, 12)) {
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let i = start; i < text.length; i += 1) {
			const ch = text[i];
			if (inString) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === "\\") {
					escaped = true;
					continue;
				}
				if (ch === '"') {
					inString = false;
				}
				continue;
			}
			if (ch === '"') {
				inString = true;
				continue;
			}
			if (ch === "{") {
				depth += 1;
			}
			else if (ch === "}") {
				depth -= 1;
				if (depth === 0) {
					pushCandidate(text.slice(start, i + 1));
					break;
				}
				if (depth < 0) {
					break;
				}
			}
		}
	}

	const objStart = text.indexOf("{");
	const objEnd = text.lastIndexOf("}");
	if (objStart >= 0 && objEnd > objStart) {
		pushCandidate(text.slice(objStart, objEnd + 1));
	}

	for (const candidate of candidates) {
		try {
			JSON.parse(candidate);
			return candidate;
		}
		catch {
			// try next candidate
		}
	}

	return null;
}

function sanitizeBusinessDisplayValue(key: string, renderedValue: string): string {
	const normalizedKey = String(key || "").trim().toLowerCase();
	const normalizedValue = String(renderedValue || "").trim();
	if (!normalizedValue)
		return "";
	if (normalizedKey.includes("luong_xu_ly") && /^\d{3,}$/.test(normalizedValue)) {
		return "";
	}
	if ((normalizedKey.includes("rui_ro") || normalizedKey.includes("risk"))
		&& /^(n\/a|na|none|khong\s+co|không\s+có)$/i.test(normalizedValue)) {
		return "";
	}
	return normalizedValue;
}

function parseStructuredAssistantPayload(raw: unknown): StructuredAssistantPayload | null {
	const candidate = extractValidJsonCandidate(String(raw || ""));
	if (!candidate)
		return null;

	try {
		const parsed = JSON.parse(candidate);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return null;
		}
		const payload = parsed as Record<string, unknown>;
		const code = typeof payload.code === "string" ? payload.code.trim() : "";
		if (!code)
			return null;
		return {
			summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
			code,
			changes: Array.isArray(payload.changes)
				? payload.changes.map(item => String(item || "").trim()).filter(Boolean)
				: [],
		};
	}
	catch {
		return null;
	}
}

function renderJsonAnswerForChat(raw: unknown, depth = 0): string {
	if (raw == null || depth > 3)
		return "";
	if (typeof raw === "string")
		return raw.trim();
	if (typeof raw === "number" || typeof raw === "boolean")
		return String(raw);
	if (Array.isArray(raw)) {
		return raw
			.slice(0, 8)
			.map(item => renderJsonAnswerForChat(item, depth + 1))
			.filter(Boolean)
			.map(item => `- ${item.replace(/\s+/g, " ").trim()}`)
			.join("\n")
			.trim();
	}
	if (typeof raw === "object") {
		return Object.entries(raw as Record<string, unknown>)
			.slice(0, 6)
			.map(([key, value]) => {
				const rendered = sanitizeBusinessDisplayValue(key, renderJsonAnswerForChat(value, depth + 1));
				if (!rendered)
					return "";
				return rendered.includes("\n")
					? `${key}:\n${rendered}`
					: `${key}: ${rendered}`;
			})
			.filter(Boolean)
			.join("\n")
			.trim();
	}
	return String(raw).trim();
}

function decodeJsonLikeString(value: string): string {
	try {
		return JSON.parse(`"${value}"`);
	}
	catch {
		return value.replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
	}
}

function renderLooseJsonLikeAnswer(raw: unknown): string | null {
	const text = String(raw || "").trim();
	if (!text)
		return null;
	const start = Math.max(text.indexOf("{"), text.indexOf("["));
	const candidate = start >= 0 ? text.slice(start).trim() : text;
	if (!(candidate.startsWith("{") || candidate.startsWith("[")))
		return null;

	const quoted = Array.from(candidate.matchAll(/"((?:[^"\\]|\\.)*)"/g))
		.map(match => decodeJsonLikeString(match[1]).trim())
		.filter(Boolean);
	if (!quoted.length)
		return null;

	if (candidate.startsWith("{") && /"(?:[^"\\]|\\.)*"\s*:\s*\[/.test(candidate) && quoted.length >= 2) {
		const [title, ...items] = quoted;
		return `${title}:\n${items.slice(0, 8).map(item => `- ${item}`).join("\n")}`.trim();
	}

	if (candidate.startsWith("{")) {
		const [title, ...rest] = quoted;
		if (!rest.length)
			return title || null;
		if (rest.length === 1)
			return `${title}: ${rest[0]}`.trim();
		return `${title}:\n${rest.slice(0, 8).map(item => `- ${item}`).join("\n")}`.trim();
	}

	return quoted.slice(0, 8).map(item => `- ${item}`).join("\n").trim() || null;
}

function sanitizeBrokenConversationalWrapper(raw: unknown): string | null {
	const text = String(raw || "").trim();
	if (!text)
		return null;
	const looksLikeRealJson = /^\s*[\[{]\s*"/.test(text) || text.includes('":') || text.includes('"');
	if (looksLikeRealJson)
		return null;

	let out = text;
	if (out.startsWith("{") || out.startsWith("["))
		out = out.slice(1).trim();
	if (out.endsWith("}") || out.endsWith("]"))
		out = out.slice(0, -1).trim();
	return out || null;
}

function normalizeConversationalJsonAnswer(raw: unknown): string | null {
	const candidate = extractValidJsonCandidate(String(raw || ""));
	if (candidate) {
		try {
			const parsed = JSON.parse(candidate);
			const rendered = renderJsonAnswerForChat(parsed, 0).trim();
			if (rendered)
				return rendered;
		}
		catch {
			// Fall through to truncated JSON-like fallback.
		}
	}
	return renderLooseJsonLikeAnswer(raw) || sanitizeBrokenConversationalWrapper(raw);
}

function normalizeBrokenListLineBreaks(raw: unknown): string {
	let text = String(raw || "").trim();
	if (!text)
		return "";

	text = text
		.replace(/\\r\\n/g, "\n")
		.replace(/\\n/g, "\n")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n");

	// Handle malformed separators like ":n1." or ".n- " from streamed/plain payloads.
	text = text
		.replace(/([:.!?])\s*n(?=\d{1,2}\.\s)/g, "$1\n")
		.replace(/([:.!?])\s*n(?=[-*•]\s)/g, "$1\n");

	return text.replace(/\n{3,}/g, "\n\n").trim();
}

function collapseRepeatedPromptEchoBlocks(raw: unknown): string {
	const source = String(raw || "").trim();
	if (!source)
		return "";

	const dedupeRequirementLines = (block: string): string => {
		const seen = new Set<string>();
		const keptLines: string[] = [];
		for (const rawLine of block.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
			const line = String(rawLine || "");
			const trimmed = line.trim();
			if (!trimmed) {
				if (keptLines.length > 0 && keptLines[keptLines.length - 1] !== "") {
					keptLines.push("");
				}
				continue;
			}
			const normalizedLine = trimmed.replace(/\s+/g, " ").trim().toLowerCase();
			const isRequirementHeading = /^#{1,3}\s*yêu\s*cầu\b/i.test(trimmed)
				|| /^#{1,3}\s*yeu\s*cau\b/i.test(trimmed)
				|| /^yêu\s*cầu\s*:/i.test(trimmed)
				|| /^yeu\s*cau\s*:/i.test(trimmed);
			const shouldDedupeLine = isRequirementHeading || normalizedLine.length >= 48;
			if (shouldDedupeLine) {
				if (seen.has(normalizedLine)) {
					continue;
				}
				seen.add(normalizedLine);
			}
			keptLines.push(line);
		}
		return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	}

	const blocks = source
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split(/\n{2,}/)
		.map(block => block.trim())
		.filter(Boolean);
	if (blocks.length <= 1)
		return dedupeRequirementLines(source) || source;

	const seenLongBlocks = new Set<string>();
	const seenRequirementBlocks = new Set<string>();
	const kept: string[] = [];

	for (const block of blocks) {
		const cleanedBlock = dedupeRequirementLines(block);
		const normalized = cleanedBlock.replace(/\s+/g, " ").trim();
		if (!normalized) {
			continue;
		}
		const isRequirementBlock = /^#{1,3}\s*yêu\s*cầu\b/i.test(cleanedBlock)
			|| /^#{1,3}\s*yeu\s*cau\b/i.test(cleanedBlock)
			|| /^yêu\s*cầu\s*:/i.test(cleanedBlock)
			|| /^yeu\s*cau\s*:/i.test(cleanedBlock)
			|| /^-{2,}\s*yêu\s*cầu/i.test(cleanedBlock)
			|| /^-{2,}\s*yeu\s*cau/i.test(cleanedBlock);
		if (isRequirementBlock) {
			if (seenRequirementBlocks.has(normalized)) {
				continue;
			}
			seenRequirementBlocks.add(normalized);
			kept.push(cleanedBlock);
			continue;
		}
		if (normalized.length >= 80) {
			if (seenLongBlocks.has(normalized)) {
				continue;
			}
			seenLongBlocks.add(normalized);
		}
		kept.push(cleanedBlock);
	}

	return kept.join("\n\n").trim() || source;
}

function normalizeAssistantDisplayText(raw: unknown): string {
	const text = stripInternalOrchestrationLeakLines(String(raw || "")).trim();
	if (!text)
		return "";

	const structuredPayload = parseStructuredAssistantPayload(text);
	if (structuredPayload) {
		const structuredText = [
			structuredPayload.summary,
			structuredPayload.changes.length
				? structuredPayload.changes.map(item => `- ${item}`).join("\n")
				: "",
		].filter(Boolean).join("\n\n").trim();
		if (structuredText)
			return structuredText;
	}

	const sanitizedPromptEcho = collapseRepeatedPromptEchoBlocks(text);
	const conversationalJsonText = normalizeConversationalJsonAnswer(sanitizedPromptEcho);
	return normalizeBrokenListLineBreaks(conversationalJsonText || sanitizedPromptEcho);
}

function stripInternalOrchestrationLeakLines(raw: unknown): string {
	const source = String(raw || "");
	if (!source.trim())
		return "";

	const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
	const out: string[] = [];
	let leakTailBudget = 0;
	let skipPromptBlock = false;
	let skipRagBlock = false;
	let skipSessionBlock = false;
	for (const rawLine of lines) {
		const line = String(rawLine || "");
		const lowered = line.trim().toLowerCase();

		if (skipRagBlock) {
			if (lowered.startsWith("## ")) {
				skipRagBlock = false;
			}
			else {
				continue;
			}
		}

		if (skipSessionBlock) {
			if (lowered.startsWith("## ")) {
				skipSessionBlock = false;
			}
			else {
				continue;
			}
		}

		if (skipPromptBlock) {
			if (lowered.startsWith("## ") || lowered.startsWith("# ")) {
				skipPromptBlock = false;
			}
			else {
				continue;
			}
		}

		if (leakTailBudget > 0) {
			const boundaryLine = !lowered
				|| /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/.test(lowered)
				|| lowered.startsWith("## ")
				|| lowered.startsWith("### ");
			if (!boundaryLine) {
				leakTailBudget -= 1;
				continue;
			}
			leakTailBudget = 0;
		}

		if (lowered.startsWith("## customer business memory") || lowered.includes("lucene vector rag")) {
			skipRagBlock = true;
			continue;
		}
		if (lowered.startsWith("## backend session context")) {
			skipSessionBlock = true;
			continue;
		}
		if (lowered.startsWith("# csm ai menu master prompt")
			|| lowered.startsWith("# csm ai code master prompt")
			|| lowered.startsWith("## auto_loaded_menu_system_knowledge")
			|| lowered.startsWith("## quy tắc ngôn ngữ đầu ra")
			|| lowered.startsWith("## quy tac ngon ngu dau ra")
			|| lowered.startsWith("quy tắc ngôn ngữ đầu ra")
			|| lowered.startsWith("quy tac ngon ngu dau ra")) {
			skipPromptBlock = true;
			continue;
		}

		const leakedDynSource = lowered.startsWith("dyn_ctx_orchestration_")
			|| lowered.startsWith("dyn_ctx_currentcode")
			|| lowered.startsWith("dyn_ctx_")
			|| lowered.includes("dyn_ctx_")
			|| lowered.startsWith("### memory ")
			|| lowered.startsWith("source=primary_flow")
			|| lowered.startsWith("source=multimodal")
			|| lowered.includes("source=primary_flow")
			|| lowered.includes("source=multimodal")
			|| (lowered.startsWith("source=")
				&& (lowered.includes("primary_flow") || lowered.includes("multimodal") || lowered.includes("orchestration")))
			|| lowered.startsWith("source: dyn_ctx_")
			|| lowered.startsWith("request=")
			|| lowered.startsWith("intentkeywords=")
			|| lowered.startsWith("codesymbols=")
			|| lowered.startsWith("contexttype=")
			|| lowered.startsWith("tasktype=")
			|| lowered.startsWith("orchestration_dynamic_memory_source=")
			|| lowered.startsWith("[reused_context]")
			|| lowered.startsWith("[session_continuity]")
			|| lowered.startsWith("[current_request]")
			|| lowered.startsWith("## user_memory")
			|| lowered.startsWith("### turn [")
			|| lowered.startsWith("source:")
			|| lowered.startsWith("score:")
			|| lowered === "content:"
			|| lowered.startsWith("localscanner")
			|| lowered.startsWith("scanner_")
			|| /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/.test(lowered)
			|| (lowered.startsWith("input") && lowered.includes("checked:"));
		if (leakedDynSource) {
			leakTailBudget = Math.max(leakTailBudget, 26);
			continue;
		}

		out.push(line);
	}

	return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function toStringList(raw: unknown): string[] {
	if (!Array.isArray(raw))
		return [];
	return raw.map(item => String(item || "").trim()).filter(Boolean);
}

function looksLikeStructuredPayload(raw: unknown): boolean {
	const text = String(raw || "").trim();
	if (!text)
		return false;
	return text.startsWith("{") && (/"summary"\s*:/.test(text) || /"code"\s*:/.test(text));
}

/** Parse a JSON payload that contains only textEdits (no full code field). */
function parseTextEditsOnlyPayload(raw: unknown): any[] | null {
	const candidate = extractValidJsonCandidate(String(raw || ""));
	if (!candidate)
		return null;
	try {
		const parsed = JSON.parse(candidate);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return null;
		const payload = parsed as Record<string, unknown>;
		// Only activate when there is no full-code field — textEdits-only mode.
		if (typeof payload.code === "string" && payload.code.trim())
			return null;
		const edits = (payload.textEdits ?? payload.text_edits) as unknown;
		if (!Array.isArray(edits) || edits.length === 0)
			return null;
		return edits;
	}
	catch {
		return null;
	}
}

function applyTextEditsToDraft(baseText: string, textEdits: any[]): string {
	if (!Array.isArray(textEdits) || textEdits.length === 0)
		return baseText;
	const lines = String(baseText || "").split("\n");
	const normalizeLine = (edit: any, key: "start" | "end"): number => {
		if (key === "start") {
			return Number(edit?.startLine ?? edit?.range?.startLine ?? edit?.range?.start?.line ?? edit?.line ?? 1);
		}
		return Number(edit?.endLine ?? edit?.range?.endLine ?? edit?.range?.end?.line ?? edit?.startLine ?? 1);
	};
	const getReplacement = (edit: any): string => String(edit?.replacement ?? edit?.text ?? edit?.newText ?? "");

	const sorted = [...textEdits].sort((a, b) => normalizeLine(b, "start") - normalizeLine(a, "start"));
	for (const edit of sorted) {
		const startLine = Math.max(1, normalizeLine(edit, "start"));
		const endLine = Math.max(startLine, normalizeLine(edit, "end"));
		const replacementLines = getReplacement(edit).split("\n");
		lines.splice(startLine - 1, endLine - startLine + 1, ...replacementLines);
	}
	return lines.join("\n");
}

function validateStructuredTextEdits(baseText: string, textEdits: any[]): { valid: boolean, reason?: string, edits: any[] } {
	if (!Array.isArray(textEdits) || textEdits.length === 0) {
		return { valid: false, reason: "missing_edits", edits: [] };
	}
	if (textEdits.length > MAX_STRUCTURED_TEXT_EDITS) {
		return { valid: false, reason: "too_many_edits", edits: [] };
	}

	const baseLines = String(baseText || "").split("\n");
	const maxLine = Math.max(1, baseLines.length + 1);
	const normalized = textEdits.map((edit) => {
		const startRaw = Number(edit?.startLine ?? edit?.range?.startLine ?? edit?.range?.start?.line ?? edit?.line ?? 1);
		const endRaw = Number(edit?.endLine ?? edit?.range?.endLine ?? edit?.range?.end?.line ?? startRaw);
		const startLine = Math.max(1, Number.isFinite(startRaw) ? Math.floor(startRaw) : 1);
		const endLine = Math.max(startLine, Number.isFinite(endRaw) ? Math.floor(endRaw) : startLine);
		const replacement = String(edit?.replacement ?? edit?.text ?? edit?.newText ?? "");
		return {
			...edit,
			startLine,
			endLine,
			replacement,
			action: String(edit?.action || "edit").trim().toLowerCase() || "edit",
		};
	});

	normalized.sort((a, b) => (a.startLine - b.startLine) || (a.endLine - b.endLine));
	let previousEnd = 0;
	let replacementChars = 0;
	for (const edit of normalized) {
		if (edit.startLine < 1 || edit.endLine < edit.startLine) {
			return { valid: false, reason: "invalid_line_range", edits: [] };
		}
		if (edit.startLine > maxLine || edit.endLine > maxLine) {
			return { valid: false, reason: "line_out_of_range", edits: [] };
		}
		if (edit.startLine <= previousEnd) {
			return { valid: false, reason: "overlapping_edits", edits: [] };
		}
		replacementChars += String(edit.replacement || "").length;
		if (replacementChars > MAX_STRUCTURED_REPLACEMENT_CHARS) {
			return { valid: false, reason: "replacement_too_large", edits: [] };
		}
		previousEnd = edit.endLine;
	}

	return { valid: true, edits: normalized };
}

function summarizeTextEditOperations(textEdits: any[]): { addCount: number, editCount: number, deleteCount: number } {
	let addCount = 0;
	let editCount = 0;
	let deleteCount = 0;
	for (const edit of Array.isArray(textEdits) ? textEdits : []) {
		const action = String(edit?.action || "").trim().toLowerCase();
		const replacement = String(edit?.replacement ?? edit?.text ?? edit?.newText ?? "");
		const startLine = Number(edit?.startLine ?? edit?.range?.startLine ?? edit?.range?.start?.line ?? edit?.line ?? 1);
		const endLine = Number(edit?.endLine ?? edit?.range?.endLine ?? edit?.range?.end?.line ?? startLine);
		const removedLines = Math.max(0, Math.floor((Number.isFinite(endLine) ? endLine : startLine) - (Number.isFinite(startLine) ? startLine : 1) + 1));

		if (action.includes("delete") || action.includes("remove")) {
			deleteCount += 1;
			continue;
		}
		if (action.includes("insert") || action.includes("add") || action.includes("create")) {
			addCount += 1;
			continue;
		}
		if (!replacement.trim() && removedLines > 0) {
			deleteCount += 1;
			continue;
		}
		if (replacement.trim() && removedLines === 0) {
			addCount += 1;
			continue;
		}
		editCount += 1;
	}
	return { addCount, editCount, deleteCount };
}

function extractMenuNodesForDiff(raw: unknown): Array<Record<string, unknown>> {
	const normalized = extractMenuDraftForEditor(raw);
	if (!normalized)
		return [];
	try {
		const parsed = JSON.parse(normalized) as { menu?: unknown[] };
		return Array.isArray(parsed?.menu)
			? parsed.menu.filter(item => item && typeof item === "object") as Array<Record<string, unknown>>
			: [];
	}
	catch {
		return [];
	}
}

function normalizeJsonForCompare(raw: unknown): string {
	const normalize = (value: any): any => {
		if (Array.isArray(value)) {
			return value.map(item => normalize(item));
		}
		if (value && typeof value === "object") {
			const entries = Object.entries(value as Record<string, unknown>)
				.filter(([key]) => key !== "_meta" && key !== "updatedAt" && key !== "timestamp")
				.sort(([a], [b]) => a.localeCompare(b));
			const out: Record<string, unknown> = {};
			for (const [key, child] of entries) {
				out[key] = normalize(child);
			}
			return out;
		}
		return value;
	};
	return JSON.stringify(normalize(raw));
}

function flattenMenuNodes(nodes: Array<Record<string, unknown>>): Map<string, string> {
	const result = new Map<string, string>();
	const walk = (input: Array<Record<string, unknown>>) => {
		for (const node of input) {
			const nodeId = String(node?.id || "").trim();
			if (nodeId) {
				result.set(nodeId, normalizeJsonForCompare(node));
			}
			const childrenRaw = (node as any)?.children;
			if (Array.isArray(childrenRaw)) {
				walk(childrenRaw.filter(item => item && typeof item === "object") as Array<Record<string, unknown>>);
			}
		}
	};
	walk(nodes);
	return result;
}

function summarizeMenuOperations(beforeRaw: unknown, afterRaw: unknown): { addCount: number, editCount: number, deleteCount: number } {
	const beforeMap = flattenMenuNodes(extractMenuNodesForDiff(beforeRaw));
	const afterMap = flattenMenuNodes(extractMenuNodesForDiff(afterRaw));
	let addCount = 0;
	let editCount = 0;
	let deleteCount = 0;

	for (const [id, afterNode] of afterMap.entries()) {
		if (!beforeMap.has(id)) {
			addCount += 1;
			continue;
		}
		if (beforeMap.get(id) !== afterNode) {
			editCount += 1;
		}
	}
	for (const id of beforeMap.keys()) {
		if (!afterMap.has(id)) {
			deleteCount += 1;
		}
	}

	return { addCount, editCount, deleteCount };
}

function summarizeMenuPatchOps(rawPatchOps: unknown, rawMergeStats?: unknown): { addCount: number, editCount: number, deleteCount: number } {
	if (rawMergeStats && typeof rawMergeStats === "object") {
		const mergeStats = rawMergeStats as Record<string, unknown>;
		return {
			addCount: Math.max(0, Number(mergeStats.added || 0) || 0),
			editCount: Math.max(0, Number(mergeStats.edited || 0) || 0),
			deleteCount: Math.max(0, Number(mergeStats.deleted || 0) || 0),
		};
	}
	let addCount = 0;
	let editCount = 0;
	let deleteCount = 0;
	for (const op of Array.isArray(rawPatchOps) ? rawPatchOps : []) {
		const action = String((op as Record<string, unknown>)?.action || "").trim().toLowerCase();
		if (action === "add") {
			addCount += 1;
		}
		else if (action === "delete") {
			deleteCount += 1;
		}
		else if (action === "edit") {
			editCount += 1;
		}
	}
	return { addCount, editCount, deleteCount };
}

function buildMenuAuditCompletionSummary(params: {
	userRequest?: string
	auditSteps?: string[]
	addCount: number
	editCount: number
	deleteCount: number
	acceptedSteps: number
	reviewRequired: boolean
	uiText: (vi: string, en: string, zh: string) => string
}): string {
	const {
		userRequest,
		auditSteps,
		addCount,
		editCount,
		deleteCount,
		acceptedSteps,
		reviewRequired,
		uiText,
	} = params;
	const defaultSteps = [
		uiText("Kiểm tra trigger từng menu theo chuẩn nghiệp vụ", "Verify each menu trigger against business rules", "按业务规范检查各菜单 trigger"),
		uiText("Chuẩn hóa tham số đầu vào (table/f_header/f_cbo_query)", "Normalize input params (table/f_header/f_cbo_query)", "规范化输入参数 (table/f_header/f_cbo_query)"),
		uiText("Bổ sung nhãn 3 ngôn ngữ (label/label_en/label_zh)", "Add 3-language labels (label/label_en/label_zh)", "补充三语标签 (label/label_en/label_zh)"),
	];
	const steps = (auditSteps && auditSteps.length > 0 ? auditSteps : defaultSteps)
		.map(step => `• ${String(step || "").trim()}`)
		.filter(line => line.length > 2);
	const opsSummary = `+${Math.max(0, addCount)} ~${Math.max(0, editCount)} -${Math.max(0, deleteCount)}`;
	const userLine = String(userRequest || "").trim().length > 16
		? `\n\n${uiText("Yêu cầu", "Request", "请求")}: ${String(userRequest || "").trim().slice(0, 160)}${String(userRequest || "").trim().length > 160 ? "..." : ""}`
		: "";
	const reviewNote = reviewRequired
		? uiText(" Một số bước đang chờ duyệt thủ công.", " Some steps are waiting for manual approval.", " 部分步骤仍在等待人工批准。")
		: "";
	return uiText(
		`Đã hoàn tất rà soát và cập nhật menu local (${Math.max(1, acceptedSteps)} bước).\n\nCác hạng mục đã xử lý:\n${steps.join("\n")}\n\nKết quả: ${opsSummary} (thêm/sửa/xóa). Toàn bộ menu đã merge nằm trong editor CodeMirror.${reviewNote}${userLine}`,
		`Completed local menu audit and update (${Math.max(1, acceptedSteps)} steps).\n\nItems handled:\n${steps.join("\n")}\n\nResult: ${opsSummary} (add/edit/delete). Full merged menu is in the CodeMirror editor.${reviewNote}${userLine}`,
		`已完成本地菜单审计与更新（${Math.max(1, acceptedSteps)} 步）。\n\n已处理项：\n${steps.join("\n")}\n\n结果：${opsSummary}（增/改/删）。完整合并菜单已在 CodeMirror 编辑器中。${reviewNote}${userLine}`,
	);
}

function looksLikeLargeMenuJsonPayload(raw: unknown): boolean {
	const text = String(raw || "").trim();
	if (text.length < 1500)
		return false;
	const head = text.slice(0, 800).toLowerCase();
	return (head.includes("\"menu\"") || head.includes("'menu'"))
		&& (head.includes("\"id\"") || head.includes("\"label\""));
}

function looksLikeRenderedMenuNodeLeak(raw: unknown): boolean {
	const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n").map(line => line.trim()).filter(Boolean);
	if (lines.length < 4 || lines.length > 40)
		return false;
	const menuFieldKeys = new Set([
		"id", "label", "trigger", "field_root", "report_name", "orientation",
		"m_icons", "table_name", "type_menu", "m_show", "g_readonly",
	]);
	let keyHits = 0;
	for (const line of lines) {
		if (menuFieldKeys.has(line.toLowerCase()))
			keyHits += 1;
	}
	return keyHits >= 3;
}

function looksLikeLegacyMenuEditSummary(raw: unknown): boolean {
	return /^Đã áp \d+ bước cập nhật menu vào editor\.\s*Tóm tắt thay đổi:/i.test(String(raw || "").trim());
}

function parseMenuOpsSummaryFromText(raw: unknown): { addCount: number, editCount: number, deleteCount: number } {
	const match = String(raw || "").match(/\+(\d+)\s*~(\d+)\s*-(\d+)/);
	if (!match)
		return { addCount: 0, editCount: 0, deleteCount: 0 };
	return {
		addCount: Math.max(0, Number(match[1]) || 0),
		editCount: Math.max(0, Number(match[2]) || 0),
		deleteCount: Math.max(0, Number(match[3]) || 0),
	};
}

function buildMenuSummaryFromPersistedContext(params: {
	assistantRaw: string
	metadata: Record<string, unknown>
	userRequest: string
	uiText: (vi: string, en: string, zh: string) => string
}): string {
	const mergeStats = params.metadata.mergeStats && typeof params.metadata.mergeStats === "object"
		? params.metadata.mergeStats as Record<string, unknown>
		: undefined;
	const parsedOps = parseMenuOpsSummaryFromText(params.assistantRaw);
	const auditSteps = Array.isArray(params.metadata.menuAuditPlanSteps)
		? params.metadata.menuAuditPlanSteps.map(item => String(item || "").trim()).filter(Boolean)
		: undefined;
	return buildMenuAuditCompletionSummary({
		userRequest: params.userRequest,
		auditSteps,
		addCount: Math.max(0, Number(mergeStats?.added ?? parsedOps.addCount) || 0),
		editCount: Math.max(0, Number(mergeStats?.edited ?? params.metadata.patchOpCount ?? parsedOps.editCount) || 0),
		deleteCount: Math.max(0, Number(mergeStats?.deleted ?? parsedOps.deleteCount) || 0),
		acceptedSteps: Math.max(1, Number(params.metadata.agenticStepAcceptedCount || params.metadata.agenticStepResultCount || 1) || 1),
		reviewRequired: params.metadata.reviewRequired === true,
		uiText: params.uiText,
	});
}

function resolvePersistedAssistantDisplayText(params: {
	assistantRaw: string
	metadata: Record<string, unknown>
	userRequest: string
	uiText: (vi: string, en: string, zh: string) => string
}): string {
	const summaryFromMeta = String(params.metadata.assistantChatSummary || "").trim();
	if (summaryFromMeta)
		return summaryFromMeta;
	const shouldRebuildMenuSummary = looksLikeLargeMenuJsonPayload(params.assistantRaw)
		|| looksLikeRenderedMenuNodeLeak(params.assistantRaw)
		|| looksLikeLegacyMenuEditSummary(params.assistantRaw);
	if (!shouldRebuildMenuSummary)
		return normalizeAssistantDisplayText(params.assistantRaw);
	return buildMenuSummaryFromPersistedContext(params);
}

function buildStructuredEditCompletionSummary(params: {
	contextType: "code" | "menu_json"
	stepResultCount: number
	acceptedCount: number
	addCount: number
	editCount: number
	deleteCount: number
	reviewRequired: boolean
	uiText: (vi: string, en: string, zh: string) => string
}): string {
	const {
		contextType,
		stepResultCount,
		acceptedCount,
		addCount,
		editCount,
		deleteCount,
		reviewRequired,
		uiText,
	} = params;
	const effectiveAcceptedCount = Math.max(0, acceptedCount || stepResultCount || 0);
	const opsSummary = `+${Math.max(0, addCount)} ~${Math.max(0, editCount)} -${Math.max(0, deleteCount)}`;
	if (contextType === "menu_json") {
		return reviewRequired
			? uiText(
				`Đã áp ${effectiveAcceptedCount} bước cập nhật menu vào editor. Tóm tắt thay đổi: ${opsSummary}. Một số bước đang chờ duyệt thủ công.`,
				`Applied ${effectiveAcceptedCount} menu update steps to the editor. Change summary: ${opsSummary}. Some steps are waiting for manual approval.`,
				`已将 ${effectiveAcceptedCount} 个菜单更新步骤应用到编辑器。变更摘要：${opsSummary}。部分步骤仍在等待人工批准。`,
			)
			: uiText(
				`Đã áp ${effectiveAcceptedCount} bước cập nhật menu vào editor. Tóm tắt thay đổi: ${opsSummary}.`,
				`Applied ${effectiveAcceptedCount} menu update steps to the editor. Change summary: ${opsSummary}.`,
				`已将 ${effectiveAcceptedCount} 个菜单更新步骤应用到编辑器。变更摘要：${opsSummary}。`,
			);
	}
	return reviewRequired
		? uiText(
			`Đã áp ${effectiveAcceptedCount} bước chỉnh sửa vào editor. Tóm tắt thay đổi: ${opsSummary}. Một số bước đang chờ duyệt thủ công.`,
			`Applied ${effectiveAcceptedCount} edit steps to the editor. Change summary: ${opsSummary}. Some steps are waiting for manual approval.`,
			`已将 ${effectiveAcceptedCount} 个编辑步骤应用到编辑器。变更摘要：${opsSummary}。部分步骤仍在等待人工批准。`,
		)
		: uiText(
			`Đã áp ${effectiveAcceptedCount} bước chỉnh sửa vào editor. Tóm tắt thay đổi: ${opsSummary}.`,
			`Applied ${effectiveAcceptedCount} edit steps to the editor. Change summary: ${opsSummary}.`,
			`已将 ${effectiveAcceptedCount} 个编辑步骤应用到编辑器。变更摘要：${opsSummary}。`,
		);
}

function buildCodeOperationPreviewLines(baseText: string, textEdits: any[], maxItems = 20): LocalFlowOperationLine[] {
	const EMPTY_DELETE_MARKER = "__LOCAL_OP_EMPTY_DELETE__";
	const EMPTY_UPDATE_MARKER = "__LOCAL_OP_EMPTY_UPDATE__";
	const baseLines = String(baseText || "").split("\n");
	const normalizeLine = (edit: any, key: "start" | "end"): number => {
		if (key === "start") {
			return Number(edit?.startLine ?? edit?.range?.startLine ?? edit?.range?.start?.line ?? edit?.line ?? 1);
		}
		return Number(edit?.endLine ?? edit?.range?.endLine ?? edit?.range?.end?.line ?? edit?.startLine ?? 1);
	};
	const getReplacement = (edit: any): string => String(edit?.replacement ?? edit?.text ?? edit?.newText ?? "");

	const lines: LocalFlowOperationLine[] = [];
	for (const edit of Array.isArray(textEdits) ? textEdits : []) {
		const startLine = Math.max(1, Math.floor(normalizeLine(edit, "start") || 1));
		const endLine = Math.max(startLine, Math.floor(normalizeLine(edit, "end") || startLine));
		const lineLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
		const actionRaw = String(edit?.action || "").trim().toLowerCase();
		const replacement = getReplacement(edit);
		let action: LocalFlowOperationLine["action"] = "edit";
		if (actionRaw.includes("delete") || actionRaw.includes("remove") || (!replacement.trim() && endLine >= startLine)) {
			action = "delete";
		}
		else if (actionRaw.includes("insert") || actionRaw.includes("add") || actionRaw.includes("create") || (replacement.trim() && endLine === startLine && !baseLines[startLine - 1])) {
			action = "add";
		}

		let snippet = "";
		if (action === "delete") {
			snippet = baseLines.slice(startLine - 1, endLine).join(" ").replace(/\s+/g, " ").trim();
		}
		else {
			snippet = replacement.split(/\r?\n/).map(item => item.trim()).find(Boolean) || "";
		}
		if (!snippet) {
			snippet = action === "delete" ? EMPTY_DELETE_MARKER : EMPTY_UPDATE_MARKER;
		}
		lines.push({ action, lineLabel, snippet });
		if (lines.length >= Math.max(1, maxItems)) {
			break;
		}
	}
	return lines;
}

function summarizeChecklistForConfirm(rawChecklist: any): string {
	if (!rawChecklist)
		return "";
	if (typeof rawChecklist === "string")
		return rawChecklist.trim();
	if (typeof rawChecklist !== "object")
		return "";
	const checklist = rawChecklist as Record<string, any>;
	const goal = String(checklist.goal || checklist.muc_tieu || "").trim();
	const scope = String(checklist.scope || checklist.pham_vi || "").trim();
	const assumptions = Array.isArray(checklist.assumptions) ? checklist.assumptions.map(x => String(x || "").trim()).filter(Boolean) : [];
	const risks = Array.isArray(checklist.risks) ? checklist.risks.map(x => String(x || "").trim()).filter(Boolean) : [];
	const parts: string[] = [];
	if (goal)
		parts.push(`Goal: ${goal}`);
	if (scope)
		parts.push(`Scope: ${scope}`);
	if (assumptions.length)
		parts.push(`Assumptions: ${assumptions.slice(0, 4).join("; ")}`);
	if (risks.length)
		parts.push(`Risks: ${risks.slice(0, 4).join("; ")}`);
	return parts.join("\n").trim();
}

function hasEditIntent(input: string): boolean {
	const text = String(input || "").trim().toLowerCase();
	if (!text)
		return false;
	const patterns = [
		/\b(sua|sửa|chinh|chỉnh|update|modify|refactor|rewrite|fix|implement|generate|tao|tạo|viet|viết|chen|chèn|apply|patch|replace|doi|đổi)\b/i,
		/(hãy\s+sửa|hay\s+sua|kiểm tra.*sửa|trigger.*sửa|nhãn\s+3\s+ngôn\s+ngữ)/i,
		/\b(add|remove|delete|insert|edit)\b/i,
		/\b(code\s+edit|edit\s+code|sua\s+code|chinh\s+code|chỉnh\s+code|json\s+patch|menu\s+patch|menu\s+design)\b/i,
		/(修改|更新|重写|修复|生成|插入|替换|代码|菜单|json)/i,
	];
	return patterns.some(pattern => pattern.test(text));
}

function hasConversationalQuestionIntent(input: string): boolean {
	const text = String(input || "").trim().toLowerCase();
	if (!text)
		return false;
	const patterns = [
		/^(hi|hello|alo|xin\s+chao|chao\s+ban|chào\s+bạn|ban\s+la\s+ai|bạn\s+là\s+ai|who\s+are\s+you|ban\s+co\s+the\s+lam\s+gi|bạn\s+có\s+thể\s+làm\s+gì)/i,
		/(la\s+gi|là\s+gì|tai\s+sao|tại\s+sao|nhu\s+the\s+nao|như\s+thế\s+nào|how|why|what|explain|giai\s+thich|giải\s+thích|huong\s+dan|hướng\s+dẫn)/i,
	];
	const hasEdit = hasEditIntent(text) || hasMenuPatchOnlyIntent(text);
	return !hasEdit && patterns.some(pattern => pattern.test(text));
}

function inferResponseModeByIntent(input: string, contextType: AiAssistantChatProps["contextType"]): ResponseMode {
	const text = String(input || "").trim();
	if (!text)
		return "analyze";
	if (hasConversationalQuestionIntent(text))
		return "analyze";
	if (contextType === "menu_json") {
		return (hasEditIntent(text) || hasMenuPatchOnlyIntent(text)) ? "edit" : "analyze";
	}
	return hasEditIntent(text) ? "edit" : "analyze";
}

function hasMenuPatchOnlyIntent(input: string): boolean {
	const text = String(input || "").trim().toLowerCase();
	if (!text)
		return false;
	const patterns = [
		/(chi\s+bo\s+sung|chỉ\s+bổ\s+sung|chi\s+cap\s+nhat|chỉ\s+cập\s+nhật|khong\s+lam\s+gi\s+khac|không\s+làm\s+gì\s+khác|giu\s+nguyen|giữ\s+nguyên)/i,
		/(label_en|label_zh|m_icon|f_header_en|f_header_zh|3\s+ngon\s+ngu|3\s+ngôn\s+ngữ|đa\s+ngôn\s+ngữ)/i,
	];
	return patterns.some(pattern => pattern.test(text));
}

function normalizeDirectiveToken(raw: string): string {
	return String(raw || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036F]/g, "")
		.replace(/_/g, "-");
}

function parseResponseModeDirective(input: string): { cleanedMessage: string, overrideMode?: ResponseMode } {
	const text = String(input || "").trim();
	if (!text.startsWith("/")) {
		return { cleanedMessage: text };
	}

	const match = text.match(/^\/([^\s:]+)\s*(?::\s*)?(.*)$/s);
	if (!match) {
		return { cleanedMessage: text };
	}

	const token = normalizeDirectiveToken(match[1]);
	const rest = String(match[2] || "").trim();
	const editTokens = new Set(["edit", "apply", "sua", "chinh", "cap-nhat", "update", "modify", "bianji", "xiugai", "编辑", "修改"]);
	const analyzeTokens = new Set(["analyze", "analysis", "phan-tich", "giai-thich", "explain", "fenxi", "jieshi", "分析", "解释"]);

	if (editTokens.has(token)) {
		return { cleanedMessage: rest, overrideMode: "edit" };
	}
	if (analyzeTokens.has(token)) {
		return { cleanedMessage: rest, overrideMode: "analyze" };
	}
	return { cleanedMessage: text };
}

function parseExecutionRouteDirective(input: string): { cleanedMessage: string, useLocalPlan: boolean } {
	const text = String(input || "").trim();
	if (!text.startsWith("/")) {
		return { cleanedMessage: text, useLocalPlan: false };
	}

	const match = text.match(/^\/([^\s:]+)\s*(?::\s*)?(.*)$/s);
	if (!match) {
		return { cleanedMessage: text, useLocalPlan: false };
	}

	const token = normalizeDirectiveToken(match[1]);
	const rest = String(match[2] || "").trim();
	const localPlanTokens = new Set([
		"local-plan",
		"localplan",
		"local-only",
		"localonly",
		"local",
		"local-ops",
		"localops",
		"local-execute",
		"localexecute",
	]);
	if (localPlanTokens.has(token)) {
		return { cleanedMessage: rest, useLocalPlan: true };
	}
	return { cleanedMessage: text, useLocalPlan: false };
}

async function readFileAsText(file: File): Promise<string> {
	return file.text();
}

async function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error || new Error("Không đọc được ảnh"));
		reader.readAsDataURL(file);
	});
}

function sanitizeLoadedChatMessages(messages: ChatMessage[]): ChatMessage[] {
	const viOnly = (vi: string, _en: string, _zh: string) => vi;
	const out: ChatMessage[] = [];
	for (const msg of messages) {
		if (msg.role !== "assistant") {
			out.push(msg);
			continue;
		}
		const prevUser = [...out].reverse().find(item => item.role === "user");
		const needsMenuSummary = looksLikeLargeMenuJsonPayload(msg.content)
			|| looksLikeRenderedMenuNodeLeak(msg.content)
			|| looksLikeLegacyMenuEditSummary(msg.content);
		if (needsMenuSummary) {
			out.push({
				...msg,
				content: buildMenuSummaryFromPersistedContext({
					assistantRaw: msg.content,
					metadata: {},
					userRequest: prevUser?.content || "",
					uiText: viOnly,
				}),
			});
			continue;
		}
		out.push(msg);
	}
	return out;
}

function getChatHistory(): ChatMessage[] {
	try {
		const stored = localStorage.getItem(CHAT_HISTORY_KEY)
		  ?? localStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
		return stored
			? sanitizeLoadedChatMessages(dedupeChatMessages(JSON.parse(stored)))
			: [];
	}
	catch {
		return [];
	}
}

function clearChatHistoryStorage() {
	try {
		localStorage.removeItem(CHAT_HISTORY_KEY);
		localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
	}
	catch {
		// ignore localStorage clear failures
	}
}

function saveChatHistory(messages: ChatMessage[]) {
	try {
		const limited = sanitizeHistoryMessages(dedupeChatMessages(messages));
		if (limited.length === 0) {
			clearChatHistoryStorage();
			return;
		}
		localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limited));
		localStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
	}
	catch (error) {
		console.error("Failed to save chat history:", error);
	}
}

function resolveChatRuntimeStorageKey(params: {
	appId: string
	contextType: string
	language: string
	targetPName?: string
}): string {
	const app = String(params.appId || "csm").trim() || "csm";
	const context = String(params.contextType || "code").trim() || "code";
	const lang = String(params.language || "javascript").trim() || "javascript";
	const target = String(params.targetPName || "__default__").trim() || "__default__";
	return `${CHAT_RUNTIME_KEY_PREFIX}:${app}:${context}:${lang}:${target}`;
}

function loadChatRuntimeSnapshot(storageKey: string): ChatRuntimeSnapshot | null {
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<ChatRuntimeSnapshot> | null;
		if (!parsed || typeof parsed !== "object") {
			return null;
		}
		const agenticSteps = Array.isArray(parsed.agenticSteps) ? parsed.agenticSteps as AgenticStep[] : [];
		const completionState = String(parsed.completionState || "idle").trim() as CompletionState;
		const allowedStates: CompletionState[] = ["idle", "done", "review_required", "stream_closed", "error", "cancelled"];
		return {
			agenticSteps,
			completionState: allowedStates.includes(completionState) ? completionState : "idle",
			streamRequestId: String(parsed.streamRequestId || "").trim() || undefined,
			updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : Date.now(),
		};
	}
	catch {
		return null;
	}
}

function saveChatRuntimeSnapshot(storageKey: string, snapshot: ChatRuntimeSnapshot) {
	try {
		localStorage.setItem(storageKey, JSON.stringify(snapshot));
	}
	catch {
		// ignore localStorage save failures
	}
}

function clearChatRuntimeSnapshot(storageKey: string) {
	try {
		localStorage.removeItem(storageKey);
	}
	catch {
		// ignore localStorage clear failures
	}
}

function normalizePersistedAgenticSteps(raw: unknown): AgenticStep[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: AgenticStep[] = [];
	raw.forEach((item, index) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) {
				return;
			}
			const input = item as Record<string, unknown>;
			const stepIndex = Number(input.stepIndex);
			const stepTotal = Number(input.stepTotal);
			const riskLevel = String(input.riskLevel || "").trim().toLowerCase();
			const approvalState = String(input.approvalState || "pending").trim().toLowerCase();
			const status = String(input.status || "done").trim().toLowerCase();
			const approvalReasons = Array.isArray(input.approvalReasons)
				? input.approvalReasons.map((entry) => String(entry || "").trim()).filter(Boolean)
				: [];
			const nextStep: AgenticStep = {
				id: String(input.id || `persisted_agentic_${index}_${Date.now()}`),
				stage: String(input.stage || `agentic_step_result_${Number.isFinite(stepIndex) ? stepIndex : index + 1}`),
				icon: String(input.icon || (approvalState === "pending" ? "🛂" : approvalState === "approved" ? "✅" : "⛔")),
				label: String(input.label || `Step ${Number.isFinite(stepIndex) ? stepIndex : index + 1}${Number.isFinite(stepTotal) && stepTotal > 0 ? `/${stepTotal}` : ""}`),
				detail: String(input.detail || "").trim() || undefined,
				qualityScore: Number.isFinite(Number(input.qualityScore)) ? Number(input.qualityScore) : undefined,
				lowConfidence: Boolean(input.lowConfidence),
				riskScore: Number.isFinite(Number(input.riskScore)) ? Number(input.riskScore) : undefined,
				riskLevel: (riskLevel === "low" || riskLevel === "medium" || riskLevel === "high") ? riskLevel as AgenticStep["riskLevel"] : undefined,
				approvalRequired: Boolean(input.approvalRequired ?? true),
				approvalReasons,
				approvalState: (approvalState === "approved" || approvalState === "rejected" || approvalState === "pending") ? approvalState as AgenticStep["approvalState"] : "pending",
				pendingTextEdits: Array.isArray(input.pendingTextEdits) ? input.pendingTextEdits : undefined,
				stepIndex: Number.isFinite(stepIndex) ? stepIndex : undefined,
				stepTotal: Number.isFinite(stepTotal) ? stepTotal : undefined,
				patchValidator: input.patchValidator as PatchValidatorMeta | undefined,
				patchDryRun: input.patchDryRun as PatchDryRunMeta | undefined,
				status: (status === "planned" || status === "running" || status === "done") ? status as AgenticStep["status"] : "done",
				timestamp: Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now(),
			};
			out.push(nextStep);
		});
	return out;
}

function resolvePromptHistoryStorageKey(params: {
	appId: string
	contextType: string
	language: string
	targetPName?: string
}): string {
	const app = String(params.appId || "csm").trim() || "csm";
	const context = String(params.contextType || "code").trim() || "code";
	const lang = String(params.language || "javascript").trim() || "javascript";
	const target = String(params.targetPName || "__default__").trim() || "__default__";
	return `${PROMPT_HISTORY_KEY_PREFIX}:${app}:${context}:${lang}:${target}`;
}

function loadPromptHistory(storageKey: string): string[] {
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw)
			return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed))
			return [];
		return parsed
			.map(item => String(item || "").trim())
			.filter(Boolean)
			.slice(0, PROMPT_HISTORY_LIMIT);
	}
	catch {
		return [];
	}
}

function savePromptHistory(storageKey: string, items: string[]) {
	try {
		localStorage.setItem(storageKey, JSON.stringify(items.slice(0, PROMPT_HISTORY_LIMIT)));
	}
	catch {
		// ignore localStorage write failures
	}
}

export default function AiAssistantChat({
	appId,
	currentCode = "",
	language = "javascript",
	contextType = "code",
	targetPName,
	targetPType,
	editorMetadata,
	onCodeInsert,
	onApplyLineEdit,
	onCitationNavigate,
	onUserMessage,
}: AiAssistantChatProps) {
	const { i18n } = useTranslation();
	const shouldHideCodeInChat = Boolean(onCodeInsert);
	const runtimeStorageKey = resolveChatRuntimeStorageKey({
		appId,
		contextType,
		language,
		targetPName,
	});
	const initialRuntimeSnapshot = loadChatRuntimeSnapshot(runtimeStorageKey);
	const [messages, setMessages] = useState<ChatMessage[]>(getChatHistory());
	const [inputValue, setInputValue] = useState("");
	const [showSlashCommandPalette, setShowSlashCommandPalette] = useState(false);
	const [slashCommandIndex, setSlashCommandIndex] = useState(0);
	const [promptHistory, setPromptHistory] = useState<string[]>([]);
	const [promptHistoryIndex, setPromptHistoryIndex] = useState(-1);
	const [promptHistoryOriginal, setPromptHistoryOriginal] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [pendingAttachments, setPendingAttachments] = useState<AiAssistantAttachment[]>([]);
	const [stageEvents, setStageEvents] = useState<AiAssistantStageEvent[]>([]);
	const [targetFileScopes, setTargetFileScopes] = useState<FileScope[]>([]);
	const [scopedPatches, setScopedPatches] = useState<ScopedPatch[]>([]);
	const [showMultiFilePanel, setShowMultiFilePanel] = useState(false);
	const [aiUsageSummary, setAiUsageSummary] = useState<{
		turn: AiUsageSummary | null
		sessionCostUsd: number
		sessionTokens: number
	}>({
		turn: null,
		sessionCostUsd: 0,
		sessionTokens: 0,
	});
	const [modelDecisionTrace, setModelDecisionTrace] = useState<ModelDecisionTrace[]>([]);
	const [showFullTimeline, setShowFullTimeline] = useState(false);
	const [showFullModelTrace, setShowFullModelTrace] = useState(false);
	const [showMiniProgress, setShowMiniProgress] = useState(true);
	const [isProgressDockCollapsed, setIsProgressDockCollapsed] = useState(false);
	const [isUsageDockVisible, setIsUsageDockVisible] = useState(false);
	const [orchPreview, setOrchPreview] = useState<OrchestrationPreviewResult | null>(null);
	const [orchPreviewLoading, setOrchPreviewLoading] = useState(false);
	const [showOrchPreview, setShowOrchPreview] = useState(false);
	const [agenticSteps, setAgenticSteps] = useState<AgenticStep[]>([]);
	const [agenticStepsCollapsed, setAgenticStepsCollapsed] = useState(false);
	const [streamRequestId, setStreamRequestId] = useState("");
	const [streamJobId, setStreamJobId] = useState("");
	const [completionState, setCompletionState] = useState<CompletionState>("idle");
	const [serverReviewHydrationDone, setServerReviewHydrationDone] = useState(false);
	const [completionMetrics, setCompletionMetrics] = useState<CompletionMetrics>({});
	const [completionErrorMessage, setCompletionErrorMessage] = useState("");
	const [partsManifest, setPartsManifest] = useState<AiStreamPartsManifest | null>(null);
	const [partsMetaPage, setPartsMetaPage] = useState<AiStreamPartsMetaPage | null>(null);
	const [partsMetaLoading, setPartsMetaLoading] = useState(false);
	const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);
	const [selectedPartContent, setSelectedPartContent] = useState("");
	const [selectedPartLoading, setSelectedPartLoading] = useState(false);
	const [localFlowOps, setLocalFlowOps] = useState<LocalFlowOperationSummary | null>(null);
	const [localFlowOpLines, setLocalFlowOpLines] = useState<LocalFlowOperationLine[]>([]);
	const [localFlowOpFilter, setLocalFlowOpFilter] = useState<LocalFlowOperationFilter>("all");
	const [quickFixSuggestions, setQuickFixSuggestions] = useState<QuickFixSuggestion[]>([]);
	const [applyingQuickFixId, setApplyingQuickFixId] = useState("");
	const [editCandidates, setEditCandidates] = useState<EditCandidate[]>([]);
	const [applyingEditCandidateId, setApplyingEditCandidateId] = useState("");
	const [retryingEditCandidateId, setRetryingEditCandidateId] = useState("");
	const [assistantCitationTokens, setAssistantCitationTokens] = useState<string[]>([]);
	const [lastProgressEventAgeSecs, setLastProgressEventAgeSecs] = useState(0);
	const [backendProgressHint, setBackendProgressHint] = useState<{ stage: string, detail: string }>({ stage: "", detail: "" });
	const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
	const [canUndoLastEdit, setCanUndoLastEdit] = useState(false);
	const [processingApprovalStepId, setProcessingApprovalStepId] = useState("");
	// Progress state: waiting for Gemini / streaming progress
	const [geminiProgress, setGeminiProgress] = useState<{
		phase: "idle" | "waiting" | "streaming"
		percent: number
		message: string
		estimatedWaitSecs: number
		remainingSecs: number
		charsReceived: number
		estimatedTotalChars: number
		ttftMs?: number
	}>({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
	const messageListRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const streamingMessageRef = useRef<string>("");
	const realtimeApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const streamFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingStreamChunkRef = useRef<string>("");
	const parsedCodeBlocksRef = useRef<CodeBlock[]>([]);
	const lastCodeBlockParseAtRef = useRef<number>(0);
	const applyRealtimeCodeFromTextRef = useRef<(rawText: string, force?: boolean) => boolean>(() => false);
	const lastAppliedCodeRef = useRef<string>("");
	const liveCodeRef = useRef<string>(currentCode || "");
	const reviewResolutionFeedbackSentRef = useRef<string>("");
	const lastRealtimeApplyAtRef = useRef<number>(0);
	const undoSnapshotRef = useRef<string>("");
	const followBottomRef = useRef<boolean>(true);
	const scrollFrameRef = useRef<number | null>(null);
	const lastSmoothScrollAtRef = useRef<number>(0);
	const turnAllowAutoApplyRef = useRef<boolean>(false);
	const localFlowVerifiedRef = useRef<boolean>(false);
	const textEditApplyCountRef = useRef<number>(0);
	const editStreamStartCodeRef = useRef<string>("");
	const streamStartedInEditModeRef = useRef<boolean>(false);
	const deliveredAssistantResultRef = useRef<boolean>(false);
	const menuAuditStepsRef = useRef<string[]>([]);
	const lastUserRequestRef = useRef<string>("");
	const [activeStreamResponseMode, setActiveStreamResponseMode] = useState<ResponseMode>("analyze");
	const remoteHistoryLoadedScopeRef = useRef<string>("");
	const remoteHistoryLoadingScopeRef = useRef<string>("");
	const stageEventSignaturesRef = useRef<Set<string>>(new Set());
	const initialReviewStateSyncRef = useRef(false);
	const requestStartedAtRef = useRef<number>(0);
	const streamJobIdRef = useRef<string>("");
	const isLoadingRef = useRef<boolean>(false);
	// Live exchange rates fetched once per session (USD base). Fallback to hardcoded.
	const fxRatesRef = useRef<{ vnd: number, cny: number }>({ vnd: 25000, cny: 7.2 });
	const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
	const sendHintKey = isMac ? "Cmd" : "Ctrl";
	const shouldRenderAssistantCodeBlocks = !onCodeInsert;
	const visibleStageEvents = showFullTimeline ? stageEvents : stageEvents.slice(-COMPACT_STAGE_EVENTS);
	const hiddenStageCount = Math.max(0, stageEvents.length - visibleStageEvents.length);
	const visibleModelDecisionTrace = showFullModelTrace
		? modelDecisionTrace
		: modelDecisionTrace.slice(-COMPACT_MODEL_TRACE);
	const hiddenModelTraceCount = Math.max(0, modelDecisionTrace.length - visibleModelDecisionTrace.length);
	const previewSources = useMemo(
		() => parsePreviewCitationSources(orchPreview?.compressedContextBlock || ""),
		[orchPreview?.compressedContextBlock],
	);
	const visibleCitationTokens = useMemo(
		() => assistantCitationTokens.slice(0, 8),
		[assistantCitationTokens],
	);
	const filteredSlashCommands = useMemo(() => {
		const text = String(inputValue || "").trimStart();
		if (!text.startsWith("/")) {
			return [];
		}
		const query = text.toLowerCase();
		return SLASH_COMMANDS.filter(item => item.command.startsWith(query) || item.label.toLowerCase().includes(query.slice(1)));
	}, [inputValue]);

	useEffect(() => {
		streamJobIdRef.current = streamJobId;
	}, [streamJobId]);

	useEffect(() => {
		isLoadingRef.current = isLoading;
	}, [isLoading]);

	const notifyServerStreamCancel = useCallback((jobId: string) => {
		const safeJobId = String(jobId || "").trim();
		if (!safeJobId) {
			return;
		}
		const endpoint = `/api/ai-code-stream/${encodeURIComponent(safeJobId)}/cancel`;
		const payload = JSON.stringify({ jobId: safeJobId, reason: "client_unload_or_cancel" });
		try {
			if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
				const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
				if (sent) {
					return;
				}
			}
		}
		catch {
			// Fallback to fetch below.
		}
		void fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: payload,
			credentials: "include",
			keepalive: true,
		}).catch(() => undefined);
	}, []);
	const promptHistoryStorageKey = useMemo(
		() => resolvePromptHistoryStorageKey({ appId, contextType, language, targetPName }),
		[appId, contextType, language, targetPName],
	);
	const requestEditorMetadata = useMemo(() => {
		const merged: Record<string, unknown>
			= editorMetadata && typeof editorMetadata === "object"
				? { ...(editorMetadata as Record<string, unknown>) }
				: {};

		// Support multiple languages for diagnostics
		const supportedLanguages = ["javascript", "html", "typescript", "python", "java", "css", "json", "sql"];
		const diagnosticsLanguage = supportedLanguages.includes(String(language || "")) ? String(language) : null;

		// Collect basic syntax validation (skip TypeScript as it requires type checker)
		const diagnosticsSnapshot = diagnosticsLanguage && diagnosticsLanguage !== "typescript"
			? validateCode(String(currentCode || ""), diagnosticsLanguage as any)
			: null;

		// Collect comprehensive workspace diagnostics (including lint patterns, structure validation)
		const workspaceDiagnostics: CodeDiagnostic[] = diagnosticsLanguage
			? collectWorkspaceDiagnostics(String(currentCode || ""), diagnosticsLanguage)
			: [];

		const normalizedPName = (targetPName || "").trim();
		if (normalizedPName && merged.fileKey == null) {
			merged.fileKey = normalizedPName;
		}
		if (language && merged.language == null) {
			merged.language = language;
		}
		if (contextType && merged.contextType == null) {
			merged.contextType = contextType;
		}
		if (typeof targetPType === "number" && Number.isFinite(targetPType) && merged.pType == null) {
			merged.pType = targetPType;
		}

		const codeLength = typeof currentCode === "string" ? currentCode.length : 0;
		if (codeLength > 0) {
			if (merged.bufferChars == null) {
				merged.bufferChars = codeLength;
			}
			if (merged.bufferLines == null) {
				merged.bufferLines = currentCode.split(/\r?\n/).length;
			}
		}

		// Include comprehensive diagnostics in metadata
		if (diagnosticsLanguage) {
			const errorCount = Math.max(
				(diagnosticsSnapshot?.errors.length || 0),
				workspaceDiagnostics.filter(d => d.severity === "error").length
			);
			const warningCount = workspaceDiagnostics.filter(d => d.severity === "warning").length;

			merged.diagnostics = {
				language: diagnosticsLanguage,
				valid: (diagnosticsSnapshot?.valid ?? true) && errorCount === 0,
				errorCount,
				warningCount,
				errors: [
					...(diagnosticsSnapshot?.errors || []).slice(0, 3),
					...workspaceDiagnostics
						.filter(d => d.severity === "error")
						.slice(0, 3)
						.map(d => `Line ${d.line + 1}: ${d.message}`),
				].slice(0, 5),
				workspaceDiagnostics: workspaceDiagnostics.slice(0, 8), // Include detailed diagnostics
			};
		}

		if (targetFileScopes.length > 0) {
			merged.multiFileScopes = targetFileScopes;
			merged.isMultiFileRequest = true;
		}

		return merged;
	}, [editorMetadata, targetPName, targetPType, language, contextType, currentCode, targetFileScopes]);

	const editorDiagnostics = useMemo(() => {
		const supportedLanguages = ["javascript", "html", "typescript", "python", "java", "css", "json", "sql"];
		if (!supportedLanguages.includes(String(language || ""))) {
			return null;
		}
		return validateCode(String(currentCode || ""), String(language) as any);
	}, [currentCode, language]);

	const remoteHistoryScopeKey = useMemo(() => JSON.stringify({
		appId,
		contextType,
		language,
		targetPName: targetPName || "",
		targetPType: typeof targetPType === "number" ? targetPType : "",
	}), [appId, contextType, language, targetPName, targetPType]);

	const uiText = useCallback((vi: string, en: string, zh: string) => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh"))
			return zh;
		if (lang.startsWith("en"))
			return en;
		return vi;
	}, [i18n.language, i18n.resolvedLanguage]);

	// Multi-file scope helpers
	const addTargetFileScope = useCallback((filePath: string, fileName?: string, language?: string) => {
		const existing = targetFileScopes.find(f => f.filePath === filePath);
		if (existing) return;
		setTargetFileScopes(prev => [...prev, {
			filePath,
			fileName: fileName || filePath.split('/').pop() || '',
			language,
		}]);
	}, [targetFileScopes]);

	const removeTargetFileScope = useCallback((filePath: string) => {
		setTargetFileScopes(prev => prev.filter(f => f.filePath !== filePath));
		setScopedPatches(prev => prev.filter(p => p.fileScope.filePath !== filePath));
	}, []);

	const clearTargetFileScopes = useCallback(() => {
		setTargetFileScopes([]);
		setScopedPatches([]);
	}, []);

	const handleCitationNavigate = useCallback((raw: string) => {
		if (!onCitationNavigate) {
			return;
		}
		const location = parseCitationLocation(raw);
		onCitationNavigate({
			path: location.path,
			line: location.line,
			token: raw,
		});
	}, [onCitationNavigate]);

	const applySlashCommand = useCallback((command: string) => {
		const current = String(inputValue || "").trimStart();
		const nextValue = current.startsWith(command)
			? current
			: `${command} `;
		setInputValue(nextValue);
		setShowSlashCommandPalette(false);
		setSlashCommandIndex(0);
	}, [inputValue]);

	const renderMultiFileScopePanel = useCallback(() => {
		if (targetFileScopes.length === 0) {
			return null;
		}

		return (
			<div style={{ display: "grid", gap: 8, padding: "8px 12px", background: "rgba(99, 102, 241, 0.08)", borderRadius: 6, marginBottom: 8 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
					<div style={{ fontSize: 11, fontWeight: 600, color: "#6366f1" }}>
						{uiText("Phạm vi tập tin", "File Scopes", "文件作用域")}
						{" "}
						({targetFileScopes.length})
					</div>
					<Button
						type="text"
						size="small"
						onClick={clearTargetFileScopes}
						style={{ color: "#ef4444", fontSize: 11 }}
					>
						{uiText("Xóa tất cả", "Clear", "清空")}
					</Button>
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
					{targetFileScopes.map((scope, idx) => (
						<Tag
							key={`${scope.filePath}-${idx}`}
							color="blue"
							closable
							onClose={() => removeTargetFileScope(scope.filePath)}
							style={{ marginInlineEnd: 0 }}
						>
							<span style={{ fontSize: 11 }}>
								{scope.fileName}
								{scope.language && <span style={{ opacity: 0.7 }}> ({scope.language})</span>}
							</span>
						</Tag>
					))}
				</div>
			</div>
		);
	}, [clearTargetFileScopes, removeTargetFileScope, targetFileScopes, uiText]);

	const renderOperationSnippetText = useCallback((raw: string): string => {
		const text = String(raw || "");
		if (text === "__LOCAL_OP_EMPTY_DELETE__") {
			return uiText("(khối đã xóa)", "(deleted block)", "（已删除代码块）");
		}
		if (text === "__LOCAL_OP_EMPTY_UPDATE__") {
			return uiText("(đã cập nhật)", "(updated)", "（已更新）");
		}
		return text;
	}, [uiText]);

	const assistantBrandLabel = uiText("Chuyên Gia", "Expert", "专家");
	const formatCompletionDuration = useCallback((elapsedMs?: number): string => {
		const value = Number(elapsedMs);
		if (!Number.isFinite(value) || value <= 0)
			return "";
		if (value < 1000)
			return `${Math.round(value)}ms`;
		return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
	}, []);
	const formatOutputChars = useCallback((outputChars?: number): string => {
		const value = Number(outputChars);
		if (!Number.isFinite(value) || value <= 0)
			return "";
		return uiText(
			`${Math.round(value).toLocaleString("vi-VN")} ký tự`,
			`${Math.round(value).toLocaleString("en-US")} chars`,
			`${Math.round(value).toLocaleString("zh-CN")} 字符`,
		);
	}, [uiText]);
	const completionMetricsLabel = useMemo(() => {
		const parts = [
			formatCompletionDuration(completionMetrics.elapsedMs),
			formatOutputChars(completionMetrics.outputChars),
		].filter(Boolean);
		return parts.join(" · ");
	}, [completionMetrics.elapsedMs, completionMetrics.outputChars, formatCompletionDuration, formatOutputChars]);
	const completionStateLabel = useMemo(() => {
		switch (completionState) {
			case "done":
				return uiText("HOÀN THÀNH", "DONE", "已完成");
			case "review_required":
				return uiText("CHỜ DUYỆT", "REVIEW REQUIRED", "等待审核");
			case "stream_closed":
				return uiText("ĐÓNG LUỒNG", "STREAM CLOSED", "流已关闭");
			case "error":
				return uiText("LỖI", "ERROR", "错误");
			case "cancelled":
				return uiText("ĐÃ HỦY", "CANCELLED", "已取消");
			default:
				return "";
		}
	}, [completionState, uiText]);
	const completionSummaryLabel = useMemo(() => {
		return [completionStateLabel, completionMetricsLabel].filter(Boolean).join(" · ");
	}, [completionMetricsLabel, completionStateLabel]);
	const completionDetailTooltip = useMemo(() => {
		const lines = [
			completionStateLabel ? `${uiText("Trạng thái", "State", "状态")}: ${completionStateLabel}` : "",
			completionState === "error" && completionErrorMessage
				? `${uiText("Lý do", "Reason", "原因")}: ${completionErrorMessage}`
				: "",
			streamRequestId ? `requestId: ${streamRequestId}` : "",
			completionMetrics.elapsedMs != null ? `${uiText("Thời gian", "Elapsed", "耗时")}: ${formatCompletionDuration(completionMetrics.elapsedMs)}` : "",
			completionMetrics.outputChars != null ? `${uiText("Độ dài", "Output", "输出长度")}: ${formatOutputChars(completionMetrics.outputChars)}` : "",
			completionMetrics.streamedChars != null ? `${uiText("Ký tự stream", "Streamed chars", "流式字符")}: ${formatOutputChars(completionMetrics.streamedChars)}` : "",
			completionMetrics.streamChunkCount != null ? `${uiText("Số chunk", "Chunk count", "分块数")}: ${Math.max(0, Math.floor(completionMetrics.streamChunkCount)).toLocaleString("en-US")}` : "",
			completionMetrics.streamAssemblyMismatch === true ? `${uiText("Mất đồng bộ", "Assembly mismatch", "拼接不一致")}: true` : "",
			completionMetrics.promptOriginalChars != null ? `${uiText("Prompt gốc", "Prompt original", "原始提示")}: ${formatOutputChars(completionMetrics.promptOriginalChars)}` : "",
			completionMetrics.promptFinalChars != null ? `${uiText("Prompt sau cắt", "Prompt final", "裁剪后提示")}: ${formatOutputChars(completionMetrics.promptFinalChars)}` : "",
			completionMetrics.promptCapChars != null ? `${uiText("Ngưỡng prompt", "Prompt cap", "提示上限")}: ${formatOutputChars(completionMetrics.promptCapChars)}` : "",
			completionMetrics.promptTruncatedByCharCap === true ? `${uiText("Prompt bị cắt theo ngưỡng", "Prompt truncated by cap", "提示触发长度裁剪")}: true` : "",
			completionMetrics.menuShrinkGuard === true ? `${uiText("Cảnh báo co rút menu", "Menu shrink guard", "菜单压缩警告")}: true (ratio=${(completionMetrics.menuShrinkRatio ?? 0).toFixed(2)})` : "",
			completionMetrics.patchFallbackNoOp === true
				? `${uiText("Patch fallback", "Patch fallback", "补丁回退")}: no-op${completionMetrics.patchFallbackReasonCode ? ` (${completionMetrics.patchFallbackReasonCode})` : ""}`
				: "",
			aiUsageSummary.turn?.model ? `${uiText("Model", "Model", "模型")}: ${aiUsageSummary.turn.model}` : "",
		].filter(Boolean);
		return lines.join("\n");
	}, [
		aiUsageSummary.turn?.model,
		completionMetrics.elapsedMs,
		completionMetrics.outputChars,
		completionMetrics.streamedChars,
		completionMetrics.streamChunkCount,
		completionMetrics.streamAssemblyMismatch,
		completionMetrics.promptOriginalChars,
		completionMetrics.promptFinalChars,
		completionMetrics.promptCapChars,
		completionMetrics.promptTruncatedByCharCap,
		completionMetrics.menuShrinkGuard,
		completionMetrics.menuShrinkRatio,
		completionMetrics.patchFallbackNoOp,
		completionMetrics.patchFallbackReasonCode,
		completionErrorMessage,
		completionState,
		completionStateLabel,
		formatCompletionDuration,
		formatOutputChars,
		streamRequestId,
		uiText,
	]);

	const formatModelDecisionReason = useCallback((reasonCode?: string): string => {
		const code = String(reasonCode || "").trim().toLowerCase();
		switch (code) {
			case "routing_simple_model":
				return uiText("Định tuyến model tiết kiệm", "Routed to cost-saving model", "已路由到节省成本模型");
			case "routing_default_model":
				return uiText("Định tuyến model mặc định", "Routed to default model", "已路由到默认模型");
			case "initial_route":
				return uiText("Tuyến model ban đầu", "Initial model route", "初始模型路由");
			case "model_switch":
				return uiText("Chuyển model", "Model switched", "模型切换");
			case "rate_limit":
				return uiText("Bị giới hạn tốc độ", "Rate limited", "触发限流");
			case "quota_exceeded":
				return uiText("Vượt quota", "Quota exceeded", "超出配额");
			case "auth_failed":
				return uiText("Lỗi xác thực", "Authentication failed", "认证失败");
			case "payload_too_large":
				return uiText("Payload quá lớn", "Payload too large", "负载过大");
			case "auto_continue":
				return uiText("Tự động tiếp tục", "Auto-continue", "自动续写");
			case "provider_error":
				return uiText("Lỗi provider", "Provider error", "提供方错误");
			case "completed":
				return uiText("Hoàn tất lượt", "Turn completed", "本轮完成");
			default:
				return code || uiText("Đang xử lý", "Processing", "处理中");
		}
	}, [uiText]);

	const formatPatchValidatorReason = useCallback((reasonCode?: string): string => {
		const code = String(reasonCode || "").trim().toLowerCase();
		switch (code) {
			case "empty_input":
				return uiText("không có patch đầu vào", "empty patch input", "补丁输入为空");
			case "all_filtered_pre_normalize":
				return uiText("patch bị loại trước normalize", "patch filtered before normalize", "规范化前已被过滤");
			case "all_filtered_overlap_or_limits":
				return uiText("patch chồng lấp hoặc vượt giới hạn", "overlap or limit-filtered patch", "补丁重叠或超限");
			case "empty_after_simulation":
				return uiText("kết quả mô phỏng rỗng", "empty result after simulation", "模拟应用后为空");
			case "shrink_ratio_below_min":
				return uiText("tỷ lệ output thấp hơn ngưỡng", "output ratio below minimum", "输出比例低于阈值");
			case "partial_filtered":
				return uiText("một phần patch bị lọc", "partially filtered patch", "补丁被部分过滤");
			case "validator_disabled":
				return uiText("validator tắt", "validator disabled", "验证器已关闭");
			case "none":
				return uiText("hợp lệ", "valid", "有效");
			default:
				return code || uiText("không rõ", "unknown", "未知");
		}
	}, [uiText]);

	const buildPatchValidatorRetryHint = useCallback((reasonCode?: string): string => {
		const code = String(reasonCode || "").trim().toLowerCase();
		switch (code) {
			case "all_filtered_pre_normalize":
			case "all_filtered_overlap_or_limits":
				return uiText(
					"Yêu cầu textEdits không chồng lấp, line-range hợp lệ, theo đúng vùng cần sửa.",
					"Return non-overlapping textEdits with valid line ranges and strict scope.",
					"请返回不重叠且行范围有效的 textEdits，并严格限制在目标范围。",
				);
			case "empty_after_simulation":
				return uiText(
					"Patch phải tạo thay đổi thực tế sau khi apply mô phỏng, không để output rỗng.",
					"Patch must produce real changes after simulated apply; output cannot be empty.",
					"补丁在模拟应用后必须产生真实变化，输出不能为空。",
				);
			case "shrink_ratio_below_min":
				return uiText(
					"Giữ nguyên phần không liên quan, tránh xóa lớn gây shrink ratio thấp.",
					"Preserve unrelated code and avoid large deletions that reduce output ratio.",
					"保留无关代码，避免大范围删除导致输出比例过低。",
				);
			default:
				return uiText(
					"Trả patch tối thiểu, áp dụng được ngay và không chỉnh ngoài phạm vi.",
					"Return a minimal immediately-applicable patch without out-of-scope edits.",
					"返回最小可立即应用补丁，且不要越范围修改。",
				);
		}
	}, [uiText]);

	const formatPatchDryRunReason = useCallback((reasonCode?: string): string => {
		const code = String(reasonCode || "").trim().toLowerCase();
		switch (code) {
			case "all_conflicted":
				return uiText("mọi patch đều xung đột", "all patches conflicted", "所有补丁均冲突");
			case "partial_conflicted":
				return uiText("một phần patch xung đột", "partially conflicted patch", "部分补丁冲突");
			case "empty_after_simulation":
				return uiText("mô phỏng xong cho ra kết quả rỗng", "empty output after dry-run simulation", "干运行后输出为空");
			case "empty_input":
				return uiText("không có patch để dry-run", "empty patch input for dry-run", "无可用于干运行的补丁");
			case "none":
				return uiText("dry-run hợp lệ", "dry-run valid", "干运行有效");
			default:
				return code || uiText("không rõ", "unknown", "未知");
		}
	}, [uiText]);

	const isLocalProgressMessage = useCallback((raw: string): boolean => {
		const text = String(raw || "").trim().toLowerCase();
		if (!text)
			return false;
		return text.includes("ai local")
			|| text.includes("local ai")
			|| text.includes("local provider")
			|| text.includes("ban dau local")
			|| text.includes("đang xử lý chunk")
			|| text.includes("đang gộp tóm tắt")
			|| text.includes("dang xu ly chunk")
			|| text.includes("dang gop tom tat");
	}, []);

	const formatSystemNotice = useCallback((input: {
		summary: string
		nextStep?: string
		internalCode?: string
		ambiguities?: string[]
		questions?: string[]
	}) => {
		const summary = String(input.summary || "").trim();
		const nextStep = String(input.nextStep || "").trim();
		const internalCode = String(input.internalCode || "").trim();
		const ambiguities = Array.isArray(input.ambiguities) ? input.ambiguities.filter(Boolean) : [];
		const questions = Array.isArray(input.questions) ? input.questions.filter(Boolean) : [];

		return [
			summary
				? `${uiText("Nguyên nhân", "Reason", "原因")}:\n${summary}`
				: "",
			ambiguities.length
				? `${uiText("Các điểm cần lưu ý", "Points to note", "需要注意的点")}:\n${ambiguities.map(item => `- ${item}`).join("\n")}`
				: "",
			questions.length
				? `${uiText("Việc cần làm tiếp", "What to do next", "下一步操作")}:\n${questions.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
				: nextStep
					? `${uiText("Việc cần làm tiếp", "What to do next", "下一步操作")}:\n${nextStep}`
					: "",
			internalCode
				? `${uiText("Mã nội bộ", "Internal code", "内部代码")}: ${internalCode}`
				: "",
		].filter(Boolean).join("\n\n").trim();
	}, [uiText]);

	const syncAgenticReviewState = useCallback(async (requestIdOverride?: string, showErrorToast = false, clearIfNotFound = false) => {
		const safeRequestId = String(requestIdOverride || streamRequestId || "").trim();
		if (!appId || !safeRequestId) {
			return false;
		}
		try {
			const response = await request.get("ai-code-stream/agentic-review-state", {
				searchParams: {
					appId,
					contextType,
					language,
					pName: targetPName || "",
					pType: typeof targetPType === "number" ? targetPType : "",
					requestId: safeRequestId,
				},
				throwHttpErrors: false,
			});
			if (!response.ok) {
				if (showErrorToast) {
					message.warning(uiText("Không đồng bộ được trạng thái review từ server", "Could not sync review state from server", "无法从服务器同步审查状态"));
				}
				return false;
			}
			const data = await response.json() as any;
			const result = data?.result && typeof data.result === "object" ? data.result as Record<string, unknown> : {};
			const found = result.found === true;
			if (!found) {
				if (clearIfNotFound) {
					setAgenticSteps([]);
					setCompletionState("idle");
					setStreamRequestId("");
					clearChatRuntimeSnapshot(runtimeStorageKey);
				}
				return false;
			}
			const nextRequestId = String(result.requestId || safeRequestId).trim() || safeRequestId;
			const nextSteps = normalizePersistedAgenticSteps(result.agenticPendingApprovalSteps);
			const reviewRequired = result.reviewRequired === true
				|| String(result.status || "").trim().toLowerCase() === "review_required"
				|| nextSteps.some(step => step.approvalRequired && step.approvalState === "pending");
			if (nextSteps.length > 0) {
				setAgenticSteps(nextSteps);
				setCompletionState("review_required");
				setStreamRequestId(nextRequestId);
				saveChatRuntimeSnapshot(runtimeStorageKey, {
					agenticSteps: nextSteps,
					completionState: "review_required",
					streamRequestId: nextRequestId,
					updatedAt: Date.now(),
				});
				return true;
			}
			if (clearIfNotFound) {
				setAgenticSteps([]);
				setCompletionState("idle");
				setStreamRequestId("");
				clearChatRuntimeSnapshot(runtimeStorageKey);
			}
			return true;
		}
		catch {
			if (showErrorToast) {
				message.warning(uiText("Không đồng bộ được trạng thái review từ server", "Could not sync review state from server", "无法从服务器同步审查状态"));
			}
			return false;
		}
	}, [appId, contextType, language, runtimeStorageKey, streamRequestId, targetPName, targetPType, uiText]);

	const loadRemoteSessionHistory = useCallback(async (showErrorToast = false) => {
		if (!appId) {
			return;
		}
		try {
			const response = await request.get("ai-assistant-session-history", {
				searchParams: {
					appId,
					contextType,
					language,
					pName: targetPName || "",
					pType: typeof targetPType === "number" ? targetPType : "",
					limit: 100,
				},
				throwHttpErrors: false,
			});
			if (!response.ok) {
				if (showErrorToast) {
					message.warning(uiText("Không tải được lịch sử chat từ server", "Could not load chat history from server", "无法从服务器加载聊天历史"));
				}
				return;
			}
			const data = await response.json() as any;
			const turns = Array.isArray(data?.turns)
				? data.turns
				: (Array.isArray(data?.recent_turns) ? data.recent_turns : []);
			const converted: ChatMessage[] = [];
			let restoredReviewRequestId = "";
			let restoredReviewSteps: AgenticStep[] = [];
			for (let i = 0; i < turns.length; i += 1) {
				const turn = turns[i] || {};
				const turnId = String(turn.turn_id || turn.id || "").trim();
				const parsedTime = Date.parse(String(turn.timestamp || ""));
				const baseTs = Number.isFinite(parsedTime) ? parsedTime : Date.now() - Math.max(0, turns.length - i) * 1000;
				const userText = String(turn.user_message || turn.userRequest || "").trim();
				const assistantRaw = String(turn.assistant_message || turn.ai_response || turn.aiResponse || "").trim();
				const metadata = turn.metadata && typeof turn.metadata === "object" && !Array.isArray(turn.metadata)
					? turn.metadata as Record<string, unknown>
					: {};
				const assistantText = resolvePersistedAssistantDisplayText({
					assistantRaw,
					metadata,
					userRequest: userText,
					uiText,
				});
				const responseModeRaw = String(turn.response_mode || turn.responseMode || "").trim().toLowerCase();
				const responseMode: ResponseMode | undefined = responseModeRaw === "edit"
					? "edit"
					: responseModeRaw === "analyze"
						? "analyze"
						: undefined;
				if (userText) {
					converted.push({
						id: `${turnId || `turn_${i}`}_u`,
						serverTurnId: turnId || undefined,
						role: "user",
						content: userText,
						timestamp: baseTs,
					});
				}
				if (assistantText) {
					const persistedReviewRequired = metadata.reviewRequired === true
						|| String(metadata.status || "").trim().toLowerCase() === "review_required";
					const persistedRequestId = String((turn as any).request_id || (turn as any).requestId || metadata.requestId || "").trim();
					const persistedReviewSteps = normalizePersistedAgenticSteps(metadata.agenticPendingApprovalSteps);
					if (persistedReviewRequired && persistedReviewSteps.length > 0 && persistedRequestId) {
						restoredReviewRequestId = persistedRequestId;
						restoredReviewSteps = persistedReviewSteps;
					}
					const rawRating = Number(turn.feedback_rating);
					const feedbackRating = Number.isFinite(rawRating)
						? Math.max(-1, Math.min(1, rawRating))
						: 0;
					const hideCodeBlocks = shouldHideCodeInChat && responseMode === "edit";
					const codeBlocks = hideCodeBlocks ? [] : extractCodeBlocks(assistantText);
					converted.push({
						id: `${turnId || `turn_${i}`}_a`,
						serverTurnId: turnId || undefined,
						requestId: String((turn as any).request_id || (turn as any).requestId || "").trim() || undefined,
						appId: String((turn as any).app_id || (turn as any).appId || appId || "").trim() || undefined,
						feedbackRating,
						role: "assistant",
						responseMode,
						content: assistantText,
						codeBlocks,
						timestamp: baseTs + 1,
					});
				}
			}

			if (converted.length > 0) {
				const nextMessages = dedupeChatMessages(converted);
				setMessages(nextMessages);
				saveChatHistory(nextMessages);
				if (restoredReviewRequestId && restoredReviewSteps.length > 0) {
					const synced = await syncAgenticReviewState(restoredReviewRequestId, false, true);
					if (!synced) {
						setAgenticSteps(restoredReviewSteps);
						setCompletionState("review_required");
						setStreamRequestId(restoredReviewRequestId);
						saveChatRuntimeSnapshot(runtimeStorageKey, {
							agenticSteps: restoredReviewSteps,
							completionState: "review_required",
							streamRequestId: restoredReviewRequestId,
							updatedAt: Date.now(),
						});
					}
				}
				else {
					setAgenticSteps([]);
					setCompletionState("idle");
					setStreamRequestId("");
					clearChatRuntimeSnapshot(runtimeStorageKey);
				}
				return;
			}

			if (turns.length === 0) {
				setMessages([]);
				saveChatHistory([]);
				setAgenticSteps([]);
				setCompletionState("idle");
				setStreamRequestId("");
				clearChatRuntimeSnapshot(runtimeStorageKey);
			}
		}
		catch {
			if (showErrorToast) {
				message.warning(uiText("Không tải được lịch sử chat từ server", "Could not load chat history from server", "无法从服务器加载聊天历史"));
			}
		}
		finally {
			setServerReviewHydrationDone(true);
		}
	}, [appId, contextType, language, runtimeStorageKey, shouldHideCodeInChat, syncAgenticReviewState, targetPName, targetPType, uiText]);

	const handleRateMessage = useCallback(async (msg: ChatMessage, rating: -1 | 0 | 1) => {
		if (!msg.serverTurnId) {
			return;
		}
		const nextRating = msg.feedbackRating === rating ? 0 : rating;
		try {
			const response = await request.post("ai-assistant-session-feedback", {
				json: {
					appId,
					contextType,
					language,
					pName: targetPName || "",
					pType: typeof targetPType === "number" ? targetPType : undefined,
					turnId: msg.serverTurnId,
					rating: nextRating,
				},
				throwHttpErrors: false,
			});
			if (!response.ok) {
				message.error(uiText("Không lưu được đánh giá", "Failed to save feedback", "保存反馈失败"));
				return;
			}
			setMessages((prev) => {
				const next = prev.map((item) => {
					if (item.serverTurnId !== msg.serverTurnId || item.role !== "assistant") {
						return item;
					}
					return {
						...item,
						feedbackRating: nextRating,
					};
				});
				saveChatHistory(next);
				return next;
			});
		}
		catch {
			message.error(uiText("Không lưu được đánh giá", "Failed to save feedback", "保存反馈失败"));
		}
	}, [appId, contextType, language, targetPName, targetPType, uiText]);

	const handleDeleteMessage = useCallback(async (msg: ChatMessage) => {
		if (!msg.serverTurnId) {
			setMessages((prev) => {
				const next = prev.filter(item => item.id !== msg.id);
				saveChatHistory(next);
				return next;
			});
			return;
		}

		try {
			const response = await request.post("ai-assistant-session-delete", {
				json: {
					appId,
					contextType,
					language,
					pName: targetPName || "",
					pType: typeof targetPType === "number" ? targetPType : undefined,
					turnId: msg.serverTurnId,
					deleteAll: false,
				},
				throwHttpErrors: false,
			});
			if (!response.ok) {
				message.error(uiText("Không xóa được tin nhắn", "Failed to delete message", "删除消息失败"));
				return;
			}
			setMessages((prev) => {
				const next = prev.filter(item => item.serverTurnId !== msg.serverTurnId);
				saveChatHistory(next);
				return next;
			});
		}
		catch {
			message.error(uiText("Không xóa được tin nhắn", "Failed to delete message", "删除消息失败"));
		}
	}, [appId, contextType, language, targetPName, targetPType, uiText]);

	const resolveSystemNextStep = useCallback((internalCode?: string, stage?: string, fallback?: string) => {
		const code = String(internalCode || "").trim().toLowerCase();
		const normalizedStage = String(stage || "").trim().toLowerCase();
		switch (code || normalizedStage) {
			case "authentication_required":
			case "auth_guard":
			case "http_401":
				return uiText("Vui lòng đăng nhập lại rồi gửi lại yêu cầu.", "Please sign in again and resend the request.", "请重新登录后再重新发送请求。");
			case "missing_flow_type":
				return uiText("Hãy mở đúng màn hình editor rồi gửi lại yêu cầu để frontend truyền đủ flowType.", "Open the correct editor screen and resend the request so the frontend can include the required flowType.", "请先打开正确的编辑器页面，再重新发送请求，以便前端带上必需的 flowType。");
			case "flow_context_mismatch":
			case "flow_guard":
				return uiText("Hãy kiểm tra lại bạn đang ở luồng code hay menu rồi gửi lại yêu cầu cho đúng ngữ cảnh.", "Check whether you are in code flow or menu flow, then resend the request with the correct context.", "请确认你当前处于代码流还是菜单流，然后按正确上下文重新发送请求。");
			case "local_provider_unavailable":
				return uiText("Hãy khởi động hoặc kiểm tra local provider rồi thử lại.", "Start or verify the local provider, then try again.", "请先启动或检查本地 provider，然后再试一次。");
			case "local_override_no_cloud_fallback":
				return uiText(
					"Hãy thu hẹp vùng sửa, mô tả cụ thể hơn, hoặc thử lại sau khi kiểm tra log backend theo requestId.",
					"Try narrowing the edit scope, using a more specific prompt, or retry after checking backend logs by requestId.",
					"请缩小修改范围、使用更具体的提示，或在按 requestId 检查后端日志后重试。",
				);
			case "edit_apply_failed":
				return uiText(
					"Hãy mô tả rõ vùng cần sửa hoặc thử lại với prompt ngắn hơn.",
					"Describe the target edit more clearly or retry with a shorter prompt.",
					"请更清楚地描述要修改的区域，或使用更短的提示重试。",
				);
			case "local_provider_circuit_open":
				return uiText("Hãy chờ local provider hết cooldown rồi thử lại sau.", "Wait for the local provider cooldown to finish, then try again.", "请等待本地 provider 冷却结束后再重试。");
			case "requirement_clarification_needed":
				return uiText("Hãy trả lời các câu hỏi làm rõ bên dưới rồi gửi tiếp để backend xử lý an toàn.", "Answer the clarification questions below, then send the request again so the backend can proceed safely.", "请先回答下面的澄清问题，然后再继续发送请求，以便后端安全处理。");
			case "backend_unexpected_error":
				return uiText("Hãy thử lại. Nếu vẫn lỗi, mở log backend theo requestId để xác định stacktrace gốc.", "Try again. If it still fails, inspect backend logs by requestId to locate the root stacktrace.", "请重试；若仍失败，请按 requestId 检查后端日志中的根因堆栈。");
			default:
				return String(fallback || "").trim() || uiText("Bạn có thể thử lại, hoặc kiểm tra log backend nếu lỗi còn lặp lại.", "Try again, or inspect backend logs if the issue keeps happening.", "你可以重试；如果问题持续出现，请检查后端日志。");
		}
	}, [uiText]);

	const showSystemToast = useCallback((kind: "info" | "warning" | "error", input: {
		summary: string
		nextStep?: string
		internalCode?: string
		ambiguities?: string[]
		questions?: string[]
	}) => {
		const content = formatSystemNotice(input);
		if (!content)
			return;
		if (kind === "warning") {
			message.warning(content);
			return;
		}
		if (kind === "info") {
			message.info(content);
			return;
		}
		message.error(content);
	}, [formatSystemNotice]);

	const buildEditApplyFailureNotice = useCallback((reasonCode?: string) => {
		const code = String(reasonCode || "").trim().toLowerCase();
		const isLocalOverride = code.includes("local_override");
		const summary = isLocalOverride
			? uiText(
				`${assistantBrandLabel} không tạo được thay đổi mã hợp lệ trên local provider.`,
				`${assistantBrandLabel} could not produce valid code edits on the local provider.`,
				`${assistantBrandLabel} 无法在本地 provider 上生成有效的代码修改。`,
			)
			: uiText(
				`${assistantBrandLabel} không áp dụng được thay đổi nào vào editor.`,
				`${assistantBrandLabel} did not apply any edits to the editor.`,
				`${assistantBrandLabel} 未能将任何修改应用到编辑器。`,
			);
		return formatSystemNotice({
			summary,
			nextStep: resolveSystemNextStep(code || "edit_apply_failed", "edit_apply_failed"),
			internalCode: code || "EDIT_APPLY_FAILED",
		});
	}, [assistantBrandLabel, formatSystemNotice, resolveSystemNextStep, uiText]);

	const markEditStreamFailureIfNeeded = useCallback((opts: {
		isEditMode: boolean
		reviewRequired?: boolean
		editCandidateCount?: number
		reasonCode?: string
	}): boolean => {
		if (!opts.isEditMode || opts.reviewRequired) {
			return false;
		}
		if (textEditApplyCountRef.current > 0) {
			return false;
		}
		if ((opts.editCandidateCount ?? 0) > 0) {
			return false;
		}
		const startCode = editStreamStartCodeRef.current;
		const applied = lastAppliedCodeRef.current ?? "";
		if (startCode !== applied) {
			return false;
		}

		const notice = buildEditApplyFailureNotice(opts.reasonCode);
		const summaryLine = notice.split("\n").find(line => line.trim()) || notice;
		setMessages((prev) => {
			const updated = [...prev];
			for (let i = updated.length - 1; i >= 0; i -= 1) {
				const lastMsg = updated[i];
				if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
					lastMsg.content = notice;
					lastMsg.codeBlocks = [];
					lastMsg.responseMode = "edit";
					lastMsg.timestamp = Date.now();
					break;
				}
			}
			return updated;
		});
		setCompletionState("error");
		setCompletionErrorMessage(summaryLine);
		setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
		setBackendProgressHint({ stage: "", detail: "" });
		showSystemToast("error", {
			summary: summaryLine,
			nextStep: resolveSystemNextStep(opts.reasonCode, "edit_apply_failed"),
			internalCode: String(opts.reasonCode || "EDIT_APPLY_FAILED").trim().toUpperCase(),
		});
		return true;
	}, [buildEditApplyFailureNotice, resolveSystemNextStep, showSystemToast]);

	const appendModelDecisionTrace = useCallback((input: {
		step: ModelDecisionTrace["step"]
		model?: string
		reason?: string
	}) => {
		const model = String(input.model || "").trim();
		if (!model)
			return;
		const reason = String(input.reason || "").trim();
		setModelDecisionTrace((prev) => {
			const signature = `${input.step}|${model.toLowerCase()}|${reason.toLowerCase()}`;
			const exists = prev.some(item => `${item.step}|${item.model.toLowerCase()}|${String(item.reason || "").toLowerCase()}` === signature);
			if (exists)
				return prev;
			const next: ModelDecisionTrace = {
				id: `md_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				step: input.step,
				model,
				reason: reason || undefined,
				timestamp: Date.now(),
			};
			return [...prev, next].slice(-8);
		});
	}, []);

	// Currency conversion based on user's selected language (uses live rates from fxRatesRef)
	const formatCost = useCallback((usdAmount: number): string => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh")) {
			const cny = usdAmount * fxRatesRef.current.cny;
			return `¥${cny.toFixed(4)}`;
		}
		if (lang.startsWith("en")) {
			return `$${usdAmount.toFixed(6)}`;
		}
		// VI → VND
		const vnd = Math.round(usdAmount * fxRatesRef.current.vnd);
		return `${vnd.toLocaleString("vi-VN")}₫`;
	}, [i18n.language, i18n.resolvedLanguage]);

	const normalizeAssistantProgressMessage = useCallback((rawMessage: unknown, fallback = ""): string => {
		const source = String(rawMessage || "").trim() || String(fallback || "").trim();
		if (!source)
			return "";

		if (/ai\s*local|local\s*ai|local\s*provider|chunk|reduce|gộp\s*tóm\s*tắt|xu\s*ly\s*chunk|xử\s*lý\s*chunk|nạp\s*model|hậu\s*xử\s*lý|suy\s*luận/i.test(source)) {
			return source;
		}

		const waitingMatch = source.match(/~\s*(\d+)\s*s/i);
		const waitingSecs = waitingMatch ? Number(waitingMatch[1]) : Number.NaN;
		const waitedMatch = source.match(/(?:da|đã)\s*cho\s*(\d+)\s*s|waited\s*(\d+)\s*s/i);
		const waitedSecs = waitedMatch ? Number(waitedMatch[1] || waitedMatch[2]) : Number.NaN;
		const receivingMatch = source.match(/(\d+)\s*(?:ký\s*tự|chars?|字符)/i);
		const receivedChars = receivingMatch ? Number(receivingMatch[1]) : Number.NaN;
		if (/dang\s*ket\s*noi\s*gemini|đang\s*kết\s*nối\s*gemini|connecting\s*(to\s*)?gemini|连接\s*gemini|đang\s*kết\s*nối\s*chuyên\s*gia|connecting\s*(to\s*)?expert|正在连接专家/i.test(source)) {
			return uiText("Đang kết nối Chuyên Gia...", "Connecting to Expert...", "正在连接专家...");
		}
		if (/dang\s*gui\s*request\s*den\s*gemini|đang\s*gửi\s*request\s*đến\s*gemini|sending\s*request\s*to\s*gemini|发送\s*请求\s*到\s*gemini|đang\s*gửi\s*yêu\s*cầu\s*đến\s*chuyên\s*gia|sending\s*request\s*to\s*expert|正在向专家发送请求/i.test(source)) {
			return uiText("Đang gửi yêu cầu đến Chuyên Gia...", "Sending request to Expert...", "正在向专家发送请求...");
		}
		if (/gemini\s*dang\s*suy\s*nghi|gemini\s*đang\s*suy\s*nghĩ|gemini\s*is\s*thinking|gemini\s*思考|chuyên\s*gia\s*đang\s*suy\s*nghĩ|expert\s*is\s*thinking|专家正在思考/i.test(source)) {
			if (Number.isFinite(waitingSecs) && waitingSecs > 0) {
				return uiText(
					`Chuyên Gia đang suy nghĩ... (~${waitingSecs}s còn lại)`,
					`Expert is thinking... (~${waitingSecs}s remaining)`,
					`专家正在思考...（约剩余 ${waitingSecs}s）`,
				);
			}
			if (Number.isFinite(waitedSecs) && waitedSecs > 0) {
				return uiText(
					`Chuyên Gia đang suy nghĩ... (đã chờ ${waitedSecs}s)`,
					`Expert is thinking... (waited ${waitedSecs}s)`,
					`专家正在思考...（已等待 ${waitedSecs}s）`,
				);
			}
			return uiText("Chuyên Gia đang suy nghĩ...", "Expert is thinking...", "专家正在思考...");
		}
		if (/bat\s*dau\s*nhan\s*ket\s*qua\s*tu\s*gemini|bắt\s*đầu\s*nhận\s*kết\s*quả\s*từ\s*gemini|start\w*\s*receiv\w*\s*result\w*\s*from\s*gemini|开始\s*接收\s*gemini|bắt\s*đầu\s*nhận\s*kết\s*quả\s*từ\s*chuyên\s*gia|starting\s*to\s*receive\s*result\s*from\s*expert|开始接收专家结果/i.test(source)) {
			return uiText("Bắt đầu nhận kết quả từ Chuyên Gia", "Starting to receive result from Expert", "开始接收专家结果");
		}
		if (/đang\s*nhận\s*kết\s*quả|receiving\s*result|正在接收结果/i.test(source)) {
			if (Number.isFinite(receivedChars) && receivedChars > 0) {
				return uiText(
					`Đang nhận kết quả... (${receivedChars.toLocaleString("vi-VN")} ký tự)`,
					`Receiving result... (${receivedChars.toLocaleString("en-US")} chars)`,
					`正在接收结果...（${receivedChars.toLocaleString("zh-CN")} 字符）`,
				);
			}
			return uiText("Đang nhận kết quả...", "Receiving result...", "正在接收结果...");
		}
		if (/đang\s*chuẩn\s*bị\s*yêu\s*cầu|preparing\s*request|正在准备请求/i.test(source)) {
			return uiText("Đang chuẩn bị yêu cầu...", "Preparing request...", "正在准备请求...");
		}
		if (/đã\s*hủy\s*request\s*theo\s*yêu\s*cầu|request\s*cancelled\s*by\s*user|已按用户要求取消请求/i.test(source)) {
			return uiText("Đã hủy request theo yêu cầu", "Request cancelled by user", "已按用户要求取消请求");
		}

		return uiText("Đang xử lý...", "Processing...", "处理中...");
	}, [assistantBrandLabel, uiText]);

	const stripMarkdownCodeBlocks = useCallback((rawText: unknown): string => {
		return String(rawText || "")
			.replace(/```[\s\S]*?```/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}, []);

	const normalizeUsagePayload = useCallback((usage: any): AiUsageSummary | null => {
		if (!usage || typeof usage !== "object")
			return null;
		const promptTokens = Number(usage.promptTokens);
		const completionTokens = Number(usage.completionTokens);
		const totalTokensRaw = Number(usage.totalTokens);
		const estimatedCostUsd = Number(usage.estimatedCostUsd);
		const totalTokens = Number.isFinite(totalTokensRaw)
			? Math.max(0, Math.floor(totalTokensRaw))
			: Math.max(0, Math.floor(promptTokens || 0) + Math.floor(completionTokens || 0));
		return {
			enabled: Boolean(usage.enabled ?? true),
			model: String(usage.model || ""),
			promptTokens: Number.isFinite(promptTokens) ? Math.max(0, Math.floor(promptTokens)) : 0,
			completionTokens: Number.isFinite(completionTokens) ? Math.max(0, Math.floor(completionTokens)) : 0,
			totalTokens,
			estimatedCostUsd: Number.isFinite(estimatedCostUsd) ? Math.max(0, estimatedCostUsd) : 0,
			currency: String(usage.currency || "USD"),
		};
	}, []);

	useEffect(() => {
		// Fetch live exchange rates once per session from a free CDN-hosted API (no key needed)
		const controller = new AbortController();
		fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json", {
			signal: controller.signal,
		})
			.then(res => res.json())
			.then((data: { usd?: Record<string, number> }) => {
				const rates = data?.usd;
				if (!rates)
					return;
				const vnd = Number(rates.vnd);
				const cny = Number(rates.cny);
				if (vnd > 0 && cny > 0) {
					fxRatesRef.current = { vnd, cny };
				}
			})
			.catch(() => {
				// Silently fall back to hardcoded rates if fetch fails
			});
		return () => controller.abort();
	}, []);

	useEffect(() => {
		setPromptHistory(loadPromptHistory(promptHistoryStorageKey));
		setPromptHistoryIndex(-1);
		setPromptHistoryOriginal("");
	}, [promptHistoryStorageKey]);

	useEffect(() => {
		if (!appId) {
			return;
		}
		if (isLoading || String(streamRequestId || "").trim()) {
			return;
		}
		if (remoteHistoryLoadedScopeRef.current === remoteHistoryScopeKey) {
			return;
		}
		if (remoteHistoryLoadingScopeRef.current === remoteHistoryScopeKey) {
			return;
		}
		remoteHistoryLoadingScopeRef.current = remoteHistoryScopeKey;
		void loadRemoteSessionHistory(false)
			.finally(() => {
				if (remoteHistoryLoadingScopeRef.current === remoteHistoryScopeKey) {
					remoteHistoryLoadingScopeRef.current = "";
				}
				remoteHistoryLoadedScopeRef.current = remoteHistoryScopeKey;
			});
	}, [appId, isLoading, loadRemoteSessionHistory, remoteHistoryScopeKey, streamRequestId]);

	useEffect(() => {
		if (initialReviewStateSyncRef.current) {
			return;
		}
		if (!serverReviewHydrationDone) {
			return;
		}
		if (completionState !== "idle" || agenticSteps.length > 0 || String(streamRequestId || "").trim()) {
			return;
		}
		const snapshotRequestId = String(initialRuntimeSnapshot?.streamRequestId || "").trim();
		if (!snapshotRequestId || initialRuntimeSnapshot?.completionState !== "review_required") {
			return;
		}
		initialReviewStateSyncRef.current = true;
		void syncAgenticReviewState(snapshotRequestId, false, true);
	}, [agenticSteps.length, completionState, initialRuntimeSnapshot, serverReviewHydrationDone, streamRequestId, syncAgenticReviewState]);

	useEffect(() => {
		if (completionState !== "done") {
			setIsProgressDockCollapsed(false);
			return;
		}
		const timer = window.setTimeout(() => {
			setShowMiniProgress(true);
			setIsProgressDockCollapsed(true);
		}, DONE_DOCK_AUTO_COLLAPSE_MS);
		return () => window.clearTimeout(timer);
	}, [completionState]);

	useEffect(() => {
		if (completionState === "done" || completionState === "stream_closed" || completionState === "error" || completionState === "cancelled") {
			setAgenticSteps(prev => prev.length > 0 ? prev.map(s => ({ ...s, status: "done" as const })) : prev);
			const timer = window.setTimeout(() => setAgenticStepsCollapsed(true), 3200);
			return () => window.clearTimeout(timer);
		}
	}, [completionState]);

	useEffect(() => {
		if (completionState === "error" || completionState === "review_required") {
			setIsUsageDockVisible(true);
			return;
		}
		if (completionState === "done" || completionState === "idle" || completionState === "stream_closed" || completionState === "cancelled") {
			setIsUsageDockVisible(false);
		}
	}, [completionState]);

	// Persist final chat history to localStorage after stream completes so reload shows correct content.
	useEffect(() => {
		if (completionState === "done" || completionState === "review_required" || completionState === "stream_closed" || completionState === "error" || completionState === "cancelled") {
			saveChatHistory(messages);
		}
	}, [completionState, messages]);

	const pickPreferredCodeBlock = useCallback((blocks: CodeBlock[]): CodeBlock | null => {
		if (!Array.isArray(blocks) || blocks.length === 0)
			return null;
		const currentLang = String(language || "").trim().toLowerCase();
		const normalize = (input: string) => String(input || "").trim().toLowerCase();
		const aliasMap: Record<string, string[]> = {
			javascript: ["javascript", "js", "jsx", "typescript", "ts", "tsx"],
			html: ["html", "xml"],
			python: ["python", "py"],
			java: ["java"],
			css: ["css", "scss", "less"],
			sql: ["sql", "mysql", "postgres", "postgresql"],
			json: ["json"],
		};
		const accepted = new Set(aliasMap[currentLang] || [currentLang]);
		for (let i = blocks.length - 1; i >= 0; i -= 1) {
			const block = blocks[i];
			const blockLang = normalize(block.language);
			if (!blockLang || accepted.has(blockLang)) {
				return block;
			}
		}
		return blocks[blocks.length - 1] || null;
	}, [language]);

	const formatStageLabel = useCallback((stage: string): string => {
		const normalized = String(stage || "").trim().toLowerCase();
		switch (normalized) {
		case "assistant_route_plan":
			return uiText("Chọn route", "Route planning", "路由规划");
		case "assistant_retrieval_plan":
			return uiText("Lập truy vấn truy hồi", "Retrieval query planning", "检索查询规划");
		case "assistant_fast_exit":
			return uiText("Trả lời nhanh", "Fast reply", "快速回复");
		case "assistant_orchestration_plan":
			return uiText("Lập kế hoạch xử lý", "Orchestration planning", "编排规划");
		case "assistant_orchestration_step_result":
			return uiText("Kết quả bước xử lý", "Step result", "步骤结果");
		case "assistant_orchestration_replan":
			return uiText("Tái lập kế hoạch", "Orchestration replan", "编排重规划");
		case "assistant_multifile_patch_plan":
			return uiText("Kế hoạch patch nhiều file", "Multi-file patch plan", "多文件补丁规划");
		case "assistant_tool_intent_plan":
			return uiText("Lập kế hoạch công cụ", "Tool intent planning", "工具意图规划");
		case "assistant_verify_plan":
			return uiText("Lập kế hoạch kiểm chứng", "Verification planning", "验证规划");
		case "assistant_verify_result":
			return uiText("Kiểm chứng kết quả", "Result verification", "结果验证");
		case "assistant_evidence_gate":
			return uiText("Kiểm tra bằng chứng phân tích", "Analysis evidence gate", "分析证据门控");
		case "assistant_edit_risk_gate":
			return uiText("Đánh giá rủi ro chỉnh sửa", "Edit risk gating", "编辑风险门控");
		case "assistant_semantic_sandbox":
			return uiText("Semantic sandbox trước khi apply", "Pre-apply semantic sandbox", "应用前语义沙箱");
		case "patch_dry_run_rejected":
			return uiText("Dry-run patch bị chặn", "Patch dry-run rejected", "补丁干运行被拒绝");
		case "assistant_tool_execution_result":
			return uiText("Kết quả thực thi công cụ", "Tool execution result", "工具执行结果");
		case "assistant_citations":
			return uiText("Trích dẫn nguồn", "Source citations", "源引用");
		case "assistant_context_budget_gate":
			return uiText("Gating ngữ cảnh", "Context budget gate", "上下文预算门控");
		case "tool_search":
			return uiText("Dò nguồn cần cập nhật", "Exploring necessary updates", "探索需要更新的来源");
		case "tool_prepare":
			return uiText("Phân tích và lập kế hoạch", "Analyzing and planning", "分析并规划");
		case "tool_apply":
			return uiText("Áp kết quả vào editor", "Applying results to editor", "将结果应用到编辑器");
		case "scope_reasoning":
			return uiText("Suy luận theo phạm vi", "Scope reasoning", "范围推理");
		case "dynamic_ingestion":
			return uiText("Nạp bộ nhớ động", "Dynamic ingestion", "动态入库");
		case "agentic_plan_schema":
			return uiText("Kiểm tra schema kế hoạch", "Plan schema verification", "计划结构验证");
		case "agentic_step_verifier":
			return uiText("Kiểm tra chất lượng step", "Step quality verification", "步骤质量验证");
		case "retrieval_quality_gate":
			return uiText("Kiểm tra chất lượng retrieval", "Retrieval quality gate", "检索质量门控");
		case "agentic_step_contract":
			return uiText("Ràng buộc step output", "Step output contract", "步骤输出契约");
			case "preparing":
				return uiText("Chuẩn bị", "Preparing", "准备中");
			case "context":
				return uiText("Phân tích ngữ cảnh", "Context analysis", "上下文分析");
			case "waiting_gemini":
			case "waiting":
				return uiText("Đang chờ xử lý", "Waiting", "等待处理中");
			case "streaming_started":
				return uiText("Bắt đầu nhận kết quả", "Streaming started", "开始接收结果");
			case "streaming_progress":
				return uiText("Đang nhận dữ liệu", "Receiving data", "正在接收数据");
			case "analyzing":
				return uiText("Đang phân tích", "Analyzing", "分析中");
			case "continuing":
				return uiText("Đang tiếp tục", "Continuing", "继续处理中");
			case "cached":
				return uiText("Dùng kết quả đệm", "Using cached result", "使用缓存结果");
			case "streaming":
				return uiText("Đang trả kết quả", "Streaming", "流式输出");
			case "direct_call":
				return uiText("Gọi trực tiếp", "Direct call", "直接调用");
			case "chunking":
				return uiText("Phân khối", "Chunking", "分块处理中");
			case "reducing":
				return uiText("Rút gọn", "Reducing", "归并中");
			case "final_merge":
				return uiText("Tổng hợp cuối", "Final merge", "最终合并");
			case "completed":
			case "complete":
				return uiText("Hoàn tất", "Completed", "已完成");
			case "error":
				return uiText("Lỗi", "Error", "错误");
			case "thinking":
				return uiText("Đang suy luận", "Thinking", "思考中");
			case "connecting":
				return uiText("Đang kết nối", "Connecting", "正在连接");
			case "model_rotate":
				return uiText("Chuyển model", "Switching model", "切换模型");
			default:
				return uiText("Đang xử lý", "Processing", "处理中");
		}
	}, [uiText]);

	const renderProgressText = useCallback((key?: string, args?: Record<string, any>, fallback?: string): string => {
		const normalizedKey = String(key || "").trim().replace(/^aiassistant\.progress\./i, "copilot.progress.");
		if (!normalizedKey)
			return String(fallback || "").trim();
		switch (normalizedKey) {
			case "copilot.progress.phase.preparing":
				return uiText("Chuẩn bị", "Preparing", "准备中");
			case "copilot.progress.phase.chunking":
				return uiText("Phân khối", "Chunking", "分块处理中");
			case "copilot.progress.phase.reducing":
				return uiText("Rút gọn", "Reducing", "归并中");
			case "copilot.progress.phase.final_reasoning":
				return uiText("Suy luận cuối", "Final Reasoning", "最终推理");
			case "copilot.progress.phase.streaming":
				return uiText("Trả dữ liệu", "Streaming", "流式输出");
			case "copilot.progress.phase.completed":
				return uiText("Hoàn tất", "Completed", "已完成");
			case "copilot.progress.phase.error":
				return uiText("Lỗi", "Error", "错误");
			case "copilot.progress.phase.running":
				return uiText("Đang xử lý", "Running", "处理中");
			case "copilot.progress.message.preparing_request":
				return uiText("Đang chuẩn bị yêu cầu AI", "Preparing AI request", "正在准备 AI 请求");
			case "copilot.progress.message.large_context_chunk_mode":
				return uiText("Ngữ cảnh quá lớn, chuyển sang chế độ chunk", "Large context detected, switching to chunk mode", "上下文过大，切换到分块模式");
			case "copilot.progress.message.chunking_prompt_parts":
				return uiText("Đang phân tích từng phần của prompt", "Analyzing prompt parts", "正在分析提示词各部分");
			case "copilot.progress.message.processing_chunk":
				return uiText(
					`Đang xử lý chunk ${args?.current}/${args?.total}`,
					`Processing chunk ${args?.current}/${args?.total}`,
					`正在处理分块 ${args?.current}/${args?.total}`,
				);
			case "copilot.progress.message.updating_draft":
				return uiText("Đang cập nhật bản nháp tạm thời", "Updating live draft", "正在更新临时草稿");
			case "copilot.progress.message.reducing_chunks":
				return uiText("Đang gộp tóm tắt các chunk", "Reducing chunk summaries", "正在合并分块摘要");
			case "copilot.progress.message.reducing_level":
				return uiText(
					`Đang gộp summary level ${args?.level}`,
					`Reducing summary level ${args?.level}`,
					`正在归并第 ${args?.level} 层摘要`,
				);
			case "copilot.progress.message.reducing_level_batch":
				return uiText(
					`Đang gộp summary level ${args?.level} (${args?.batchIndex}/${args?.batchTotal})`,
					`Reducing summary level ${args?.level} (${args?.batchIndex}/${args?.batchTotal})`,
					`正在归并第 ${args?.level} 层摘要（${args?.batchIndex}/${args?.batchTotal}）`,
				);
			case "copilot.progress.message.final_merge":
				return uiText("Đang tổng hợp kết quả cuối", "Building final answer", "正在汇总最终结果");
			case "copilot.progress.message.final_waiting":
				return uiText("Đang chờ phản hồi tổng hợp cuối", "Waiting for final synthesis", "正在等待最终综合结果");
			case "copilot.progress.message.direct_request":
				return uiText("Đang gửi yêu cầu trực tiếp tới AI", "Sending direct AI request", "正在发送 AI 直接请求");
			case "copilot.progress.message.direct_waiting":
				return uiText("Đang chờ phản hồi từ AI", "Waiting for AI response", "正在等待 AI 响应");
			case "copilot.progress.message.streaming_start":
				return uiText("Bắt đầu phiên AI", "Starting AI session", "开始 AI 会话");
			case "copilot.progress.message.receiving_data":
				return uiText("Đang nhận dữ liệu", "Receiving data", "正在接收数据");
			case "copilot.progress.message.connecting_model":
				return uiText(
					`Đang kết nối ${assistantBrandLabel}`,
					`Connecting ${assistantBrandLabel}`,
					`正在连接 ${assistantBrandLabel}`,
				);
			case "copilot.progress.message.local_provider_primary":
				return uiText(
					"Tối ưu chi phí: ưu tiên AI local trước",
					"Cost optimized: prioritize local AI first",
					"成本优化：优先使用本地 AI",
				);
			case "copilot.progress.message.local_quality_fallback":
				return uiText(
					"Kết quả local chưa đạt quality gate, chuyển fallback sang model stream",
					"Local output failed quality gate, switching to stream-model fallback",
					"本地输出未通过质量门禁，切换到流式模型回退",
				);
			case "copilot.progress.message.local_provider_failed":
				return uiText(
					"AI local không trả dữ liệu hợp lệ, chuyển fallback sang model stream",
					"Local AI returned invalid output, switching to stream-model fallback",
					"本地 AI 返回无效结果，切换到流式模型回退",
				);
			case "copilot.progress.message.fallback_to_default":
				return uiText(
					"Model hiện tại lỗi, tự động chuyển sang model mặc định",
					"Current model failed, auto-switching to default model",
					"当前模型失败，自动切换到默认模型",
				);
			case "copilot.progress.message.fallback_to_provider":
				return uiText(
					"Simple/default stream đều thất bại, chuyển sang provider fallback",
					"Simple/default streams failed, switching to provider fallback",
					"简单/默认流均失败，切换到提供方回退",
				);
			case "copilot.progress.message.chat_complete":
				return uiText("Chat hoàn tất", "Chat completed", "对话已完成");
			case "copilot.progress.message.github_fallback":
				return uiText("Provider chính tạm không xử lý được, đang thử fallback", "Primary provider is temporarily unavailable, trying fallback", "主提供方暂时不可用，正在尝试回退");
			case "copilot.progress.message.chat_error":
				return uiText(
					`Chat lỗi: ${args?.error || "unknown"}`,
					`Chat error: ${args?.error || "unknown"}`,
					`对话错误：${args?.error || "unknown"}`,
				);
			case "copilot.progress.message.fast_failover_rate_limit":
				return uiText(
					`Model ${args?.model} đang bị rate-limit, chuyển fallback để giảm trễ`,
					`Model ${args?.model} is rate-limited, switching fallback to reduce latency`,
					`模型 ${args?.model} 已被限流，切换回退以降低延迟`,
				);
			case "copilot.progress.message.waiting_rate_limit":
				return uiText(
					`Đang chờ quota AI${args?.waitingMs ? ` (${args.waitingMs}ms)` : ""}`,
					`Waiting for AI quota${args?.waitingMs ? ` (${args.waitingMs}ms)` : ""}`,
					`正在等待 AI 配额${args?.waitingMs ? `（${args.waitingMs}ms）` : ""}`,
				);
			case "copilot.progress.message.local_loading":
				return uiText(
					`AI local đang nạp model... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`Local AI is loading model... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`本地AI正在加载模型... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
				);
			case "copilot.progress.message.local_infer":
				return uiText(
					`AI local đang suy luận... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`Local AI is inferring... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`本地AI正在推理... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
				);
			case "copilot.progress.message.local_postprocess":
				return uiText(
					`AI local đang hậu xử lý kết quả... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`Local AI is post-processing output... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
					`本地AI正在后处理结果... ${args?.elapsedSecs ?? 0}s/${args?.estimatedWaitSecs ?? 0}s`,
				);
			case "copilot.progress.message.local_chunking_start":
				return uiText(
					`AI local đang chia ngữ cảnh lớn thành ${args?.chunkCount ?? "?"} phần (~${args?.estimatedWaitSecs ?? "?"}s)`,
					`Local AI is chunking large context into ${args?.chunkCount ?? "?"} parts (~${args?.estimatedWaitSecs ?? "?"}s)`,
					`本地AI正在将大上下文拆分为 ${args?.chunkCount ?? "?"} 个分块（约 ${args?.estimatedWaitSecs ?? "?"}s）`,
				);
			case "copilot.progress.message.local_chunking_progress":
				return uiText(
					`Đang xử lý chunk ${args?.current ?? "?"}/${args?.total ?? "?"} (${args?.mode === "heuristic" ? "heuristic" : "local"}) · ${args?.elapsedSecs ?? 0}s, còn ~${args?.remainingSecs ?? "?"}s`,
					`Processing chunk ${args?.current ?? "?"}/${args?.total ?? "?"} (${args?.mode === "heuristic" ? "heuristic" : "local"}) · ${args?.elapsedSecs ?? 0}s elapsed, ~${args?.remainingSecs ?? "?"}s left`,
					`正在处理分块 ${args?.current ?? "?"}/${args?.total ?? "?"}（${args?.mode === "heuristic" ? "heuristic" : "local"}）· 已耗时 ${args?.elapsedSecs ?? 0}s，预计剩余 ${args?.remainingSecs ?? "?"}s`,
				);
			case "copilot.progress.message.local_chunking_reduce_start":
				return uiText(
					`Đang gộp tóm tắt ${args?.chunkCount ?? "?"} chunk để tạo context gọn · ${args?.elapsedSecs ?? 0}s, còn ~${args?.remainingSecs ?? "?"}s`,
					`Reducing ${args?.chunkCount ?? "?"} chunk summaries into compact context · ${args?.elapsedSecs ?? 0}s elapsed, ~${args?.remainingSecs ?? "?"}s left`,
					`正在合并 ${args?.chunkCount ?? "?"} 个分块摘要为紧凑上下文 · 已耗时 ${args?.elapsedSecs ?? 0}s，预计剩余 ${args?.remainingSecs ?? "?"}s`,
				);
			case "copilot.progress.message.local_chunking_done":
				return uiText(
					`Đã nén context còn ${args?.outputChars ?? "?"} ký tự trong ${args?.elapsedSecs ?? "?"}s`,
					`Context compressed to ${args?.outputChars ?? "?"} chars in ${args?.elapsedSecs ?? "?"}s`,
					`上下文已压缩至 ${args?.outputChars ?? "?"} 字符，用时 ${args?.elapsedSecs ?? "?"}s`,
				);
			case "copilot.progress.message.local_preanalysis_infer":
				return uiText(
					`AI local đang suy luận pre-analysis (~${args?.estimatedWaitSecs ?? "?"}s)`,
					`Local AI is running pre-analysis inference (~${args?.estimatedWaitSecs ?? "?"}s)`,
					`本地AI正在进行预分析推理（约 ${args?.estimatedWaitSecs ?? "?"}s）`,
				);
			case "copilot.progress.message.local_preanalysis_fallback_cloud":
				return uiText(
					"AI local không xử lý trọn vẹn, chuyển sang cloud context fallback",
					"Local AI could not complete safely, switching to cloud-context fallback",
					"本地AI无法完整处理，切换到云上下文回退",
				);
			case "copilot.progress.message.local_preanalysis_budget_trim":
				return uiText(
					`Đã rút gọn ngữ cảnh local ${args?.beforeChars ?? "?"} -> ${args?.afterChars ?? "?"} ký tự (budget ~${args?.tokenBudget ?? "?"} tokens)`,
					`Trimmed local context ${args?.beforeChars ?? "?"} -> ${args?.afterChars ?? "?"} chars (budget ~${args?.tokenBudget ?? "?"} tokens)`,
					`已裁剪本地上下文 ${args?.beforeChars ?? "?"} -> ${args?.afterChars ?? "?"} 字符（预算约 ${args?.tokenBudget ?? "?"} tokens）`,
				);
			case "copilot.progress.message.completed":
				return uiText("Đã hoàn tất xử lý AI", "AI processing completed", "AI 处理已完成");
			case "copilot.progress.detail.deciding_mode":
				return uiText("Đang kiểm tra kích thước ngữ cảnh và quyết định direct/chunk mode", "Checking context size and deciding direct vs chunk mode", "正在检查上下文大小并决定直连或分块模式");
			case "copilot.progress.detail.streaming_chunk_fallback":
				return uiText("Ngữ cảnh lớn vượt ngưỡng streaming direct, kích hoạt chunk mode map-reduce", "Large context exceeded direct streaming threshold, enabling chunked map-reduce", "大上下文超过直连流式阈值，启用分块 map-reduce");
			case "copilot.progress.detail.split_into_chunks":
				return uiText(
					`Đã chia ngữ cảnh thành ${args?.chunkCount} phần để phân tích tuần tự`,
					`Split context into ${args?.chunkCount} parts for sequential analysis`,
					`已将上下文拆分为 ${args?.chunkCount} 个部分以顺序分析`,
				);
			case "copilot.progress.detail.analyzing_chunk":
				return uiText(
					`Đang phân tích phần [${args?.current}/${args?.total}] bằng model chunk-summary`,
					`Analyzing part [${args?.current}/${args?.total}] with chunk-summary model`,
					`正在使用 chunk-summary 模型分析第 [${args?.current}/${args?.total}] 部分`,
				);
			case "copilot.progress.detail.chunk_completed":
				return uiText(
					`Đã hoàn tất phân tích phần [${args?.current}/${args?.total}]`,
					`Completed analysis for part [${args?.current}/${args?.total}]`,
					`已完成第 [${args?.current}/${args?.total}] 部分分析`,
				);
			case "copilot.progress.detail.reducing_summaries":
				return uiText(
					`Đang gom ${args?.chunkCount} bản tóm tắt để tạo bộ nhớ tạm cho suy luận cuối`,
					`Combining ${args?.chunkCount} summaries for final reasoning memory`,
					`正在合并 ${args?.chunkCount} 份摘要以构建最终推理上下文`,
				);
			case "copilot.progress.detail.final_reasoning":
				return uiText(
					"Đang tổng hợp toàn bộ chunk summaries thành kết quả cuối cùng",
					"Synthesizing all chunk summaries into the final answer",
					"正在将全部分块摘要综合为最终结果",
				);
			case "copilot.progress.detail.completed_pipeline":
				return uiText(
					"Đã hoàn tất toàn bộ quy trình preparing -> chunking -> reducing -> final reasoning",
					"Completed the full pipeline: preparing -> chunking -> reducing -> final reasoning",
					"已完成完整流程：preparing -> chunking -> reducing -> final reasoning",
				);
			case "copilot.progress.detail.github_fallback":
				return uiText(
					`Chi tiết: ${args?.error || "không rõ lỗi"}`,
					`Details: ${args?.error || "unknown error"}`,
					`详情：${args?.error || "未知错误"}`,
				);
			default:
				return String(fallback || "").trim();
		}
	}, [assistantBrandLabel, uiText]);

	const getStageTone = useCallback((stage: string, orchestrationPhase?: string): "preparing" | "chunking" | "reducing" | "final" | "completed" | "error" | "default" => {
		const normalizedPhase = String(orchestrationPhase || "").trim().toLowerCase();
		const normalizedStage = String(stage || "").trim().toLowerCase();
	if (normalizedStage === "assistant_route_plan")
		return "preparing";
	if (normalizedStage === "assistant_fast_exit")
		return "final";
	if (normalizedStage === "assistant_orchestration_plan")
		return "preparing";
	if (normalizedStage === "assistant_orchestration_step_result")
		return "chunking";
	if (normalizedStage === "assistant_orchestration_replan")
		return "chunking";
	if (normalizedStage === "assistant_multifile_patch_plan")
		return "preparing";
	if (normalizedStage === "assistant_tool_intent_plan")
		return "preparing";
	if (normalizedStage === "assistant_verify_plan")
		return "preparing";
	if (normalizedStage === "assistant_verify_result")
		return "final";
	if (normalizedStage === "assistant_tool_execution_result")
		return "final";
	if (normalizedStage === "assistant_citations")
		return "final";
	if (normalizedStage === "assistant_evidence_gate")
		return "final";
	if (normalizedStage === "assistant_edit_risk_gate")
		return "final";
	if (normalizedStage === "assistant_semantic_sandbox")
		return "final";
	if (normalizedStage === "patch_dry_run_rejected")
		return "error";
	if (normalizedStage === "scope_reasoning")
		return "preparing";
	if (normalizedStage === "dynamic_ingestion")
		return "chunking";
	if (normalizedStage === "agentic_plan_schema")
		return "final";
	if (normalizedStage === "agentic_step_verifier")
		return "final";
	if (normalizedStage === "retrieval_quality_gate")
		return "final";
	if (normalizedStage === "agentic_step_contract")
		return "error";
		const key = normalizedPhase || normalizedStage;
		if (key.includes("preparing"))
			return "preparing";
		if (key.includes("chunking"))
			return "chunking";
		if (key.includes("reducing"))
			return "reducing";
		if (key.includes("final"))
			return "final";
		if (key.includes("complete"))
			return "completed";
		if (key.includes("error"))
			return "error";
		return "default";
	}, []);

	const formatStageToneLabel = useCallback((tone: "preparing" | "chunking" | "reducing" | "final" | "completed" | "error" | "default") => {
		switch (tone) {
			case "preparing":
				return uiText("Chuẩn bị", "Preparing", "准备中");
			case "chunking":
				return uiText("Phân khối", "Chunking", "分块处理中");
			case "reducing":
				return uiText("Rút gọn", "Reducing", "归并中");
			case "final":
				return uiText("Suy luận cuối", "Final", "最终阶段");
			case "completed":
				return uiText("Hoàn tất", "Completed", "已完成");
			case "error":
				return uiText("Lỗi", "Error", "错误");
			default:
				return uiText("Khác", "Other", "其他");
		}
	}, [uiText]);

	const extractStageRangeLabel = useCallback((data: any): string | undefined => {
		const candidates: any[]
			= (Array.isArray(data?.textEdits) && data.textEdits.length > 0 && data.textEdits)
			  || (Array.isArray(data?.lineRanges) && data.lineRanges.length > 0 && data.lineRanges)
			  || (Array.isArray(data?.changedRanges) && data.changedRanges.length > 0 && data.changedRanges)
			  || [];
		if (candidates.length === 0)
			return undefined;

		const normalizeLine = (item: any, key: "start" | "end"): number => {
			const raw = key === "start"
				? (item?.startLine ?? item?.fromLine ?? item?.range?.startLine ?? item?.range?.start?.line)
				: (item?.endLine ?? item?.toLine ?? item?.range?.endLine ?? item?.range?.end?.line ?? item?.startLine ?? item?.fromLine);
			const value = Number(raw);
			return Number.isFinite(value) ? Math.max(1, value) : 1;
		};

		const ranges = candidates
			.slice(0, 3)
			.map((item) => {
				const startLine = normalizeLine(item, "start");
				const endLine = Math.max(startLine, normalizeLine(item, "end"));
				return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
			});
		if (ranges.length === 0)
			return undefined;
		if (candidates.length > 3) {
			ranges.push(`+${candidates.length - 3}`);
		}
		return ranges.join(", ");
	}, []);

	const appendStageEvent = useCallback((data: any) => {
		const normalizeProgressArgs = (raw: any): Record<string, any> | undefined => {
			if (raw && typeof raw === "object" && !Array.isArray(raw)) {
				return raw as Record<string, any>;
			}
			if (typeof raw === "string") {
				const text = raw.trim();
				if (text.startsWith("{") && text.endsWith("}")) {
					try {
						const parsed = JSON.parse(text);
						if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
							return parsed as Record<string, any>;
						}
					}
					catch {
						return undefined;
					}
				}
			}
			return undefined;
		};

		const stage = String(data?.stage || data?.status || "").trim();
		const status = String(data?.status || "").trim();
		const traceStatus = String(data?.traceStatus || data?.status || "").trim();
		const toolName = String(data?.toolName || "").trim();
		const retryCountNum = Number(data?.retryCount);
		const errorClass = String(data?.errorClass || "").trim();
		const errorCode = String(data?.errorCode || "").trim();
		const model = String(data?.model || "").trim();
		const requestId = String(data?.requestId || "").trim();
		const msg = normalizeAssistantProgressMessage(String(data?.message || "").trim());
		const messageKey = String(data?.messageKey || "").trim();
		const messageArgs = normalizeProgressArgs(data?.messageArgs);
		const detail = normalizeAssistantProgressMessage(String(data?.detail || "").trim());
		const detailKey = String(data?.detailKey || "").trim();
		const detailArgs = normalizeProgressArgs(data?.detailArgs);
		const orchestrationPhase = String(data?.orchestrationPhase || "").trim();
		const orchestrationPhaseKey = String(data?.orchestrationPhaseKey || "").trim();
		const scopeMaskNum = Number(data?.scopeMask);
		const scopeSummary = String(data?.scopeSummary || "").trim();
		const scopeTags = Array.isArray(data?.scopeTags)
			? data.scopeTags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
			: [];
		const queueState = String(data?.queueState || "").trim();
		const dynamicSource = String(data?.dynamicSource || "").trim();
		const prunedSourcesNum = Number(data?.prunedSources);
		const retrievalCharsNum = Number(data?.retrievalChars);
		const minCharsNum = Number(data?.minChars);
		const deficitNum = Number(data?.deficit);
		const retryApplied = Boolean(data?.retryApplied);
		const patchValidator = normalizePatchValidatorMeta(data?.patchValidator);
		const patchDryRun = normalizePatchDryRunMeta(data?.patchDryRun);
		const rangeLabel = extractStageRangeLabel(data);
		const hasValue = stage || msg || messageKey || detail || detailKey || orchestrationPhase || orchestrationPhaseKey || Number.isFinite(Number(data?.percent)) || Number.isFinite(Number(data?.overallPercent)) || Boolean(rangeLabel) || Boolean(patchValidator) || Boolean(patchDryRun);
		if (!hasValue)
			return;

		const overallPercentNum = Number(data?.overallPercent);
		const percentNum = Number(data?.percent);
		const currentNum = Number(data?.current);
		const totalNum = Number(data?.total);
		const signature = [
			stage.toLowerCase(),
			status.toLowerCase(),
			traceStatus.toLowerCase(),
			toolName.toLowerCase(),
			Number.isFinite(retryCountNum) ? retryCountNum : "",
			errorClass.toLowerCase(),
			errorCode.toLowerCase(),
			model.toLowerCase(),
			requestId.toLowerCase(),
			messageKey,
			orchestrationPhase,
			orchestrationPhaseKey,
			msg,
			JSON.stringify(messageArgs || {}),
			detail,
			detailKey,
			JSON.stringify(detailArgs || {}),
			Number.isFinite(overallPercentNum) ? overallPercentNum : "",
			Number.isFinite(percentNum) ? percentNum : "",
			Number.isFinite(currentNum) ? currentNum : "",
			Number.isFinite(totalNum) ? totalNum : "",
			Number.isFinite(scopeMaskNum) ? scopeMaskNum : "",
			scopeSummary,
			scopeTags.join(","),
			queueState.toLowerCase(),
			dynamicSource.toLowerCase(),
			Number.isFinite(prunedSourcesNum) ? prunedSourcesNum : "",
			Number.isFinite(retrievalCharsNum) ? retrievalCharsNum : "",
			Number.isFinite(minCharsNum) ? minCharsNum : "",
			Number.isFinite(deficitNum) ? deficitNum : "",
			retryApplied ? "1" : "0",
			patchValidator?.rejectionReason || "",
			patchValidator?.acceptedCount ?? "",
			patchValidator?.rejectedCount ?? "",
			patchDryRun?.rejectionReason || "",
			patchDryRun?.acceptedCount ?? "",
			patchDryRun?.rejectedCount ?? "",
			patchDryRun?.conflictCount ?? "",
			rangeLabel || "",
		].join("|");

		if (stageEventSignaturesRef.current.has(signature))
			return;
		stageEventSignaturesRef.current.add(signature);

		const nextEvent = {
			id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			stage: stage || "processing",
			status: status || undefined,
			traceStatus: traceStatus || undefined,
			toolName: toolName || undefined,
			retryCount: Number.isFinite(retryCountNum) ? Math.max(0, Math.floor(retryCountNum)) : undefined,
			errorClass: errorClass || undefined,
			errorCode: errorCode || undefined,
			model: model || undefined,
			requestId: requestId || undefined,
			scopeMask: Number.isFinite(scopeMaskNum) ? scopeMaskNum : undefined,
			scopeSummary: scopeSummary || undefined,
			scopeTags: scopeTags.length > 0 ? scopeTags : undefined,
			queueState: queueState || undefined,
			dynamicSource: dynamicSource || undefined,
			prunedSources: Number.isFinite(prunedSourcesNum) ? prunedSourcesNum : undefined,
			retrievalChars: Number.isFinite(retrievalCharsNum) ? retrievalCharsNum : undefined,
			minChars: Number.isFinite(minCharsNum) ? minCharsNum : undefined,
			deficit: Number.isFinite(deficitNum) ? deficitNum : undefined,
			retryApplied,
			patchValidator,
			patchDryRun,
			message: msg,
			messageKey: messageKey || undefined,
			messageArgs,
			detail: detail || undefined,
			detailKey: detailKey || undefined,
			detailArgs,
			orchestrationPhase: orchestrationPhase || undefined,
			orchestrationPhaseKey: orchestrationPhaseKey || undefined,
			overallPercent: Number.isFinite(overallPercentNum) ? overallPercentNum : undefined,
			percent: Number.isFinite(percentNum) ? percentNum : undefined,
			current: Number.isFinite(currentNum) ? currentNum : undefined,
			total: Number.isFinite(totalNum) ? totalNum : undefined,
			rangeLabel,
			timestamp: Date.now(),
		};

		setStageEvents((prev) => {
			if (String(nextEvent.stage || "").toLowerCase().startsWith("tool_trace_")) {
				const matchRequestId = String(nextEvent.requestId || "");
				let replaced = false;
				const updated = prev.map((item) => {
					const sameLane = String(item.stage || "").toLowerCase() === String(nextEvent.stage || "").toLowerCase();
					const sameRequest = String(item.requestId || "") === matchRequestId;
					if (sameLane && sameRequest) {
						replaced = true;
						return { ...item, ...nextEvent, id: item.id, timestamp: Date.now() };
					}
					return item;
				});
				if (replaced) {
					return updated.slice(-40);
				}
			}

			const last = prev[prev.length - 1];
			if (last) {
				const lastPercent = Number.isFinite(Number(last.overallPercent))
					? Number(last.overallPercent)
					: (Number.isFinite(Number(last.percent)) ? Number(last.percent) : undefined);
				const nextPercent = Number.isFinite(Number(nextEvent.overallPercent))
					? Number(nextEvent.overallPercent)
					: (Number.isFinite(Number(nextEvent.percent)) ? Number(nextEvent.percent) : undefined);
				const sameCoreSignal = String(last.stage || "").toLowerCase() === String(nextEvent.stage || "").toLowerCase()
					&& String(last.toolName || "") === String(nextEvent.toolName || "")
					&& String(last.traceStatus || "") === String(nextEvent.traceStatus || "")
					&& String(last.messageKey || "") === String(nextEvent.messageKey || "")
					&& String(last.detailKey || "") === String(nextEvent.detailKey || "")
					&& String(last.orchestrationPhaseKey || "") === String(nextEvent.orchestrationPhaseKey || "")
					&& String(last.requestId || "") === String(nextEvent.requestId || "")
					&& String(last.rangeLabel || "") === String(nextEvent.rangeLabel || "")
					&& String(last.message || "") === String(nextEvent.message || "")
					&& String(last.detail || "") === String(nextEvent.detail || "");
				const samePercent = (lastPercent == null && nextPercent == null) || lastPercent === nextPercent;
				const sameRetry = Number(last.retryCount ?? -1) === Number(nextEvent.retryCount ?? -1);
				const sameError = String(last.errorClass || "") === String(nextEvent.errorClass || "")
					&& String(last.errorCode || "") === String(nextEvent.errorCode || "");
				if (sameCoreSignal && samePercent && sameRetry && sameError) {
					return prev;
				}
			}
			const next: AiAssistantStageEvent[] = [...prev, nextEvent];
			return next.slice(-40);
		});
	}, [extractStageRangeLabel, normalizeAssistantProgressMessage]);

	const liveBackendStepLabel = useMemo(() => {
		const stage = String(backendProgressHint.stage || "").trim();
		const detail = String(backendProgressHint.detail || "").trim();
		if (!stage && !detail)
			return "";
		if (!detail)
			return stage;
		if (!stage)
			return detail;
		return `${stage}: ${detail}`;
	}, [backendProgressHint.detail, backendProgressHint.stage]);

	const formatQueueStateLabel = useCallback((stateRaw: string): string => {
		const state = String(stateRaw || "").trim().toLowerCase();
		if (!state)
			return "";
		if (state === "queued")
			return uiText("đang xếp hàng", "queued", "已排队");
		if (state === "indexed")
			return uiText("đã index", "indexed", "已索引");
		return state;
	}, [uiText]);

	const formatRiskLevelLabel = useCallback((riskLevelRaw?: string): string => {
		const level = String(riskLevelRaw || "").trim().toLowerCase();
		if (!level)
			return "";
		switch (level) {
			case "low":
				return uiText("thấp", "low", "低");
			case "medium":
				return uiText("trung bình", "medium", "中");
			case "high":
				return uiText("cao", "high", "高");
			default:
				return level;
		}
	}, [uiText]);

	const formatVerdictLabel = useCallback((verdictRaw?: string): string => {
		const verdict = String(verdictRaw || "").trim().toLowerCase();
		if (!verdict)
			return "";
		switch (verdict) {
			case "passed":
				return uiText("đạt", "passed", "已通过");
			case "blocked":
				return uiText("bị chặn", "blocked", "已阻止");
			case "failed":
				return uiText("thất bại", "failed", "失败");
			case "warning":
				return uiText("cảnh báo", "warning", "警告");
			case "rejected":
				return uiText("bị từ chối", "rejected", "已拒绝");
			default:
				return verdict;
		}
	}, [uiText]);

	const formatInternalFlagLabel = useCallback((flagRaw?: string): string => {
		const flag = String(flagRaw || "").trim().toLowerCase();
		if (!flag)
			return "";
		switch (flag) {
			case "block-auto-apply":
				return uiText("chặn tự apply", "auto-apply blocked", "已阻止自动应用");
			case "review-required":
				return uiText("cần duyệt", "review required", "需要审核");
			case "low-confidence":
				return uiText("độ tin cậy thấp", "low confidence", "低置信度");
			default:
				return flag;
		}
	}, [uiText]);

	const buildDynamicIngestionParts = useCallback((input: {
		state?: string
		source?: string
		pruned?: number
	}): string[] => {
		const state = String(input.state || "").trim().toLowerCase();
		const source = String(input.source || "").trim();
		const pruned = Number(input.pruned);
		const parts: string[] = [];
		if (state) {
			const localizedState = formatQueueStateLabel(state);
			parts.push(uiText(
				`trạng thái ${localizedState}`,
				`state ${localizedState}`,
				`状态 ${localizedState}`,
			));
		}
		if (source)
			parts.push(uiText(`nguồn ${source}`, `source ${source}`, `来源 ${source}`));
		if (Number.isFinite(pruned) && pruned > 0)
			parts.push(uiText(`lọc bớt ${pruned}`, `pruned ${pruned}`, `裁剪 ${pruned}`));
		return parts;
	}, [formatQueueStateLabel, uiText]);

	const formatScopeReasoningLabel = useCallback((scopeSummaryRaw?: string, scopeMaskRaw?: number, scopeTagsRaw?: string[], includeTags = true): string => {
		const summary = String(scopeSummaryRaw || "").trim();
		const mask = Number(scopeMaskRaw);
		const tags = Array.isArray(scopeTagsRaw)
			? scopeTagsRaw.map(item => String(item || "").trim()).filter(Boolean).slice(0, 3)
			: [];
		if (!summary && !Number.isFinite(mask) && tags.length === 0)
			return "";
		const tagsSuffix = includeTags && tags.length > 0 ? ` · ${tags.map(tag => `#${tag}`).join(" ")}` : "";
		return uiText(
			`Phạm vi truy hồi: ${summary || "tự động"}${Number.isFinite(mask) ? ` (mask=${mask})` : ""}${tagsSuffix}`,
			`Retrieval scope: ${summary || "auto"}${Number.isFinite(mask) ? ` (mask=${mask})` : ""}${tagsSuffix}`,
			`检索范围: ${summary || "自动"}${Number.isFinite(mask) ? `（mask=${mask}）` : ""}${tagsSuffix}`,
		);
	}, [uiText]);

	const liveOrchestrationHintLabel = useMemo(() => {
		for (let i = stageEvents.length - 1; i >= 0; i -= 1) {
			const event = stageEvents[i];
			if (!event)
				continue;
			const eventStage = String(event.stage || "").trim().toLowerCase();
			if (eventStage === "scope_reasoning") {
				const scopeLabel = formatScopeReasoningLabel(event.scopeSummary, event.scopeMask, event.scopeTags);
				if (scopeLabel)
					return scopeLabel;
				const fallbackMessage = String(event.detail || event.message || "").trim();
				if (fallbackMessage)
					return fallbackMessage;
			}
			if (eventStage === "dynamic_ingestion") {
				const parts = buildDynamicIngestionParts({
					state: String(event.queueState || event.status || ""),
					source: event.dynamicSource,
					pruned: event.prunedSources,
				});
				if (parts.length > 0) {
					return uiText(
						`Nạp động: ${parts.join(" · ")}`,
						`Ingestion: ${parts.join(" · ")}`,
						`动态入库: ${parts.join(" · ")}`,
					);
				}
				const fallbackMessage = String(event.detail || event.message || "").trim();
				if (fallbackMessage)
					return fallbackMessage;
			}
			if (eventStage === "retrieval_quality_gate") {
				const status = String(event.status || "").trim().toLowerCase();
				const chars = Number.isFinite(Number(event.retrievalChars)) ? Number(event.retrievalChars) : undefined;
				const minChars = Number.isFinite(Number(event.minChars)) ? Number(event.minChars) : undefined;
				const deficit = Number.isFinite(Number(event.deficit)) ? Number(event.deficit) : undefined;
				const retryApplied = Boolean(event.retryApplied);
				if (chars != null || minChars != null || deficit != null || retryApplied || status) {
					return uiText(
						`Retrieval gate: ${status || "running"}${chars != null ? ` · chars=${chars}` : ""}${minChars != null ? `/${minChars}` : ""}${deficit != null && deficit > 0 ? ` · thiếu ${deficit}` : ""}${retryApplied ? " · có remediation" : ""}`,
						`Retrieval gate: ${status || "running"}${chars != null ? ` · chars=${chars}` : ""}${minChars != null ? `/${minChars}` : ""}${deficit != null && deficit > 0 ? ` · deficit ${deficit}` : ""}${retryApplied ? " · remediation applied" : ""}`,
						`检索门控：${status || "running"}${chars != null ? ` · chars=${chars}` : ""}${minChars != null ? `/${minChars}` : ""}${deficit != null && deficit > 0 ? ` · 缺口 ${deficit}` : ""}${retryApplied ? " · 已补救" : ""}`,
					);
				}
				const fallbackMessage = String(event.detail || event.message || "").trim();
				if (fallbackMessage)
					return fallbackMessage;
			}
			if (eventStage === "agentic_step_contract") {
				const status = String(event.status || "").trim().toLowerCase();
				const fallbackMessage = String(event.detail || event.message || "").trim();
				if (status || fallbackMessage) {
					return uiText(
						`Step contract: ${status || "unknown"}${fallbackMessage ? ` · ${fallbackMessage}` : ""}`,
						`Step contract: ${status || "unknown"}${fallbackMessage ? ` · ${fallbackMessage}` : ""}`,
						`步骤契约：${status || "unknown"}${fallbackMessage ? ` · ${fallbackMessage}` : ""}`,
					);
				}
			}
		}
		return "";
	}, [buildDynamicIngestionParts, formatScopeReasoningLabel, stageEvents, uiText]);

	const liveOrchestrationBadge = useMemo((): { label: string, tone: "scope" | "queued" | "indexed" | "retrieval_low" } | null => {
		for (let i = stageEvents.length - 1; i >= 0; i -= 1) {
			const event = stageEvents[i];
			if (!event)
				continue;
			const eventStage = String(event.stage || "").trim().toLowerCase();
			if (eventStage === "retrieval_quality_gate") {
				const status = String(event.status || "").trim().toLowerCase();
				if (status === "low_evidence") {
					return {
						label: uiText("Low Evidence", "Low Evidence", "证据偏低"),
						tone: "retrieval_low",
					};
				}
			}
			if (eventStage === "dynamic_ingestion") {
				const state = String(event.queueState || event.status || "").trim().toLowerCase();
				if (state === "queued") {
					return {
						label: uiText("Queued", "Queued", "已排队"),
						tone: "queued",
					};
				}
				if (state === "indexed") {
					return {
						label: uiText("Indexed", "Indexed", "已索引"),
						tone: "indexed",
					};
				}
			}
			if (eventStage === "scope_reasoning") {
				return {
					label: uiText("Scoped", "Scoped", "已锁定范围"),
					tone: "scope",
				};
			}
		}
		return null;
	}, [stageEvents, uiText]);

	const groupedVisibleStageEvents = useMemo(() => {
		const orderedTones: Array<"preparing" | "chunking" | "reducing" | "final" | "completed" | "error" | "default"> = [
			"preparing",
			"chunking",
			"reducing",
			"final",
			"completed",
			"error",
			"default",
		];
		const buckets = new Map<string, AiAssistantStageEvent[]>();
		for (const event of visibleStageEvents) {
			const tone = getStageTone(event.stage, event.orchestrationPhase);
			if (!buckets.has(tone)) {
				buckets.set(tone, []);
			}
			buckets.get(tone)!.push(event);
		}

		return orderedTones
			.filter(tone => (buckets.get(tone)?.length || 0) > 0)
			.map(tone => ({
				tone,
				label: formatStageToneLabel(tone),
				events: buckets.get(tone) || [],
			}));
	}, [visibleStageEvents, getStageTone, formatStageToneLabel]);

	const lowConfidenceAgenticSteps = useMemo(
		() => agenticSteps.filter(step => Boolean(step.lowConfidence)),
		[agenticSteps],
	);

	const pendingApprovalAgenticSteps = useMemo(
		() => agenticSteps.filter(step => step.approvalRequired && step.approvalState === "pending"),
		[agenticSteps],
	);

	useEffect(() => {
		const shouldPersistReviewLoop = completionState === "review_required"
			|| agenticSteps.some(step => step.approvalRequired && step.approvalState === "pending");
		if (!shouldPersistReviewLoop) {
			clearChatRuntimeSnapshot(runtimeStorageKey);
			return;
		}
		saveChatRuntimeSnapshot(runtimeStorageKey, {
			agenticSteps,
			completionState,
			streamRequestId: String(streamRequestId || "").trim() || undefined,
			updatedAt: Date.now(),
		});
	}, [agenticSteps, completionState, runtimeStorageKey, streamRequestId]);

	useEffect(() => {
		if (completionState !== "review_required") {
			return;
		}
		if (pendingApprovalAgenticSteps.length > 0) {
			return;
		}
		const reviewResolutionKey = String(streamRequestId || "__review_resolved__").trim();
		if (reviewResolutionFeedbackSentRef.current !== reviewResolutionKey) {
			reviewResolutionFeedbackSentRef.current = reviewResolutionKey;
			const safeRequestId = String(streamRequestId || "").trim();
			if (safeRequestId) {
				void request.post("ai-code-stream/agentic-approval-feedback", {
					json: {
						appId,
						language,
						contextType,
						requestId: safeRequestId,
						action: "resolved",
					},
				}).catch(() => {
					// Best-effort telemetry only. UI flow should not be blocked.
				});
			}
		}
		appendStageEvent({
			stage: "review_resolved",
			status: "completed",
			requestId: streamRequestId || undefined,
			message: uiText(
				"Đã xử lý xong tất cả bước chờ duyệt",
				"All pending approval steps were resolved",
				"所有待批准步骤均已处理完毕",
			),
			detail: uiText(
				"Kết thúc lượt agentic sau vòng review thủ công.",
				"Closing the agentic turn after manual review completed.",
				"手动审核完成后结束 agentic 回合。",
			),
		});
		setCompletionState("done");
		setGeminiProgress({
			phase: "idle",
			percent: 100,
			message: uiText("Đã hoàn tất sau khi duyệt", "Completed after review", "审核后已完成"),
			estimatedWaitSecs: 0,
			remainingSecs: 0,
			charsReceived: 0,
			estimatedTotalChars: 0,
		});
		showSystemToast("info", {
			summary: uiText(
				"Đã xử lý xong tất cả bước cần duyệt và kết thúc lượt làm việc.",
				"All review-required steps were resolved and the turn is now complete.",
				"所有待审核步骤均已处理完毕，本轮现已完成。",
			),
			internalCode: "REVIEW_LOOP_RESOLVED",
		});
	}, [appId, appendStageEvent, completionState, contextType, language, pendingApprovalAgenticSteps.length, showSystemToast, streamRequestId, uiText]);

	const filteredLocalFlowOpLines = useMemo(() => {
		if (localFlowOpFilter === "all") {
			return localFlowOpLines;
		}
		return localFlowOpLines.filter(line => line.action === localFlowOpFilter);
	}, [localFlowOpFilter, localFlowOpLines]);

	const isNearBottom = useCallback((element: HTMLDivElement, threshold = 72): boolean => {
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		return distance <= threshold;
	}, []);

	const scrollToBottom = useCallback((force = false) => {
		const container = messageListRef.current;
		if (!container)
			return;
		if (!force && !followBottomRef.current)
			return;

		if (scrollFrameRef.current != null) {
			window.cancelAnimationFrame(scrollFrameRef.current);
		}

		scrollFrameRef.current = window.requestAnimationFrame(() => {
			scrollFrameRef.current = null;
			const now = Date.now();
			const useSmooth = !force && now - lastSmoothScrollAtRef.current > 160;
			container.scrollTo({
				top: container.scrollHeight,
				behavior: useSmooth ? "smooth" : "auto",
			});
			if (useSmooth) {
				lastSmoothScrollAtRef.current = now;
			}
		});
	}, []);

	const handleMessageListScroll = useCallback(() => {
		const container = messageListRef.current;
		if (!container)
			return;
		followBottomRef.current = isNearBottom(container);
	}, [isNearBottom]);

	const flushStreamingToUI = useCallback((force = false) => {
		const pendingChunk = pendingStreamChunkRef.current;
		if (!pendingChunk && !force)
			return;

		if (pendingChunk) {
			streamingMessageRef.current += pendingChunk;
			pendingStreamChunkRef.current = "";
		}

		const nextText = stripInternalOrchestrationLeakLines(streamingMessageRef.current || "");
		streamingMessageRef.current = nextText;
		if (nextText.trim()) {
			deliveredAssistantResultRef.current = true;
		}
		if (!nextText && !force)
			return;

		applyRealtimeCodeFromTextRef.current(nextText, force);
		const structuredPayload = parseStructuredAssistantPayload(nextText);
		const shouldHideCodeInChat = Boolean(onCodeInsert) && turnAllowAutoApplyRef.current;
		const showStructuredPlaceholder = !structuredPayload && looksLikeStructuredPayload(nextText);
		const normalizedAssistantText = !structuredPayload && !shouldHideCodeInChat && !showStructuredPlaceholder
			? normalizeAssistantDisplayText(nextText)
			: "";
		const displayText = structuredPayload
			? [
				structuredPayload.summary,
				structuredPayload.changes.length
					? structuredPayload.changes.map(item => `- ${item}`).join("\n")
					: "",
			].filter(Boolean).join("\n\n").trim()
			: showStructuredPlaceholder
				? uiText(
					"Trợ lý Ảo đang chuẩn bị kết quả cho editor...",
					"Virtual Assistant is preparing the result for the editor...",
					"虚拟助手正在为编辑器准备结果...",
				)
				: normalizedAssistantText
					? normalizedAssistantText
				: shouldHideCodeInChat
					? (stripMarkdownCodeBlocks(nextText) || uiText(
						`Đang cập nhật mã vào editor bằng ${assistantBrandLabel}...`,
						`${assistantBrandLabel} is updating code in the editor...`,
						`${assistantBrandLabel} 正在将代码更新到编辑器...`,
					))
					: nextText;

		const now = Date.now();
		const finalizedAt = force && nextText.trim() ? now : null;
		let nextCodeBlocks = parsedCodeBlocksRef.current;
		if (structuredPayload) {
			nextCodeBlocks = [];
			parsedCodeBlocksRef.current = nextCodeBlocks;
			lastCodeBlockParseAtRef.current = now;
		}
		else if (force || now - lastCodeBlockParseAtRef.current >= STREAM_CODEBLOCK_PARSE_MS) {
			nextCodeBlocks = extractCodeBlocks(nextText);
			parsedCodeBlocksRef.current = nextCodeBlocks;
			lastCodeBlockParseAtRef.current = now;
		}

		setMessages((prev) => {
			const updated = [...prev];
			for (let i = updated.length - 1; i >= 0; i -= 1) {
				const lastMsg = updated[i];
				if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
					lastMsg.content = displayText;
					lastMsg.codeBlocks = shouldHideCodeInChat ? [] : nextCodeBlocks;
					if (finalizedAt) {
						lastMsg.timestamp = finalizedAt;
					}
					break;
				}
			}
			return updated;
		});

		scrollToBottom(false);
	}, [assistantBrandLabel, contextType, onCodeInsert, scrollToBottom, stripMarkdownCodeBlocks, uiText]);

	const scheduleStreamFlush = useCallback(() => {
		if (streamFlushTimerRef.current)
			return;
		streamFlushTimerRef.current = setTimeout(() => {
			streamFlushTimerRef.current = null;
			flushStreamingToUI(false);
		}, STREAM_UI_FLUSH_MS);
	}, [flushStreamingToUI]);

	const setAssistantLiveStatus = useCallback((statusText: string) => {
		const text = String(statusText || "").trim();
		if (!text)
			return;
		// Progress status belongs to progress dock/timeline, not chat bubble content.
		return;
	}, []);

	const applyMenuEditorCodeDirect = useCallback((rawMenuPayload: string): boolean => {
		if (!onCodeInsert)
			return false;
		const nextCode = extractMenuDraftForEditor(rawMenuPayload);
		if (!nextCode)
			return false;
		if (nextCode === lastAppliedCodeRef.current)
			return false;
		const baseCode = liveCodeRef.current || currentCode || "";
		if (baseCode && baseCode !== nextCode) {
			undoSnapshotRef.current = baseCode;
			setCanUndoLastEdit(true);
		}
		onCodeInsert(nextCode);
		liveCodeRef.current = nextCode;
		lastAppliedCodeRef.current = nextCode;
		lastRealtimeApplyAtRef.current = Date.now();
		deliveredAssistantResultRef.current = true;
		localFlowVerifiedRef.current = true;
		return true;
	}, [currentCode, onCodeInsert]);

	const applyRealtimeCodeFromText = useCallback((rawText: string, force = false): boolean => {
		if (!turnAllowAutoApplyRef.current || !localFlowVerifiedRef.current || !onCodeInsert)
			return false;
		const source = String(rawText || "");
		const baseCode = liveCodeRef.current || currentCode || "";
		let nextCode = "";
		if (contextType === "menu_json") {
			nextCode = extractMenuDraftForEditor(source);
			if (!nextCode && baseCode) {
				const rawEdits = parseTextEditsOnlyPayload(source);
				if (rawEdits) {
					const validation = validateStructuredTextEdits(baseCode, rawEdits);
					if (validation.valid && validation.edits.length > 0) {
						nextCode = applyTextEditsToDraft(baseCode, validation.edits);
					}
				}
			}
		}
		else {
			const structuredPayload = parseStructuredAssistantPayload(source);
			if (structuredPayload?.code) {
				nextCode = structuredPayload.code;
			}
			// Handle textEdits-only response: backend returned patch array without full code.
			if (!nextCode && baseCode) {
				const rawEdits = parseTextEditsOnlyPayload(source);
				if (rawEdits) {
					const validation = validateStructuredTextEdits(baseCode, rawEdits);
					if (validation.valid && validation.edits.length > 0) {
						nextCode = applyTextEditsToDraft(baseCode, validation.edits);
					}
				}
			}
		}

		const blocks = !nextCode ? extractCodeBlocks(source) : [];
		if (!blocks.length) {
			const openBlock = extractLatestOpenCodeBlock(source);
			if (openBlock?.code) {
				blocks.push(openBlock);
			}
		}
		if (!nextCode) {
			if (!blocks.length)
				return false;
			const preferredBlock = pickPreferredCodeBlock(blocks);
			if (!preferredBlock?.code)
				return false;
			nextCode = preferredBlock.code;
		}
		if (nextCode === lastAppliedCodeRef.current)
			return false;

		const now = Date.now();
		if (!force && now - lastRealtimeApplyAtRef.current < 140) {
			if (realtimeApplyTimerRef.current)
				clearTimeout(realtimeApplyTimerRef.current);
			realtimeApplyTimerRef.current = setTimeout(() => {
				realtimeApplyTimerRef.current = null;
				applyRealtimeCodeFromText(rawText, true);
			}, 120);
			return false;
		}

		// Snapshot code before overwriting so user can undo
		if (baseCode && baseCode !== nextCode) {
			undoSnapshotRef.current = baseCode;
			setCanUndoLastEdit(true);
		}
		onCodeInsert(nextCode);
		liveCodeRef.current = nextCode;
		lastAppliedCodeRef.current = nextCode;
		lastRealtimeApplyAtRef.current = now;
		return true;
	}, [contextType, currentCode, onCodeInsert, pickPreferredCodeBlock]);

	const insertImportLinesIntoCode = useCallback((baseCode: string, importLines: string[]): string => {
		const source = String(baseCode || "");
		if (!source || !Array.isArray(importLines) || importLines.length === 0)
			return source;
		const normalizedImports = importLines
			.map(line => String(line || "").trim())
			.filter(Boolean)
			.filter((line, idx, arr) => arr.indexOf(line) === idx)
			.filter(line => !source.includes(line));
		if (normalizedImports.length === 0)
			return source;

		const lines = source.split(/\r?\n/);
		let insertIndex = 0;
		for (let i = 0; i < lines.length; i += 1) {
			const line = String(lines[i] || "").trim();
			if (line.startsWith("package ") || line.startsWith("import ")) {
				insertIndex = i + 1;
				continue;
			}
			if (insertIndex > 0) {
				break;
			}
		}

		const next = [...lines];
		next.splice(insertIndex, 0, ...normalizedImports);
		return next.join("\n");
	}, []);

	const sendQuickFixFeedback = useCallback(async (suggestion: QuickFixSuggestion, action: "applied" | "dismissed") => {
		try {
			await request.post("ai-code-stream/quick-fix-feedback", {
				json: {
					appId,
					language,
					quickFixId: suggestion.id,
					action,
				},
			});
		}
		catch {
			// Best-effort telemetry only. UI flow should not be blocked.
		}
	}, [appId, language]);

	const applyQuickFixSuggestion = useCallback((suggestion: QuickFixSuggestion) => {
		if (!onCodeInsert || contextType !== "code") {
			message.info(uiText("Quick-fix chỉ áp dụng cho code editor.", "Quick fixes are available in code editor mode only.", "Quick-fix 仅适用于代码编辑模式。"));
			return;
		}
		const action = String(suggestion.action || "").trim().toLowerCase();
		const payload = suggestion.payload || {};
		let nextCode = String(currentCode || "");
		if (action === "insert_import") {
			const importLine = String(payload.importLine || "").trim();
			nextCode = insertImportLinesIntoCode(nextCode, importLine ? [importLine] : []);
		}
		else if (action === "insert_imports") {
			const importLines = Array.isArray(payload.importLines)
				? payload.importLines.map((line: unknown) => String(line || "").trim()).filter(Boolean)
				: [];
			nextCode = insertImportLinesIntoCode(nextCode, importLines);
		}
		if (!nextCode || nextCode === currentCode) {
			message.warning(uiText("Không có thay đổi để áp dụng từ quick-fix.", "No changes to apply from this quick fix.", "该 quick-fix 没有可应用的变更。"));
			return;
		}
		setApplyingQuickFixId(suggestion.id);
		onCodeInsert(nextCode);
		setQuickFixSuggestions(prev => prev.filter(item => item.id !== suggestion.id));
		void sendQuickFixFeedback(suggestion, "applied");
		setApplyingQuickFixId("");
		message.success(uiText("Đã áp dụng quick-fix.", "Quick fix applied.", "已应用 quick-fix。"));
	}, [contextType, currentCode, insertImportLinesIntoCode, onCodeInsert, sendQuickFixFeedback, uiText]);

	const dismissQuickFixSuggestion = useCallback((suggestion: QuickFixSuggestion) => {
		setQuickFixSuggestions(prev => prev.filter(item => item.id !== suggestion.id));
		void sendQuickFixFeedback(suggestion, "dismissed");
	}, [sendQuickFixFeedback]);

	const sendEditCandidateFeedback = useCallback(async (candidate: EditCandidate, action: "applied" | "dismissed") => {
		try {
			await request.post("ai-code-stream/edit-candidate-feedback", {
				json: {
					appId,
					language,
					editCandidateId: candidate.id,
					action,
				},
			});
		}
		catch {
			// Best-effort telemetry only. UI flow should not be blocked.
		}
	}, [appId, language]);

	const sendAgenticApprovalFeedback = useCallback(async (action: "approved" | "rejected" | "resolved", step?: AgenticStep) => {
		const safeRequestId = String(streamRequestId || "").trim();
		if (!safeRequestId) {
			return false;
		}
		try {
			await request.post("ai-code-stream/agentic-approval-feedback", {
				json: {
					appId,
					language,
					contextType,
					pName: targetPName,
					pType: typeof targetPType === "number" ? targetPType : undefined,
					requestId: safeRequestId,
					action,
					stepIndex: step?.stepIndex,
					stepTotal: step?.stepTotal,
					stepLabel: step?.label || step?.detail || step?.stage,
					riskLevel: step?.riskLevel,
					editCount: Array.isArray(step?.pendingTextEdits) ? step.pendingTextEdits.length : 0,
				},
			});
			if (action !== "resolved") {
				return await syncAgenticReviewState(safeRequestId, false, false);
			}
			return true;
		}
		catch {
			// Best-effort telemetry only. UI flow should not be blocked.
			return false;
		}
	}, [appId, contextType, language, streamRequestId, syncAgenticReviewState, targetPName, targetPType]);

	const applyEditCandidate = useCallback((candidate: EditCandidate) => {
		if (!onCodeInsert || contextType !== "code") {
			message.info(uiText("Edit candidate chỉ áp dụng cho code editor.", "Edit candidates are available in code editor mode only.", "Edit candidate 仅适用于代码编辑模式。"));
			return;
		}
		const validation = validateStructuredTextEdits(currentCode, candidate.textEdits);
		if (!validation.valid || validation.edits.length === 0) {
			message.warning(uiText("Candidate không hợp lệ để áp dụng an toàn.", "Candidate is invalid for safe apply.", "Candidate 无法安全应用。"));
			return;
		}
		const nextCode = applyTextEditsToDraft(currentCode, validation.edits);
		if (!nextCode || nextCode === currentCode) {
			message.warning(uiText("Candidate không tạo ra thay đổi mới.", "Candidate does not produce any change.", "Candidate 未产生新变更。"));
			return;
		}
		setApplyingEditCandidateId(candidate.id);
		onCodeInsert(nextCode);
		setEditCandidates(prev => prev.filter(item => item.id !== candidate.id));
		void sendEditCandidateFeedback(candidate, "applied");
		setApplyingEditCandidateId("");
		message.success(uiText("Đã áp dụng edit candidate.", "Edit candidate applied.", "已应用 edit candidate。"));
	}, [contextType, currentCode, onCodeInsert, sendEditCandidateFeedback, uiText]);

	const dismissEditCandidate = useCallback((candidate: EditCandidate) => {
		setEditCandidates(prev => prev.filter(item => item.id !== candidate.id));
		void sendEditCandidateFeedback(candidate, "dismissed");
	}, [sendEditCandidateFeedback]);

	useEffect(() => {
		applyRealtimeCodeFromTextRef.current = applyRealtimeCodeFromText;
	}, [applyRealtimeCodeFromText]);

	useEffect(() => {
		liveCodeRef.current = currentCode || "";
	}, [currentCode]);

	const appendFiles = useCallback(async (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0)
			return;
		const currentCount = pendingAttachments.length;
		if (currentCount >= MAX_ATTACHMENTS) {
			message.warning(uiText(`Tối đa ${MAX_ATTACHMENTS} tệp đính kèm`, `Maximum ${MAX_ATTACHMENTS} attachments`, `最多 ${MAX_ATTACHMENTS} 个附件`));
			return;
		}

		const nextFiles = Array.from(fileList).slice(0, Math.max(0, MAX_ATTACHMENTS - currentCount));
		const nextAttachments: AiAssistantAttachment[] = [];

		for (const file of nextFiles) {
			try {
				if (file.type.startsWith("image/")) {
					if (file.size > MAX_IMAGE_FILE_BYTES) {
						message.warning(uiText(
							`${file.name} vượt quá 5MB`,
							`${file.name} exceeds 5MB`,
							`${file.name} 超过 5MB`,
						));
						continue;
					}
					const dataUrl = await readFileAsDataUrl(file);
					nextAttachments.push({
						id: createAttachmentId("img"),
						name: file.name,
						mimeType: file.type || "image/png",
						size: file.size,
						kind: "image",
						summary: uiText("Ảnh đính kèm để Trợ lý AI phân tích trực tiếp", "Attached image for direct AI Assistant analysis", "用于 AI 助手直接分析的图像"),
						dataUrl,
						previewUrl: dataUrl,
					});
					continue;
				}

				if (!isTextLikeFile(file)) {
					message.warning(uiText(
						`Chỉ hỗ trợ file văn bản/JSON/code hoặc hình ảnh: ${file.name}`,
						`Only text/JSON/code files or images are supported: ${file.name}`,
						`仅支持文本/JSON/代码文件或图像: ${file.name}`,
					));
					continue;
				}
				if (file.size > MAX_TEXT_FILE_BYTES) {
					message.warning(uiText(
						`${file.name} vượt quá 10MB`,
						`${file.name} exceeds 10MB`,
						`${file.name} 超过 10MB`,
					));
					continue;
				}

				const rawText = await readFileAsText(file);
				const textContent = rawText.length <= MAX_TEXT_ATTACHMENT_CHARS
					? rawText
					: `${rawText.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n...[truncated]`;
				const kind = getFileExtension(file.name) === "json" ? "json" : "text";
				const contextMeta = classifyAttachmentContext(file.name, file.type || "text/plain", kind, contextType);
				nextAttachments.push({
					id: createAttachmentId("file"),
					name: file.name,
					mimeType: file.type || "text/plain",
					size: file.size,
					kind,
					contextRole: contextMeta.contextRole,
					authoritative: contextMeta.authoritative,
					summary: summarizeFileContent(file, textContent),
					textContent,
					fullContext: contextMeta.defaultFullContext,
				});
			}
			catch (error) {
				console.error("Failed to process attachment:", error);
				message.error(uiText(
					`Không đọc được tệp ${file.name}`,
					`Failed to read ${file.name}`,
					`无法读取 ${file.name}`,
				));
			}
		}

		if (nextAttachments.length > 0) {
			setPendingAttachments(prev => [...prev, ...nextAttachments].slice(0, MAX_ATTACHMENTS));
		}
	}, [contextType, pendingAttachments.length, uiText]);

	const removePendingAttachment = useCallback((id: string) => {
		setPendingAttachments(prev => prev.filter(item => item.id !== id));
	}, []);

	// SSE abort ref for canceling in-flight streaming requests
	const sseAbortRef = useRef<AbortController | null>(null);
	const lastProgressEventAtRef = useRef<number>(0);
	const lastProgressWatchdogAlertAtRef = useRef<number>(0);

	// Cleanup on unmount: cancel animation frame, timers, in-flight SSE fetch
	useEffect(() => {
		const stopActiveStream = () => {
			const jobId = String(streamJobIdRef.current || "").trim();
			if (jobId) {
				notifyServerStreamCancel(jobId);
			}
			if (sseAbortRef.current) {
				sseAbortRef.current.abort();
				sseAbortRef.current = null;
			}
		};

		const handlePageLifecycle = () => {
			if (isLoadingRef.current) {
				stopActiveStream();
			}
		};

		window.addEventListener("pagehide", handlePageLifecycle);
		window.addEventListener("beforeunload", handlePageLifecycle);

		return () => {
			window.removeEventListener("pagehide", handlePageLifecycle);
			window.removeEventListener("beforeunload", handlePageLifecycle);
			stopActiveStream();
			if (scrollFrameRef.current != null) {
				window.cancelAnimationFrame(scrollFrameRef.current);
				scrollFrameRef.current = null;
			}
			if (streamFlushTimerRef.current) {
				clearTimeout(streamFlushTimerRef.current);
				streamFlushTimerRef.current = null;
			}
			if (realtimeApplyTimerRef.current) {
				clearTimeout(realtimeApplyTimerRef.current);
				realtimeApplyTimerRef.current = null;
			}
		};
	}, [notifyServerStreamCancel]);

	useEffect(() => {
		if (!isLoading) {
			setLastProgressEventAgeSecs(0);
			return;
		}

		if (lastProgressEventAtRef.current <= 0) {
			lastProgressEventAtRef.current = Date.now();
		}

		const watchdogTimer = window.setInterval(() => {
			if (!isLoading) {
				return;
			}
			if (geminiProgress.phase === "idle") {
				return;
			}

			const now = Date.now();
			const lastEventAt = lastProgressEventAtRef.current || requestStartedAtRef.current || now;
			const silentMs = Math.max(0, now - lastEventAt);
			if (silentMs < PROGRESS_WATCHDOG_SILENCE_MS) {
				return;
			}

			const silentSecs = Math.floor(silentMs / 1000);
			setGeminiProgress(prev => ({
				...prev,
				message: uiText(
					`Tiến độ tạm im ${silentSecs}s, AI vẫn đang chạy. Nếu file lớn có thể cần thêm thời gian...`,
					`No progress event for ${silentSecs}s, AI is still running. Large inputs may need more time...`,
					`进度暂时静默 ${silentSecs}s，AI 仍在运行。大输入可能需要更久时间...`,
				),
			}));
			setAssistantLiveStatus(uiText(
				`Tiến độ tạm im ${silentSecs}s, AI vẫn đang chạy...`,
				`No progress event for ${silentSecs}s, AI is still running...`,
				`进度静默 ${silentSecs}s，AI 仍在运行...`,
			));

			if (SHOW_DETAILED_PROGRESS_TIMELINE) {
				const lastAlert = lastProgressWatchdogAlertAtRef.current;
				if (now - lastAlert >= PROGRESS_WATCHDOG_ALERT_INTERVAL_MS) {
					lastProgressWatchdogAlertAtRef.current = now;
					appendStageEvent({
						stage: "waiting_gemini",
						message: uiText(
							`Watchdog: chưa nhận event mới trong ${silentSecs}s, backend có thể đang xử lý chunk/reduce nặng`,
							`Watchdog: no new events in ${silentSecs}s, backend may be processing heavy chunk/reduce work`,
							`Watchdog：${silentSecs}s 未收到新事件，后端可能正在执行较重的分块/归并处理`,
						),
						percent: Math.max(1, Math.min(95, Number(geminiProgress.percent || 0))),
					});
				}
			}
		}, PROGRESS_WATCHDOG_TICK_MS);

		const ageTicker = window.setInterval(() => {
			if (!isLoading || geminiProgress.phase === "idle") {
				setLastProgressEventAgeSecs(0);
				return;
			}
			const now = Date.now();
			const lastEventAt = lastProgressEventAtRef.current || requestStartedAtRef.current || now;
			setLastProgressEventAgeSecs(Math.max(0, Math.floor((now - lastEventAt) / 1000)));
		}, PROGRESS_EVENT_AGE_TICK_MS);

		return () => {
			window.clearInterval(watchdogTimer);
			window.clearInterval(ageTicker);
		};
	}, [appendStageEvent, geminiProgress.percent, geminiProgress.phase, isLoading, setAssistantLiveStatus, uiText]);

	const appendAgenticStep = useCallback((partial: Omit<AgenticStep, "id" | "timestamp">) => {
		setAgenticSteps((prev) => {
			const existing = prev.findIndex(s => s.stage === partial.stage);
			if (existing >= 0) {
				const updated = [...prev];
				updated[existing] = { ...updated[existing], ...partial, timestamp: Date.now() };
				return updated;
			}
			return [...prev, { ...partial, id: `astep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() }];
		});
	}, []);

	const handleApproveAgenticStep = useCallback(async (step: AgenticStep) => {
		if (!step.pendingTextEdits || step.pendingTextEdits.length <= 0) {
			return;
		}
		if (processingApprovalStepId) {
			return;
		}
		setProcessingApprovalStepId(step.id);
		try {
			const synced = await sendAgenticApprovalFeedback("approved", step);
			if (!synced) {
				message.warning(uiText(
					"Không đồng bộ được trạng thái duyệt từ server, chưa áp dụng patch risky.",
					"Could not sync approval state from server, the risky patch was not applied.",
					"无法从服务器同步批准状态，风险补丁尚未应用。",
				));
				return;
			}
			const editsPayload = JSON.stringify({ textEdits: step.pendingTextEdits });
			applyRealtimeCodeFromTextRef.current(editsPayload, true);
			appendStageEvent({
				stage: "approval_action",
				status: "approved",
				requestId: streamRequestId || undefined,
				message: uiText("Đã duyệt bước risky", "Approved risky step", "已批准风险步骤"),
				detail: step.label || step.detail || step.stage,
			});
			message.success(uiText("Đã áp dụng bước risky sau khi duyệt", "Risky step applied after approval", "已在批准后应用风险步骤"));
		}
		finally {
			setProcessingApprovalStepId("");
		}
	}, [appendStageEvent, processingApprovalStepId, sendAgenticApprovalFeedback, streamRequestId, uiText]);

	const handleRejectAgenticStep = useCallback(async (step: AgenticStep) => {
		if (processingApprovalStepId) {
			return;
		}
		setProcessingApprovalStepId(step.id);
		try {
			const synced = await sendAgenticApprovalFeedback("rejected", step);
			if (!synced) {
				message.warning(uiText(
					"Không đồng bộ được trạng thái từ chối từ server, chưa chốt bước risky này.",
					"Could not sync rejection state from server, this risky step remains unresolved.",
					"无法从服务器同步拒绝状态，此风险步骤仍未完成处理。",
				));
				return;
			}
			appendStageEvent({
				stage: "approval_action",
				status: "rejected",
				requestId: streamRequestId || undefined,
				message: uiText("Đã từ chối bước risky", "Rejected risky step", "已拒绝风险步骤"),
				detail: step.label || step.detail || step.stage,
			});
			message.info(uiText("Đã giữ lại patch risky, chưa áp dụng", "Risky patch kept unapplied", "风险补丁已保留且未应用"));
		}
		finally {
			setProcessingApprovalStepId("");
		}
	}, [appendStageEvent, processingApprovalStepId, sendAgenticApprovalFeedback, streamRequestId, uiText]);

	const handleOrchPreview = useCallback(async () => {
		const msg = inputValue.trim();
		if (!msg && pendingAttachments.length === 0) {
			message.warning(uiText(
				"Nhập nội dung để preview orchestration",
				"Enter a message to preview orchestration",
				"请输入内容以预览编排",
			));
			return;
		}
		setOrchPreviewLoading(true);
		setShowOrchPreview(true);
		try {
			const inferredPreviewMode = inferResponseModeByIntent(msg, contextType);
			const res = await request.post("ai-orchestration-preview", {
				json: {
					appId,
					message: msg,
					currentCode,
					language,
					contextType,
					pName: targetPName,
					pType: targetPType,
					editorMetadata: requestEditorMetadata,
					taskType: contextType === "menu_json"
						? (inferredPreviewMode === "edit" ? "menu_patch" : "menu_qa")
						: "code_assistant",
					responseMode: inferredPreviewMode,
					attachments: pendingAttachments.map(a => ({
						id: a.id,
						name: a.name,
						mimeType: a.mimeType,
						size: a.size,
						kind: a.kind,
						contextRole: a.contextRole,
						authoritative: a.authoritative,
						summary: a.summary,
						textContent: a.textContent,
						fullContext: a.fullContext ?? false,
					})),
				},
				throwHttpErrors: false,
			});
			if (!res.ok) {
				message.error(uiText("Không lấy được preview", "Failed to fetch preview", "获取预览失败"));
				return;
			}
			const data = await res.json() as OrchestrationPreviewResult;
			setOrchPreview(data);
		}
		catch {
			message.error(uiText("Lỗi preview orchestration", "Orchestration preview error", "编排预览错误"));
		}
		finally {
			setOrchPreviewLoading(false);
		}
	}, [appId, inputValue, pendingAttachments, contextType, currentCode, language, targetPName, targetPType, requestEditorMetadata, uiText]);

	const handleCancelRequest = useCallback(() => {
		const controller = sseAbortRef.current;
		if (!controller && !isLoadingRef.current) {
			return;
		}
		const jobId = String(streamJobIdRef.current || "").trim();
		if (jobId) {
			notifyServerStreamCancel(jobId);
		}
		sseAbortRef.current = null;
		controller?.abort();
		flushStreamingToUI(true);
		setCompletionState("cancelled");
		setCompletionMetrics({
			elapsedMs: requestStartedAtRef.current > 0 ? Math.max(0, Date.now() - requestStartedAtRef.current) : undefined,
			outputChars: streamingMessageRef.current.length + pendingStreamChunkRef.current.length,
		});
		setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
		setBackendProgressHint({ stage: "", detail: "" });
		setIsLoading(false);
		turnAllowAutoApplyRef.current = false;
		if (SHOW_DETAILED_PROGRESS_TIMELINE) {
			appendStageEvent({
				stage: "cancelled",
				message: uiText("Đã hủy request theo yêu cầu", "Request cancelled by user", "已按用户要求取消请求"),
				percent: Math.max(0, geminiProgress.percent || 0),
			});
		}
		showSystemToast("info", {
			summary: uiText("Đã hủy request đang chạy.", "The running request was cancelled.", "当前正在运行的请求已取消。"),
			nextStep: uiText("Bạn có thể chỉnh lại yêu cầu rồi gửi lại khi sẵn sàng.", "You can revise the request and send it again when ready.", "你可以调整请求后在准备好时重新发送。"),
			internalCode: "REQUEST_CANCELLED",
		});
	}, [appendStageEvent, flushStreamingToUI, geminiProgress.percent, notifyServerStreamCancel, showSystemToast, uiText]);
	// Auto-scroll to latest message
	useEffect(() => {
		scrollToBottom(false);
	}, [messages, scrollToBottom]);

	const sendMessage = useCallback(
		async (text: string) => {
			if ((!text.trim() && pendingAttachments.length === 0) || isLoading) {
				return;
			}

			const normalizedText = text.trim();
			if (normalizedText) {
				setPromptHistory((prev) => {
					const next = [normalizedText, ...prev.filter(item => item !== normalizedText)].slice(0, PROMPT_HISTORY_LIMIT);
					savePromptHistory(promptHistoryStorageKey, next);
					return next;
				});
				setPromptHistoryIndex(-1);
				setPromptHistoryOriginal("");
			}
			const routeDirective = parseExecutionRouteDirective(normalizedText);
			const modeDirective = parseResponseModeDirective(routeDirective.cleanedMessage);
			const cleanedMessage = modeDirective.cleanedMessage;
			const useLocalPlanRoute = routeDirective.useLocalPlan;
			if (!cleanedMessage && pendingAttachments.length === 0) {
				message.warning(uiText(
					"Vui lòng nhập nội dung sau lệnh /analyze, /edit hoặc /local-plan",
					"Please enter content after /analyze, /edit, or /local-plan",
					"请在 /analyze、/edit 或 /local-plan 后输入内容",
				));
				return;
			}
			const outgoingAttachments = [...pendingAttachments];
			onUserMessage?.({
				message: cleanedMessage || normalizedText,
				attachments: outgoingAttachments,
			});

			// Add user message
			const userMsg: ChatMessage = {
				id: `user_${Date.now()}`,
				role: "user",
				content: cleanedMessage || text,
				timestamp: Date.now(),
				attachments: outgoingAttachments.map(attachment => ({
					id: attachment.id,
					name: attachment.name,
					mimeType: attachment.mimeType,
					size: attachment.size,
					kind: attachment.kind,
					contextRole: attachment.contextRole,
					authoritative: attachment.authoritative,
					summary: attachment.summary,
					previewUrl: attachment.previewUrl,
				})),
			};

			const inferredResponseMode = inferResponseModeByIntent(cleanedMessage || normalizedText, contextType);
			const explicitResponseMode: ResponseMode | undefined = useLocalPlanRoute
				? (modeDirective.overrideMode ?? "edit")
				: modeDirective.overrideMode;
			const requestedResponseMode: ResponseMode = explicitResponseMode ?? inferredResponseMode;
			const sendExplicitResponseMode = Boolean(explicitResponseMode);
			setActiveStreamResponseMode(requestedResponseMode);

			// Add placeholder for assistant response
			const assistantMsg: ChatMessage = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				messageType: "response",
				appId: String(appId || "").trim() || undefined,
				content: "",
				timestamp: Date.now(),
			};

			setMessages((prev) => {
				const nextMessages = dedupeChatMessages([...prev, userMsg, assistantMsg]);
				saveChatHistory(nextMessages);
				return nextMessages;
			});
			setIsLoading(true);
			setStageEvents([]);
			setAgenticSteps([]);
			setAgenticStepsCollapsed(requestedResponseMode === "analyze");
			lastAppliedCodeRef.current = "";
			menuAuditStepsRef.current = [];
			lastUserRequestRef.current = cleanedMessage || text;
			setAiUsageSummary(prev => ({ ...prev, turn: null }));
			setModelDecisionTrace([]);
			setShowFullTimeline(false);
			setShowFullModelTrace(false);
			setShowMiniProgress(true);
			setIsProgressDockCollapsed(false);
			setIsUsageDockVisible(false);
			reviewResolutionFeedbackSentRef.current = "";
			setStreamRequestId("");
			setStreamJobId("");
			setCompletionState("idle");
			setCompletionMetrics({});
			setCompletionErrorMessage("");
			setPartsManifest(null);
			setPartsMetaPage(null);
			setSelectedPartIndex(null);
			setSelectedPartContent("");
			setLocalFlowOps(null);
			setLocalFlowOpLines([]);
			setLocalFlowOpFilter("all");
			setQuickFixSuggestions([]);
			setApplyingQuickFixId("");
			setEditCandidates([]);
			setApplyingEditCandidateId("");
			setRetryingEditCandidateId("");
			setAssistantCitationTokens([]);
			setFollowUpSuggestions([]);
			setCanUndoLastEdit(false);
			setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
			setBackendProgressHint({ stage: "", detail: "" });
			setLastProgressEventAgeSecs(0);
			lastProgressEventAtRef.current = 0;
			lastProgressWatchdogAlertAtRef.current = 0;
			stageEventSignaturesRef.current = new Set();
			followBottomRef.current = true;
			streamingMessageRef.current = "";
			pendingStreamChunkRef.current = "";
			deliveredAssistantResultRef.current = false;
			parsedCodeBlocksRef.current = [];
			lastCodeBlockParseAtRef.current = 0;
			if (SHOW_DETAILED_PROGRESS_TIMELINE) {
				appendStageEvent({
					stage: "preparing",
					message: uiText("Đang chuẩn bị yêu cầu", "Preparing request", "正在准备请求"),
					percent: 0,
				});
			}
			turnAllowAutoApplyRef.current = requestedResponseMode === "edit";
			localFlowVerifiedRef.current = false;
			textEditApplyCountRef.current = 0;
			editStreamStartCodeRef.current = liveCodeRef.current || currentCode || "";
			streamStartedInEditModeRef.current = requestedResponseMode === "edit";
			requestStartedAtRef.current = Date.now();
			lastProgressEventAtRef.current = requestStartedAtRef.current;
			lastProgressWatchdogAlertAtRef.current = 0;
			setLastProgressEventAgeSecs(0);
			setInputValue("");
			setPendingAttachments([]);

			let controller: AbortController | null = null;
			try {
				// SSE streaming via Gemini (replaces legacy Socket.IO stream route)
				controller = new AbortController();
				sseAbortRef.current = controller;
				const requestJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				let effectiveStreamJobId = requestJobId;
				setStreamJobId(requestJobId);
				const flowType = contextType === "menu_json" ? "menu_manager" : "code_editor";
				const taskType = contextType === "menu_json"
					? (requestedResponseMode === "analyze"
						? "menu_qa"
						: (hasMenuPatchOnlyIntent(cleanedMessage || normalizedText) ? "menu_patch" : "menu_design"))
					: "code_assistant";
				const response = await request.post(useLocalPlanRoute ? "ai-local/execute-local-plan" : "ai-code-stream", {
					json: {
						appId,
						applyDynamicIngestion: useLocalPlanRoute,
						executePatch: useLocalPlanRoute,
						jobId: requestJobId,
						message: cleanedMessage || normalizedText,
						uiLanguage: String(i18n.resolvedLanguage || i18n.language || "vi"),
						flowType,
						taskType,
						...(sendExplicitResponseMode ? { responseMode: requestedResponseMode } : {}),
						currentCode,
						language,
						contextType,
						pName: targetPName,
						pType: targetPType,
						editorMetadata: requestEditorMetadata,
						attachments: outgoingAttachments.map((attachment) => {
							const imageBase64 = attachment.kind === "image" && attachment.dataUrl
								? (attachment.dataUrl.includes(",") ? attachment.dataUrl.split(",")[1] : attachment.dataUrl)
								: undefined;
							if (useLocalPlanRoute) {
								return {
									type: attachment.kind === "image" ? "image" : "json",
									filename: attachment.name,
									mimeType: attachment.mimeType,
									summary: attachment.summary,
									content: attachment.textContent,
									dataUrl: attachment.dataUrl,
									base64Data: imageBase64,
								};
							}
							return {
								id: attachment.id,
								name: attachment.name,
								mimeType: attachment.mimeType,
								size: attachment.size,
								kind: attachment.kind,
								contextRole: attachment.contextRole,
								authoritative: attachment.authoritative,
								summary: attachment.summary,
								textContent: attachment.textContent,
								dataUrl: attachment.dataUrl,
								fullContext: attachment.fullContext ?? false,
								// For image attachments, strip the data URL prefix so backend gets raw base64
								base64Data: imageBase64,
							};
						}),
					},
					timeout: AI_TIMEOUT_MS,
					throwHttpErrors: false,
					signal: controller.signal,
				});

				if (!response.ok) {
					const status = response.status;
					const errorText = formatSystemNotice({
						summary: status === 401
							? uiText("Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ.", "Your session has expired or is no longer valid.", "当前登录会话已过期或已失效。")
							: uiText("Không gửi được yêu cầu lên backend.", "The request could not be sent to the backend.", "请求无法发送到后端。"),
						nextStep: resolveSystemNextStep(status === 401 ? "http_401" : "http_request_failed"),
						internalCode: status === 401 ? "HTTP_401" : `HTTP_${status}`,
					});
					setMessages((prev) => {
						const updated = [...prev];
						for (let i = updated.length - 1; i >= 0; i -= 1) {
							const lastMsg = updated[i];
							if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
								lastMsg.content = errorText;
								lastMsg.codeBlocks = [];
								lastMsg.responseMode = "analyze";
								lastMsg.timestamp = Date.now();
								break;
							}
						}
						return updated;
					});
					showSystemToast("error", {
						summary: status === 401
							? uiText("Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ.", "Your session has expired or is no longer valid.", "当前登录会话已过期或已失效。")
							: uiText("Không gửi được yêu cầu lên backend.", "The request could not be sent to the backend.", "请求无法发送到后端。"),
						nextStep: resolveSystemNextStep(status === 401 ? "http_401" : "http_request_failed"),
						internalCode: status === 401 ? "HTTP_401" : `HTTP_${status}`,
					});
					setIsLoading(false);
					turnAllowAutoApplyRef.current = false;
					return;
				}

				const contentType = String(response.headers.get("content-type") || "").toLowerCase();
				if (!contentType.includes("text/event-stream")) {
					const rawBody = await response.text();
					let backendSummary = uiText(
						"Backend không trả SSE stream hợp lệ.",
						"Backend did not return a valid SSE stream.",
						"后端未返回有效的 SSE 流。",
					);
					let internalCode = "NON_SSE_RESPONSE";
					try {
						const parsed = JSON.parse(rawBody);
						const parsedMessage = String((parsed as any)?.message || "").trim();
						if (parsedMessage) {
							backendSummary = parsedMessage;
						}
						const parsedStatus = String((parsed as any)?.status || "").trim();
						if (parsedStatus) {
							internalCode = `${internalCode}_${parsedStatus.toUpperCase()}`;
						}
					}
					catch {
						// Keep default summary and code.
					}

					setMessages((prev) => {
						const updated = [...prev];
						for (let i = updated.length - 1; i >= 0; i -= 1) {
							const lastMsg = updated[i];
							if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
								lastMsg.content = formatSystemNotice({
									summary: backendSummary,
									nextStep: uiText(
										"Kiểm tra endpoint /ai-code-stream có trả text/event-stream và không bị response wrapper ghi đè.",
										"Verify /ai-code-stream returns text/event-stream and is not wrapped by a response interceptor.",
										"请检查 /ai-code-stream 是否返回 text/event-stream 且未被响应包装器覆盖。",
									),
									internalCode,
								});
								lastMsg.codeBlocks = [];
								lastMsg.responseMode = "analyze";
								lastMsg.timestamp = Date.now();
								break;
							}
						}
						return updated;
					});
					setCompletionState("error");
					setCompletionErrorMessage(backendSummary);
					setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
					setBackendProgressHint({ stage: "", detail: "" });
					setIsLoading(false);
					if (sseAbortRef.current === controller) {
						sseAbortRef.current = null;
					}
					turnAllowAutoApplyRef.current = false;
					showSystemToast("error", {
						summary: backendSummary,
						nextStep: uiText(
							"Backend phải stream đúng định dạng SSE để hiển thị từng bước và apply patch vào editor.",
							"Backend must stream valid SSE to show step-by-step updates and apply patches in the editor.",
							"后端必须输出有效 SSE 才能逐步显示并将补丁应用到编辑器。",
						),
						internalCode,
					});
					return;
				}

				const reader = response.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let receivedCompleteEvent = false;
				let receivedErrorEvent = false;
				let receivedBlockedGuardEvent = false;
				let lastReasonCode = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done)
						break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.startsWith("data:"))
							continue;
						const json = line.slice(5).trim();
						if (!json || json === "[DONE]")
							continue;
						try {
							const evt = JSON.parse(json) as {
								stage: string
								chunk?: string
								fullResponse?: string
								responseMode?: string
								contextType?: string
								patchOps?: unknown[]
								mergeStats?: {
									added?: number
									edited?: number
									deleted?: number
								}
								message?: string
								detail?: string
								detailKey?: string
								detailArgs?: Record<string, any>
								percent?: number
								estimatedWaitSecs?: number
								messageKey?: string
								messageArgs?: Record<string, any>
								localPhase?: string
								remainingEstimateSecs?: number
								charsReceived?: number
								estimatedTotalChars?: number
								ttftMs?: number
								elapsedMs?: number
								promptTokens?: number
								model?: string
								requestId?: string
								jobId?: string
								partIndex?: number
								partTotal?: number
								partLabel?: string
								isLastPart?: boolean
								streamedChars?: number
								streamChunkCount?: number
								localProviderPrimaryUsed?: boolean
								flowConfirmedByLocal?: boolean
								textEdits?: any[]
								streamAssemblyMismatch?: boolean
								promptOriginalChars?: number
								promptFinalChars?: number
								promptCapChars?: number
								promptTruncatedByCharCap?: boolean
								menuShrinkGuard?: boolean
								menuShrinkRatio?: number
								shrinkRatio?: number
								inputChars?: number
								outputChars?: number
								minRatio?: number
								modelDecisionStep?: "primary" | "fallback" | "final"
								modelDecisionReason?: string
								decision_step?: "primary" | "fallback" | "final"
								reason_code?: string
								patchFallbackNoOp?: boolean
								patchFallbackReasonCode?: string
								patchValidator?: PatchValidatorMeta
								quickFixes?: any[]
								usage?: any
								completionTokens?: number
								estimatedCostUsd?: number
								// agentic_plan fields
								compacted?: boolean
								savedChars?: number
								charsBefore?: number
								charsAfter?: number
								routingTier?: string
								planStepCount?: number
								parts?: {
									jobId?: string
									totalParts?: number
									totalChars?: number
									status?: string
									createdAt?: number
									updatedAt?: number
								}
								result?: {
									ingestCount?: number
									aggregateScopeMask?: number
									scopeTags?: string[]
									planningHints?: string[]
								}
							};
							lastProgressEventAtRef.current = Date.now();
							setLastProgressEventAgeSecs(0);
							const normalizeEvtArgs = (raw: any): Record<string, any> | undefined => {
								if (raw && typeof raw === "object" && !Array.isArray(raw)) {
									return raw as Record<string, any>;
								}
								if (typeof raw === "string") {
									const text = raw.trim();
									if (text.startsWith("{") && text.endsWith("}")) {
										try {
											const parsed = JSON.parse(text);
											if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
												return parsed as Record<string, any>;
											}
										}
										catch {
											return undefined;
										}
									}
								}
								return undefined;
							};
							const evtMessageArgs = normalizeEvtArgs(evt.messageArgs);
							const evtDetailArgs = normalizeEvtArgs(evt.detailArgs);
							const renderedEvtMessage = renderProgressText(evt.messageKey, evtMessageArgs, evt.message);
							const localizedEvtMessage = normalizeAssistantProgressMessage(renderedEvtMessage);
							const localizedEvtDetail = normalizeAssistantProgressMessage(
								renderProgressText(evt.detailKey, evtDetailArgs, evt.detail),
							);
							const evtForTimeline = {
								...evt,
								messageArgs: evtMessageArgs,
								detailArgs: evtDetailArgs,
								message: localizedEvtMessage,
								detail: localizedEvtDetail || undefined,
							};
							const evtAny = evt as any;
							const progressStageLabel = renderProgressText(
								String(evtAny.orchestrationPhaseKey || ""),
								undefined,
								String(evtAny.orchestrationPhase || "").trim() || formatStageLabel(String(evt.stage || evtAny.status || "processing")),
							);
							const progressDetailLabel = localizedEvtDetail || localizedEvtMessage || progressStageLabel;
							if (progressStageLabel || progressDetailLabel) {
								setBackendProgressHint({ stage: progressStageLabel, detail: progressDetailLabel });
							}
							const evtStatus = String((evt as any).status || "").trim().toLowerCase();
							const evtQuestions = toStringList((evt as any).questions);
							const evtAmbiguities = toStringList((evt as any).ambiguities);
							const evtReasonCode = String((evt as any).reason_code || "").trim().toLowerCase();
							if (evtReasonCode) {
								lastReasonCode = evtReasonCode;
							}
							const effectiveReasonCode = evtReasonCode || lastReasonCode;
							if (evt.responseMode) {
								const mode = String(evt.responseMode).trim().toLowerCase();
								if (mode === "edit") {
									turnAllowAutoApplyRef.current = true;
									setActiveStreamResponseMode("edit");
								}
								else if (mode === "analyze") {
									turnAllowAutoApplyRef.current = false;
									setActiveStreamResponseMode("analyze");
								}
								setMessages((prev) => {
									const updated = [...prev];
									for (let i = updated.length - 1; i >= 0; i -= 1) {
										const lastMsg = updated[i];
										if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
											lastMsg.responseMode = mode === "edit" ? "edit" : "analyze";
											break;
										}
									}
									return updated;
								});
							}
							if (evt.requestId) {
								const nextRequestId = String(evt.requestId).trim();
								setStreamRequestId(String(evt.requestId));
								setMessages((prev) => {
									const updated = [...prev];
									for (let i = updated.length - 1; i >= 0; i -= 1) {
										const lastMsg = updated[i];
										if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
											lastMsg.requestId = nextRequestId || lastMsg.requestId;
											lastMsg.appId = String(appId || "").trim() || lastMsg.appId;
											break;
										}
									}
									return updated;
								});
							}
							if (evt.jobId) {
								effectiveStreamJobId = String(evt.jobId);
								setStreamJobId(effectiveStreamJobId);
							}
							if (evtStatus === "blocked" && localizedEvtMessage) {
								receivedBlockedGuardEvent = true;
								const blockedContent = formatSystemNotice({
									summary: localizedEvtMessage,
									nextStep: resolveSystemNextStep(effectiveReasonCode, evt.stage),
									internalCode: String(effectiveReasonCode || evt.stage || "").trim().toUpperCase(),
									ambiguities: evtAmbiguities,
									questions: evtQuestions,
								});
								showSystemToast("warning", {
									summary: localizedEvtMessage,
									nextStep: resolveSystemNextStep(effectiveReasonCode, evt.stage),
									internalCode: String(effectiveReasonCode || evt.stage || "").trim().toUpperCase(),
									ambiguities: evtAmbiguities,
									questions: evtQuestions,
								});

								streamingMessageRef.current = blockedContent;
								pendingStreamChunkRef.current = "";
								turnAllowAutoApplyRef.current = false;
								setMessages((prev) => {
									const updated = [...prev];
									for (let i = updated.length - 1; i >= 0; i -= 1) {
										const lastMsg = updated[i];
										if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
											lastMsg.content = blockedContent;
											lastMsg.codeBlocks = [];
											lastMsg.responseMode = "analyze";
											lastMsg.timestamp = Date.now();
											break;
										}
									}
									return updated;
								});
							}
							const decisionStep = evt.modelDecisionStep || evt.decision_step;
							const decisionReason = evt.modelDecisionReason || evt.reason_code;
							if (evt.stage === "assistant_fast_exit") {
								appendAgenticStep({
									stage: "assistant_fast_exit",
									icon: "⚡",
									label: uiText("Trả lời nhanh", "Fast reply", "快速回复"),
									detail: uiText(
										`Độ tự tin ${(evt as any).confidence || 0}% · <200ms`,
										`Confidence ${(evt as any).confidence || 0}% · <200ms`,
										`置信度 ${(evt as any).confidence || 0}% · <200ms`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_orchestration_plan") {
								const stepCount = Number((evt as any).stepCount || 0);
								const estimatedTime = Number((evt as any).estimatedTimeMs || 0);
								appendAgenticStep({
									stage: "assistant_orchestration_plan",
									icon: "🎯",
									label: uiText("Lập kế hoạch xử lý", "Orchestration plan", "编排规划"),
									detail: uiText(
										`${stepCount} bước · ~${estimatedTime}ms · ${(evt as any).category || ""}`,
										`${stepCount} steps · ~${estimatedTime}ms · ${(evt as any).category || ""}`,
										`${stepCount} 步骤 · ~${estimatedTime}ms · ${(evt as any).category || ""}`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_orchestration_step_result") {
								const stepName = String((evt as any).stepName || (evt as any).operation || "");
								const stepStatus = String((evt as any).status || "");
								const durationMs = Number((evt as any).durationMs || 0);
								const progressPercent = Number((evt as any).progressPercent || 0);
								appendAgenticStep({
									stage: "assistant_orchestration_step_result",
									icon: stepStatus === "success" ? "✅" : stepStatus === "error" ? "❌" : "⏳",
									label: uiText(`Bước: ${stepName}`, `Step: ${stepName}`, `步骤: ${stepName}`),
									detail: uiText(
										`${stepStatus} · ${durationMs}ms · ${progressPercent}%`,
										`${stepStatus} · ${durationMs}ms · ${progressPercent}%`,
										`${stepStatus} · ${durationMs}ms · ${progressPercent}%`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_orchestration_replan") {
								const failedStep = String((evt as any).failedStep || "");
								const currentConfidence = Number((evt as any).currentConfidence || 0);
								const requiredConfidence = Number((evt as any).requiredConfidence || 0);
								const candidateSteps = Array.isArray((evt as any).candidateSteps) ? (evt as any).candidateSteps.length : 0;
								appendAgenticStep({
									stage: "assistant_orchestration_replan",
									icon: "🔁",
									label: uiText("Tái lập kế hoạch DAG", "Replan DAG", "DAG 重规划"),
									detail: uiText(
										`step: ${failedStep || "-"} · conf ${Math.round(currentConfidence * 100)}%/${Math.round(requiredConfidence * 100)}% · ${candidateSteps} nhánh`,
										`step: ${failedStep || "-"} · conf ${Math.round(currentConfidence * 100)}%/${Math.round(requiredConfidence * 100)}% · ${candidateSteps} branches`,
										`步骤: ${failedStep || "-"} · 置信度 ${Math.round(currentConfidence * 100)}%/${Math.round(requiredConfidence * 100)}% · ${candidateSteps} 分支`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_multifile_patch_plan") {
								const fileCount = Number((evt as any).fileCount || 0);
								const edgeCount = Number((evt as any).edgeCount || 0);
								const planConfidence = Number((evt as any).planConfidence || 0);
								const strategy = String((evt as any).strategy || "dependency_ordered_linear");
								appendAgenticStep({
									stage: "assistant_multifile_patch_plan",
									icon: "🗺️",
									label: uiText("Lập patch nhiều file", "Planning multi-file patch", "规划多文件补丁"),
									detail: uiText(
										`${fileCount} file · ${edgeCount} dependency · ${planConfidence}% · ${strategy}`,
										`${fileCount} files · ${edgeCount} dependencies · ${planConfidence}% · ${strategy}`,
										`${fileCount} 文件 · ${edgeCount} 依赖 · ${planConfidence}% · ${strategy}`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							if (evt.stage === "agentic_plan" && evt.compacted && Number(evt.savedChars) > 0) {
								appendAgenticStep({
									stage: "agentic_plan",
									icon: "🧠",
									label: uiText("Lập kế hoạch Agentic", "Agentic Planning", "Agent 计划"),
									detail: uiText(
										`${evt.planStepCount ?? 0} bước · tier: ${evt.routingTier || "—"} · tiết kiệm ${(evt.savedChars ?? 0).toLocaleString()} ký tự`,
										`${evt.planStepCount ?? 0} steps · tier: ${evt.routingTier || "—"} · saved ${(evt.savedChars ?? 0).toLocaleString()} chars`,
										`${evt.planStepCount ?? 0} 步骤 · 层级: ${evt.routingTier || "—"} · 节省 ${(evt.savedChars ?? 0).toLocaleString()} 字符`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evt);
							}
							else if (evt.stage === "agentic_plan") {
								appendAgenticStep({ stage: "agentic_plan", icon: "🧠", label: uiText("Lập kế hoạch Agentic", "Agentic Planning", "Agent 计划"), status: "done" });
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evt);
							}
							else if (evt.stage === "assistant_route_plan") {
								const routeName = String((evt as any).routeName || "").trim();
								const routeReason = String((evt as any).routeReason || (evt as any).reason_code || "").trim();
								const routeConfidence = Number((evt as any).routeConfidence);
								const workspaceKind = String((evt as any).workspaceKind || "").trim();
								const weakMachineSafe = Boolean((evt as any).weakMachineSafe);
								const routeParts = [
									routeName ? `${routeName}${routeReason ? ` · ${routeReason}` : ""}${Number.isFinite(routeConfidence) ? ` · ${Math.round(routeConfidence)}%` : ""}` : (routeReason || ""),
									workspaceKind ? uiText(`workspace=${workspaceKind}`, `workspace=${workspaceKind}`, `workspace=${workspaceKind}`) : "",
									weakMachineSafe ? uiText("safe cho máy yếu", "weak-machine safe", "弱机器安全") : "",
								].filter(Boolean);
								appendAgenticStep({
									stage: "assistant_route_plan",
									icon: "🧭",
									label: uiText("Chọn route", "Route planning", "路由规划"),
									detail: routeParts.join(" · ") || undefined,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evt);
							}
							else if (evt.stage === "assistant_tool_intent_plan") {
								const tools = Array.isArray((evt as any).tools) ? (evt as any).tools : [];
								const topTools = tools
									.map((item: any) => String(item?.intent || "").trim())
									.filter(Boolean)
									.slice(0, 3);
								const toolCount = Number((evt as any).toolCount || tools.length || 0);
								const ingestTargets = Array.isArray((evt as any).ingestTargets)
									? (evt as any).ingestTargets.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 4)
									: [];
								const executionBlueprint = Array.isArray((evt as any).executionBlueprint)
									? (evt as any).executionBlueprint
										.map((item: any) => String(item?.description || item?.action || "").trim())
										.filter(Boolean)
										.slice(0, 3)
									: [];
								const attachmentInsights = Array.isArray((evt as any).attachmentInsights)
									? (evt as any).attachmentInsights
										.map((item: any) => String(item?.category || item?.role || item?.name || "").trim())
										.filter(Boolean)
										.slice(0, 3)
									: [];
								const detailParts = [
									uiText(
										`${toolCount} bước${topTools.length ? ` · ${topTools.join(" -> ")}` : ""}`,
										`${toolCount} steps${topTools.length ? ` · ${topTools.join(" -> ")}` : ""}`,
										`${toolCount} 步骤${topTools.length ? ` · ${topTools.join(" -> ")}` : ""}`,
									),
									ingestTargets.length > 0 ? uiText(`nạp: ${ingestTargets.join(", ")}`, `ingest: ${ingestTargets.join(", ")}`, `入库: ${ingestTargets.join(", ")}`) : "",
									executionBlueprint.length > 0 ? uiText(`plan: ${executionBlueprint.join(" | ")}`, `plan: ${executionBlueprint.join(" | ")}`, `plan: ${executionBlueprint.join(" | ")}`) : "",
									attachmentInsights.length > 0 ? uiText(`attachment: ${attachmentInsights.join(", ")}`, `attachments: ${attachmentInsights.join(", ")}`, `附件: ${attachmentInsights.join(", ")}`) : "",
								].filter(Boolean);
								appendAgenticStep({
									stage: "assistant_tool_intent_plan",
									icon: "🧩",
									label: uiText("Lập kế hoạch công cụ", "Tool intent planning", "工具意图规划"),
									detail: detailParts.join(" · "),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_verify_plan") {
								appendAgenticStep({
									stage: "assistant_verify_plan",
									icon: "✅",
									label: uiText("Lập kế hoạch kiểm chứng", "Verification planning", "验证规划"),
									detail: String((evt as any).mode || "").trim() || undefined,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_verify_result") {
								const score = Number((evt as any).verificationScore);
								const passed = Boolean((evt as any).verificationPassed);
								const verdict = String((evt as any).verificationVerdict || "").trim();
								const evidenceTokens = Array.isArray((evt as any).evidenceTokens)
									? (evt as any).evidenceTokens.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 4)
									: [];
								appendAgenticStep({
									stage: "assistant_verify_result",
									icon: passed ? "✅" : "⚠️",
									label: uiText("Kiểm chứng kết quả", "Result verification", "结果验证"),
									detail: uiText(
										`${Number.isFinite(score) ? `${Math.round(score)}/100` : "--"}${verdict ? ` · ${verdict}` : ""}${evidenceTokens.length ? ` · ${evidenceTokens.join(", ")}` : ""}`,
										`${Number.isFinite(score) ? `${Math.round(score)}/100` : "--"}${verdict ? ` · ${verdict}` : ""}${evidenceTokens.length ? ` · ${evidenceTokens.join(", ")}` : ""}`,
										`${Number.isFinite(score) ? `${Math.round(score)}/100` : "--"}${verdict ? ` · ${verdict}` : ""}${evidenceTokens.length ? ` · ${evidenceTokens.join(", ")}` : ""}`,
									),
									status: passed ? "done" : "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_evidence_gate") {
								const verdict = String((evt as any).verificationVerdict || "").trim();
								const score = Number((evt as any).score);
								const minScore = Number((evt as any).minScore);
								const evidenceCount = Number((evt as any).evidenceCount || 0);
								const minEvidenceCount = Number((evt as any).minEvidenceCount || 0);
								appendAgenticStep({
									stage: "assistant_evidence_gate",
									icon: "🛡️",
									label: uiText("Gate bằng chứng phân tích", "Analysis evidence gate", "分析证据门控"),
									detail: `${formatVerdictLabel(verdict || "blocked")} · ${uiText("điểm", "score", "分数")}=${Number.isFinite(score) ? Math.round(score) : "--"}/${Number.isFinite(minScore) ? Math.round(minScore) : "--"} · ${uiText("bằng chứng", "evidence", "证据")}=${evidenceCount}/${minEvidenceCount}`,
									status: "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "patch_dry_run_rejected") {
								const dryRun = normalizePatchDryRunMeta((evt as any).stats || (evt as any).patchDryRun || {});
								const reason = String((evt as any).reason || dryRun?.rejectionReason || "").trim();
								const conflictCount = Number(dryRun?.conflictCount ?? (dryRun?.conflicts?.length || 0));
								appendAgenticStep({
									stage: "patch_dry_run_rejected",
									icon: "⛔",
									label: uiText("Dry-run patch bị chặn", "Patch dry-run rejected", "补丁干运行被拒绝"),
									detail: `${formatPatchDryRunReason(reason)}${Number.isFinite(conflictCount) && conflictCount > 0 ? ` · ${uiText("xung đột", "conflicts", "冲突") }=${conflictCount}` : ""}`,
									status: "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_edit_risk_gate") {
								const riskScore = Number((evt as any).riskScore);
								const riskLevel = String((evt as any).riskLevel || "").trim().toLowerCase();
								const localizedRiskLevel = formatRiskLevelLabel(riskLevel);
								const blockAutoApply = Boolean((evt as any).blockAutoApply);
								const reasons = Array.isArray((evt as any).reasons)
									? (evt as any).reasons.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 3)
									: [];
								appendAgenticStep({
									stage: "assistant_edit_risk_gate",
									icon: blockAutoApply ? "🛑" : (riskLevel === "medium" ? "⚠️" : "✅"),
									label: uiText("Đánh giá rủi ro chỉnh sửa", "Edit risk gating", "编辑风险门控"),
									detail: uiText(
										`${Number.isFinite(riskScore) ? `${Math.round(riskScore)}/100` : "--"}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("block-auto-apply")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
										`${Number.isFinite(riskScore) ? `${Math.round(riskScore)}/100` : "--"}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("block-auto-apply")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
										`${Number.isFinite(riskScore) ? `${Math.round(riskScore)}/100` : "--"}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("block-auto-apply")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
									),
									status: blockAutoApply ? "running" : "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_semantic_sandbox") {
								const riskScore = Number((evt as any).riskScore);
								const riskLevel = String((evt as any).riskLevel || "").trim().toLowerCase();
								const localizedRiskLevel = formatRiskLevelLabel(riskLevel);
								const blockAutoApply = Boolean((evt as any).blockAutoApply);
								const verdict = String((evt as any).verdict || "").trim();
								const reasons = Array.isArray((evt as any).reasons)
									? (evt as any).reasons.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 3)
									: [];
								appendAgenticStep({
									stage: "assistant_semantic_sandbox",
									icon: blockAutoApply ? "🛑" : (riskLevel === "medium" ? "⚠️" : "🧪"),
									label: uiText("Semantic sandbox trước khi apply", "Pre-apply semantic sandbox", "应用前语义沙箱"),
									detail: uiText(
										`${formatVerdictLabel(verdict || "passed")}${Number.isFinite(riskScore) ? ` · ${Math.round(riskScore)}/100` : ""}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("review-required")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
										`${formatVerdictLabel(verdict || "passed")}${Number.isFinite(riskScore) ? ` · ${Math.round(riskScore)}/100` : ""}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("review-required")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
										`${formatVerdictLabel(verdict || "passed")}${Number.isFinite(riskScore) ? ` · ${Math.round(riskScore)}/100` : ""}${localizedRiskLevel ? ` · ${localizedRiskLevel}` : ""}${blockAutoApply ? ` · ${formatInternalFlagLabel("review-required")}` : ""}${reasons.length ? ` · ${reasons.join(", ")}` : ""}`,
									),
									status: blockAutoApply ? "running" : "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_tool_execution_result") {
								const toolName = String((evt as any).toolName || "").trim();
								const intent = String((evt as any).intent || "").trim();
								const status = String((evt as any).status || "").trim().toLowerCase();
								const durationMs = Number((evt as any).durationMs || 0);
								const errorCode = Number((evt as any).errorCode || 0);
								const successOutput = Boolean((evt as any).successOutput);
								const statusIcon = successOutput ? "✅" : (errorCode > 0 ? "❌" : "⏳");
								appendAgenticStep({
									stage: "assistant_tool_execution_result",
									icon: statusIcon,
									label: uiText("Kết quả thực thi công cụ", "Tool execution result", "工具执行结果"),
									detail: uiText(
										`${toolName || intent}${status ? ` · ${status}` : ""}${durationMs > 0 ? ` · ${durationMs}ms` : ""}${errorCode > 0 ? ` · error=${errorCode}` : ""}`,
										`${toolName || intent}${status ? ` · ${status}` : ""}${durationMs > 0 ? ` · ${durationMs}ms` : ""}${errorCode > 0 ? ` · error=${errorCode}` : ""}`,
										`${toolName || intent}${status ? ` · ${status}` : ""}${durationMs > 0 ? ` · ${durationMs}ms` : ""}${errorCode > 0 ? ` · error=${errorCode}` : ""}`,
									),
									status: successOutput ? "done" : "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "assistant_citations") {
								const count = Number((evt as any).count || 0);
								const sources = Number((evt as any).sources || 0);
								const tokens = Array.isArray((evt as any).tokens)
									? (evt as any).tokens.map((token: any) => String(token || "").trim()).filter(Boolean)
									: [];
								setAssistantCitationTokens(tokens);
								appendAgenticStep({
									stage: "assistant_citations",
									icon: count > 0 ? "📚" : "○",
									label: uiText("Trích dẫn nguồn", "Source citations", "源引用"),
									detail: uiText(
										count > 0 ? `${count} trích dẫn từ ${sources} nguồn` : "không có trích dẫn",
										count > 0 ? `${count} citations from ${sources} sources` : "no citations",
										count > 0 ? `${count}个引用来自${sources}个源` : "无引用",
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "attachment_intake") {
								const total = Number((evt as any).total || 0);
								const imageCount = Number((evt as any).images || 0);
								const jsonCount = Number((evt as any).json || 0);
								const markdownCount = Number((evt as any).markdown || 0);
								const textChars = Number((evt as any).textChars || 0);
								appendAgenticStep({
									stage: "attachment_intake",
									icon: "📎",
									label: uiText("Chuẩn hóa attachment inline", "Normalized inline attachments", "规范化内联附件"),
									detail: uiText(
										`${total} tệp · img ${imageCount} · json ${jsonCount} · md ${markdownCount} · ${textChars} chars`,
										`${total} files · img ${imageCount} · json ${jsonCount} · md ${markdownCount} · ${textChars} chars`,
										`${total} 个文件 · 图像 ${imageCount} · json ${jsonCount} · md ${markdownCount} · ${textChars} 字符`,
									),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "tool_search") {
								const topK = Number((evt as any).retrievalTopK || 0);
								const retrievalHitCount = Number((evt as any).retrievalHitCount || 0);
								const retrievalSourceCount = Number((evt as any).retrievalSourceCount || 0);
								const retrievalMaxChars = Number((evt as any).retrievalMaxChars || 0);
								const scopeSummary = String((evt as any).scopeSummary || "").trim();
								const retrievalEngineLabel = String((evt as any).retrievalEngineLabel || "").trim();
								const retrievalQuery = String((evt as any).retrievalQuery || "").trim();
								const menuSignals = Array.isArray((evt as any).menuSignals)
									? (evt as any).menuSignals.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 4)
									: [];
								const focusTargets = Array.isArray((evt as any).focusTargets)
									? (evt as any).focusTargets.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 4)
									: [];
								const symbolQueries = Array.isArray((evt as any).symbolQueries)
									? (evt as any).symbolQueries.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 2)
									: [];
								const targetedQueries = Array.isArray((evt as any).targetedQueries)
									? (evt as any).targetedQueries.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 2)
									: [];
								const virtualContextPreview = Array.isArray((evt as any).virtualContextPreview)
									? (evt as any).virtualContextPreview.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 3)
									: [];
								const retrievalHits = Array.isArray((evt as any).retrievalHits)
									? (evt as any).retrievalHits
										.map((item: any) => {
											const source = String(item?.source || "").trim();
											const summary = String(item?.summary || "").trim();
											const score = Number(item?.score || 0);
											const scoreLabel = score > 0 ? ` (${score.toFixed(3)})` : "";
											const sourceCategory = String(item?.sourceCategory || "").trim().toLowerCase();
											const matchedTokens = Array.isArray(item?.matchedTokens)
												? item.matchedTokens.map((token: unknown) => String(token || "").trim()).filter(Boolean).slice(0, 3)
												: [];
											const recent = Boolean(item?.recent);
											const reasonParts: string[] = [];
											if (sourceCategory && sourceCategory !== "general") {
												reasonParts.push((() => {
													switch (sourceCategory) {
														case "current_code":
															return uiText("code hiện tại", "current code", "当前代码");
														case "current_menu":
															return uiText("menu hiện tại", "current menu", "当前菜单");
														case "menu_context":
															return uiText("ngữ cảnh menu", "menu context", "菜单上下文");
														case "attachment_context":
															return uiText("attachment tham chiếu", "attachment context", "附件上下文");
														case "reference_docs":
															return uiText("tài liệu tham chiếu", "reference docs", "参考文档");
														case "workspace_module":
															return uiText("module workspace", "workspace module", "工作区模块");
														case "dynamic_context":
															return uiText("ngữ cảnh động", "dynamic context", "动态上下文");
														default:
															return "";
													}
												})());
											}
											if (matchedTokens.length > 0) {
												reasonParts.push(uiText(
													`khớp ${matchedTokens.join(", ")}`,
													`matched ${matchedTokens.join(", ")}`,
													`匹配 ${matchedTokens.join(", ")}`,
												));
											}
											if (recent) {
												reasonParts.push(uiText("mới", "recent", "最近"));
											}
											const reasonLabel = reasonParts.length > 0
												? ` [${uiText("vì sao", "why", "原因")}: ${reasonParts.join(" · ")}]`
												: "";
											if (!source && !summary) {
												return "";
											}
											if (source && summary) {
												return `${source}${scoreLabel}: ${summary}${reasonLabel}`;
											}
											return `${source || summary}${scoreLabel}${reasonLabel}`;
										})
										.filter(Boolean)
										.slice(0, 2)
									: [];
								const adaptiveReasons = Array.isArray((evt as any).adaptiveReasons)
									? (evt as any).adaptiveReasons.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 2)
									: [];
								const formatFocusTargetLabel = (item: string) => {
									if (item === "code_editor") {
										return uiText("trình biên tập mã", "code editor", "代码编辑器");
									}
									if (item === "menu_json") {
										return uiText("thiết kế menu", "menu designer", "菜单设计");
									}
									if (item === "menu_string") {
										return uiText("menu hiện tại", "current menu", "当前菜单");
									}
									if (item === "menu_attachment_json") {
										return uiText("json menu đính kèm", "attached menu json", "附加菜单 JSON");
									}
									if (item === "menu_context") {
										return uiText("ngữ cảnh menu", "menu context", "菜单上下文");
									}
									if (item === "current_code") {
										return uiText("code hiện tại", "current code", "当前代码");
									}
									if (item === "current_menu") {
										return uiText("menu hiện tại", "current menu", "当前菜单");
									}
									return item;
								};
								const buildPrefixedList = (labelVi: string, labelEn: string, labelZh: string, values: string[], formatter?: (value: string) => string) => {
									if (values.length <= 0) {
										return "";
									}
									const rendered = values.map(value => formatter ? formatter(value) : value).filter(Boolean).join(" · ");
									if (!rendered) {
										return "";
									}
									return uiText(
										`${labelVi}: ${rendered}`,
										`${labelEn}: ${rendered}`,
										`${labelZh}: ${rendered}`,
									);
								};
								const detailParts: string[] = [];
								if (focusTargets.length > 0) {
									detailParts.push(buildPrefixedList("phạm vi", "scope", "范围", focusTargets, formatFocusTargetLabel));
								}
								if (retrievalSourceCount > 0 || retrievalHitCount > 0) {
									detailParts.push(uiText(
										`đã dò ${retrievalSourceCount || retrievalHitCount} nguồn · ${retrievalHitCount} hits`,
										`searched ${retrievalSourceCount || retrievalHitCount} sources · ${retrievalHitCount} hits`,
										`已搜索 ${retrievalSourceCount || retrievalHitCount} 个来源 · ${retrievalHitCount} 个命中`,
									));
								}
								if (retrievalQuery) {
									detailParts.push(uiText(`query chính: ${retrievalQuery}`, `main query: ${retrievalQuery}`, `主查询: ${retrievalQuery}`));
								}
								if (menuSignals.length > 0) {
									detailParts.push(buildPrefixedList("neo menu", "menu anchors", "菜单锚点", menuSignals));
								}
								if (symbolQueries.length > 0) {
									detailParts.push(buildPrefixedList("neo symbol", "symbol probes", "符号探针", symbolQueries));
								}
								if (targetedQueries.length > 0) {
									detailParts.push(buildPrefixedList("neo đích", "targeted probes", "定向探针", targetedQueries));
								}
								if (virtualContextPreview.length > 0) {
									detailParts.push(buildPrefixedList("bộ nhớ ảo", "virtual context", "虚拟上下文", virtualContextPreview));
								}
								if (retrievalHits.length > 0) {
									detailParts.push(buildPrefixedList("nguồn trúng", "matched sources", "命中来源", retrievalHits));
								}
								const isMenuSearchFlow = menuSignals.length > 0
									|| focusTargets.includes("menu_json")
									|| focusTargets.includes("menu_context")
									|| focusTargets.includes("current_menu")
									|| focusTargets.includes("menu_attachment_json");
								const scopeEngineLabel = (() => {
									if (isMenuSearchFlow) {
										const normalizedEngineLabel = retrievalEngineLabel.toLowerCase();
										if (!normalizedEngineLabel || normalizedEngineLabel.includes("code scope") || normalizedEngineLabel.includes("symbol retrieval")) {
											return "menu schema + trigger retrieval";
										}
									}
									return retrievalEngineLabel || scopeSummary;
								})();
								if (scopeEngineLabel) {
									detailParts.push(uiText(`scope engine: ${scopeEngineLabel}`, `scope engine: ${scopeEngineLabel}`, `范围引擎: ${scopeEngineLabel}`));
								}
								if (topK > 0) {
									detailParts.push(uiText(`topK=${topK}${retrievalMaxChars > 0 ? ` · tối đa ${retrievalMaxChars} ký tự` : ""}`, `topK=${topK}${retrievalMaxChars > 0 ? ` · max ${retrievalMaxChars} chars` : ""}`, `topK=${topK}${retrievalMaxChars > 0 ? ` · 最多 ${retrievalMaxChars} 字符` : ""}`));
								}
								if (adaptiveReasons.length > 0) {
									detailParts.push(buildPrefixedList("điều chỉnh", "adaptive reasons", "自适应原因", adaptiveReasons));
								}
								appendAgenticStep({
									stage: "tool_search",
									icon: "🔎",
									label: uiText("Tìm ngữ cảnh và nguồn liên quan", "Searching context and relevant sources", "搜索上下文与相关来源"),
									detail: detailParts.length > 0 ? detailParts.join(" · ") : localizedEvtMessage,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "tool_prepare") {
								const stepCount = Number((evt as any).planStepCount || 0);
								appendAgenticStep({
									stage: "tool_prepare",
									icon: "🧩",
									label: uiText("Phân tích và lập kế hoạch", "Analyzing and planning", "分析并规划"),
									detail: stepCount > 0 ? uiText(`${stepCount} bước`, `${stepCount} steps`, `${stepCount} 步`) : localizedEvtMessage,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "tool_apply") {
								const applyStatusRaw = String((evt as any).status || "running").trim().toLowerCase();
								const applyStatus: AgenticStep["status"] = (applyStatusRaw === "completed" || applyStatusRaw === "failed" || applyStatusRaw === "skipped")
									? "done"
									: (applyStatusRaw === "planned" ? "planned" : "running");
								const applyIcon = applyStatusRaw === "completed"
									? "✅"
									: (applyStatusRaw === "failed" ? "❌" : "🛠");
								appendAgenticStep({
									stage: "tool_apply",
									icon: applyIcon,
									label: uiText("Áp kết quả vào editor", "Applying results to editor", "将结果应用到编辑器"),
									detail: localizedEvtMessage,
									status: applyStatus,
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "tool_trace") {
								const toolName = String((evt as any).toolName || "").trim() || "tool";
								const toolLane = toolName.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
								const traceStatusRaw = String((evt as any).status || "completed").trim().toLowerCase();
								const traceStatus = ["start", "running", "completed", "failed", "skipped"].includes(traceStatusRaw)
									? traceStatusRaw
									: "completed";
								const inputDigest = String((evt as any).inputDigest || "").trim();
								const outputDigest = String((evt as any).outputDigest || "").trim();
								const durationMs = Number((evt as any).durationMs || 0);
								const retryCount = Number((evt as any).retryCount || 0);
								const errorClass = String((evt as any).errorClass || "none").trim();
								const errorCode = String((evt as any).errorCode || "none").trim();
								const stepIndex = Number((evt as any).stepIndex || 0);
								const stepTotal = Number((evt as any).stepTotal || 0);
								const lifecycle: AgenticStep["status"] = (traceStatus === "running" || traceStatus === "start") ? "running" : "done";
								const icon = traceStatus === "failed"
									? "❌"
									: (traceStatus === "skipped" ? "⚠️" : (traceStatus === "running" || traceStatus === "start" ? "⏳" : "✅"));
								const parts = [
									stepIndex > 0 && stepTotal > 0 ? `${stepIndex}/${stepTotal}` : "",
									traceStatus,
									durationMs > 0 ? `${Math.round(durationMs)}ms` : "",
									retryCount > 0 ? `retry=${retryCount}` : "",
									inputDigest ? `in: ${inputDigest}` : "",
									outputDigest ? `out: ${outputDigest}` : "",
									(errorClass !== "none" || errorCode !== "none") ? `err=${errorClass}/${errorCode}` : "",
								].filter(Boolean);
								appendAgenticStep({
									stage: `tool_trace_${toolLane}`,
									icon,
									label: uiText(`Tool trace · ${toolName}`, `Tool trace · ${toolName}`, `工具轨迹 · ${toolName}`),
									detail: parts.join(" · "),
									status: lifecycle,
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE) {
									appendStageEvent({
										...evtForTimeline,
										stage: `tool_trace_${toolLane}`,
										traceStatus,
										toolName,
										retryCount,
										errorClass,
										errorCode,
										message: uiText(`Tool trace · ${toolName}`, `Tool trace · ${toolName}`, `工具轨迹 · ${toolName}`),
										detail: parts.join(" · ") || undefined,
										orchestrationPhase: traceStatus,
									});
								}
							}
							else if (evt.stage === "agentic_step") {
								const currentStep = Number((evt as any).current || 0);
								const totalSteps = Number((evt as any).total || 0);
								const stepMessage = String((evt as any).message || localizedEvtMessage || "").trim();
								const lifecycleStatusRaw = String((evt as any).status || "").trim().toLowerCase();
								const lifecycleStatus: AgenticStep["status"] = lifecycleStatusRaw === "planned"
									? "planned"
									: (lifecycleStatusRaw === "done" ? "done" : "running");
								const stepLabelPrefix = lifecycleStatus === "planned"
									? uiText("Lên kế hoạch bước", "Planned step", "计划步骤")
									: uiText("Thực thi bước", "Executing step", "执行步骤");
								const stepLabel = totalSteps > 0
									? `${stepLabelPrefix} ${Math.max(1, currentStep)}/${totalSteps}`
									: stepLabelPrefix;
								appendAgenticStep({
									stage: `agentic_step_${Math.max(1, currentStep)}_${Math.max(1, totalSteps)}`,
									icon: lifecycleStatus === "planned" ? "🧭" : "🪜",
									label: stepLabel,
									detail: stepMessage || undefined,
									status: lifecycleStatus,
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "local_tool_invocation") {
								appendAgenticStep({
									stage: "local_tool_invocation",
									icon: "🔧",
									label: uiText("Chạy local tools", "Local tools executed", "执行本地工具"),
									detail: localizedEvtMessage,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "menu_editor_apply") {
								const fetchReady = Boolean((evt as any).menuEditorApplyFetch === true);
								const applyRequestId = String((evt as any).requestId || streamRequestId || "").trim();
								const stepMergeStats = (evt as any).mergeStats;
								if (stepMergeStats && contextType === "menu_json") {
									const menuOpSummary = summarizeMenuPatchOps([], stepMergeStats);
									setLocalFlowOps({
										verified: true,
										flow: "menu_json",
										addCount: menuOpSummary.addCount,
										editCount: menuOpSummary.editCount,
										deleteCount: menuOpSummary.deleteCount,
									});
									localFlowVerifiedRef.current = true;
								}
								appendAgenticStep({
									stage: "menu_editor_apply",
									icon: "📥",
									label: uiText("Nạp menu đã merge", "Load merged menu", "加载已合并菜单"),
									detail: uiText(
										`Đang áp ${Number((evt as any).menuEditorApplyChars || 0).toLocaleString()} ký tự vào editor`,
										`Applying ${Number((evt as any).menuEditorApplyChars || 0).toLocaleString()} chars to editor`,
										`正在将 ${Number((evt as any).menuEditorApplyChars || 0).toLocaleString()} 字符应用到编辑器`,
									),
									status: "running",
								});
								if (fetchReady && applyRequestId) {
									void fetchMenuEditorApplyPayload(applyRequestId).then((menuJson) => {
										if (menuJson) {
											applyMenuEditorCodeDirect(menuJson);
										}
										setAgenticSteps((prev) => prev.map((step) =>
											step.stage === "menu_editor_apply"
												? {
													...step,
													status: "done" as const,
													detail: menuJson
														? step.detail
														: uiText(
															"Không tải được menu merge để áp vào editor",
															"Could not fetch merged menu to apply to editor",
															"无法获取已合并菜单以应用到编辑器",
														),
												}
												: step,
										));
									});
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "menu_audit_progress") {
								const stepDesc = String((evt as any).stepDescription || "").trim();
								if (stepDesc && !menuAuditStepsRef.current.includes(stepDesc)) {
									menuAuditStepsRef.current = [...menuAuditStepsRef.current, stepDesc];
								}
								const stepIndex = Number((evt as any).stepIndex || 1);
								const stepTotal = Number((evt as any).stepTotal || 1);
								appendAgenticStep({
									stage: `menu_audit_progress_${stepIndex}`,
									icon: "🔍",
									label: uiText(
										`Audit ${stepIndex}/${stepTotal}`,
										`Audit ${stepIndex}/${stepTotal}`,
										`审计 ${stepIndex}/${stepTotal}`,
									),
									detail: stepDesc || undefined,
									stepIndex,
									stepTotal,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "agentic_step_result") {
								// Step-by-step results from local agentic execution.
								const stepIndex = Number((evt as any).stepIndex || 1);
								const stepTotal = Number((evt as any).stepTotal || 1);
								const stepDesc = String((evt as any).stepDescription || "").trim();
								const isPartial = Boolean((evt as any).partial);
								const stepPatchValidator = normalizePatchValidatorMeta((evt as any).patchValidator);
								const stepPatchDryRun = normalizePatchDryRunMeta((evt as any).patchDryRun);
								const stepContextType = String((evt as any).contextType || contextType || "").trim().toLowerCase();
								const stepPatchOps = (evt as any).patchOps;
								const stepMergeStats = (evt as any).mergeStats;
								const patchRejected = isPatchValidatorRejected(stepPatchValidator);
								const dryRunRejected = isPatchDryRunRejected(stepPatchDryRun);
								const patchReasonCode = String(stepPatchValidator?.rejectionReason || "").trim().toLowerCase();
								const dryRunReasonCode = String(stepPatchDryRun?.rejectionReason || "").trim().toLowerCase();
								const patchHint = stepPatchValidator
									? `${formatPatchValidatorReason(stepPatchValidator.rejectionReason)} (${stepPatchValidator.acceptedCount ?? 0}/${stepPatchValidator.inputCount ?? 0})`
									: "";
								const dryRunHint = stepPatchDryRun
									? `${formatPatchDryRunReason(stepPatchDryRun.rejectionReason)} (${stepPatchDryRun.acceptedCount ?? 0}/${stepPatchDryRun.inputCount ?? 0})`
									: "";
								const rawQualityScore = Number((evt as any).qualityScore);
								const hasQualityScore = Number.isFinite(rawQualityScore);
								const qualityScore = Number.isFinite(rawQualityScore)
									? Math.max(0, Math.min(100, Math.round(rawQualityScore)))
									: undefined;
								const rawRiskScore = Number((evt as any).riskScore);
								const riskScore = Number.isFinite(rawRiskScore)
									? Math.max(0, Math.min(100, Math.round(rawRiskScore)))
									: undefined;
								const riskLevelRaw = String((evt as any).riskLevel || "").trim().toLowerCase();
								const riskLevel = ["low", "medium", "high"].includes(riskLevelRaw)
									? (riskLevelRaw as "low" | "medium" | "high")
									: undefined;
								const approvalRequired = Boolean((evt as any).approvalRequired);
								const approvalReasons = Array.isArray((evt as any).approvalReasons)
									? (evt as any).approvalReasons.map((item: unknown) => String(item || "").trim()).filter(Boolean)
									: [];
								const lowConfidence = Boolean((evt as any).lowConfidence)
									|| (hasQualityScore && qualityScore !== undefined ? qualityScore < 45 : false)
									|| patchRejected
									|| dryRunRejected;
								const qualityNote = hasQualityScore && qualityScore !== undefined
									? ` · ${uiText("chất lượng", "quality", "质量")}=${qualityScore}${lowConfidence ? ` · ${formatInternalFlagLabel("low-confidence")}` : ""}`
									: (lowConfidence ? ` · ${formatInternalFlagLabel("low-confidence")}` : "");
								const validatorNote = patchRejected
									? ` · ${uiText("validator", "validator", "验证器")}=${formatPatchValidatorReason(patchReasonCode || "rejected")}`
									: (patchHint ? ` · ${uiText("validator", "validator", "验证器")}=${patchHint}` : "");
								const dryRunNote = dryRunRejected
									? ` · ${uiText("dry-run", "dry-run", "干运行")}=${formatPatchDryRunReason(dryRunReasonCode || "rejected")}`
									: (dryRunHint ? ` · ${uiText("dry-run", "dry-run", "干运行")}=${dryRunHint}` : "");
								appendAgenticStep({
									stage: `agentic_step_result_${stepIndex}`,
									icon: approvalRequired ? "🛂" : (lowConfidence ? "⚠️" : "✏️"),
									label: uiText(
										`Bước ${stepIndex}/${stepTotal}`,
										`Step ${stepIndex}/${stepTotal}`,
										`步骤 ${stepIndex}/${stepTotal}`,
									),
									detail: `${stepDesc || ""}${qualityNote}${validatorNote}${dryRunNote}`.trim() || undefined,
									qualityScore,
									lowConfidence,
									riskScore,
									riskLevel,
									approvalRequired,
									approvalReasons,
									approvalState: approvalRequired ? "pending" : undefined,
									stepIndex,
									stepTotal,
									patchValidator: stepPatchValidator,
									patchDryRun: stepPatchDryRun,
									pendingTextEdits: approvalRequired && Array.isArray((evt as any).textEdits) ? (evt as any).textEdits : undefined,
									status: isPartial ? "running" : "done",
								});
								// Apply textEdits to CodeMirror immediately for edit-mode steps.
								const stepTextEdits = (evt as any).textEdits;
								const editorApplyDeferred = Boolean((evt as any).editorApplyDeferred === true);
								if (approvalRequired || (Array.isArray(stepTextEdits) && stepTextEdits.length > 0) || editorApplyDeferred) {
									deliveredAssistantResultRef.current = true;
								}
								if (stepContextType === "menu_json"
									&& ((Array.isArray(stepPatchOps) && stepPatchOps.length > 0) || editorApplyDeferred || stepMergeStats)) {
									const menuOpSummary = summarizeMenuPatchOps(stepPatchOps, stepMergeStats);
									setLocalFlowOps({
										verified: true,
										flow: "menu_json",
										addCount: menuOpSummary.addCount,
										editCount: menuOpSummary.editCount,
										deleteCount: menuOpSummary.deleteCount,
									});
									setLocalFlowOpLines([]);
									localFlowVerifiedRef.current = true;
								}
								if (Array.isArray(stepTextEdits) && stepTextEdits.length > 0) {
									const stepEvent = evt as Record<string, unknown>;
									const normalizedStepContextType = String(stepEvent.contextType || contextType || "").trim().toLowerCase();
									const normalizedStepResponseMode = String(stepEvent.responseMode || "").trim().toLowerCase();
									const blockAutoApplyByRisk = Boolean(stepEvent.editRiskBlockAutoApply === true);
									const isRealtimeEditableFlow = (normalizedStepContextType === "code" || normalizedStepContextType === "menu_json")
										&& (normalizedStepResponseMode === "edit" || turnAllowAutoApplyRef.current);
									if (isRealtimeEditableFlow && !blockAutoApplyByRisk) {
										localFlowVerifiedRef.current = true;
									}
								}
								else if (editorApplyDeferred && stepContextType === "menu_json") {
									localFlowVerifiedRef.current = true;
								}
								if (!approvalRequired && !editorApplyDeferred && Array.isArray(stepTextEdits) && stepTextEdits.length > 0) {
									const stepEvent = evt as Record<string, unknown>;
									const stepCode = String(stepEvent.code || "").trim();
									const editsPayload = stepCode
										? JSON.stringify({ code: stepCode, textEdits: stepTextEdits })
										: JSON.stringify({ textEdits: stepTextEdits });
									applyRealtimeCodeFromText(editsPayload, true);
								}
								// Append analysis text section to streaming content for analyze-mode steps.
								const stepText = String((evt as any).text || "").trim();
								if (stepText && !stepTextEdits) {
									deliveredAssistantResultRef.current = true;
									pendingStreamChunkRef.current += (pendingStreamChunkRef.current ? "\n\n" : "") + stepText;
									scheduleStreamFlush();
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "context_compression") {
								appendAgenticStep({
									stage: "context_compression",
									icon: "🗜",
									label: uiText("Gắn context nén vào prompt", "Attached compressed context", "已附加压缩上下文"),
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evt);
							}
							else if (evt.stage === "scope_reasoning") {
								const scopeSummary = String((evt as any).scopeSummary || "").trim();
								const scopeMask = Number((evt as any).scopeMask);
								const scopeTags = Array.isArray((evt as any).scopeTags)
									? (evt as any).scopeTags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
									: [];
								const scopeDetail = formatScopeReasoningLabel(scopeSummary, scopeMask, scopeTags) || localizedEvtMessage;
								appendAgenticStep({
									stage: "scope_reasoning",
									icon: "🎯",
									label: uiText("Khóa phạm vi reasoning", "Scoped reasoning locked", "已锁定推理范围"),
									detail: scopeDetail,
									status: "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "dynamic_ingestion") {
								const queueState = String((evt as any).queueState || (evt as any).status || "").trim().toLowerCase();
								const dynamicSource = String((evt as any).dynamicSource || "").trim();
								const prunedSources = Number((evt as any).prunedSources);
								const detailParts = buildDynamicIngestionParts({
									state: queueState,
									source: dynamicSource,
									pruned: prunedSources,
								});
								const dynamicDetail = detailParts.length > 0
									? `${uiText("Nạp động", "Ingestion", "动态入库")}: ${detailParts.join(" · ")}`
									: localizedEvtMessage;
								appendAgenticStep({
									stage: "dynamic_ingestion",
									icon: "📥",
									label: uiText("Nạp Lucene tạm", "Temporary Lucene ingestion", "临时 Lucene 入库"),
									detail: dynamicDetail,
									status: queueState === "queued" ? "running" : "done",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "agentic_plan_schema") {
								const score = Number((evt as any).score);
								const minScore = Number((evt as any).minScore);
								const missing = Array.isArray((evt as any).missing)
									? (evt as any).missing.map((item: unknown) => String(item || "").trim()).filter(Boolean)
									: [];
								const detailParts: string[] = [];
								if (Number.isFinite(score) && Number.isFinite(minScore) && minScore > 0) {
									detailParts.push(`${uiText("điểm", "score", "分数")}: ${score}/${minScore}`);
								}
								if (missing.length > 0) {
									detailParts.push(`${uiText("thiếu", "missing", "缺失")}: ${missing.slice(0, 3).join(", ")}`);
								}
								appendAgenticStep({
									stage: "agentic_plan_schema",
									icon: "🧭",
									label: uiText("Chuẩn hóa schema kế hoạch", "Planner schema contract", "计划结构约束"),
									detail: detailParts.length > 0 ? detailParts.join(" · ") : localizedEvtMessage,
									status: String((evt as any).status || "").toLowerCase() === "passed" ? "done" : "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "agentic_step_verifier") {
								const score = Number((evt as any).score);
								const minScore = Number((evt as any).minScore);
								const verdict = String((evt as any).verdict || (evt as any).status || "").trim().toLowerCase();
								const missing = Array.isArray((evt as any).missing)
									? (evt as any).missing.map((item: unknown) => String(item || "").trim()).filter(Boolean)
									: [];
								const detailParts: string[] = [];
								if (Number.isFinite(score) && Number.isFinite(minScore) && minScore > 0) {
									detailParts.push(`${uiText("điểm", "score", "分数")}: ${score}/${minScore}`);
								}
								if (missing.length > 0) {
									detailParts.push(`${uiText("thiếu", "missing", "缺失")}: ${missing.slice(0, 3).join(", ")}`);
								}
								appendAgenticStep({
									stage: "agentic_step_verifier",
									icon: "✅",
									label: uiText("Kiểm tra chất lượng kế hoạch", "Plan quality verification", "计划质量验证"),
									detail: detailParts.length > 0 ? detailParts.join(" · ") : localizedEvtMessage,
									status: verdict === "passed" ? "done" : "running",
								});
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "preparing") {
								const preparingMessageFromKey = renderProgressText(evt.messageKey, evt.messageArgs, evt.message);
								const preparingMessage = renderProgressText(evt.messageKey, evtMessageArgs, evt.message);
								const isLocalPreparing = String(evt.model || "").trim().toLowerCase() === "local_provider"
									|| String(decisionReason || "").toLowerCase().includes("local");
								const preparingFallback = isLocalPreparing
									? uiText("AI local đang chuẩn bị prompt và context...", "Local AI is preparing prompt and context...", "本地AI正在准备提示和上下文...")
									: uiText("Chuyên Gia đang chuẩn bị yêu cầu...", "Expert is preparing the request...", "专家正在准备请求...");
								appendModelDecisionTrace({
									step: decisionStep || "primary",
									model: evt.model,
									reason: formatModelDecisionReason(decisionReason) || preparingMessage || localizedEvtMessage,
								});
								setGeminiProgress(prev => ({
									...prev,
									phase: "waiting",
									percent: evt.percent ?? 0,
									message: normalizeAssistantProgressMessage(preparingMessage || evt.message, preparingFallback),
									estimatedWaitSecs: evt.estimatedWaitSecs ?? 0,
									remainingSecs: evt.estimatedWaitSecs ?? 0,
								}));
								setAssistantLiveStatus(normalizeAssistantProgressMessage(preparingMessage || evt.message, preparingFallback));
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "waiting_gemini") {
								const localPhase = String(evt.localPhase || "").trim().toLowerCase();
								const localPhaseFallback = localPhase === "loading"
									? uiText("AI local đang nạp model...", "Local AI is loading model...", "本地AI正在加载模型...")
									: localPhase === "postprocess"
										? uiText("AI local đang hậu xử lý kết quả...", "Local AI is post-processing output...", "本地AI正在后处理结果...")
										: uiText("AI local đang suy luận...", "Local AI is inferring...", "本地AI正在推理...");
								const waitingMessageFromKey = renderProgressText(evt.messageKey, evtMessageArgs, evt.message);
								setGeminiProgress(prev => ({
									...prev,
									phase: "waiting",
									percent: evt.percent ?? prev.percent,
									message: normalizeAssistantProgressMessage(waitingMessageFromKey || evt.message, localPhaseFallback),
									remainingSecs: evt.remainingEstimateSecs ?? prev.remainingSecs,
								}));
								setAssistantLiveStatus(normalizeAssistantProgressMessage(waitingMessageFromKey || evt.message, localPhaseFallback));
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "streaming_started") {
								const startedText = String(evt.model || "").trim().toLowerCase() === "local_provider"
									? uiText("AI local bắt đầu stream kết quả...", "Local AI started streaming the result...", "本地AI开始流式返回结果...")
									: uiText("Đang nhận kết quả từ Chuyên Gia...", "Receiving result from Expert...", "正在接收专家结果...");
								setGeminiProgress(prev => ({
									...prev,
									phase: "streaming",
									percent: 15,
									message: startedText,
									ttftMs: evt.ttftMs,
									estimatedTotalChars: evt.estimatedTotalChars ?? prev.estimatedTotalChars,
									remainingSecs: 0,
								}));
								setAssistantLiveStatus(startedText);
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "streaming_progress") {
								setGeminiProgress(prev => ({
									...prev,
									phase: "streaming",
									percent: evt.percent ?? prev.percent,
									message: localizedEvtMessage || prev.message,
									charsReceived: evt.charsReceived ?? prev.charsReceived,
									remainingSecs: evt.remainingEstimateSecs ?? prev.remainingSecs,
								}));
							}
							else if (evt.stage === "analyzing") {
								if (SHOW_DETAILED_PROGRESS_TIMELINE) {
									appendStageEvent({ stage: evt.stage as any, message: localizedEvtMessage, percent: evt.percent ?? 0 });
								}
							}
							else if (evt.stage === "menu_shrink_guard") {
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
								showSystemToast("warning", {
									summary: uiText(
										`AI trả về nhỏ hơn dự kiến (tỷ lệ ${Number(evt.shrinkRatio ?? 0).toFixed(2)}), có thể bị mất dữ liệu menu.`,
										`AI output shrank unexpectedly (ratio ${Number(evt.shrinkRatio ?? 0).toFixed(2)}), and menu data may be missing.`,
										`AI 输出意外缩小（比例 ${Number(evt.shrinkRatio ?? 0).toFixed(2)}），菜单数据可能缺失。`,
									),
									nextStep: uiText("Hãy kiểm tra lại kết quả menu trước khi áp dụng vào editor.", "Review the menu result carefully before applying it to the editor.", "在应用到编辑器之前，请先仔细检查菜单结果。"),
									internalCode: "MENU_SHRINK_GUARD",
								});
							}
							else if (evt.stage === "quick_fixes_available") {
								const fixes = normalizeQuickFixSuggestions((evt as any).quickFixes);
								if (fixes.length > 0) {
									setQuickFixSuggestions(fixes);
									showSystemToast("info", {
										summary: uiText(
											`Có ${fixes.length} quick-fix có thể áp dụng ngay.`,
											`${fixes.length} quick fixes are ready to apply.`,
											`有 ${fixes.length} 个 quick-fix 可立即应用。`,
										),
										nextStep: uiText(
											"Bấm Apply trong khu vực Usage Dock để áp dụng từng fix.",
											"Click Apply in the Usage Dock to apply each fix.",
											"在 Usage Dock 中点击 Apply 逐个应用修复。",
										),
										internalCode: "QUICK_FIX_AVAILABLE",
									});
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "edit_candidates_available") {
								const candidates = normalizeEditCandidates((evt as any).editCandidates);
								if (candidates.length > 0) {
									setEditCandidates(candidates);
									showSystemToast("info", {
										summary: uiText(
											`Có ${candidates.length} phương án patch để chọn.`,
											`${candidates.length} patch candidates are available.`,
											`有 ${candidates.length} 个 patch 候选方案可选。`,
										),
										nextStep: uiText(
											"Bấm Apply trong Usage Dock để áp dụng phương án phù hợp.",
											"Click Apply in the Usage Dock to use the best candidate.",
											"在 Usage Dock 中点击 Apply 应用合适方案。",
										),
										internalCode: "EDIT_CANDIDATES_AVAILABLE",
									});
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "context" || evt.stage === "continuing" || evt.stage === "cached" || evt.stage === "prompt_budget") {
								if (decisionStep === "fallback" || !!decisionReason || (evt.message || "").toLowerCase().includes("fallback") || (evt.message || "").toLowerCase().includes("switch") || (evt.message || "").toLowerCase().includes("chuy") || (evt.message || "").toLowerCase().includes("rate-limit")) {
									appendModelDecisionTrace({
										step: decisionStep || "fallback",
										model: evt.model,
										reason: formatModelDecisionReason(decisionReason) || localizedEvtMessage,
									});
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE) {
									appendStageEvent({ stage: evt.stage as any, message: localizedEvtMessage, percent: evt.percent ?? 0 });
								}
							}
							else if (evt.stage === "routing" && evt.responseMode) {
								const mode = String(evt.responseMode).trim().toLowerCase();
								setActiveStreamResponseMode(mode === "edit" ? "edit" : "analyze");
								turnAllowAutoApplyRef.current = mode === "edit";
							}
							else if (evt.stage === "streaming" && evt.chunk) {
								// Edit/menu patch: never stream raw LLM tokens into chat — apply via text_edit_apply only.
								if (turnAllowAutoApplyRef.current) {
									continue;
								}
								pendingStreamChunkRef.current += stripInternalOrchestrationLeakLines(evt.chunk);
								scheduleStreamFlush();
							}
						else if (evt.stage === "text_edit_apply" && (evt as any).textEdit) {
							// Real-time line-edit: apply immediately to CodeMirror without waiting for full response
							const rawEdit = (evt as any).textEdit as Record<string, unknown>;
							const maybeStartLine = Number(
								rawEdit.startLine ??
								(rawEdit.range as any)?.startLine ??
								rawEdit.start_line ??
								(rawEdit.range as any)?.start_line ??
								NaN,
							);
							const maybeEndLine = Number(
								rawEdit.endLine ??
								(rawEdit.range as any)?.endLine ??
								rawEdit.end_line ??
								(rawEdit.range as any)?.end_line ??
								NaN,
							);
							const startLine = Number.isFinite(maybeStartLine) && maybeStartLine > 0
								? Math.max(1, Math.floor(maybeStartLine))
								: undefined;
							const endLine = Number.isFinite(maybeEndLine) && maybeEndLine > 0
								? Math.max(startLine ?? 1, Math.floor(maybeEndLine))
								: undefined;
							const replacement = String(
								rawEdit.replacement ??
								rawEdit.newText ??
								rawEdit.text ??
								rawEdit.replace ??
								rawEdit.content ??
								"",
							);
							const action = String(rawEdit.action ?? rawEdit.op ?? rawEdit.operation ?? "edit").trim().toLowerCase();
							const normalizedEdit = {
								...rawEdit,
								...(startLine ? { startLine } : {}),
								...(endLine ? { endLine } : {}),
								replacement,
								action,
							};
							turnAllowAutoApplyRef.current = true;
							localFlowVerifiedRef.current = true;
							let appliedEdit = false;
							if (onApplyLineEdit && startLine && endLine) {
								// Precise CodeMirror dispatch: only the affected line range changes
								if (!undoSnapshotRef.current || undoSnapshotRef.current === (liveCodeRef.current || currentCode)) {
									undoSnapshotRef.current = liveCodeRef.current || currentCode || "";
									setCanUndoLastEdit(true);
								}
								onApplyLineEdit({ startLine, endLine, replacement, action });
								const updatedCode = applyTextEditsToDraft(liveCodeRef.current || currentCode || "", [normalizedEdit]);
								liveCodeRef.current = updatedCode;
								lastAppliedCodeRef.current = updatedCode;
								appliedEdit = true;
							} else if (onCodeInsert) {
								// Fallback: apply to accumulated code and push full replacement
								const baseCode = liveCodeRef.current || currentCode || "";
								const validation = validateStructuredTextEdits(baseCode, [normalizedEdit]);
								if (validation.valid && validation.edits.length > 0) {
									const nextCode = applyTextEditsToDraft(baseCode, validation.edits);
									if (nextCode !== lastAppliedCodeRef.current) {
										if (!undoSnapshotRef.current || undoSnapshotRef.current === baseCode) {
											undoSnapshotRef.current = baseCode;
											setCanUndoLastEdit(true);
										}
										onCodeInsert(nextCode);
										liveCodeRef.current = nextCode;
										lastAppliedCodeRef.current = nextCode;
										appliedEdit = true;
									}
								}
							}
							if (appliedEdit) {
								textEditApplyCountRef.current += 1;
							}
						}
							else if (evt.stage === "text_edit_apply_done") {
								const count = Number((evt as any).count ?? 0);
								// If using onApplyLineEdit, liveCodeRef is already up to date.
								// If using onCodeInsert fallback, ensure final state is committed.
								if (!onApplyLineEdit && onCodeInsert) {
									const finalCode = liveCodeRef.current;
									if (finalCode && finalCode !== lastAppliedCodeRef.current) {
										onCodeInsert(finalCode);
										lastAppliedCodeRef.current = finalCode;
									}
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE && count > 0) {
									appendStageEvent({
										...evtForTimeline,
										stage: "text_edit_apply_done" as any,
										message: uiText(
											`Đã áp dụng ${count} thay đổi vào editor`,
											`Applied ${count} edits to editor`,
											`已将 ${count} 处更改应用到编辑器`,
										),
										percent: 90,
									});
								}
							}
							else if (evt.stage === "request_complete") {
								const elapsedMs = Number((evt as any).elapsedMs || 0);
								appendStageEvent({
									...evtForTimeline,
									stage: "request_complete",
									message: localizedEvtMessage || uiText(
										`Hoàn tất yêu cầu (${elapsedMs}ms)`,
										`Request completed (${elapsedMs}ms)`,
										`请求完成（${elapsedMs}ms）`,
									),
									detail: localizedEvtDetail || String((evt as any).flow || "").trim(),
								});
							}
							else if (evt.stage === "completed" && evtStatus === "clarification_needed") {
								receivedCompleteEvent = true;
								setCompletionState("done");
								setGeminiProgress({ phase: "idle", percent: 100, message: uiText("Cần làm rõ thêm", "Clarification needed", "需要进一步澄清"), estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
								setBackendProgressHint({ stage: "", detail: "" });
								setIsLoading(false);
								if (sseAbortRef.current === controller) {
									sseAbortRef.current = null;
								}
								turnAllowAutoApplyRef.current = false;
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
							}
							else if (evt.stage === "complete") {
								receivedCompleteEvent = true;
								const completionPayload: any = evt;
								const reviewRequired = String(completionPayload.status || "").trim().toLowerCase() === "review_required"
									|| Number(completionPayload.agenticStepApprovalPendingCount || 0) > 0;
								const completionQuickFixes = normalizeQuickFixSuggestions(completionPayload.quickFixes);
								if (completionQuickFixes.length > 0) {
									setQuickFixSuggestions(completionQuickFixes);
								}
								const completionEditCandidates = normalizeEditCandidates(completionPayload.editCandidates);
								if (completionEditCandidates.length > 0) {
									setEditCandidates(completionEditCandidates);
								}
								const usage = normalizeUsagePayload(evt.usage || {
									model: evt.model,
									promptTokens: evt.promptTokens,
									completionTokens: evt.completionTokens,
									totalTokens: Number(evt.promptTokens || 0) + Number(evt.completionTokens || 0),
									estimatedCostUsd: evt.estimatedCostUsd,
									currency: "USD",
								});
								if (usage) {
									appendModelDecisionTrace({
										step: decisionStep || "final",
										model: usage.model,
										reason: formatModelDecisionReason(decisionReason) || uiText("Model kết thúc lượt xử lý", "Final model used for this turn", "本轮最终使用模型"),
									});
									setAiUsageSummary(prev => ({
										turn: usage,
										sessionCostUsd: prev.sessionCostUsd + (usage.enabled ? usage.estimatedCostUsd : 0),
										sessionTokens: prev.sessionTokens + usage.totalTokens,
									}));
								}

								const effectiveContextType = String(evt.contextType || contextType || "").trim().toLowerCase();
								const isMainFlow = effectiveContextType === "code" || effectiveContextType === "menu_json";
								const isEditModeEvt = String(evt.responseMode || "").trim().toLowerCase() === "edit";
								const completionEventMeta = evt as Record<string, unknown>;
								const agenticStepResultCount = Math.max(0, Number(completionEventMeta["agenticStepResultCount"] || 0));
								const agenticStepAcceptedCount = Math.max(0, Number(completionEventMeta["agenticStepAcceptedCount"] || 0));
								const qualityGateEarlyAudit = Boolean(completionEventMeta["qualityGateEarlyAudit"] === true);
								const menuEditorApplyReady = Boolean(completionEventMeta["menuEditorApplyReady"] === true);
								const completionTextEditsCount = Math.max(
									0,
									Number(completionEventMeta["textEditsCount"] || 0),
								);
								const completionTextEdits = Array.isArray(evt.textEdits) && evt.textEdits.length > 0
									? evt.textEdits
									: parseTextEditsOnlyPayload(evt.fullResponse || "") || [];
								const completionPatchOps = effectiveContextType === "menu_json" && Array.isArray(evt.patchOps)
									? evt.patchOps
									: [];
								const hasStructuredStepResults = agenticStepResultCount > 0;
								const completionMergeStats = evt.mergeStats;
								const completionPatchOpCount = Math.max(
									0,
									Number(completionEventMeta["patchOpCount"] || 0),
								);
								const hasStructuredCompletionEdits = hasStructuredStepResults
									|| completionTextEdits.length > 0
									|| completionPatchOps.length > 0
									|| completionPatchOpCount > 0
									|| menuEditorApplyReady
									|| (completionMergeStats && typeof completionMergeStats === "object");
								const localFlowVerified = Boolean(
									evt.flowConfirmedByLocal === true
									|| (evt.localProviderPrimaryUsed === true && isMainFlow),
								);
								const blockAutoApplyByRisk = Boolean((evt as any).editRiskBlockAutoApply === true);
								localFlowVerifiedRef.current = localFlowVerified && isEditModeEvt && !blockAutoApplyByRisk;
								let completionOpSummary = { addCount: 0, editCount: 0, deleteCount: 0 };

								if (localFlowVerifiedRef.current) {
									if (effectiveContextType === "code") {
										completionOpSummary = summarizeTextEditOperations(completionTextEdits);
										setLocalFlowOpLines(buildCodeOperationPreviewLines(currentCode, completionTextEdits, 20));
									}
									else if (effectiveContextType === "menu_json") {
										if (completionMergeStats && typeof completionMergeStats === "object") {
											completionOpSummary = summarizeMenuPatchOps(completionPatchOps, completionMergeStats);
										}
										else if (completionPatchOps.length > 0) {
											completionOpSummary = summarizeMenuPatchOps(completionPatchOps, undefined);
										}
										else if (completionPatchOpCount > 0) {
											completionOpSummary = {
												addCount: 0,
												editCount: completionPatchOpCount,
												deleteCount: 0,
											};
										}
										else if (String(evt.fullResponse || "").trim()) {
											completionOpSummary = summarizeMenuOperations(currentCode, evt.fullResponse || "");
										}
										else if (completionTextEditsCount > 0) {
											completionOpSummary = {
												addCount: 0,
												editCount: completionTextEditsCount,
												deleteCount: 0,
											};
										}
										setLocalFlowOpLines([]);
									}
									setLocalFlowOps({
										verified: true,
										flow: effectiveContextType as "code" | "menu_json",
										addCount: completionOpSummary.addCount,
										editCount: completionOpSummary.editCount,
										deleteCount: completionOpSummary.deleteCount,
									});
								}
								else if (isEditModeEvt) {
									setLocalFlowOpLines([]);
									setLocalFlowOps({
										verified: false,
										flow: "",
										addCount: 0,
										editCount: 0,
										deleteCount: 0,
										reason: uiText(
											"Không xác nhận được local flow code/menu nên ẩn nhãn add-edit-delete để tránh sai lệch.",
											"Local code/menu flow was not verified, so add-edit-delete labels are hidden to avoid misleading output.",
											"未能确认本地 code/menu 流程，已隐藏 add-edit-delete 标签以避免误导。",
										),
									});
								}

								setCompletionMetrics({
									elapsedMs: Number.isFinite(Number(evt.elapsedMs))
										? Number(evt.elapsedMs)
										: Math.max(0, Date.now() - requestStartedAtRef.current),
									outputChars: evt.fullResponse
										? evt.fullResponse.length
										: Number.isFinite(Number(evt.charsReceived))
											? Number(evt.charsReceived)
											: streamingMessageRef.current.length + pendingStreamChunkRef.current.length,
									streamedChars: Number.isFinite(Number(evt.streamedChars)) ? Number(evt.streamedChars) : undefined,
									streamChunkCount: Number.isFinite(Number(evt.streamChunkCount)) ? Number(evt.streamChunkCount) : undefined,
									streamAssemblyMismatch: evt.streamAssemblyMismatch === true,
									promptOriginalChars: Number.isFinite(Number(evt.promptOriginalChars)) ? Number(evt.promptOriginalChars) : undefined,
									promptFinalChars: Number.isFinite(Number(evt.promptFinalChars)) ? Number(evt.promptFinalChars) : undefined,
									promptCapChars: Number.isFinite(Number(evt.promptCapChars)) ? Number(evt.promptCapChars) : undefined,
									promptTruncatedByCharCap: evt.promptTruncatedByCharCap === true,
									patchFallbackNoOp: evt.patchFallbackNoOp === true,
									patchFallbackReasonCode: String(evt.patchFallbackReasonCode || evt.reason_code || "").trim() || undefined,
								});
								if (evt.patchFallbackNoOp === true) {
									showSystemToast("warning", {
										summary: uiText(
											"Patch local không qua quality gate, đã fallback no-op an toàn.",
											"Local patch failed quality gate and fell back to a safe no-op.",
											"本地补丁未通过质量门禁，已回退为安全 no-op。",
										),
										nextStep: uiText(
											"Hãy tinh gọn yêu cầu hoặc chia nhỏ tác vụ để model tạo patch ổn định hơn.",
											"Try narrowing the request or splitting tasks to get a stable patch.",
											"请缩小请求范围或拆分任务，以获得更稳定的补丁输出。",
										),
										internalCode: String(evt.patchFallbackReasonCode || evt.reason_code || "LOCAL_PATCH_FALLBACK_NOOP").toUpperCase(),
									});
								}
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
								setGeminiProgress({
									phase: "idle",
									percent: 100,
									message: reviewRequired
										? uiText("Chờ duyệt trước khi hoàn tất", "Waiting for approval before completion", "等待批准后完成")
										: uiText("Hoàn thành", "Completed", "已完成"),
									estimatedWaitSecs: 0,
									remainingSecs: 0,
									charsReceived: 0,
									estimatedTotalChars: 0,
								});
								setBackendProgressHint({ stage: "", detail: "" });
								if (evt.parts && evt.parts.jobId) {
									effectiveStreamJobId = String(evt.parts.jobId);
									setPartsManifest({
										jobId: String(evt.parts.jobId),
										totalParts: Number.isFinite(Number(evt.parts.totalParts)) ? Number(evt.parts.totalParts) : 0,
										totalChars: Number.isFinite(Number(evt.parts.totalChars)) ? Number(evt.parts.totalChars) : undefined,
										status: String(evt.parts.status || "").trim() || undefined,
										createdAt: Number.isFinite(Number(evt.parts.createdAt)) ? Number(evt.parts.createdAt) : undefined,
										updatedAt: Number.isFinite(Number(evt.parts.updatedAt)) ? Number(evt.parts.updatedAt) : undefined,
									});
									setStreamJobId(effectiveStreamJobId);
									void loadStreamPartsMeta(effectiveStreamJobId, 1, 20);
								}
								const backendAssistantSummary = String(completionEventMeta["assistantChatSummary"] || "").trim();
								const completionAuditSteps = Array.isArray(completionEventMeta["menuAuditPlanSteps"])
									? (completionEventMeta["menuAuditPlanSteps"] as unknown[]).map(item => String(item || "").trim()).filter(Boolean)
									: menuAuditStepsRef.current;
								const resolveMenuCompletionChatText = () => {
									if (backendAssistantSummary)
										return backendAssistantSummary;
									if (qualityGateEarlyAudit && effectiveContextType === "menu_json") {
										return buildMenuAuditCompletionSummary({
											userRequest: lastUserRequestRef.current,
											auditSteps: completionAuditSteps,
											addCount: completionOpSummary.addCount,
											editCount: completionOpSummary.editCount,
											deleteCount: completionOpSummary.deleteCount,
											acceptedSteps: Math.max(1, agenticStepAcceptedCount || agenticStepResultCount || 1),
											reviewRequired,
											uiText,
										});
									}
									return buildStructuredEditCompletionSummary({
										contextType: effectiveContextType === "menu_json" ? "menu_json" : "code",
										stepResultCount: agenticStepResultCount,
										acceptedCount: agenticStepAcceptedCount,
										addCount: completionOpSummary.addCount,
										editCount: completionOpSummary.editCount,
										deleteCount: completionOpSummary.deleteCount,
										reviewRequired,
										uiText,
									});
								};
								const shouldHideRawEditCompletionPayload = isEditModeEvt && isMainFlow && hasStructuredCompletionEdits;
								if (evt.fullResponse || shouldHideRawEditCompletionPayload || backendAssistantSummary) {
									deliveredAssistantResultRef.current = true;
									streamingMessageRef.current = shouldHideRawEditCompletionPayload || backendAssistantSummary
										? resolveMenuCompletionChatText()
										: stripInternalOrchestrationLeakLines(evt.fullResponse);
									pendingStreamChunkRef.current = "";
								}
								else if (useLocalPlanRoute && evt.result) {
									deliveredAssistantResultRef.current = true;
									const hints = Array.isArray(evt.result.planningHints)
										? evt.result.planningHints.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
										: [];
									const scopeTags = Array.isArray(evt.result.scopeTags)
										? evt.result.scopeTags.map((item) => String(item || "").trim()).filter(Boolean)
										: [];
									const summaryLines: string[] = [
										uiText("Đã hoàn tất mô phỏng local execute-plan (dry-run).", "Completed local execute-plan simulation (dry-run).", "本地执行计划模拟（dry-run）已完成。"),
										uiText(
											`Số nguồn nạp động: ${Number(evt.result.ingestCount || 0)}`,
											`Dynamic ingestion sources: ${Number(evt.result.ingestCount || 0)}`,
											`动态入库源数量：${Number(evt.result.ingestCount || 0)}`,
										),
										uiText(
											`Scope mask: ${Number(evt.result.aggregateScopeMask || 0)}`,
											`Scope mask: ${Number(evt.result.aggregateScopeMask || 0)}`,
											`范围掩码：${Number(evt.result.aggregateScopeMask || 0)}`,
										),
									];
									if (scopeTags.length > 0) {
										summaryLines.push(uiText(
											`Scope tags: ${scopeTags.join(", ")}`,
											`Scope tags: ${scopeTags.join(", ")}`,
											`范围标签：${scopeTags.join(", ")}`,
										));
									}
									if (hints.length > 0) {
										summaryLines.push(uiText("Planning hints:", "Planning hints:", "规划提示："));
										hints.forEach((hint, index) => {
											summaryLines.push(`${index + 1}. ${hint}`);
										});
									}
									streamingMessageRef.current = summaryLines.join("\n");
									pendingStreamChunkRef.current = "";
								}
								else {
									const effectiveJobId = String(evt.jobId || evt.parts?.jobId || effectiveStreamJobId || "").trim();
									if (effectiveJobId) {
										const hydrated = await hydrateFromPersistedParts(effectiveJobId);
										if (hydrated) {
											void loadStreamPartsMeta(effectiveJobId, 1, 20);
										}
									}
								}
								const shouldSynthesizeCompletionStep = isEditModeEvt
									&& isMainFlow
									&& (!hasStructuredStepResults || qualityGateEarlyAudit)
									&& (completionTextEdits.length > 0 || completionTextEditsCount > 0 || completionPatchOps.length > 0 || menuEditorApplyReady);
								if (shouldSynthesizeCompletionStep) {
									const completionSummaryText = resolveMenuCompletionChatText();
									appendAgenticStep({
										stage: qualityGateEarlyAudit ? "menu_audit_apply_completion" : "agentic_step_result_completion",
										icon: reviewRequired ? "🛂" : "✏️",
										label: qualityGateEarlyAudit
											? uiText("Áp patch audit menu", "Apply menu audit patch", "应用菜单审计补丁")
											: uiText("Kết quả apply cuối", "Final applied result", "最终应用结果"),
										detail: completionSummaryText,
										approvalRequired: reviewRequired,
										approvalState: reviewRequired ? "pending" : undefined,
										pendingTextEdits: reviewRequired && completionTextEdits.length > 0 ? completionTextEdits : undefined,
										status: "done",
									});
									if (SHOW_DETAILED_PROGRESS_TIMELINE) {
										appendStageEvent({
											stage: "agentic_step_result",
											message: uiText(
												"Dựng step apply từ completion cuối để đồng bộ editor",
												"Synthesized final apply step from completion",
												"已从最终 completion 合成应用步骤",
											),
											percent: 100,
										});
									}
								}

								if (String(evt.responseMode || "").trim().toLowerCase() === "edit") {
									const blockAutoApplyByRisk = Boolean((evt as any).editRiskBlockAutoApply === true);
									turnAllowAutoApplyRef.current = !blockAutoApplyByRisk;
									if (blockAutoApplyByRisk) {
										showSystemToast("warning", {
											summary: uiText(
												"Patch có rủi ro cao, đã chặn auto-apply để tránh sửa sai ngoài phạm vi.",
												"High-risk patch detected; auto-apply is blocked to avoid out-of-scope edits.",
												"检测到高风险补丁；已阻止自动应用以避免越界修改。",
											),
											nextStep: uiText(
												"Hãy review text_edits trước khi áp dụng thủ công.",
												"Review text_edits before applying manually.",
												"请先审阅 text_edits，再手动应用。",
											),
											internalCode: "EDIT_RISK_BLOCK_AUTO_APPLY",
										});
									}
								}
								if (evt.promptTruncatedByCharCap === true) {
									message.warning(uiText(
										"Prompt đã bị cắt theo ngưỡng, kết quả có thể thiếu một phần menu lớn",
										"Prompt was truncated by budget, large menu output may be incomplete",
										"提示已按预算裁剪，大型菜单结果可能不完整",
									));
								}
								flushStreamingToUI(true);
								if (evt.fullResponse || completionTextEdits.length > 0 || menuEditorApplyReady) {
									const blockAutoApplyByRisk = Boolean((evt as any).editRiskBlockAutoApply === true);
									if (!blockAutoApplyByRisk && !reviewRequired) {
										const completionFetchApply = Boolean(completionEventMeta["menuEditorApplyFetch"] === true);
										const completionRequestId = String(evt.requestId || streamRequestId || "").trim();
										if (isEditModeEvt && effectiveContextType === "menu_json") {
											if (completionFetchApply && completionRequestId) {
												void fetchMenuEditorApplyPayload(completionRequestId).then((menuJson) => {
													if (menuJson) {
														applyMenuEditorCodeDirect(menuJson);
													}
												});
											}
											else if (evt.fullResponse) {
												const applied = applyMenuEditorCodeDirect(String(evt.fullResponse || ""));
												if (!applied && onCodeInsert) {
													const forcedDraft = extractMenuDraftForEditor(evt.fullResponse || "")
														|| String(evt.fullResponse || "").trim();
													if (forcedDraft && forcedDraft !== lastAppliedCodeRef.current) {
														onCodeInsert(forcedDraft);
														liveCodeRef.current = forcedDraft;
														lastAppliedCodeRef.current = forcedDraft;
														deliveredAssistantResultRef.current = true;
													}
												}
											}
										}
										else {
											const completionCode = extractMenuDraftForEditor(evt.fullResponse || "");
											const completionTextEditsPayload = completionTextEdits.length > 0
												? String(JSON.stringify({
													...(completionCode ? { code: String(evt.fullResponse || "").trim() } : {}),
													textEdits: completionTextEdits,
												}) || "")
												: "";
											const completionApplyPayload = completionTextEditsPayload
												|| (completionCode ? String(evt.fullResponse || "") : "");
											if (completionApplyPayload) {
												applyRealtimeCodeFromText(completionApplyPayload, true);
											}
											else if (!hasStructuredStepResults) {
												applyRealtimeCodeFromText(String(evt.fullResponse || ""), true);
											}
										}
									}
								}
								if (markEditStreamFailureIfNeeded({
									isEditMode: isEditModeEvt || streamStartedInEditModeRef.current,
									reviewRequired,
									editCandidateCount: completionEditCandidates.length,
									reasonCode: String(completionEventMeta["reason_code"] || lastReasonCode || "").trim(),
								})) {
									setIsLoading(false);
									if (sseAbortRef.current === controller) {
										sseAbortRef.current = null;
									}
									turnAllowAutoApplyRef.current = false;
									continue;
								}
								setCompletionState(reviewRequired ? "review_required" : "done");
								setIsLoading(false);
								if (sseAbortRef.current === controller) {
									sseAbortRef.current = null;
								}
								turnAllowAutoApplyRef.current = false;
								if (reviewRequired) {
									showSystemToast("info", {
										summary: uiText(
											"Đã dừng ở trạng thái chờ duyệt vì còn patch rủi ro cần xác nhận thủ công.",
											"Stopped in review-required state because some risky patches still need manual approval.",
											"已停在待审核状态，因为仍有高风险补丁需要手动批准。",
										),
										nextStep: uiText(
											"Duyệt hoặc từ chối các bước đang gắn nhãn pending trong bảng agentic steps.",
											"Approve or reject the pending items in the agentic steps panel.",
											"请在 agentic steps 面板中批准或拒绝待处理项。",
										),
										internalCode: "REVIEW_REQUIRED",
									});
								}
								// Populate follow-up suggestions if backend emitted them
								const backendFollowUps = Array.isArray(completionPayload.followUpSuggestions)
									? completionPayload.followUpSuggestions.map((s: unknown) => String(s || "").trim()).filter(Boolean).slice(0, 3) as string[]
									: [];
								if (backendFollowUps.length > 0) {
									setFollowUpSuggestions(backendFollowUps);
								}
							}
							else if (evt.stage === "error") {
								receivedErrorEvent = true;
								const rawErrorMessage = stripMarkdownCodeBlocks(renderedEvtMessage);
								const errorSummary = rawErrorMessage || localizedEvtMessage || uiText("Lỗi xử lý từ backend", "Backend processing error", "后端处理错误");
								const errorCode = String(effectiveReasonCode || "backend_unexpected_error").trim().toUpperCase();
								if (receivedBlockedGuardEvent) {
									setCompletionState("done");
									setCompletionErrorMessage("");
									setGeminiProgress({ phase: "idle", percent: 100, message: localizedEvtMessage || uiText("Đã chặn theo điều kiện bảo vệ", "Blocked by safety guard", "已被保护规则拦截"), estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
									setBackendProgressHint({ stage: "", detail: "" });
									if (SHOW_DETAILED_PROGRESS_TIMELINE)
										appendStageEvent(evtForTimeline);
									setIsLoading(false);
									if (sseAbortRef.current === controller) {
										sseAbortRef.current = null;
									}
									turnAllowAutoApplyRef.current = false;
									continue;
								}
								const hasDeliveredContent = (
									deliveredAssistantResultRef.current
									|| (
										String(streamingMessageRef.current || "")
										+ String(pendingStreamChunkRef.current || "")
									).trim().length > 0
								);
								const localOverrideEditFailure = effectiveReasonCode.includes("local_override")
									&& streamStartedInEditModeRef.current
									&& textEditApplyCountRef.current === 0
									&& editStreamStartCodeRef.current === (lastAppliedCodeRef.current ?? "");
								if (localOverrideEditFailure) {
									markEditStreamFailureIfNeeded({
										isEditMode: true,
										reasonCode: effectiveReasonCode,
									});
									setIsLoading(false);
									if (sseAbortRef.current === controller) {
										sseAbortRef.current = null;
									}
									turnAllowAutoApplyRef.current = false;
									continue;
								}
								if (hasDeliveredContent) {
									flushStreamingToUI(true);
									receivedCompleteEvent = true;
									setCompletionState("done");
									setCompletionErrorMessage("");
									setCompletionMetrics({
										elapsedMs: Math.max(0, Date.now() - requestStartedAtRef.current),
										outputChars: String(streamingMessageRef.current || "").length,
									});
									setGeminiProgress({ phase: "idle", percent: 100, message: uiText("Hoàn thành", "Completed", "已完成"), estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
									setBackendProgressHint({ stage: "", detail: "" });
									if (SHOW_DETAILED_PROGRESS_TIMELINE)
										appendStageEvent(evtForTimeline);
									showSystemToast("warning", {
										summary: uiText(
											"Đã nhận được nội dung trả về; bỏ qua lỗi muộn từ backend.",
											"Response content was received; ignoring late backend error.",
											"已收到响应内容；已忽略后续后端错误。",
										),
										nextStep: resolveSystemNextStep(effectiveReasonCode, evt.stage),
										internalCode: `${errorCode}_LATE`,
									});
									setIsLoading(false);
									if (sseAbortRef.current === controller) {
										sseAbortRef.current = null;
									}
									turnAllowAutoApplyRef.current = false;
									continue;
								}
								setMessages((prev) => {
									const updated = [...prev];
									for (let i = updated.length - 1; i >= 0; i -= 1) {
										const lastMsg = updated[i];
										if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
											lastMsg.content = formatSystemNotice({
												summary: errorSummary,
												nextStep: resolveSystemNextStep(effectiveReasonCode, evt.stage),
												internalCode: errorCode,
											});
											lastMsg.codeBlocks = [];
											lastMsg.responseMode = "analyze";
											lastMsg.timestamp = Date.now();
											break;
										}
									}
									return updated;
								});
								setCompletionState("error");
								setCompletionErrorMessage(errorSummary);
								setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
								setBackendProgressHint({ stage: "", detail: "" });
								if (SHOW_DETAILED_PROGRESS_TIMELINE)
									appendStageEvent(evtForTimeline);
								showSystemToast("error", {
									summary: errorSummary,
									nextStep: resolveSystemNextStep(effectiveReasonCode, evt.stage),
									internalCode: errorCode,
								});
								setIsLoading(false);
								if (sseAbortRef.current === controller) {
									sseAbortRef.current = null;
								}
								turnAllowAutoApplyRef.current = false;
							}
						}
						catch (parseErr) {
							console.debug("Failed to parse SSE line:", json, parseErr);
						}
					}
				}

				if (!receivedCompleteEvent && !receivedErrorEvent) {
					// Fallback: some deployments may close SSE without the final complete frame.
					if (!streamingMessageRef.current && !deliveredAssistantResultRef.current) {
						const fallbackJobId = String(effectiveStreamJobId || "").trim();
						if (fallbackJobId) {
							const hydrated = await hydrateFromPersistedParts(fallbackJobId);
							if (hydrated) {
								void loadStreamPartsMeta(fallbackJobId, 1, 20);
							}
						}
					}
					flushStreamingToUI(true);
					const hasDeliveredContent = deliveredAssistantResultRef.current || String(streamingMessageRef.current || "").trim().length > 0;
					if (markEditStreamFailureIfNeeded({
						isEditMode: streamStartedInEditModeRef.current,
						reasonCode: lastReasonCode,
					})) {
						setIsLoading(false);
						if (sseAbortRef.current === controller) {
							sseAbortRef.current = null;
						}
						turnAllowAutoApplyRef.current = false;
					}
					else {
					setCompletionState(hasDeliveredContent ? "done" : "stream_closed");
					setCompletionMetrics({
						elapsedMs: Math.max(0, Date.now() - requestStartedAtRef.current),
						outputChars: streamingMessageRef.current.length + pendingStreamChunkRef.current.length,
					});
					setGeminiProgress({ phase: "idle", percent: 100, message: uiText("Hoàn thành", "Completed", "已完成"), estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
					setBackendProgressHint({ stage: "", detail: "" });
					setIsLoading(false);
					if (sseAbortRef.current === controller) {
						sseAbortRef.current = null;
					}
					turnAllowAutoApplyRef.current = false;
					if (SHOW_DETAILED_PROGRESS_TIMELINE) {
						appendStageEvent({
							stage: "complete",
							message: uiText("Đã nhận xong dữ liệu trả về", "Stream closed after response", "响应流已完成"),
							percent: 100,
						});
					}
					}
				}
			}
			catch (error) {
				if ((error as Error)?.name === "AbortError")
					return;
				console.error("Failed to send message:", error);
				setCompletionState("error");
				setCompletionErrorMessage((error as Error)?.message ? String((error as Error).message) : "SSE request failed");
				setCompletionMetrics({
					elapsedMs: requestStartedAtRef.current > 0 ? Math.max(0, Date.now() - requestStartedAtRef.current) : undefined,
					outputChars: streamingMessageRef.current.length + pendingStreamChunkRef.current.length,
				});
				const status = Number((error as any)?.response?.status ?? 0);
				showSystemToast("error", {
					summary: status === 401
						? uiText("Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ.", "Your session has expired or is no longer valid.", "当前登录会话已过期或已失效。")
						: uiText("Không gửi được yêu cầu lên backend.", "The request could not be sent to the backend.", "请求无法发送到后端。"),
					nextStep: resolveSystemNextStep(status === 401 ? "http_401" : "http_request_failed"),
					internalCode: status === 401 ? "HTTP_401" : `HTTP_${status || 0}`,
				});
				setIsLoading(false);
				if (sseAbortRef.current === controller) {
					sseAbortRef.current = null;
				}
				turnAllowAutoApplyRef.current = false;
			}
			finally {
				if (sseAbortRef.current === controller) {
					sseAbortRef.current = null;
				}
			}
		},
		[appId, contextType, currentCode, isLoading, language, normalizeAssistantProgressMessage, normalizeUsagePayload, onUserMessage, onCodeInsert, onApplyLineEdit, pendingAttachments, targetPName, targetPType, requestEditorMetadata, uiText, formatModelDecisionReason, formatPatchValidatorReason, formatSystemNotice, resolveSystemNextStep, showSystemToast, appendStageEvent, appendModelDecisionTrace, applyMenuEditorCodeDirect, applyRealtimeCodeFromText, flushStreamingToUI, scheduleStreamFlush, scrollToBottom, promptHistoryStorageKey, setAssistantLiveStatus, formatStageLabel, renderProgressText, markEditStreamFailureIfNeeded],
	);

	const handleRetryAgenticStep = useCallback((step: AgenticStep) => {
		if (isLoading) {
			message.info(uiText(
				"Đang có request chạy, hãy chờ xong rồi retry step.",
				"A request is running, wait until it finishes before retrying this step.",
				"当前有请求在运行，请等待完成后再重试该步骤。",
			));
			return;
		}
		const stepLabel = step.stepIndex && step.stepTotal
			? `${step.stepIndex}/${step.stepTotal}`
			: step.label;
		const validatorReason = String(step.patchValidator?.rejectionReason || "").trim();
		const validatorHint = validatorReason
			? `${formatPatchValidatorReason(validatorReason)}. ${buildPatchValidatorRetryHint(validatorReason)}`
			: "";
		const retryPrompt = uiText(
			`/edit Retry riêng bước ${stepLabel}: ${step.detail || step.label}. ${validatorHint ? `Lỗi validator trước đó: ${validatorHint}. ` : ""}Yêu cầu: chỉ sửa phần liên quan bước này, trả về patch apply được ngay (textEdits hoặc SEARCH/REPLACE), không lan sang phần khác.`,
			`/edit Retry step ${stepLabel}: ${step.detail || step.label}. ${validatorHint ? `Previous validator issue: ${validatorHint}. ` : ""}Requirement: update only this step scope and return an immediately applicable patch (textEdits or SEARCH/REPLACE), without unrelated changes.`,
			`/edit 重试步骤 ${stepLabel}：${step.detail || step.label}。${validatorHint ? `此前验证器问题：${validatorHint}。` : ""}要求：仅修改该步骤范围，并返回可立即应用的补丁（textEdits 或 SEARCH/REPLACE），不要扩散到无关部分。`,
		);
		setInputValue(retryPrompt);
		void sendMessage(retryPrompt);
	}, [buildPatchValidatorRetryHint, formatPatchValidatorReason, isLoading, message, sendMessage, uiText]);

	const handleRetryLowConfidenceBatch = useCallback(() => {
		if (isLoading) {
			message.info(uiText(
				"Đang có request chạy, hãy chờ xong rồi retry batch.",
				"A request is running, wait until it finishes before retrying the batch.",
				"当前有请求在运行，请等待完成后再批量重试。",
			));
			return;
		}
		if (!lowConfidenceAgenticSteps.length) {
			message.info(uiText(
				"Không có bước low-confidence để retry.",
				"No low-confidence steps to retry.",
				"没有可重试的低置信度步骤。",
			));
			return;
		}
		const bulletList = lowConfidenceAgenticSteps
			.slice(0, 8)
			.map((step, idx) => {
				const stepLabel = step.stepIndex && step.stepTotal
					? `${step.stepIndex}/${step.stepTotal}`
					: step.label;
				const quality = typeof step.qualityScore === "number" && Number.isFinite(step.qualityScore)
					? `Q${Math.round(step.qualityScore)}`
					: "Q?";
				const validatorReason = String(step.patchValidator?.rejectionReason || "").trim();
				const validatorNote = validatorReason
					? ` · validator=${formatPatchValidatorReason(validatorReason)}`
					: "";
				return `${idx + 1}. step ${stepLabel} (${quality}${validatorNote}): ${step.detail || step.label}`;
			})
			.join("\n");
		const retryPrompt = uiText(
			`/edit Retry batch các bước low-confidence sau:\n${bulletList}\n\nYêu cầu:\n- Chỉ sửa đúng phạm vi các bước trên\n- Trả patch apply được ngay (textEdits hoặc SEARCH/REPLACE)\n- Không thay đổi phần không liên quan\n- Nếu thiếu dữ kiện, nêu rõ bước nào thiếu và đề xuất patch tối thiểu an toàn.`,
			`/edit Retry batch for these low-confidence steps:\n${bulletList}\n\nRequirements:\n- Update only the scopes listed above\n- Return an immediately applicable patch (textEdits or SEARCH/REPLACE)\n- Do not modify unrelated parts\n- If evidence is insufficient, state which step lacks evidence and provide a minimal safe patch.`,
			`/edit 批量重试以下低置信度步骤：\n${bulletList}\n\n要求：\n- 仅修改上述步骤范围\n- 返回可立即应用的补丁（textEdits 或 SEARCH/REPLACE）\n- 不要修改无关部分\n- 若证据不足，请明确指出缺失步骤并给出最小安全补丁。`,
		);
		setInputValue(retryPrompt);
		void sendMessage(retryPrompt);
	}, [formatPatchValidatorReason, isLoading, lowConfidenceAgenticSteps, message, sendMessage, uiText]);

	const handleRetryEditCandidate = useCallback((candidate: EditCandidate) => {
		if (isLoading) {
			message.info(uiText(
				"Đang có request chạy, hãy chờ xong rồi retry candidate.",
				"A request is running, wait until it finishes before retrying this candidate.",
				"当前有请求在运行，请等待完成后再重试该候选方案。",
			));
			return;
		}
		const risk = String(candidate.riskLevel || "").trim().toLowerCase();
		const guardText = risk === "high"
			? uiText(
				"Giảm thao tác xóa, chỉ giữ thay đổi thiết yếu.",
				"Reduce deletions and keep only essential changes.",
				"减少删除操作，仅保留必要改动。",
			)
			: uiText(
				"Giữ phạm vi hẹp, không đổi phần không liên quan.",
				"Keep scope narrow and avoid unrelated edits.",
				"保持范围收敛，不修改无关部分。",
			);
		const rationale = String(candidate.rationale || candidate.description || "").trim();
		const retryPrompt = uiText(
			`/edit Retry candidate ${candidate.title}: ${rationale || "patch trước chưa phù hợp"}. Yêu cầu: ${guardText} Trả về textEdits hoặc SEARCH/REPLACE có thể apply ngay.`,
			`/edit Retry candidate ${candidate.title}: ${rationale || "previous patch was not ideal"}. Requirement: ${guardText} Return immediately-applicable textEdits or SEARCH/REPLACE.`,
			`/edit 重试候选方案 ${candidate.title}：${rationale || "之前补丁不够理想"}。要求：${guardText} 返回可立即应用的 textEdits 或 SEARCH/REPLACE。`,
		);
		setRetryingEditCandidateId(candidate.id);
		setInputValue(retryPrompt);
		setEditCandidates(prev => prev.filter(item => item.id !== candidate.id));
		void sendEditCandidateFeedback(candidate, "dismissed");
		void sendMessage(retryPrompt).finally(() => {
			setRetryingEditCandidateId("");
		});
	}, [isLoading, message, sendEditCandidateFeedback, sendMessage, uiText]);

	const handleSend = () => {
		sendMessage(inputValue);
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && e.ctrlKey) {
			handleSend();
		}
	};

	const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && e.ctrlKey) {
			handleSend();
			return;
		}

		if (showSlashCommandPalette && filteredSlashCommands.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSlashCommandIndex((prev) => (prev + 1) % filteredSlashCommands.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSlashCommandIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
				return;
			}
			if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				applySlashCommand(filteredSlashCommands[slashCommandIndex]?.command || filteredSlashCommands[0]?.command || "/analyze");
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setShowSlashCommandPalette(false);
				setSlashCommandIndex(0);
				return;
			}
		}

		if (e.key !== "ArrowUp" && e.key !== "ArrowDown")
			return;
		if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey)
			return;
		if (!promptHistory.length)
			return;

		const element = e.currentTarget;
		const start = Number(element.selectionStart ?? 0);
		const end = Number(element.selectionEnd ?? 0);
		const text = String(inputValue || "");
		const isAtTop = start === 0 && end === 0;
		const isAtBottom = start === text.length && end === text.length;

		if (e.key === "ArrowUp" && !isAtTop)
			return;
		if (e.key === "ArrowDown" && !isAtBottom)
			return;

		e.preventDefault();

		if (e.key === "ArrowUp") {
			const nextIndex = promptHistoryIndex < 0
				? 0
				: Math.min(promptHistory.length - 1, promptHistoryIndex + 1);
			if (promptHistoryIndex < 0) {
				setPromptHistoryOriginal(text);
			}
			setPromptHistoryIndex(nextIndex);
			setInputValue(promptHistory[nextIndex] || "");
			return;
		}

		if (promptHistoryIndex < 0) {
			return;
		}

		const nextIndex = promptHistoryIndex - 1;
		if (nextIndex < 0) {
			setPromptHistoryIndex(-1);
			setInputValue(promptHistoryOriginal || "");
			return;
		}
		setPromptHistoryIndex(nextIndex);
		setInputValue(promptHistory[nextIndex] || "");
	}, [applySlashCommand, filteredSlashCommands, handleSend, inputValue, promptHistory, promptHistoryIndex, promptHistoryOriginal, showSlashCommandPalette, slashCommandIndex]);

	const handleClearHistory = async () => {
		const activeJobId = String(streamJobIdRef.current || "").trim();
		if (activeJobId) {
			notifyServerStreamCancel(activeJobId);
		}
		if (sseAbortRef.current) {
			sseAbortRef.current.abort();
			sseAbortRef.current = null;
		}
		try {
			await request.post("ai-assistant-session-delete", {
				json: {
					appId,
					contextType,
					language,
					pName: targetPName || "",
					pType: typeof targetPType === "number" ? targetPType : undefined,
					requestId: activeJobId || undefined,
					deleteAll: true,
				},
				throwHttpErrors: false,
			});
		}
		catch {
			// Ignore remote clear errors and still clear local UI state
		}
		setMessages([]);
		setAiUsageSummary({ turn: null, sessionCostUsd: 0, sessionTokens: 0 });
		setIsProgressDockCollapsed(false);
		setIsUsageDockVisible(false);
		setIsLoading(false);
		reviewResolutionFeedbackSentRef.current = "";
		setStreamRequestId("");
		setStreamJobId("");
		setCompletionState("idle");
		setCompletionMetrics({});
		setCompletionErrorMessage("");
		clearChatHistoryStorage();
		message.success(uiText("Đã xóa lịch sử chat", "Chat history cleared", "聊天记录已清除"));
	};

	const handleCopyCode = (code: string) => {
		navigator.clipboard.writeText(code);
		message.success(uiText("Đã sao chép code", "Code copied", "代码已复制"));
	};

	const handleCopyRequestId = useCallback(() => {
		if (!streamRequestId)
			return;
		navigator.clipboard.writeText(streamRequestId);
		message.success(uiText("Đã sao chép requestId", "requestId copied", "requestId 已复制"));
	}, [streamRequestId, uiText]);

	const handleCopyJobId = useCallback(() => {
		if (!streamJobId)
			return;
		navigator.clipboard.writeText(streamJobId);
		message.success(uiText("Đã sao chép jobId", "jobId copied", "jobId 已复制"));
	}, [streamJobId, uiText]);

	const loadStreamPartsManifest = useCallback(async (jobId: string) => {
		const safeJobId = String(jobId || "").trim();
		if (!safeJobId)
			return null;
		const response = await request.get(`ai-code-stream/${encodeURIComponent(safeJobId)}/manifest`, {
			throwHttpErrors: false,
		});
		if (!response.ok)
			return null;
		const data = await response.json() as any;
		const manifest: AiStreamPartsManifest = {
			jobId: String(data?.jobId || safeJobId),
			totalParts: Number.isFinite(Number(data?.totalParts)) ? Number(data.totalParts) : 0,
			totalChars: Number.isFinite(Number(data?.totalChars)) ? Number(data.totalChars) : undefined,
			status: String(data?.status || "").trim() || undefined,
			createdAt: Number.isFinite(Number(data?.createdAt)) ? Number(data.createdAt) : undefined,
			updatedAt: Number.isFinite(Number(data?.updatedAt)) ? Number(data.updatedAt) : undefined,
		};
		setPartsManifest(manifest);
		return manifest;
	}, []);

	const loadStreamPartsMeta = useCallback(async (jobId: string, page = 1, size = 20) => {
		const safeJobId = String(jobId || "").trim();
		if (!safeJobId)
			return null;
		setPartsMetaLoading(true);
		try {
			const response = await request.get(`ai-code-stream/${encodeURIComponent(safeJobId)}/parts/meta`, {
				searchParams: { page, size },
				throwHttpErrors: false,
			});
			if (!response.ok)
				return null;
			const data = await response.json() as any;
			const pagePayload: AiStreamPartsMetaPage = {
				jobId: String(data?.jobId || safeJobId),
				page: Number.isFinite(Number(data?.page)) ? Number(data.page) : 1,
				size: Number.isFinite(Number(data?.size)) ? Number(data.size) : size,
				totalParts: Number.isFinite(Number(data?.totalParts)) ? Number(data.totalParts) : 0,
				totalPages: Number.isFinite(Number(data?.totalPages)) ? Number(data.totalPages) : 1,
				items: Array.isArray(data?.items)
					? data.items.map((item: any) => ({
						partIndex: Number(item?.partIndex || 0),
						label: String(item?.label || ""),
						chars: Number(item?.chars || 0),
					})).filter((item: AiStreamPartMeta) => item.partIndex > 0)
					: [],
			};
			setPartsMetaPage(pagePayload);
			return pagePayload;
		}
		finally {
			setPartsMetaLoading(false);
		}
	}, []);

	const loadStreamPartContent = useCallback(async (jobId: string, partIndex: number) => {
		const safeJobId = String(jobId || "").trim();
		if (!safeJobId || !Number.isFinite(partIndex) || partIndex <= 0)
			return "";
		setSelectedPartLoading(true);
		setSelectedPartIndex(partIndex);
		try {
			const response = await request.get(`ai-code-stream/${encodeURIComponent(safeJobId)}/parts/${partIndex}`, {
				throwHttpErrors: false,
			});
			if (!response.ok)
				return "";
			const data = await response.json() as any;
			const content = String(data?.content || "");
			setSelectedPartContent(content);
			return content;
		}
		finally {
			setSelectedPartLoading(false);
		}
	}, []);

	const hydrateFromPersistedParts = useCallback(async (jobId: string) => {
		const safeJobId = String(jobId || "").trim();
		if (!safeJobId)
			return "";
		const manifest = await loadStreamPartsManifest(safeJobId);
		const totalParts = Number(manifest?.totalParts || 0);
		if (totalParts <= 0)
			return "";
		const chunks: string[] = [];
		for (let partIndex = 1; partIndex <= totalParts; partIndex += 1) {
			const response = await request.get(`ai-code-stream/${encodeURIComponent(safeJobId)}/parts/${partIndex}`, {
				throwHttpErrors: false,
			});
			if (!response.ok)
				break;
			const data = await response.json() as any;
			chunks.push(String(data?.content || ""));
		}
		const full = chunks.join("");
		if (full) {
			streamingMessageRef.current = full;
			pendingStreamChunkRef.current = "";
		}
		return full;
	}, [loadStreamPartsManifest]);

	const handleInsertCode = (code: string) => {
		if (onCodeInsert) {
			onCodeInsert(code);
			message.success(uiText("Đã chèn code", "Code inserted", "代码已插入"));
		}
	};

	return (
		<Card
			className={styles.aiAssistantChat}
			title={uiText("Trò chuyện Trợ lý AI", "AI Assistant Chat", "AI 助手对话")}
			size="small"
			extra={(
				<Space size="small">
					<Tooltip title={uiText("Xóa lịch sử", "Clear history", "清除历史")}>
						<Popconfirm
							title={uiText("Xóa toàn bộ lịch sử chat?", "Delete all chat history?", "删除全部聊天记录？")}
							description={uiText(
								"Thao tác này sẽ xóa dữ liệu phiên trên server theo phạm vi hiện tại.",
								"This will remove session data on server for the current scope.",
								"此操作将删除当前范围下服务器会话数据。",
							)}
							okText={uiText("Xóa", "Delete", "删除")}
							cancelText={uiText("Hủy", "Cancel", "取消")}
							onConfirm={() => void handleClearHistory()}
						>
							<Button
								type="text"
								size="small"
								icon={<ClearOutlined />}
							/>
						</Popconfirm>
					</Tooltip>
				</Space>
			)}
		>
			<div className={styles.container}>
				{/* Messages List */}
				<div
					className={`${styles.messageList} ${messages.length > 0 ? styles.messageListPinnedBottom : ""}`.trim()}
					ref={messageListRef}
					onScroll={handleMessageListScroll}
				>
					{messages.length === 0 ? (
						<Empty
							description={uiText("Bắt đầu trò chuyện với Trợ lý AI", "Start a conversation with AI Assistant", "开始与 AI 助手对话")}
							style={{ marginTop: 32 }}
						/>
					) : (
						messages.map((msg, msgIdx) => {
							if (msg.messageType === "compacted_context") {
								const savedK = Math.round((msg.compactedSavedChars ?? 0) / 1000);
								const savePct = msg.compactedCharsBefore && msg.compactedCharsBefore > 0
									? Math.round(((msg.compactedSavedChars ?? 0) / msg.compactedCharsBefore) * 100)
									: 0;
								return (
									<div
										key={msg.id}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											margin: "8px 0",
											paddingLeft: 4,
											paddingRight: 4,
										}}
									>
										<div style={{ flex: 1, height: 1, background: "rgba(114,46,209,0.25)" }} />
										<Tooltip title={uiText(
											`Context đã được nén: ${(msg.compactedCharsBefore ?? 0).toLocaleString()} → ${(msg.compactedCharsAfter ?? 0).toLocaleString()} ký tự${msg.compactedRoutingTier ? ` · tier: ${msg.compactedRoutingTier}` : ""}${msg.compactedPlanStepCount ? ` · ${msg.compactedPlanStepCount} bước kế hoạch` : ""}`,
											`Context compacted: ${(msg.compactedCharsBefore ?? 0).toLocaleString()} → ${(msg.compactedCharsAfter ?? 0).toLocaleString()} chars${msg.compactedRoutingTier ? ` · tier: ${msg.compactedRoutingTier}` : ""}${msg.compactedPlanStepCount ? ` · ${msg.compactedPlanStepCount} plan steps` : ""}`,
											`上下文已压缩：${(msg.compactedCharsBefore ?? 0).toLocaleString()} → ${(msg.compactedCharsAfter ?? 0).toLocaleString()} 字符${msg.compactedRoutingTier ? ` · 层级: ${msg.compactedRoutingTier}` : ""}`,
										)}
										>
											<span style={{
												fontSize: 11,
												color: "#722ed1",
												whiteSpace: "nowrap",
												cursor: "default",
												display: "flex",
												alignItems: "center",
												gap: 4,
											}}
											>
												<ThunderboltOutlined style={{ fontSize: 10 }} />
												{uiText(
													`Hội thoại đã được nén · tiết kiệm ${savedK > 0 ? `~${savedK}K` : (msg.compactedSavedChars ?? 0).toLocaleString()} ký tự${savePct > 0 ? ` (${savePct}%)` : ""}`,
													`Compacted conversation · saved ${savedK > 0 ? `~${savedK}K` : (msg.compactedSavedChars ?? 0).toLocaleString()} chars${savePct > 0 ? ` (${savePct}%)` : ""}`,
													`对话已压缩 · 节省 ${savedK > 0 ? `~${savedK}K` : (msg.compactedSavedChars ?? 0).toLocaleString()} 字符${savePct > 0 ? `（${savePct}%）` : ""}`,
												)}
											</span>
										</Tooltip>
										<div style={{ flex: 1, height: 1, background: "rgba(114,46,209,0.25)" }} />
									</div>
								);
							}
							const isLastMsg = msgIdx === messages.length - 1;
							const showStepCards = false;
							return (
								<Fragment key={msg.id}>
									{showStepCards && (
										<div style={{ padding: "2px 8px 0" }}>
											<div style={{
												border: "1px solid rgba(114,46,209,0.22)",
												borderRadius: 8,
												background: "rgba(114,46,209,0.05)",
												overflow: "hidden",
												marginBottom: 4,
											}}
											>
												<div
													style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", cursor: "pointer" }}
													onClick={() => setAgenticStepsCollapsed(c => !c)}
												>
													<span style={{ fontSize: 11, color: "#722ed1", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
														<ThunderboltOutlined style={{ fontSize: 10 }} />
														{agenticStepsCollapsed
															? uiText(`${agenticSteps.length} b\u01B0\u1EDBc agentic ho\u00E0n t\u1EA5t`, `${agenticSteps.length} agentic steps done`, `${agenticSteps.length} \u4E2A Agent \u6B65\u9AA4\u5B8C\u6210`)
															: uiText("Agentic workflow", "Agentic workflow", "Agent \u5DE5\u4F5C\u6D41")}
													</span>
													<span style={{ fontSize: 10, color: "#722ed1" }}>{agenticStepsCollapsed ? "\u25BC" : "\u25B2"}</span>
												</div>
												{!agenticStepsCollapsed && (
													<div style={{ borderTop: "1px solid rgba(114,46,209,0.12)", padding: "3px 0" }}>
														{agenticSteps.map(step => (
															<div key={step.id} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "3px 10px", fontSize: 11 }}>
																<span style={{ fontSize: 13, lineHeight: "15px", flexShrink: 0 }}>{step.icon}</span>
																<div style={{ flex: 1, minWidth: 0, lineHeight: "15px" }}>
																	<span style={{ color: "rgba(230,230,230,0.9)" }}>{step.label}</span>
																	{step.detail && (
																		<span style={{ color: "rgba(180,180,180,0.6)", marginLeft: 6, fontSize: 10 }}>{step.detail}</span>
																	)}
																</div>
																<span style={{
																	fontSize: 11,
																	color: step.status === "done" ? "#52c41a" : (step.status === "planned" ? "#8c8c8c" : "#722ed1"),
																	flexShrink: 0,
																	lineHeight: "15px",
																}}>
																	{step.status === "done" ? "\u2713" : (step.status === "planned" ? "\u25CB" : "\u2026")}
																</span>
															</div>
														))}
													</div>
												)}
											</div>
										</div>
									)}
									<div
										className={`${styles.messageItem} ${styles[msg.role]}`}
									>
										<div className={styles.messageContent}>
											<div className={styles.messageText}>
												{msg.role === "user" ? (
													<>
														<span>{msg.content}</span>
														{Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
															<div className={styles.attachmentList}>
																{msg.attachments.map(attachment => (
																	<div key={attachment.id} className={styles.attachmentChip}>
																		{attachment.kind === "image" && attachment.previewUrl
																			? (
																				<img src={attachment.previewUrl} alt={attachment.name} className={styles.attachmentThumb} />
																			)
																			: (
																				<PaperClipOutlined />
																			)}
																		<div className={styles.attachmentMeta}>
																			<div>{attachment.name}</div>
																			<div className={styles.attachmentSummary}>{attachment.summary}</div>
																		</div>
																	</div>
																))}
															</div>
														)}
													</>
												) : (
													<div className={styles.assistantText}>
														{msg.messageType === "debug" && (
															<Tag color="gold">AI ASSISTANT DEBUG PAYLOAD</Tag>
														)}
														{/* Render text with code blocks */}
														{msg.content.split(/```[\s\S]*?```/g).map((part, idx) => (
															<span key={idx}>{part}</span>
														))}

														{/* Render code blocks */}
														{!shouldRenderAssistantCodeBlocks && msg.responseMode === "edit" && Array.isArray(msg.codeBlocks) && msg.codeBlocks.length > 0 && (
															<div className={styles.attachmentSummary}>
																{uiText(
																	"Mã đã được cập nhật trong editor. Chat chỉ hiển thị tóm tắt thay đổi.",
																	"Code has been updated in the editor. Chat shows only the summary.",
																	"代码已更新到编辑器中，聊天窗口仅显示摘要。",
																)}
															</div>
														)}
															{(shouldRenderAssistantCodeBlocks || msg.responseMode !== "edit") && msg.codeBlocks?.map(block => (
																<div
																	key={`code_${block.index}`}
																	className={styles.codeBlock}
																>
																	<div className={styles.codeHeader}>
																		<span>{block.language}</span>
																		<Space size={4}>
																			<Button
																				type="text"
																				size="small"
																				icon={<CopyOutlined />}
																				onClick={() => handleCopyCode(block.code)}
																				title={uiText("Sao chép code", "Copy code", "复制代码")}
																			/>
																			{onCodeInsert && msg.messageType !== "debug" && (
																				<>
																				<Button
																					type="text"
																					size="small"
																					icon={<BgColorsOutlined />}
																					onClick={() => handleInsertCode(block.code)}
																					title={uiText("Chèn vào editor", "Insert into editor", "插入到编辑器")}
																				/>
																				<Button
																					type="primary"
																					size="small"
																					onClick={() => {
																						undoSnapshotRef.current = currentCode || "";
																						setCanUndoLastEdit(true);
																						onCodeInsert(block.code);
																						lastAppliedCodeRef.current = block.code;
																						message.success(uiText("Đã áp dụng vào editor", "Applied to editor", "已应用到编辑器"));
																					}}
																					title={uiText("Áp dụng vào editor", "Apply in Editor", "应用到编辑器")}
																				>
																					{uiText("Apply", "Apply", "应用")}
																				</Button>
																				</>
																			)}
																		</Space>
																	</div>
																	<pre className={styles.codeContent}>
																		<code>{block.code}</code>
																	</pre>
																</div>
															))}
														</div>
													)}
												</div>
												<div className={styles.timestamp}>
													<span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
												<span className={styles.messageActionGroup}>
													{msg.role === "assistant" && msg.serverTurnId && (
														<>
															<span className={styles.feedbackMessageAction}>
																<Button
																	type="text"
																	size="small"
																	icon={<LikeOutlined />}
																	className={msg.feedbackRating === 1 ? styles.feedbackActivePositive : undefined}
																	onClick={() => void handleRateMessage(msg, 1)}
																	title={uiText("Đánh giá tốt", "Mark as good", "标记为有帮助")}
																/>
															</span>
															<span className={styles.feedbackMessageAction}>
																<Button
																	type="text"
																	size="small"
																	icon={<DislikeOutlined />}
																	className={msg.feedbackRating === -1 ? styles.feedbackActiveNegative : undefined}
																	onClick={() => void handleRateMessage(msg, -1)}
																	title={uiText("Đánh giá chưa tốt", "Mark as not helpful", "标记为无帮助")}
																/>
															</span>
														</>
													)}
													<span className={styles.deleteMessageAction}>
														<Button
															type="text"
															size="small"
															icon={<DeleteOutlined />}
															onClick={() => void handleDeleteMessage(msg)}
															title={uiText("Xóa tin nhắn", "Delete message", "删除消息")}
														/>
													</span>
												</span>
											</div>
										</div>
									</div>
								</Fragment>
							);
						})
					)}

				</div>

				{/* Follow-up question suggestions (shown after response completes) */}
				{!isLoading && completionState === "done" && followUpSuggestions.length > 0 && (
					<div style={{ padding: "6px 12px 2px", display: "flex", flexWrap: "wrap", gap: 6 }}>
						{followUpSuggestions.map((suggestion, idx) => (
							<Button
								key={idx}
								size="small"
								type="dashed"
								style={{ fontSize: 12, borderRadius: 12, height: "auto", whiteSpace: "normal", textAlign: "left" }}
								onClick={() => {
									setInputValue(suggestion);
									setFollowUpSuggestions([]);
								}}
							>
								{suggestion}
							</Button>
						))}
					</div>
				)}

				{(isLoading || completionState !== "idle") && (
					<div className={styles.progressDock}>
						{isProgressDockCollapsed && !isLoading && completionSummaryLabel && (
							<div className={styles.progressDockCollapsedBar}>
								<div className={styles.progressCompletionMain}>
									<span className={styles.progressCompletionTitle}>
										{uiText("Kết thúc xử lý", "Processing finished", "处理已结束")}
									</span>
									<span className={styles.progressCompletionStats}>{completionSummaryLabel}</span>
									{streamRequestId && (
										<span className={styles.progressRequestId}>
											req
											{streamRequestId}
										</span>
									)}
								</div>
								<div className={styles.progressCollapsedActions}>
									{streamRequestId && (
										<Button
											type="text"
											size="small"
											icon={<CopyOutlined />}
											className={styles.requestActionBtn}
											onClick={handleCopyRequestId}
											title={uiText("Sao chép requestId", "Copy requestId", "复制 requestId")}
										/>
									)}
									<Button
										type="link"
										size="small"
										className={styles.compactToggleBtn}
										onClick={() => setIsProgressDockCollapsed(false)}
									>
										{uiText("Mở lại", "Expand", "展开")}
									</Button>
								</div>
							</div>
						)}
						{!isProgressDockCollapsed && isLoading && geminiProgress.phase !== "idle" && (
							showMiniProgress
								? (
									<div className={styles.progressMiniBar}>
										<div className={styles.progressMiniMain}>
											<span className={styles.progressMiniPhase}>
												{normalizeAssistantProgressMessage(
													geminiProgress.message,
													geminiProgress.phase === "waiting"
														? (isLocalProgressMessage(geminiProgress.message)
															? uiText("AI local đang xử lý", "Local AI processing", "本地AI处理中")
															: uiText("Đang xử lý", "Processing", "处理中"))
														: (isLocalProgressMessage(geminiProgress.message)
															? uiText("AI local đang stream", "Local AI streaming", "本地AI流式处理中")
															: uiText("Đang streaming", "Streaming", "流式中")),
												)}
											</span>
											<span className={styles.progressMiniStats}>
												{`${Math.max(0, Math.min(100, geminiProgress.percent))}%`}
												{geminiProgress.remainingSecs > 0 ? ` · ~${geminiProgress.remainingSecs}s` : ""}
												{liveOrchestrationHintLabel ? ` · ${liveOrchestrationHintLabel}` : (liveBackendStepLabel ? ` · ${liveBackendStepLabel}` : "")}
												{` · evt ${Math.max(0, lastProgressEventAgeSecs)}s`}
											</span>
											{liveOrchestrationBadge && (
												<span className={`${styles.progressMiniStageBadge} ${styles[`progressMiniStageBadge_${liveOrchestrationBadge.tone}`] || ""}`.trim()}>
													{liveOrchestrationBadge.label}
												</span>
											)}
											{streamRequestId && (
												<button type="button" className={styles.progressRequestIdButton} onClick={handleCopyRequestId}>
													<span className={styles.progressRequestId}>
														req
														{streamRequestId}
													</span>
												</button>
											)}
										</div>
										<Space size={4}>
											<Button
												type="text"
												size="small"
												danger
												icon={<CloseOutlined />}
												onClick={handleCancelRequest}
											>
												{uiText("Hủy", "Cancel", "取消")}
											</Button>
											<Button
												type="link"
												size="small"
												className={styles.compactToggleBtn}
												onClick={() => setShowMiniProgress(false)}
											>
												{uiText("Chi tiết", "Details", "详情")}
											</Button>
										</Space>
									</div>
								)
								: (
									<div className={styles.geminiProgressCard}>
										<div className={styles.geminiProgressHeader}>
											<span className={styles.geminiProgressIcon}>
												{geminiProgress.phase === "waiting" ? "⏳" : "⚡"}
											</span>
											<span className={styles.geminiProgressLabel}>
												{normalizeAssistantProgressMessage(
													geminiProgress.message,
													geminiProgress.phase === "waiting"
														? (isLocalProgressMessage(geminiProgress.message)
															? uiText("AI local đang xử lý...", "Local AI is processing...", "本地AI正在处理中...")
															: uiText("Chuyên Gia đang xử lý...", "Expert is processing...", "专家正在处理中..."))
														: (isLocalProgressMessage(geminiProgress.message)
															? uiText("Đang nhận kết quả từ AI local...", "Receiving result from Local AI...", "正在接收本地AI结果...")
															: uiText("Đang nhận kết quả từ Chuyên Gia...", "Receiving result from Expert...", "正在接收专家结果...")),
												)}
											</span>
											<span className={styles.geminiProgressCountdown}>
												{geminiProgress.remainingSecs > 0 ? `~${geminiProgress.remainingSecs}s` : " "}
											</span>
											<span className={styles.geminiProgressCountdown}>
												{`evt ${Math.max(0, lastProgressEventAgeSecs)}s`}
											</span>
											<Button
												type="text"
												size="small"
												danger
												icon={<CloseOutlined />}
												onClick={handleCancelRequest}
											>
												{uiText("Hủy", "Cancel", "取消")}
											</Button>
											<Button
												type="link"
												size="small"
												className={styles.compactToggleBtn}
												onClick={() => setShowMiniProgress(true)}
											>
												{uiText("Mini", "Mini", "迷你")}
											</Button>
										</div>
										<div className={styles.geminiProgressBarTrack}>
											<div
												className={`${styles.geminiProgressBarFill} ${geminiProgress.phase === "waiting" ? styles.geminiProgressBarWaiting : styles.geminiProgressBarStreaming}`}
												style={{ width: `${Math.max(2, Math.min(100, geminiProgress.percent))}%` }}
											/>
										</div>
										<div className={styles.geminiProgressMeta}>
											{geminiProgress.phase === "streaming" && geminiProgress.charsReceived > 0
													? (
													<>
														{geminiProgress.charsReceived.toLocaleString()}
														{" "}
															{isLocalProgressMessage(geminiProgress.message)
																? uiText("ký tự từ AI local", "chars from Local AI", "来自本地AI的字符")
																: uiText("ký tự nhận được", "chars received", "已接收字符")}
														{geminiProgress.ttftMs != null && (
															<span className={styles.geminiProgressTtft}>
																{" "}
																· TTFT
																{geminiProgress.ttftMs}
																ms
															</span>
														)}
													</>
													)
													: geminiProgress.phase === "waiting" && geminiProgress.estimatedWaitSecs > 0
													? uiText(
														`Ước tính ~${geminiProgress.estimatedWaitSecs}s tổng thời gian`,
														`Estimated total time ~${geminiProgress.estimatedWaitSecs}s`,
														`预计总耗时约 ${geminiProgress.estimatedWaitSecs}s`,
													)
													: " "}
											{liveBackendStepLabel && (
												<div>
													{uiText("Bước hiện tại", "Current step", "当前步骤")}
													{": "}
													{liveBackendStepLabel}
												</div>
											)}
										</div>
										{streamRequestId && (
											<button type="button" className={styles.progressRequestIdButton} onClick={handleCopyRequestId}>
												<div className={styles.progressMetaInline}>
													req
													{streamRequestId}
												</div>
											</button>
										)}
									</div>
								)
						)}
						{!isProgressDockCollapsed && !isLoading && completionSummaryLabel && (
							<div className={[
								styles.progressCompletionBar,
								completionState === "stream_closed" ? styles.progressCompletionBar_streamClosed : "",
								completionState === "error" ? styles.progressCompletionBar_error : "",
							].filter(Boolean).join(" ")}
							>
								<div className={styles.progressCompletionMain}>
									<span className={styles.progressCompletionTitle}>
										{uiText("Kết thúc xử lý", "Processing finished", "处理已结束")}
									</span>
									<Tooltip title={completionDetailTooltip || completionSummaryLabel}>
										<span className={styles.progressCompletionStats}>{completionSummaryLabel}</span>
									</Tooltip>
									{streamRequestId && (
										<span className={styles.progressRequestId}>
											req
											{streamRequestId}
										</span>
									)}
								</div>
								{streamRequestId && (
									<Button
										type="text"
										size="small"
										icon={<CopyOutlined />}
										className={styles.requestActionBtn}
										onClick={handleCopyRequestId}
										title={uiText("Sao chép requestId", "Copy requestId", "复制 requestId")}
									/>
								)}
							</div>
						)}
						{!isProgressDockCollapsed && agenticSteps.length >= 2 && activeStreamResponseMode !== "analyze" && (
							<div className={`${styles.messageContent} ${styles.stageTimelineCard}`}>
								<div
									className={styles.stageTimelineHeader}
									onClick={() => setAgenticStepsCollapsed(c => !c)}
									style={{ cursor: "pointer" }}
								>
									<div className={styles.stageTimelineTitle}>
										{agenticStepsCollapsed
											? uiText(
												`${agenticSteps.length} bước agentic hoàn tất`,
												`${agenticSteps.length} agentic steps done`,
												`${agenticSteps.length} 个 Agent 步骤完成`,
											)
											: uiText("Agentic workflow", "Agentic workflow", "Agent 工作流")}
									</div>
											<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
												{pendingApprovalAgenticSteps.length > 0 && !agenticStepsCollapsed && (
													<Tag color="red">{uiText(
														`${pendingApprovalAgenticSteps.length} bước chờ duyệt`,
														`${pendingApprovalAgenticSteps.length} awaiting approval`,
														`${pendingApprovalAgenticSteps.length} 个步骤待批准`,
													)}</Tag>
												)}
												{lowConfidenceAgenticSteps.length > 1 && !agenticStepsCollapsed && (
													<Button
														type="link"
														size="small"
														className={styles.compactToggleBtn}
														onClick={(e) => {
															e.stopPropagation();
															handleRetryLowConfidenceBatch();
														}}
													>
														{uiText("Retry all low-confidence", "Retry all low-confidence", "重试全部低置信度")}
													</Button>
												)}
												<Button
													type="link"
													size="small"
													className={styles.compactToggleBtn}
													onClick={(e) => {
														e.stopPropagation();
														setAgenticStepsCollapsed(c => !c);
													}}
												>
													{agenticStepsCollapsed
														? uiText("Mở", "Expand", "展开")
														: uiText("Thu", "Collapse", "收起")}
												</Button>
											</div>
								</div>
								{!agenticStepsCollapsed && (
									<div className={styles.stageTimelineList}>
										{agenticSteps.map(step => (
											<div key={step.id} className={styles.stageTimelineItem}>
												<span className={styles.stageTimelineBullet} />
												<div className={styles.stageTimelineText}>
													<div className={styles.stageTimelineHead}>
														<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
															<span>{`${step.icon} ${step.label}`}</span>
															{Number.isFinite(step.qualityScore as number) && (
																<span style={{
																	fontSize: 11,
																	padding: "1px 6px",
																	borderRadius: 999,
																	border: "1px solid rgba(255,255,255,0.16)",
																	color: step.lowConfidence ? "#ff7875" : "#95de64",
																}}>{`Q${Math.round(step.qualityScore as number)}`}</span>
															)}
															{step.lowConfidence && (
																<Button
																	type="link"
																	size="small"
																	className={styles.compactToggleBtn}
																	onClick={(e) => {
																		e.stopPropagation();
																		handleRetryAgenticStep(step);
																	}}
																>
																	{uiText("Retry step", "Retry step", "重试步骤")}
																</Button>
															)}
															{step.riskLevel && step.riskLevel !== "low" && (
																<Tag color={step.riskLevel === "high" ? "red" : "orange"}>{`risk: ${step.riskLevel}`}</Tag>
															)}
															{step.approvalRequired && step.approvalState === "pending" && (
																<Tag color="magenta">{uiText("Chờ duyệt", "Pending approval", "待批准")}</Tag>
															)}
															{step.approvalState === "approved" && (
																<Tag color="green">{uiText("Đã duyệt", "Approved", "已批准")}</Tag>
															)}
															{step.approvalState === "rejected" && (
																<Tag color="default">{uiText("Đã từ chối", "Rejected", "已拒绝")}</Tag>
															)}
															{step.patchValidator?.rejectionReason && String(step.patchValidator.rejectionReason).toLowerCase() !== "none" && (
																<Tooltip title={uiText(
																	buildPatchValidatorRetryHint(step.patchValidator.rejectionReason),
																	buildPatchValidatorRetryHint(step.patchValidator.rejectionReason),
																	buildPatchValidatorRetryHint(step.patchValidator.rejectionReason),
																)}>
																	<Tag color="orange">{`validator: ${formatPatchValidatorReason(step.patchValidator.rejectionReason)}`}</Tag>
																</Tooltip>
															)}
															{step.approvalRequired && step.approvalState === "pending" && (
																<>
																	<Button
																		type="link"
																		size="small"
																		className={styles.compactToggleBtn}
																		disabled={processingApprovalStepId === step.id}
																		onClick={(e) => {
																			e.stopPropagation();
																			void handleApproveAgenticStep(step);
																		}}
																	>
																		{processingApprovalStepId === step.id
																			? uiText("Syncing...", "Syncing...", "同步中...")
																			: uiText("Approve", "Approve", "批准")}
																	</Button>
																	<Button
																		type="link"
																		size="small"
																		className={styles.compactToggleBtn}
																		disabled={processingApprovalStepId === step.id}
																		onClick={(e) => {
																			e.stopPropagation();
																			void handleRejectAgenticStep(step);
																		}}
																	>
																		{uiText("Reject", "Reject", "拒绝")}
																	</Button>
																</>
															)}
														</div>
														<span>{step.status === "done" ? "✓" : (step.status === "planned" ? "○" : "…")}</span>
													</div>
													{step.detail && (
														<div className={styles.stageTimelineMessage}>{step.detail}</div>
													)}
													{step.approvalRequired && step.approvalReasons && step.approvalReasons.length > 0 && (
														<div className={styles.stageTimelineMetaLine}>
															{step.approvalReasons.join(" · ")}
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						)}
						{!isProgressDockCollapsed && SHOW_DETAILED_PROGRESS_TIMELINE && stageEvents.length > 0 && !showMiniProgress && (
							<div className={`${styles.messageContent} ${styles.stageTimelineCard}`}>
								<div className={styles.stageTimelineHeader}>
									<div className={styles.stageTimelineTitle}>
										{uiText("Tiến độ xử lý", "Processing timeline", "处理进度")}
									</div>
									<Button
										type="link"
										size="small"
										className={styles.compactToggleBtn}
										onClick={() => setShowFullTimeline(prev => !prev)}
									>
										{showFullTimeline
											? uiText("Thu gọn", "Compact", "收起")
											: uiText("Xem đầy đủ", "Expand", "展开")}
									</Button>
								</div>
								<div className={styles.stageTimelineList}>
									{hiddenStageCount > 0 && !showFullTimeline && (
										<div className={styles.stageTimelineMetaLine}>
											{uiText(
												`Đang ẩn ${hiddenStageCount} mốc cũ`,
												`Hiding ${hiddenStageCount} older events`,
												`已隐藏 ${hiddenStageCount} 条较早记录`,
											)}
										</div>
									)}
									{groupedVisibleStageEvents.map(group => (
										<div key={group.tone} className={styles.stageTimelineGroup}>
											<div className={styles.stageTimelineGroupHeader}>{group.label}</div>
											<div className={styles.stageTimelineGroupList}>
												{group.events.map((event) => {
													const stageLabel = renderProgressText(event.orchestrationPhaseKey, undefined, event.orchestrationPhase || formatStageLabel(event.stage));
													const stageTone = getStageTone(event.stage, event.orchestrationPhase);
													const isToolTraceEvent = String(event.stage || "").trim().toLowerCase().startsWith("tool_trace_");
													const toolRetry = Number(event.retryCount || 0);
													const toolErrorClass = String(event.errorClass || "").trim();
													const toolErrorCode = String(event.errorCode || "").trim();
													const toolTraceStatus = String(event.traceStatus || event.orchestrationPhase || event.status || "").trim().toLowerCase();
													const effectivePercent = Number.isFinite(Number(event.overallPercent)) ? Number(event.overallPercent) : Number(event.percent);
													const percentText = Number.isFinite(effectivePercent) ? ` (${Math.max(0, Math.min(100, effectivePercent))}%)` : "";
													const progressText = Number.isFinite(Number(event.current)) && Number.isFinite(Number(event.total))
														? ` [${Math.max(0, Number(event.current))}/${Math.max(1, Number(event.total))}]`
														: "";
													const timelineMessageBase = renderProgressText(event.detailKey, event.detailArgs, event.detail || renderProgressText(event.messageKey, event.messageArgs, event.message));
													const dynamicParts = String(event.stage || "").trim().toLowerCase() === "dynamic_ingestion"
														? buildDynamicIngestionParts({
															state: String(event.queueState || event.status || ""),
															source: event.dynamicSource,
															pruned: event.prunedSources,
														})
														: [];
													const scopeLabel = String(event.stage || "").trim().toLowerCase() === "scope_reasoning"
														? formatScopeReasoningLabel(event.scopeSummary, event.scopeMask, event.scopeTags, false)
														: "";
													const scopeTagsCompact = String(event.stage || "").trim().toLowerCase() === "scope_reasoning"
														? (Array.isArray(event.scopeTags)
															? event.scopeTags.map(tag => String(tag || "").trim()).filter(Boolean).slice(0, 3)
															: [])
														: [];
													const timelineMessage = dynamicParts.length > 0
														? `${uiText("Nạp động", "Ingestion", "动态入库")}: ${dynamicParts.join(" · ")}`
														: (scopeLabel || timelineMessageBase);
													const patchValidatorHint = event.patchValidator
														? `${formatPatchValidatorReason(event.patchValidator.rejectionReason)} (${event.patchValidator.acceptedCount ?? 0}/${event.patchValidator.inputCount ?? 0})`
														: "";
													return (
														<div key={event.id} className={`${styles.stageTimelineItem} ${styles[`stageTimelineItem_${stageTone}`] || ""}`.trim()}>
															<span className={`${styles.stageTimelineBullet} ${styles[`stageTimelineBullet_${stageTone}`] || ""}`.trim()} />
															<div className={styles.stageTimelineText}>
																<div className={`${styles.stageTimelineHead} ${styles[`stageTimelineHead_${stageTone}`] || ""}`.trim()}>
																	<span>
																		{stageLabel}
																		{percentText}
																		{progressText}
																	</span>
																	{event.rangeLabel && <span className={styles.stageRangeBadge}>{event.rangeLabel}</span>}
																</div>
																{event.model && (
																	<div className={`${styles.stageTimelineMessage} ${styles.stageTimelineMessageCompact}`.trim()}>
																		{`model=${event.model}`}
																	</div>
																)}
																{event.requestId && (stageTone === "completed" || stageTone === "error") && (
																	<div className={`${styles.stageTimelineMessage} ${styles.stageTimelineMessageCompact}`.trim()}>
																		{`req=${event.requestId}`}
																	</div>
																)}
																{timelineMessage && (
																	<div className={`${styles.stageTimelineMessage} ${styles.stageTimelineMessageCompact}`.trim()}>
																		{timelineMessage}
																	</div>
																)}
																	{isToolTraceEvent && (
																		<div className={styles.stageScopeTagList}>
																			{toolTraceStatus && (
																				<span className={styles.stageScopeTagChip}>{`status:${toolTraceStatus}`}</span>
																			)}
																			{toolRetry > 0 && (
																				<span className={styles.stageScopeTagChip}>{`retry:${toolRetry}`}</span>
																			)}
																			{toolErrorClass && toolErrorClass.toLowerCase() !== "none" && (
																				<span className={styles.stageScopeTagChip}>{`errorClass:${toolErrorClass}`}</span>
																			)}
																			{toolErrorCode && toolErrorCode.toLowerCase() !== "none" && (
																				<span className={styles.stageScopeTagChip}>{`errorCode:${toolErrorCode}`}</span>
																			)}
																		</div>
																	)}
																{patchValidatorHint && (
																	<div className={`${styles.stageTimelineMessage} ${styles.stageTimelineMessageCompact}`.trim()}>
																		{`validator=${patchValidatorHint}`}
																	</div>
																)}
																{scopeTagsCompact.length > 0 && (
																	<div className={styles.stageScopeTagList}>
																		{scopeTagsCompact.map(tag => (
																			<span key={`${event.id}_${tag}`} className={styles.stageScopeTagChip}>
																				#{tag}
																			</span>
																		))}
																	</div>
																)}
															</div>
														</div>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						)}
						{!isProgressDockCollapsed && isLoading && (
							<div className={styles.progressDockSpinnerRow}>
								<Spin size="small" />
							</div>
						)}
					</div>
				)}

				{isUsageDockVisible && (completionState === "error" || completionState === "review_required" || localFlowOps || streamRequestId) && (
					<div className={[
						styles.usageDock,
						completionState === "stream_closed" ? styles.usageDock_streamClosed : "",
						completionState === "error" ? styles.usageDock_error : "",
					].filter(Boolean).join(" ")}
					>
						<div className={styles.usageDockHeader}>
							<div className={styles.usageDockTitle}>
								{uiText("Trạng thái request", "Request status", "请求状态")}
							</div>
							<div className={styles.usageDockBadges}>
								{completionStateLabel && (
									<Tooltip title={completionDetailTooltip || completionStateLabel}>
										<Tag color={completionState === "done" ? "green" : completionState === "review_required" ? "blue" : completionState === "stream_closed" ? "gold" : completionState === "error" ? "red" : completionState === "cancelled" ? "orange" : "default"}>
											{completionStateLabel}
										</Tag>
									</Tooltip>
								)}
								{completionMetrics.patchFallbackNoOp === true && (
									<Tooltip title={uiText(
										"Patch local không hợp lệ, hệ thống đã fallback no-op an toàn.",
										"Local patch was invalid, system applied a safe no-op fallback.",
										"本地补丁无效，系统已回退为安全 no-op。",
									)}>
										<Tag color="orange">
											{uiText("Patch fallback: no-op", "Patch fallback: no-op", "补丁回退：no-op")}
										</Tag>
									</Tooltip>
								)}
								{streamRequestId && (
									<Tag>
										<span className={styles.requestTagContent}>
											req
											{streamRequestId}
										</span>
										<Button
											type="text"
											size="small"
											icon={<CopyOutlined />}
											className={styles.requestActionBtn}
											onClick={handleCopyRequestId}
											title={uiText("Sao chép requestId", "Copy requestId", "复制 requestId")}
										/>
									</Tag>
								)}
							</div>
						</div>
						{completionSummaryLabel && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Kết thúc", "Completion", "结束状态")}</span>
								<span>{completionSummaryLabel}</span>
							</div>
						)}
						{localFlowOps && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Local flow", "Local flow", "本地流程")}</span>
								<span>
									{localFlowOps.verified
										? (
											<Space size={4} wrap>
												<Tag color="green">
													{localFlowOps.flow === "menu_json"
														? uiText("Đã xác nhận MENU", "MENU verified", "已确认 MENU")
														: uiText("Đã xác nhận CODE", "CODE verified", "已确认 CODE")}
												</Tag>
												<Tag>{`${uiText("Thêm", "Add", "新增")}: ${localFlowOps.addCount}`}</Tag>
												<Tag>{`${uiText("Sửa", "Edit", "编辑")}: ${localFlowOps.editCount}`}</Tag>
												<Tag>{`${uiText("Xóa", "Delete", "删除")}: ${localFlowOps.deleteCount}`}</Tag>
											</Space>
										)
										: (
											<Tooltip title={localFlowOps.reason || ""}>
												<Tag color="orange">
													{uiText("Chưa xác nhận local flow", "Local flow not verified", "本地流程未确认")}
												</Tag>
											</Tooltip>
										)}
								</span>
							</div>
						)}
						{localFlowOps?.verified && localFlowOps.flow === "code" && localFlowOpLines.length > 0 && (
							<div className={styles.localOpsPreview}>
								<div className={styles.localOpsPreviewHeader}>
									<div className={styles.localOpsPreviewTitle}>
										{uiText("Preview thay đổi theo line", "Line-level operation preview", "按行操作预览")}
									</div>
									<Space size={4} wrap>
										<Button
											type={localFlowOpFilter === "all" ? "primary" : "default"}
											size="small"
											onClick={() => setLocalFlowOpFilter("all")}
										>
											{uiText("Tất cả", "All", "全部")}
										</Button>
										<Button
											type={localFlowOpFilter === "add" ? "primary" : "default"}
											size="small"
											onClick={() => setLocalFlowOpFilter("add")}
										>
											{uiText("Thêm", "Add", "新增")}
										</Button>
										<Button
											type={localFlowOpFilter === "edit" ? "primary" : "default"}
											size="small"
											onClick={() => setLocalFlowOpFilter("edit")}
										>
											{uiText("Sửa", "Edit", "编辑")}
										</Button>
										<Button
											type={localFlowOpFilter === "delete" ? "primary" : "default"}
											size="small"
											onClick={() => setLocalFlowOpFilter("delete")}
										>
											{uiText("Xóa", "Delete", "删除")}
										</Button>
									</Space>
								</div>
								<div className={styles.localOpsPreviewList}>
									{filteredLocalFlowOpLines.map((line, idx) => (
										<div
											key={`${line.action}_${line.lineLabel}_${idx}`}
											className={`${styles.localOpsLine} ${styles[`localOpsLine_${line.action}`] || ""}`.trim()}
										>
											<span className={styles.localOpsLineTag}>
												{line.action === "add" ? "+" : line.action === "delete" ? "-" : "~"}
												{" "}
												{line.lineLabel}
											</span>
											<span className={styles.localOpsLineText}>{renderOperationSnippetText(line.snippet)}</span>
										</div>
									))}
									{filteredLocalFlowOpLines.length === 0 && (
										<div className={styles.localOpsEmpty}>
											{uiText("Không có dòng phù hợp bộ lọc.", "No lines match this filter.", "没有匹配该筛选条件的行。")}
										</div>
									)}
								</div>
							</div>
						)}
						{quickFixSuggestions.length > 0 && (
							<div className={styles.quickFixPanel}>
								<div className={styles.quickFixPanelHeader}>
									{uiText("Quick-fix đề xuất", "Suggested quick fixes", "建议的 quick-fix")}
								</div>
								<div className={styles.quickFixList}>
									{quickFixSuggestions.map((fix) => {
										const canApply = Boolean(onCodeInsert) && contextType === "code";
										return (
											<div key={fix.id} className={styles.quickFixItem}>
												<div className={styles.quickFixText}>
													<div className={styles.quickFixTitle}>{fix.title}</div>
													{fix.description && <div className={styles.quickFixDesc}>{fix.description}</div>}
												</div>
												<Space size={6}>
													<Button
														size="small"
														type="primary"
														disabled={!canApply}
														loading={applyingQuickFixId === fix.id}
														onClick={() => applyQuickFixSuggestion(fix)}
													>
														{uiText("Áp dụng", "Apply", "应用")}
													</Button>
													<Button
														size="small"
														onClick={() => dismissQuickFixSuggestion(fix)}
													>
														{uiText("Bỏ qua", "Dismiss", "忽略")}
													</Button>
												</Space>
											</div>
										);
									})}
								</div>
							</div>
						)}
						{editCandidates.length > 0 && (
							<div className={styles.quickFixPanel}>
								<div className={styles.quickFixPanelHeader}>
									{uiText("Patch candidates", "Patch candidates", "Patch 候选方案")}
								</div>
								<div className={styles.quickFixList}>
									{editCandidates.map((candidate) => {
										const canApply = Boolean(onCodeInsert) && contextType === "code";
										const opAdd = Number(candidate.ops?.add || 0);
										const opEdit = Number(candidate.ops?.edit || 0);
										const opDelete = Number(candidate.ops?.delete || 0);
										const opSummary = `+${opAdd} ~${opEdit} -${opDelete}`;
										const riskLabel = String(candidate.riskLevel || "").trim().toLowerCase();
										const confidenceLabel = Number.isFinite(Number(candidate.confidence))
											? `conf ${Math.round(Number(candidate.confidence))}`
											: "";
										const feedbackLabel = Number.isFinite(Number(candidate.feedbackScore))
											? `score ${Number(candidate.feedbackScore).toFixed(2)}`
											: "";
										return (
											<div key={candidate.id} className={styles.quickFixItem}>
												<div className={styles.quickFixText}>
													<div className={styles.quickFixTitle}>{candidate.title}</div>
													{candidate.description && <div className={styles.quickFixDesc}>{candidate.description}</div>}
													<div className={styles.quickFixDesc}>{opSummary}</div>
													{(riskLabel || confidenceLabel || feedbackLabel) && (
														<div className={styles.quickFixDesc}>
															{[riskLabel ? `risk ${riskLabel}` : "", confidenceLabel, feedbackLabel].filter(Boolean).join(" · ")}
														</div>
													)}
													{candidate.rationale && <div className={styles.quickFixDesc}>{candidate.rationale}</div>}
												</div>
												<Space size={6}>
													<Button
														size="small"
														type="primary"
														disabled={!canApply}
														loading={applyingEditCandidateId === candidate.id}
														onClick={() => applyEditCandidate(candidate)}
													>
														{uiText("Áp dụng", "Apply", "应用")}
													</Button>
													<Button
														size="small"
														loading={retryingEditCandidateId === candidate.id}
														onClick={() => handleRetryEditCandidate(candidate)}
													>
														{uiText("Thử phương án khác", "Retry", "重试")}
													</Button>
													<Button
														size="small"
														onClick={() => dismissEditCandidate(candidate)}
													>
														{uiText("Bỏ qua", "Dismiss", "忽略")}
													</Button>
												</Space>
											</div>
										);
									})}
								</div>
							</div>
						)}
						{streamJobId && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Stream job", "Stream job", "流任务")}</span>
								<span>
									<Space size={4} wrap>
										<Tag>
											job
											{streamJobId}
										</Tag>
										<Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyJobId} />
										<Button
											type="link"
											size="small"
											className={styles.compactToggleBtn}
											onClick={() => {
												void loadStreamPartsManifest(streamJobId);
												void loadStreamPartsMeta(streamJobId, 1, 20);
											}}
										>
											{partsMetaLoading
												? uiText("Đang tải...", "Loading...", "加载中...")
												: uiText("Tải danh sách PART", "Load PART list", "加载 PART 列表")}
										</Button>
									</Space>
								</span>
							</div>
						)}
						{partsManifest && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Lưu trữ", "Persistence", "持久化")}</span>
								<span>
									{uiText("Tổng PART", "Total PART", "总 PART")}
									:
									{" "}
									{Math.max(0, Number(partsManifest.totalParts || 0)).toLocaleString("en-US")}
									{partsManifest.totalChars != null && (
										<>
											{" · "}
											{uiText("Ký tự", "Chars", "字符")}
											:
											{" "}
											{Math.max(0, Number(partsManifest.totalChars || 0)).toLocaleString("en-US")}
										</>
									)}
								</span>
							</div>
						)}
						{partsMetaPage && partsMetaPage.items.length > 0 && (
							<div className={styles.usageDockRow}>
								<span>{uiText("PART theo trang", "PART pages", "分页 PART")}</span>
								<span>
									<Space size={4} wrap>
										{partsMetaPage.items.map(item => (
											<Button
												key={`part_${item.partIndex}`}
												type={selectedPartIndex === item.partIndex ? "primary" : "default"}
												size="small"
												onClick={() => {
													void loadStreamPartContent(streamJobId, item.partIndex);
												}}
											>
												{`P${item.partIndex}`}
											</Button>
										))}
										<Button
											type="link"
											size="small"
											className={styles.compactToggleBtn}
											disabled={partsMetaPage.page <= 1 || partsMetaLoading}
											onClick={() => {
												void loadStreamPartsMeta(streamJobId, Math.max(1, partsMetaPage.page - 1), partsMetaPage.size);
											}}
										>
											{uiText("Trang trước", "Prev", "上一页")}
										</Button>
										<Button
											type="link"
											size="small"
											className={styles.compactToggleBtn}
											disabled={partsMetaPage.page >= partsMetaPage.totalPages || partsMetaLoading}
											onClick={() => {
												void loadStreamPartsMeta(streamJobId, Math.min(partsMetaPage.totalPages, partsMetaPage.page + 1), partsMetaPage.size);
											}}
										>
											{uiText("Trang sau", "Next", "下一页")}
										</Button>
										<Tag>
											{partsMetaPage.page}
											/
											{Math.max(1, partsMetaPage.totalPages)}
										</Tag>
									</Space>
								</span>
							</div>
						)}
						{selectedPartIndex != null && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Nội dung PART", "PART content", "PART 内容")}</span>
								<span>
									{selectedPartLoading
										? uiText("Đang tải...", "Loading...", "加载中...")
										: `${uiText("PART", "PART", "PART")} ${selectedPartIndex}: ${selectedPartContent.slice(0, 180).replace(/\s+/g, " ")}${selectedPartContent.length > 180 ? "..." : ""}`}
								</span>
							</div>
						)}
						{modelDecisionTrace.length > 0 && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Luồng model", "Model trace", "模型路径")}</span>
								<span>
									{hiddenModelTraceCount > 0 && !showFullModelTrace && (
										<Tag>{uiText(`+${hiddenModelTraceCount} cũ`, `+${hiddenModelTraceCount} older`, `+${hiddenModelTraceCount} 条旧记录`)}</Tag>
									)}
									<Space size={4} wrap>
										{visibleModelDecisionTrace.map((trace) => {
											const color = trace.step === "primary"
												? "blue"
												: trace.step === "fallback"
													? "orange"
													: "green";
											const label = trace.step === "primary"
												? uiText("Primary", "Primary", "主模型")
												: trace.step === "fallback"
													? uiText("Fallback", "Fallback", "回退")
													: uiText("Final", "Final", "最终");
											const text = `${label}: ${trace.model}`;
											return (
												<Tooltip key={trace.id} title={trace.reason || text}>
													<Tag color={color}>{text}</Tag>
												</Tooltip>
											);
										})}
										<Button
											type="link"
											size="small"
											className={styles.compactToggleBtn}
											onClick={() => setShowFullModelTrace(prev => !prev)}
										>
											{showFullModelTrace
												? uiText("Thu gọn", "Compact", "收起")
												: uiText("Xem đầy đủ", "Expand", "展开")}
										</Button>
									</Space>
								</span>
							</div>
						)}
					</div>
				)}

				{/* Orchestration Preview Panel */}
				{showOrchPreview && (
					<div className={styles.usageDock} style={{ borderTop: "2px solid #722ed1" }}>
						<div className={styles.usageDockHeader}>
							<div className={styles.usageDockTitle} style={{ color: "#722ed1" }}>
								<ThunderboltOutlined style={{ marginRight: 4 }} />
								{uiText("Preview Orchestration", "Orchestration Preview", "编排预览")}
							</div>
							<Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setShowOrchPreview(false)} />
						</div>
						{orchPreviewLoading && (
							<div className={styles.progressDockSpinnerRow}>
								<Spin size="small" />
								<span style={{ marginLeft: 8, fontSize: 12 }}>{uiText("Đang phân tích...", "Analyzing...", "分析中...")}</span>
							</div>
						)}
						{!orchPreviewLoading && orchPreview && (
							<>
								<div className={styles.usageDockRow}>
									<span>{uiText("Routing tier", "Routing tier", "路由层级")}</span>
									<span>
										<Tag color="purple">{orchPreview.routingTier || "—"}</Tag>
										<Tag color="geekblue">{orchPreview.preferredModelHint || "—"}</Tag>
									</span>
								</div>
								<div className={styles.usageDockRow}>
									<span>{uiText("Tiết kiệm ký tự", "Chars saved", "节省字符数")}</span>
									<span>
										{orchPreview.totalCharsBefore.toLocaleString()}
										{" "}
										→
										{orchPreview.totalCharsAfter.toLocaleString()}
										{orchPreview.savedChars > 0 && (
											<Tag color="green" style={{ marginLeft: 4 }}>
												-
												{orchPreview.savedChars.toLocaleString()}
											</Tag>
										)}
									</span>
								</div>
								{orchPreview.speculativeExecuted && (
									<div className={styles.usageDockRow}>
										<span>{uiText("Speculative", "Speculative", "推测执行")}</span>
										<Tag color="cyan">{orchPreview.speculativeOperation}</Tag>
									</div>
								)}
								{Array.isArray(orchPreview.planSteps) && orchPreview.planSteps.length > 0 && (
									<div className={styles.usageDockRow} style={{ alignItems: "flex-start" }}>
										<span style={{ flexShrink: 0 }}>{uiText("Kế hoạch", "Plan steps", "计划步骤")}</span>
										<div style={{ fontSize: 11, lineHeight: 1.5 }}>
											{orchPreview.planSteps.map((step, i) => (
												<div key={i}>
													<span style={{ color: "#722ed1", marginRight: 4 }}>
														{i + 1}
														.
													</span>
													{step}
												</div>
											))}
										</div>
									</div>
								)}
								{orchPreview.compressedContextBlock && (
									<div className={styles.usageDockRow} style={{ alignItems: "flex-start" }}>
										<span style={{ flexShrink: 0 }}>{uiText("Context nén", "Compressed ctx", "压缩上下文")}</span>
										<pre style={{ fontSize: 10, maxHeight: 80, overflowY: "auto", background: "#1f1f1f", color: "#d4d4d4", padding: "4px 6px", borderRadius: 4, flex: 1, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
											{orchPreview.compressedContextBlock.slice(0, 600)}
											{orchPreview.compressedContextBlock.length > 600 ? "..." : ""}
										</pre>
									</div>
								)}
								{previewSources.length > 0 && (
									<div className={styles.usageDockRow} style={{ alignItems: "flex-start" }}>
										<span style={{ flexShrink: 0 }}>{uiText("Nguồn tham chiếu", "References", "参考来源")}</span>
										<div style={{ flex: 1, display: "grid", gap: 8 }}>
											{previewSources.map((src, idx) => (
												<div key={`${src.title}-${idx}`} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 8, background: "rgba(255,255,255,0.03)" }}>
													<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
														<Tag color="blue">#{idx + 1}</Tag>
														<span style={{ fontSize: 11, fontWeight: 600, wordBreak: "break-word" }}>{src.title}</span>
														{src.score && <Tag color="geekblue">score {src.score}</Tag>}
														{src.scope && <Tag color="cyan">{src.scope}</Tag>}
													</div>
													{src.path && (
														<button
															type="button"
															onClick={() => handleCitationNavigate(src.path || src.title)}
															style={{ fontSize: 10, opacity: 0.8, wordBreak: "break-all", textAlign: "left", padding: 0, border: 0, background: "transparent", color: "#91caff", cursor: "pointer" }}
														>
															{src.path}
														</button>
													)}
													{src.summary && <div style={{ fontSize: 10, opacity: 0.9, marginTop: 4 }}>{src.summary}</div>}
													{src.content && (
														<pre style={{ fontSize: 10, maxHeight: 90, overflowY: "auto", background: "#111827", color: "#e5e7eb", padding: "6px 8px", borderRadius: 4, marginTop: 6, marginBottom: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
															{src.content.slice(0, 320)}
															{src.content.length > 320 ? "..." : ""}
														</pre>
													)}
												</div>
											))}
										</div>
									</div>
								)}
								{visibleCitationTokens.length > 0 && (
									<div className={styles.usageDockRow} style={{ alignItems: "flex-start" }}>
										<span style={{ flexShrink: 0 }}>{uiText("Bằng chứng", "Evidence", "证据")}</span>
										<div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
											{visibleCitationTokens.map((token, idx) => (
												<Tag
													key={`${token}-${idx}`}
													color="gold"
													style={{ maxWidth: 280, marginInlineEnd: 0, whiteSpace: "normal", wordBreak: "break-word", cursor: onCitationNavigate ? "pointer" : "default" }}
													onClick={onCitationNavigate ? () => handleCitationNavigate(token) : undefined}
												>
													{token}
												</Tag>
											))}
											{assistantCitationTokens.length > visibleCitationTokens.length && (
												<Tag color="default">+{assistantCitationTokens.length - visibleCitationTokens.length}</Tag>
											)}
										</div>
									</div>
								)}
								{editorDiagnostics && (
									<div className={styles.usageDockRow} style={{ alignItems: "flex-start" }}>
										<span style={{ flexShrink: 0 }}>{uiText("Diagnostics", "Diagnostics", "诊断")}</span>
										<div style={{ flex: 1, display: "grid", gap: 6 }}>
											<Tag color={editorDiagnostics.valid ? "green" : "red"} style={{ width: "fit-content" }}>
												{editorDiagnostics.valid ? uiText("Hợp lệ", "Valid", "有效") : uiText("Có lỗi", "Has errors", "存在错误")}
											</Tag>
											{!editorDiagnostics.valid && editorDiagnostics.errors.length > 0 && (
												<div style={{ display: "grid", gap: 4 }}>
													<div style={{ fontSize: 11, fontWeight: 600, color: "#f5a623" }}>
														{uiText("Lỗi cú pháp", "Syntax Errors", "语法错误")}
														{" "}
														({editorDiagnostics.errors.length})
													</div>
													{editorDiagnostics.errors.slice(0, 3).map((error, idx) => (
														<div key={`${error}-${idx}`} style={{ fontSize: 10, lineHeight: 1.4, color: "#f87171", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
															• {error}
														</div>
													))}
												</div>
											)}
											{/* Show workspace diagnostics if available */}
											{(requestEditorMetadata as any)?.diagnostics?.workspaceDiagnostics?.length > 0 && (
												<div style={{ display: "grid", gap: 4, marginTop: 4 }}>
													<div style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa" }}>
														{uiText("Lỗi workspace", "Workspace Issues", "工作区问题")}
														{" "}
														({(requestEditorMetadata as any).diagnostics.workspaceDiagnostics.length})
													</div>
													{(requestEditorMetadata as any).diagnostics.workspaceDiagnostics.slice(0, 4).map((diag: any, idx: number) => (
														<div key={`diag-${idx}`} style={{ 
															fontSize: 10, 
															lineHeight: 1.4, 
															color: diag.severity === "error" ? "#f87171" : "#fbbf24",
															whiteSpace: "pre-wrap", 
															wordBreak: "break-word",
															borderLeft: `2px solid ${diag.severity === "error" ? "#ef4444" : "#f59e0b"}`,
															paddingLeft: 6
														}}>
															Line {diag.line + 1}: {diag.message}
														</div>
													))}
												</div>
											)}
										</div>
									</div>
								)}
							</>
						)}
					</div>
				)}

				{/* Input Area */}
				<div className={styles.inputArea}>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept=".json,.txt,.md,.js,.ts,.tsx,.jsx,.java,.sql,.css,.scss,.less,.html,.xml,.yml,.yaml,.csv,.py,.properties,.env,text/*,application/json"
						style={{ display: "none" }}
						onChange={(e) => {
							void appendFiles(e.target.files);
							e.currentTarget.value = "";
						}}
					/>
					<input
						ref={imageInputRef}
						type="file"
						multiple
						accept="image/*"
						style={{ display: "none" }}
						onChange={(e) => {
							void appendFiles(e.target.files);
							e.currentTarget.value = "";
						}}
					/>
					{pendingAttachments.length > 0 && (
						<div className={styles.pendingAttachmentWrap}>
							{pendingAttachments.map(attachment => (
								<div key={attachment.id} className={styles.pendingAttachmentItem}>
									{attachment.kind === "image" && attachment.previewUrl
										? (
											<img src={attachment.previewUrl} alt={attachment.name} className={styles.pendingAttachmentThumb} />
										)
										: (
											<Tag color={attachment.kind === "json" ? "processing" : "default"}>{attachment.kind.toUpperCase()}</Tag>
										)}
									<div className={styles.pendingAttachmentMeta}>
										<div>{attachment.name}</div>
										<div className={styles.attachmentSummary}>{attachment.summary}</div>
									</div>
									<Tooltip title={attachment.fullContext
										? uiText("Toàn bộ nội dung (click để tắt)", "Full content (click to disable)", "完整内容（点击关闭）")
										: uiText("Chỉ snippet (click để gửi toàn bộ)", "Snippet only (click to send full)", "仅片段（点击发送完整内容）")}
									>
										<Button
											type="text"
											size="small"
											style={{ color: attachment.fullContext ? "#52c41a" : undefined, fontSize: 11, padding: "0 4px" }}
											onClick={() => setPendingAttachments(prev => prev.map(a => a.id === attachment.id ? { ...a, fullContext: !a.fullContext } : a))}
										>
											{attachment.fullContext ? "FULL" : "RAG"}
										</Button>
									</Tooltip>
									<Button type="text" size="small" icon={<CloseOutlined />} onClick={() => removePendingAttachment(attachment.id)} />
								</div>
							))}
						</div>
					)}
					{renderMultiFileScopePanel()}
					<Space.Compact style={{ width: "100%" }}>
						<Input.TextArea
							value={inputValue}
							onChange={(e) => {
								const nextValue = e.target.value;
								setInputValue(nextValue);
								const shouldShowPalette = nextValue.trimStart().startsWith("/");
								setShowSlashCommandPalette(shouldShowPalette);
								if (!shouldShowPalette) {
									setSlashCommandIndex(0);
								}
								if (promptHistoryIndex !== -1) {
									setPromptHistoryIndex(-1);
									setPromptHistoryOriginal("");
								}
							}}
							onKeyPress={handleKeyPress}
							onKeyDown={handleInputKeyDown}
							placeholder={uiText(
								`Hỏi Trợ lý AI (${sendHintKey}+Enter để gửi). Lệnh: /phan-tich hoặc /sua`,
								`Ask AI Assistant (${sendHintKey}+Enter to send). Commands: /analyze or /edit`,
								`向 AI 助手提问（${sendHintKey}+Enter 发送）。命令：/分析 或 /编辑`,
							)}
							rows={3}
							maxLength={MAX_CHAT_INPUT_CHARS}
						/>
					</Space.Compact>
					{showSlashCommandPalette && filteredSlashCommands.length > 0 && (
						<div style={{ marginTop: 8, display: "grid", gap: 6, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 8, background: "rgba(15, 23, 42, 0.92)" }}>
							{filteredSlashCommands.slice(0, 5).map((item, idx) => (
								<button
									key={item.command}
									type="button"
									onClick={() => applySlashCommand(item.command)}
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										gap: 12,
										padding: "8px 10px",
										borderRadius: 6,
										border: idx === slashCommandIndex ? "1px solid #60a5fa" : "1px solid transparent",
										background: idx === slashCommandIndex ? "rgba(59,130,246,0.16)" : "transparent",
										color: "#e5e7eb",
										cursor: "pointer",
										textAlign: "left",
									}}
								>
									<span style={{ fontSize: 12, fontWeight: 600 }}>{item.command}</span>
									<span style={{ fontSize: 11, opacity: 0.8 }}>{item.description}</span>
								</button>
							))}
						</div>
					)}
					<div className={styles.buttonGroup}>
						<Tooltip title={uiText("Đính kèm file văn bản/JSON", "Attach text/JSON file", "附加文本/JSON 文件")}>
							<Button
								type="text"
								icon={<PaperClipOutlined />}
								onClick={() => fileInputRef.current?.click()}
							/>
						</Tooltip>
						<Tooltip title={uiText("Đính kèm hình ảnh", "Attach image", "附加图像")}>
							<Button
								type="text"
								icon={<FileImageOutlined />}
								onClick={() => imageInputRef.current?.click()}
							/>
						</Tooltip>
						<Tooltip title={uiText("Preview luồng orchestration (dev)", "Preview orchestration plan (dev)", "预览编排计划（开发）")}>
							<Button
								type="text"
								icon={<ThunderboltOutlined />}
								onClick={() => void handleOrchPreview()}
								disabled={isLoading || orchPreviewLoading}
								loading={orchPreviewLoading}
								style={{ color: showOrchPreview ? "#722ed1" : undefined }}
							/>
						</Tooltip>
						{isLoading && (
							<Button
								danger
								icon={<CloseOutlined />}
								onClick={handleCancelRequest}
							>
								{uiText("Hủy", "Cancel", "取消")}
							</Button>
						)}
						{canUndoLastEdit && !isLoading && onCodeInsert && (
							<Button
								type="default"
								icon={<UndoOutlined />}
								onClick={() => {
									if (undoSnapshotRef.current) {
										onCodeInsert(undoSnapshotRef.current);
										setCanUndoLastEdit(false);
										message.info(uiText("Đã hoàn tác thay đổi", "Edit undone", "已撤销编辑"));
									}
								}}
							>
								{uiText("Hoàn tác", "Undo edit", "撤销编辑")}
							</Button>
						)}
						<Button
							type="primary"
							icon={<SendOutlined />}
							onClick={handleSend}
							disabled={isLoading || (!inputValue.trim() && pendingAttachments.length === 0)}
						>
							{uiText("Gửi", "Send", "发送")}
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
