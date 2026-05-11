import { AI_TIMEOUT_MS } from "#src/api/ai";
import { searchBusinessMemory } from "#src/api/ai/assistant-engine";
import { extractCodeBlocks, extractLatestOpenCodeBlock } from "#src/pages/system/developer/codeUtils";
import { request } from "#src/utils";
import {
	BgColorsOutlined,
	BulbOutlined,
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

interface AgenticStep {
	id: string
	stage: string
	icon: string
	label: string
	detail?: string
	status: "running" | "done"
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

interface StructuredAssistantPayload {
	summary: string
	code: string
	changes: string[]
}

interface AiAssistantStageEvent {
	id: string
	stage: string
	status?: string
	model?: string
	requestId?: string
	scopeMask?: number
	scopeSummary?: string
	scopeTags?: string[]
	queueState?: string
	dynamicSource?: string
	prunedSources?: number
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
	timestamp: number
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

	type CompletionState = "idle" | "done" | "stream_closed" | "error" | "cancelled";

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

interface AiAssistantChatProps {
	appId: string
	currentCode?: string
	language?: "javascript" | "html" | "python" | "java" | "css" | "sql" | "json"
	contextType?: "code" | "menu_json"
	targetPName?: string
	targetPType?: number
	editorMetadata?: Record<string, unknown>
	onCodeInsert?: (code: string) => void
	onUserMessage?: (payload: AiAssistantUserMessagePayload) => void
	autoApplyCodeBlock?: boolean
	autoApplyPreferenceKey?: string
	onAutoApplyChange?: (enabled: boolean) => void
}

const CHAT_HISTORY_KEY = "codeeditor.aiassistant.chat.v1";
const LEGACY_CHAT_HISTORY_KEY = "codeeditor.copilot.chat.v1";
const PROMPT_HISTORY_KEY_PREFIX = "codeeditor.aiassistant.promptHistory.v1";
const BUSINESS_MEMORY_ENABLED_KEY = "aiassistant.businessMemory.enabled";
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
const SHOW_DETAILED_PROGRESS_TIMELINE = false;
const COMPACT_STAGE_EVENTS = 4;
const COMPACT_MODEL_TRACE = 1;
const DONE_DOCK_AUTO_COLLAPSE_MS = 3500;
const DONE_USAGE_DOCK_AUTO_HIDE_MS = 6500;
const PROGRESS_WATCHDOG_SILENCE_MS = 15_000;
const PROGRESS_WATCHDOG_TICK_MS = 3_000;
const PROGRESS_WATCHDOG_ALERT_INTERVAL_MS = 30_000;
const PROGRESS_EVENT_AGE_TICK_MS = 2_000;
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

function normalizeAssistantDisplayText(raw: unknown): string {
	const text = String(raw || "").trim();
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

	const conversationalJsonText = normalizeConversationalJsonAnswer(text);
	return normalizeBrokenListLineBreaks(conversationalJsonText || text);
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
		/\b(sua|chinh|chỉnh|update|modify|refactor|rewrite|fix|implement|generate|tao|tạo|viet|viết|chen|chèn|apply|patch|replace|doi|đổi)\b/i,
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

function getChatHistory(): ChatMessage[] {
	try {
		const stored = localStorage.getItem(CHAT_HISTORY_KEY)
		  ?? localStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
		return stored ? dedupeChatMessages(JSON.parse(stored)) : [];
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
	onUserMessage,
}: AiAssistantChatProps) {
	const { i18n } = useTranslation();
	const shouldHideCodeInChat = Boolean(onCodeInsert);
	const [messages, setMessages] = useState<ChatMessage[]>(getChatHistory());
	const [inputValue, setInputValue] = useState("");
	const [promptHistory, setPromptHistory] = useState<string[]>([]);
	const [promptHistoryIndex, setPromptHistoryIndex] = useState(-1);
	const [promptHistoryOriginal, setPromptHistoryOriginal] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [pendingAttachments, setPendingAttachments] = useState<AiAssistantAttachment[]>([]);
	const [stageEvents, setStageEvents] = useState<AiAssistantStageEvent[]>([]);
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
	const [isUsageDockVisible, setIsUsageDockVisible] = useState(true);
	const [orchPreview, setOrchPreview] = useState<OrchestrationPreviewResult | null>(null);
	const [orchPreviewLoading, setOrchPreviewLoading] = useState(false);
	const [showOrchPreview, setShowOrchPreview] = useState(false);
	const [businessMemoryEnabled, setBusinessMemoryEnabled] = useState<boolean>(() => {
		try { return localStorage.getItem(BUSINESS_MEMORY_ENABLED_KEY) !== "false"; }
		catch { return true; }
	});
	const [bmSearching, setBmSearching] = useState(false);
	const [agenticSteps, setAgenticSteps] = useState<AgenticStep[]>([]);
	const [agenticStepsCollapsed, setAgenticStepsCollapsed] = useState(false);
	const [streamRequestId, setStreamRequestId] = useState("");
	const [streamJobId, setStreamJobId] = useState("");
	const [completionState, setCompletionState] = useState<CompletionState>("idle");
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
	const [lastProgressEventAgeSecs, setLastProgressEventAgeSecs] = useState(0);
	const [backendProgressHint, setBackendProgressHint] = useState<{ stage: string, detail: string }>({ stage: "", detail: "" });
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
	const lastRealtimeApplyAtRef = useRef<number>(0);
	const followBottomRef = useRef<boolean>(true);
	const scrollFrameRef = useRef<number | null>(null);
	const lastSmoothScrollAtRef = useRef<number>(0);
	const turnAllowAutoApplyRef = useRef<boolean>(false);
	const localFlowVerifiedRef = useRef<boolean>(false);
	const stageEventSignaturesRef = useRef<Set<string>>(new Set());
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

		return merged;
	}, [editorMetadata, targetPName, targetPType, language, contextType, currentCode]);

	const uiText = useCallback((vi: string, en: string, zh: string) => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh"))
			return zh;
		if (lang.startsWith("en"))
			return en;
		return vi;
	}, [i18n.language, i18n.resolvedLanguage]);

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
			for (let i = 0; i < turns.length; i += 1) {
				const turn = turns[i] || {};
				const turnId = String(turn.turn_id || turn.id || "").trim();
				const parsedTime = Date.parse(String(turn.timestamp || ""));
				const baseTs = Number.isFinite(parsedTime) ? parsedTime : Date.now() - Math.max(0, turns.length - i) * 1000;
				const userText = String(turn.user_message || turn.userRequest || "").trim();
				const assistantRaw = String(turn.assistant_message || turn.ai_response || turn.aiResponse || "").trim();
				const assistantText = normalizeAssistantDisplayText(assistantRaw);
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
					const rawRating = Number(turn.feedback_rating);
					const feedbackRating = Number.isFinite(rawRating)
						? Math.max(-1, Math.min(1, rawRating))
						: 0;
					const hideCodeBlocks = shouldHideCodeInChat && responseMode === "edit";
					const codeBlocks = hideCodeBlocks ? [] : extractCodeBlocks(assistantText);
					converted.push({
						id: `${turnId || `turn_${i}`}_a`,
						serverTurnId: turnId || undefined,
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
				return;
			}

			if (turns.length === 0) {
				setMessages([]);
				saveChatHistory([]);
			}
		}
		catch {
			if (showErrorToast) {
				message.warning(uiText("Không tải được lịch sử chat từ server", "Could not load chat history from server", "无法从服务器加载聊天历史"));
			}
		}
	}, [appId, contextType, language, shouldHideCodeInChat, targetPName, targetPType, uiText]);

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
		void loadRemoteSessionHistory(false);
	}, [loadRemoteSessionHistory]);

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
		if (completionState === "done") {
			setIsUsageDockVisible(true);
			const timer = window.setTimeout(() => {
				setIsUsageDockVisible(false);
			}, DONE_USAGE_DOCK_AUTO_HIDE_MS);
			return () => window.clearTimeout(timer);
		}
		if (completionState === "stream_closed" || completionState === "error" || completionState === "cancelled") {
			setIsUsageDockVisible(true);
			return;
		}
		if (completionState === "idle") {
			setIsUsageDockVisible(true);
		}
	}, [completionState]);

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
		case "scope_reasoning":
			return uiText("Suy luận theo phạm vi", "Scope reasoning", "范围推理");
		case "dynamic_ingestion":
			return uiText("Nạp bộ nhớ động", "Dynamic ingestion", "动态入库");
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
	if (normalizedStage === "scope_reasoning")
		return "preparing";
	if (normalizedStage === "dynamic_ingestion")
		return "chunking";
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
		const rangeLabel = extractStageRangeLabel(data);
		const hasValue = stage || msg || messageKey || detail || detailKey || orchestrationPhase || orchestrationPhaseKey || Number.isFinite(Number(data?.percent)) || Number.isFinite(Number(data?.overallPercent)) || Boolean(rangeLabel);
		if (!hasValue)
			return;

		const overallPercentNum = Number(data?.overallPercent);
		const percentNum = Number(data?.percent);
		const currentNum = Number(data?.current);
		const totalNum = Number(data?.total);
		const signature = [
			stage.toLowerCase(),
			status.toLowerCase(),
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
			rangeLabel || "",
		].join("|");

		if (stageEventSignaturesRef.current.has(signature))
			return;
		stageEventSignaturesRef.current.add(signature);

		const nextEvent = {
			id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			stage: stage || "processing",
			status: status || undefined,
			model: model || undefined,
			requestId: requestId || undefined,
			scopeMask: Number.isFinite(scopeMaskNum) ? scopeMaskNum : undefined,
			scopeSummary: scopeSummary || undefined,
			scopeTags: scopeTags.length > 0 ? scopeTags : undefined,
			queueState: queueState || undefined,
			dynamicSource: dynamicSource || undefined,
			prunedSources: Number.isFinite(prunedSourcesNum) ? prunedSourcesNum : undefined,
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
			const last = prev[prev.length - 1];
			if (last) {
				const lastPercent = Number.isFinite(Number(last.overallPercent))
					? Number(last.overallPercent)
					: (Number.isFinite(Number(last.percent)) ? Number(last.percent) : undefined);
				const nextPercent = Number.isFinite(Number(nextEvent.overallPercent))
					? Number(nextEvent.overallPercent)
					: (Number.isFinite(Number(nextEvent.percent)) ? Number(nextEvent.percent) : undefined);
				const sameCoreSignal = String(last.stage || "").toLowerCase() === String(nextEvent.stage || "").toLowerCase()
					&& String(last.messageKey || "") === String(nextEvent.messageKey || "")
					&& String(last.detailKey || "") === String(nextEvent.detailKey || "")
					&& String(last.orchestrationPhaseKey || "") === String(nextEvent.orchestrationPhaseKey || "")
					&& String(last.requestId || "") === String(nextEvent.requestId || "")
					&& String(last.rangeLabel || "") === String(nextEvent.rangeLabel || "")
					&& String(last.message || "") === String(nextEvent.message || "")
					&& String(last.detail || "") === String(nextEvent.detail || "");
				const samePercent = (lastPercent == null && nextPercent == null) || lastPercent === nextPercent;
				if (sameCoreSignal && samePercent) {
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
			parts.push(uiText(
				`trạng thái ${formatQueueStateLabel(state)}`,
				`state ${state}`,
				`状态 ${state}`,
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
		}
		return "";
	}, [buildDynamicIngestionParts, formatScopeReasoningLabel, stageEvents, uiText]);

	const liveOrchestrationBadge = useMemo((): { label: string, tone: "scope" | "queued" | "indexed" } | null => {
		for (let i = stageEvents.length - 1; i >= 0; i -= 1) {
			const event = stageEvents[i];
			if (!event)
				continue;
			const eventStage = String(event.stage || "").trim().toLowerCase();
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

		const nextText = String(streamingMessageRef.current || "");
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

	const applyRealtimeCodeFromText = useCallback((rawText: string, force = false): boolean => {
		if (!turnAllowAutoApplyRef.current || !localFlowVerifiedRef.current || !onCodeInsert)
			return false;
		const source = String(rawText || "");
		let nextCode = "";
		if (contextType === "menu_json") {
			nextCode = extractMenuDraftForEditor(source);
		}
		else {
			const structuredPayload = parseStructuredAssistantPayload(source);
			if (structuredPayload?.code) {
				nextCode = structuredPayload.code;
			}
			// Handle textEdits-only response: backend returned patch array without full code.
			if (!nextCode && currentCode) {
				const rawEdits = parseTextEditsOnlyPayload(source);
				if (rawEdits) {
					const validation = validateStructuredTextEdits(currentCode, rawEdits);
					if (validation.valid && validation.edits.length > 0) {
						nextCode = applyTextEditsToDraft(currentCode, validation.edits);
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

		onCodeInsert(nextCode);
		lastAppliedCodeRef.current = nextCode;
		lastRealtimeApplyAtRef.current = now;
		return true;
	}, [contextType, currentCode, onCodeInsert, pickPreferredCodeBlock]);

	useEffect(() => {
		applyRealtimeCodeFromTextRef.current = applyRealtimeCodeFromText;
	}, [applyRealtimeCodeFromText]);

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
			// Backend classifier handles responseMode routing - don't infer frontend
			const responseMode: ResponseMode = "analyze";
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
					taskType: responseMode,
					responseMode,
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
			// Business Memory auto-inject: search relevant knowledge before sending
			let bmAttachments: AiAssistantAttachment[] = [];
			if (businessMemoryEnabled) {
				try {
					setBmSearching(true);
					const bmHits = await searchBusinessMemory({ appId, q: cleanedMessage || normalizedText, k: 4 });
					bmAttachments = bmHits
						.filter(hit => Number(hit.score) > 0.05)
						.slice(0, 4)
						.map(hit => ({
							id: `bm_${hit.chunkId}`,
							name: hit.sourceName,
							mimeType: "text/markdown",
							size: hit.content.length,
							kind: "text" as const,
							contextRole: "business_logic" as const,
							authoritative: true,
							summary: hit.summary,
							textContent: hit.content,
							fullContext: true,
						}));
				}
				catch {
					// Silent fallback: business memory unavailable does not block chat
				}
				finally {
					setBmSearching(false);
				}
			}
			const outgoingAttachments = [...bmAttachments, ...pendingAttachments];
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

			// Default behavior:
			// - normal route: analyze-first
			// - local-plan route: edit-first so streamed local patch can auto-apply
			const requestedResponseMode: ResponseMode = useLocalPlanRoute
				? (modeDirective.overrideMode ?? "edit")
				: (modeDirective.overrideMode ?? "analyze");

			// Add placeholder for assistant response
			const assistantMsg: ChatMessage = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				messageType: "response",
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
			setAgenticStepsCollapsed(false);
			setAiUsageSummary(prev => ({ ...prev, turn: null }));
			setModelDecisionTrace([]);
			setShowFullTimeline(false);
			setShowFullModelTrace(false);
			setShowMiniProgress(true);
			setIsProgressDockCollapsed(false);
			setIsUsageDockVisible(true);
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
			setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
			setBackendProgressHint({ stage: "", detail: "" });
			setLastProgressEventAgeSecs(0);
			lastProgressEventAtRef.current = 0;
			lastProgressWatchdogAlertAtRef.current = 0;
			stageEventSignaturesRef.current = new Set();
			followBottomRef.current = true;
			streamingMessageRef.current = "";
			pendingStreamChunkRef.current = "";
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
						responseMode: requestedResponseMode,
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
								}
								else if (mode === "analyze") {
									turnAllowAutoApplyRef.current = false;
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
								setStreamRequestId(String(evt.requestId));
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
							else if (evt.stage === "streaming" && evt.chunk) {
								pendingStreamChunkRef.current += evt.chunk;
								scheduleStreamFlush();
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
								const localFlowVerified = Boolean(
									evt.flowConfirmedByLocal === true
									|| (evt.localProviderPrimaryUsed === true && isMainFlow),
								);
								localFlowVerifiedRef.current = localFlowVerified && isEditModeEvt;

								if (localFlowVerifiedRef.current) {
									let opSummary = { addCount: 0, editCount: 0, deleteCount: 0 };
									if (effectiveContextType === "code") {
										const candidateEdits = Array.isArray(evt.textEdits) && evt.textEdits.length > 0
											? evt.textEdits
											: parseTextEditsOnlyPayload(evt.fullResponse || "") || [];
										opSummary = summarizeTextEditOperations(candidateEdits);
										setLocalFlowOpLines(buildCodeOperationPreviewLines(currentCode, candidateEdits, 20));
									}
									else if (effectiveContextType === "menu_json") {
										opSummary = summarizeMenuOperations(currentCode, evt.fullResponse || "");
										setLocalFlowOpLines([]);
									}
									setLocalFlowOps({
										verified: true,
										flow: effectiveContextType as "code" | "menu_json",
										addCount: opSummary.addCount,
										editCount: opSummary.editCount,
										deleteCount: opSummary.deleteCount,
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
								setGeminiProgress({ phase: "idle", percent: 100, message: uiText("Hoàn thành", "Completed", "已完成"), estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
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
								if (evt.fullResponse) {
									streamingMessageRef.current = evt.fullResponse;
									pendingStreamChunkRef.current = "";
								}
								else if (useLocalPlanRoute && evt.result) {
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
								if (String(evt.responseMode || "").trim().toLowerCase() === "edit") {
									turnAllowAutoApplyRef.current = true;
								}
								if (evt.promptTruncatedByCharCap === true) {
									message.warning(uiText(
										"Prompt đã bị cắt theo ngưỡng, kết quả có thể thiếu một phần menu lớn",
										"Prompt was truncated by budget, large menu output may be incomplete",
										"提示已按预算裁剪，大型菜单结果可能不完整",
									));
								}
								flushStreamingToUI(true);
								if (evt.fullResponse) {
									// Force final apply after backend settles mode to avoid debounce race.
									applyRealtimeCodeFromText(evt.fullResponse, true);
								}
								setCompletionState("done");
								setIsLoading(false);
								if (sseAbortRef.current === controller) {
									sseAbortRef.current = null;
								}
								turnAllowAutoApplyRef.current = false;
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
									String(streamingMessageRef.current || "")
									+ String(pendingStreamChunkRef.current || "")
								).trim().length > 0;
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
					if (!streamingMessageRef.current) {
						const fallbackJobId = String(effectiveStreamJobId || "").trim();
						if (fallbackJobId) {
							const hydrated = await hydrateFromPersistedParts(fallbackJobId);
							if (hydrated) {
								void loadStreamPartsMeta(fallbackJobId, 1, 20);
							}
						}
					}
					flushStreamingToUI(true);
					const hasDeliveredContent = String(streamingMessageRef.current || "").trim().length > 0;
					setCompletionState(hasDeliveredContent ? "done" : "stream_closed");
					setCompletionMetrics({
						elapsedMs: Math.max(0, Date.now() - requestStartedAtRef.current),
						outputChars: streamingMessageRef.current.length,
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
		[appId, contextType, currentCode, isLoading, language, normalizeAssistantProgressMessage, normalizeUsagePayload, onUserMessage, onCodeInsert, pendingAttachments, targetPName, targetPType, requestEditorMetadata, uiText, formatModelDecisionReason, formatSystemNotice, resolveSystemNextStep, showSystemToast, appendStageEvent, appendModelDecisionTrace, applyRealtimeCodeFromText, flushStreamingToUI, scheduleStreamFlush, scrollToBottom, promptHistoryStorageKey, setAssistantLiveStatus, formatStageLabel, renderProgressText],
	);

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
	}, [handleSend, inputValue, promptHistory, promptHistoryIndex, promptHistoryOriginal]);

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
		setIsUsageDockVisible(true);
		setIsLoading(false);
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
																<span style={{ fontSize: 11, color: step.status === "done" ? "#52c41a" : "#722ed1", flexShrink: 0, lineHeight: "15px" }}>
																	{step.status === "done" ? "\u2713" : "\u2026"}
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
																			<Button
																				type="text"
																				size="small"
																				icon={<BgColorsOutlined />}
																				onClick={() =>
																					handleInsertCode(block.code)}
																				title={uiText("Chèn vào editor", "Insert into editor", "插入到编辑器")}
																			/>
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
						{!isProgressDockCollapsed && agenticSteps.length >= 2 && (
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
								{!agenticStepsCollapsed && (
									<div className={styles.stageTimelineList}>
										{agenticSteps.map(step => (
											<div key={step.id} className={styles.stageTimelineItem}>
												<span className={styles.stageTimelineBullet} />
												<div className={styles.stageTimelineText}>
													<div className={styles.stageTimelineHead}>
														<span>{`${step.icon} ${step.label}`}</span>
														<span>{step.status === "done" ? "✓" : "…"}</span>
													</div>
													{step.detail && (
														<div className={styles.stageTimelineMessage}>{step.detail}</div>
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

				{isUsageDockVisible && (aiUsageSummary.turn || aiUsageSummary.sessionTokens > 0 || completionState === "stream_closed" || completionState === "error" || completionState === "cancelled") && (
					<div className={[
						styles.usageDock,
						completionState === "stream_closed" ? styles.usageDock_streamClosed : "",
						completionState === "error" ? styles.usageDock_error : "",
					].filter(Boolean).join(" ")}
					>
						<div className={styles.usageDockHeader}>
							<div className={styles.usageDockTitle}>
								{uiText("Theo dõi chi phí AI", "AI Cost Tracking", "AI 成本跟踪")}
							</div>
							<div className={styles.usageDockBadges}>
								{completionStateLabel && (
									<Tooltip title={completionDetailTooltip || completionStateLabel}>
										<Tag color={completionState === "done" ? "green" : completionState === "stream_closed" ? "gold" : completionState === "error" ? "red" : completionState === "cancelled" ? "orange" : "default"}>
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
						{aiUsageSummary.turn && (
							<div className={styles.usageDockRow}>
								<span>{uiText("Lượt này", "This turn", "本轮")}</span>
								<span>
									{aiUsageSummary.turn.enabled
										? `${formatCost(aiUsageSummary.turn.estimatedCostUsd)} · ${aiUsageSummary.turn.totalTokens.toLocaleString()} tokens`
										: uiText("Đã tắt", "Disabled", "已关闭")}
								</span>
							</div>
						)}
						<div className={styles.usageDockRow}>
							<span>{uiText("Tổng phiên", "Session total", "会话总计")}</span>
							<span>
								{formatCost(aiUsageSummary.sessionCostUsd)}
								{" "}
								·
								{" "}
								{aiUsageSummary.sessionTokens.toLocaleString()}
								{" "}
								tokens
							</span>
						</div>
						{aiUsageSummary.turn?.model && (
							<div className={styles.usageDockModel}>
								{uiText("Model", "Model", "模型")}
								:
								{aiUsageSummary.turn.model}
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
					<Space.Compact style={{ width: "100%" }}>
						<Input.TextArea
							value={inputValue}
							onChange={(e) => {
								setInputValue(e.target.value);
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
						<Tooltip title={uiText(
							businessMemoryEnabled
								? "Bộ nhớ nghiệp vụ BẬT — AI tự động tra cứu tài liệu nghiệp vụ trước mỗi câu hỏi"
								: "Bộ nhớ nghiệp vụ TẮT — Click để bật tra cứu tài liệu nghiệp vụ",
							businessMemoryEnabled
								? "Business Memory ON — AI auto-searches knowledge base before each message"
								: "Business Memory OFF — Click to enable knowledge base lookup",
							businessMemoryEnabled ? "业务记忆已开启" : "业务记忆已关闭",
						)}
						>
							<Button
								type="text"
								icon={<BulbOutlined />}
								loading={bmSearching}
								onClick={() => {
									const next = !businessMemoryEnabled;
									setBusinessMemoryEnabled(next);
									try { localStorage.setItem(BUSINESS_MEMORY_ENABLED_KEY, String(next)); }
									catch { /* ignore */ }
									message.info(next
										? uiText("Đã bật tra cứu nghiệp vụ", "Business memory enabled", "业务记忆已开启")
										: uiText("Đã tắt tra cứu nghiệp vụ", "Business memory disabled", "业务记忆已关闭"),
									);
								}}
								style={{ color: businessMemoryEnabled ? "#52c41a" : undefined }}
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
