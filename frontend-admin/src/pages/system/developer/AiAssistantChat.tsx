import { useState, useEffect, useRef, useCallback } from "react";
import { Button, Input, Card, Space, Empty, Spin, Tooltip, Tag, Switch, message } from "antd";
import {
	SendOutlined,
	CopyOutlined,
	ClearOutlined,
	BgColorsOutlined,
	PaperClipOutlined,
	FileImageOutlined,
	CloseOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "#src/store/auth";
import { extractCodeBlocks, extractLatestOpenCodeBlock } from "#src/pages/system/developer/codeUtils";
import styles from "./AiAssistantChat.module.css";

export type AiAssistantAttachment = {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	kind: "text" | "json" | "image";
	contextRole?: "system_requirement" | "legacy_json" | "business_logic" | "reference_code" | "general_text";
	authoritative?: boolean;
	summary: string;
	textContent?: string;
	dataUrl?: string;
	previewUrl?: string;
	/** When true the entire file content is injected instead of snippet-based RAG */
	fullContext?: boolean;
};

export type AiAssistantUserMessagePayload = {
	message: string;
	attachments: AiAssistantAttachment[];
};

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	messageType?: "response" | "debug";
	content: string;
	timestamp: number;
	codeBlocks?: CodeBlock[];
	attachments?: Array<Pick<AiAssistantAttachment, "id" | "name" | "mimeType" | "size" | "kind" | "summary" | "previewUrl">>;
};

type CodeBlock = {
	language: string;
	code: string;
	index: number;
};

type ResponseMode = "analyze" | "edit";

type AiAssistantStageEvent = {
	id: string;
	stage: string;
	message: string;
	messageKey?: string;
	messageArgs?: Record<string, any>;
	detail?: string;
	detailKey?: string;
	detailArgs?: Record<string, any>;
	orchestrationPhase?: string;
	orchestrationPhaseKey?: string;
	overallPercent?: number;
	percent?: number;
	current?: number;
	total?: number;
	rangeLabel?: string;
	timestamp: number;
};

type AiAssistantChatProps = {
	appId: string;
	currentCode?: string;
	language?: "javascript" | "html" | "python" | "java" | "css" | "sql" | "json";
	contextType?: "code" | "menu_json";
	targetPName?: string;
	targetPType?: number;
	onCodeInsert?: (code: string) => void;
	onUserMessage?: (payload: AiAssistantUserMessagePayload) => void;
	autoApplyCodeBlock?: boolean;
	autoApplyPreferenceKey?: string;
	onAutoApplyChange?: (enabled: boolean) => void;
};

const CHAT_HISTORY_KEY = "codeeditor.aiassistant.chat.v1";
const LEGACY_CHAT_HISTORY_KEY = "codeeditor.copilot.chat.v1";
const CHAT_STORAGE_LIMIT = 20;
const MAX_ATTACHMENTS = 8;
const MAX_TEXT_ATTACHMENT_CHARS = 800000;
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
const STREAM_UI_FLUSH_MS = 48;
const STREAM_CODEBLOCK_PARSE_MS = 240;
const AUTO_APPLY_PREF_KEY = "aiassistant.autoApply";
const LEGACY_AUTO_APPLY_PREF_KEY = "copilot.autoApply";
const MAX_CHAT_INPUT_CHARS = 20000;
const MAX_STRUCTURED_TEXT_EDITS = 160;
const MAX_STRUCTURED_REPLACEMENT_CHARS = 800000;
const TEXT_FILE_EXTENSIONS = new Set([
	"txt", "md", "markdown", "json", "js", "ts", "tsx", "jsx", "java", "sql", "css", "scss", "less",
	"html", "xml", "yml", "yaml", "csv", "py", "properties", "env", "log", "ini",
]);

function sanitizeHistoryMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages.slice(-CHAT_STORAGE_LIMIT).map((msg) => ({
		...msg,
		attachments: Array.isArray(msg.attachments)
			? msg.attachments.map((attachment) => ({
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
	contextRole: NonNullable<AiAssistantAttachment["contextRole"]>;
	authoritative: boolean;
	defaultFullContext: boolean;
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
	if (file.type.startsWith("text/")) return true;
	if (["application/json", "application/xml"].includes(file.type)) return true;
	return TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

function summarizeAttachmentText(text: string, maxLength = 180): string {
	const compact = String(text || "").replace(/\s+/g, " ").trim();
	if (!compact) return "";
	return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}

function summarizeFileContent(file: File, textContent: string): string {
	const ext = getFileExtension(file.name);
	if (ext === "json") {
		try {
			const parsed = JSON.parse(textContent);
			if (Array.isArray(parsed)) return `JSON array (${parsed.length} items)`;
			if (parsed && typeof parsed === "object") return `JSON object (${Object.keys(parsed).length} keys)`;
		} catch {
			return summarizeAttachmentText(textContent);
		}
	}
	return summarizeAttachmentText(textContent);
}

function createAttachmentId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveAutoApplyStorageKey(preferenceKey?: string): string {
	const suffix = String(preferenceKey || "default").trim() || "default";
	return `${AUTO_APPLY_PREF_KEY}:${suffix}`;
}

function resolveLegacyAutoApplyStorageKey(preferenceKey?: string): string {
	const suffix = String(preferenceKey || "default").trim() || "default";
	return `${LEGACY_AUTO_APPLY_PREF_KEY}:${suffix}`;
}

function loadAutoApplyPreference(preferenceKey: string | undefined, fallback: boolean): boolean {
	try {
		const raw = localStorage.getItem(resolveAutoApplyStorageKey(preferenceKey))
			?? localStorage.getItem(resolveLegacyAutoApplyStorageKey(preferenceKey));
		if (raw == null) return fallback;
		return raw === "1" || raw === "true";
	} catch {
		return fallback;
	}
}

function saveAutoApplyPreference(preferenceKey: string | undefined, value: boolean) {
	try {
		localStorage.setItem(resolveAutoApplyStorageKey(preferenceKey), value ? "1" : "0");
	} catch {
		// ignore localStorage write failures
	}
}

function extractMenuDraftForEditor(raw: unknown): string {
	const text = String(raw || "").trim();
	if (!text) return "";

 const parseMenuPayload = (candidate: string): string => {
	const value = String(candidate || "").trim();
	if (!value) return "";
	try {
	 const parsed = JSON.parse(value);
	 if (Array.isArray(parsed)) {
		return JSON.stringify({ menu: parsed }, null, 2);
	 }
	 if (parsed && typeof parsed === "object") {
		const obj = parsed as Record<string, unknown>;
		if (Array.isArray(obj.menu)) {
		 return JSON.stringify({ ...obj, menu: obj.menu }, null, 2);
		}
		if (obj.data && typeof obj.data === "object" && Array.isArray((obj.data as any).menu)) {
		 return JSON.stringify({ menu: (obj.data as any).menu }, null, 2);
		}
	 }
	} catch {
	 return "";
	}
	return "";
 };

 const direct = parseMenuPayload(text);
 if (direct) return direct;

 const strippedFence = text
	.replace(/^```(?:json)?\s*/i, "")
	.replace(/\s*```$/i, "")
	.trim();
 const stripped = parseMenuPayload(strippedFence);
 if (stripped) return stripped;

 const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
 let match: RegExpExecArray | null;
 while ((match = fenceRegex.exec(text)) !== null) {
	const fromFence = parseMenuPayload(match[1]);
	if (fromFence) return fromFence;
 }

	try {
	// Fallback: locate the first JSON object in mixed text and attempt parse.
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start >= 0 && end > start) {
	 return parseMenuPayload(text.slice(start, end + 1));
	}
	} catch {
		return "";
	}
	return "";
}

function applyTextEditsToDraft(baseText: string, textEdits: any[]): string {
	if (!Array.isArray(textEdits) || textEdits.length === 0) return baseText;
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

function validateStructuredTextEdits(baseText: string, textEdits: any[]): { valid: boolean; reason?: string; edits: any[] } {
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

function summarizeChecklistForConfirm(rawChecklist: any): string {
	if (!rawChecklist) return "";
	if (typeof rawChecklist === "string") return rawChecklist.trim();
	if (typeof rawChecklist !== "object") return "";
	const checklist = rawChecklist as Record<string, any>;
	const goal = String(checklist.goal || checklist.muc_tieu || "").trim();
	const scope = String(checklist.scope || checklist.pham_vi || "").trim();
	const assumptions = Array.isArray(checklist.assumptions) ? checklist.assumptions.map((x) => String(x || "").trim()).filter(Boolean) : [];
	const risks = Array.isArray(checklist.risks) ? checklist.risks.map((x) => String(x || "").trim()).filter(Boolean) : [];
	const parts: string[] = [];
	if (goal) parts.push(`Goal: ${goal}`);
	if (scope) parts.push(`Scope: ${scope}`);
	if (assumptions.length) parts.push(`Assumptions: ${assumptions.slice(0, 4).join("; ")}`);
	if (risks.length) parts.push(`Risks: ${risks.slice(0, 4).join("; ")}`);
	return parts.join("\n").trim();
}

function hasEditIntent(input: string): boolean {
	const text = String(input || "").trim().toLowerCase();
	if (!text) return false;
	const patterns = [
		/\b(sua|chinh|chỉnh|update|modify|refactor|rewrite|fix|implement|generate|tao|tạo|viet|viết|chen|chèn|apply|patch|replace|doi|đổi)\b/i,
		/\b(add|remove|delete|insert|edit|code|json|schema|menu)\b/i,
		/(修改|更新|重写|修复|生成|插入|替换|代码|菜单|json)/i,
	];
	return patterns.some((pattern) => pattern.test(text));
}

function normalizeDirectiveToken(raw: string): string {
	return String(raw || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/_/g, "-");
}

function parseResponseModeDirective(input: string): { cleanedMessage: string; overrideMode?: ResponseMode } {
	const text = String(input || "").trim();
	if (!text.startsWith("/")) {
		return { cleanedMessage: text };
	}

	const match = text.match(/^\/([^\s:]+)\s*:?[\s\n]*(.*)$/s);
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

const getChatHistory = (): ChatMessage[] => {
	try {
		const stored = localStorage.getItem(CHAT_HISTORY_KEY)
			?? localStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
};

const saveChatHistory = (messages: ChatMessage[]) => {
	try {
		const limited = sanitizeHistoryMessages(messages);
		localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limited));
	} catch (error) {
		console.error("Failed to save chat history:", error);
	}
};

export default function AiAssistantChat({
	appId,
	currentCode = "",
	language = "javascript",
	contextType = "code",
	targetPName,
	targetPType,
	onCodeInsert,
	onUserMessage,
	autoApplyCodeBlock = false,
	autoApplyPreferenceKey,
	onAutoApplyChange,
}: AiAssistantChatProps) {
	const { i18n } = useTranslation();
	const [messages, setMessages] = useState<ChatMessage[]>(getChatHistory());
	const [inputValue, setInputValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [autoApplyEnabled, setAutoApplyEnabled] = useState<boolean>(() => loadAutoApplyPreference(autoApplyPreferenceKey, Boolean(autoApplyCodeBlock)));
	const [pendingAttachments, setPendingAttachments] = useState<AiAssistantAttachment[]>([]);
	const [stageEvents, setStageEvents] = useState<AiAssistantStageEvent[]>([]);
	// Progress state: waiting for Gemini / streaming progress
	const [geminiProgress, setGeminiProgress] = useState<{
		phase: "idle" | "waiting" | "streaming";
		percent: number;
		message: string;
		estimatedWaitSecs: number;
		remainingSecs: number;
		charsReceived: number;
		estimatedTotalChars: number;
		ttftMs?: number;
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
	const stageEventSignaturesRef = useRef<Set<string>>(new Set());
	const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
	const sendHintKey = isMac ? "Cmd" : "Ctrl";

	useEffect(() => {
		setAutoApplyEnabled(loadAutoApplyPreference(autoApplyPreferenceKey, Boolean(autoApplyCodeBlock)));
	}, [autoApplyCodeBlock, autoApplyPreferenceKey]);

	useEffect(() => {
		saveAutoApplyPreference(autoApplyPreferenceKey, autoApplyEnabled);
		onAutoApplyChange?.(autoApplyEnabled);
	}, [autoApplyEnabled, autoApplyPreferenceKey, onAutoApplyChange]);

	const pickPreferredCodeBlock = useCallback((blocks: CodeBlock[]): CodeBlock | null => {
		if (!Array.isArray(blocks) || blocks.length === 0) return null;
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

	const uiText = useCallback((vi: string, en: string, zh: string) => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh")) return zh;
		if (lang.startsWith("en")) return en;
		return vi;
	}, [i18n.language, i18n.resolvedLanguage]);

	const formatStageLabel = useCallback((stage: string): string => {
		const normalized = String(stage || "").trim().toLowerCase();
		switch (normalized) {
			case "preparing":
				return uiText("Preparing", "Preparing", "准备中");
			case "streaming":
				return uiText("Streaming", "Streaming", "流式输出");
			case "direct_call":
				return uiText("Direct Call", "Direct Call", "直接调用");
			case "chunking":
				return uiText("Chunking", "Chunking", "分块处理中");
			case "reducing":
				return uiText("Reducing", "Reducing", "归并中");
			case "final_merge":
				return uiText("Final Merge", "Final Merge", "最终合并");
			case "completed":
			case "complete":
				return uiText("Completed", "Completed", "已完成");
			case "error":
				return uiText("Error", "Error", "错误");
			case "thinking":
				return uiText("AI đang suy nghĩ...", "AI Thinking...", "AI 正在思考...");
			case "connecting":
				return uiText("Đang kết nối", "Connecting", "正在连接");
			case "model_rotate":
				return uiText("Đổi model", "Switching model", "切换模型");
			default:
				return normalized ? normalized : uiText("Processing", "Processing", "处理中");
		}
	}, [uiText]);

	const renderProgressText = useCallback((key?: string, args?: Record<string, any>, fallback?: string): string => {
		const normalizedKey = String(key || "").trim().replace(/^aiassistant\.progress\./i, "copilot.progress.");
		if (!normalizedKey) return String(fallback || "").trim();
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
					`Đang kết nối tới ${args?.model}`,
					`Connecting to ${args?.model}`,
					`正在连接到 ${args?.model}`,
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
	}, [uiText]);

	const getStageTone = useCallback((stage: string, orchestrationPhase?: string): "preparing" | "chunking" | "reducing" | "final" | "completed" | "error" | "default" => {
		const normalizedPhase = String(orchestrationPhase || "").trim().toLowerCase();
		const normalizedStage = String(stage || "").trim().toLowerCase();
		const key = normalizedPhase || normalizedStage;
		if (key.includes("preparing")) return "preparing";
		if (key.includes("chunking")) return "chunking";
		if (key.includes("reducing")) return "reducing";
		if (key.includes("final")) return "final";
		if (key.includes("complete")) return "completed";
		if (key.includes("error")) return "error";
		return "default";
	}, []);

	const extractStageRangeLabel = useCallback((data: any): string | undefined => {
		const candidates: any[] =
			(Array.isArray(data?.textEdits) && data.textEdits.length > 0 && data.textEdits)
			|| (Array.isArray(data?.lineRanges) && data.lineRanges.length > 0 && data.lineRanges)
			|| (Array.isArray(data?.changedRanges) && data.changedRanges.length > 0 && data.changedRanges)
			|| [];
		if (candidates.length === 0) return undefined;

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
		if (ranges.length === 0) return undefined;
		if (candidates.length > 3) {
			ranges.push(`+${candidates.length - 3}`);
		}
		return ranges.join(", ");
	}, []);

	const appendStageEvent = useCallback((data: any) => {
		const stage = String(data?.stage || data?.status || "").trim();
		const msg = String(data?.message || "").trim();
		const messageKey = String(data?.messageKey || "").trim();
		const messageArgs = data?.messageArgs && typeof data.messageArgs === "object" ? data.messageArgs : undefined;
		const detail = String(data?.detail || "").trim();
		const detailKey = String(data?.detailKey || "").trim();
		const detailArgs = data?.detailArgs && typeof data.detailArgs === "object" ? data.detailArgs : undefined;
		const orchestrationPhase = String(data?.orchestrationPhase || "").trim();
		const orchestrationPhaseKey = String(data?.orchestrationPhaseKey || "").trim();
		const rangeLabel = extractStageRangeLabel(data);
		const hasValue = stage || msg || messageKey || detail || detailKey || orchestrationPhase || orchestrationPhaseKey || Number.isFinite(Number(data?.percent)) || Number.isFinite(Number(data?.overallPercent)) || Boolean(rangeLabel);
		if (!hasValue) return;

		const overallPercentNum = Number(data?.overallPercent);
		const percentNum = Number(data?.percent);
		const currentNum = Number(data?.current);
		const totalNum = Number(data?.total);
		const signature = [
			stage.toLowerCase(),
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
			rangeLabel || "",
		].join("|");

		if (stageEventSignaturesRef.current.has(signature)) return;
		stageEventSignaturesRef.current.add(signature);

		setStageEvents((prev) => {
			const next: AiAssistantStageEvent[] = [
				...prev,
				{
					id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					stage: stage || "processing",
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
				},
			];
			return next.slice(-60);
		});
	}, [extractStageRangeLabel]);

	const isNearBottom = useCallback((element: HTMLDivElement, threshold = 72): boolean => {
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		return distance <= threshold;
	}, []);

	const scrollToBottom = useCallback((force = false) => {
		const container = messageListRef.current;
		if (!container) return;
		if (!force && !followBottomRef.current) return;

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
		if (!container) return;
		followBottomRef.current = isNearBottom(container);
	}, [isNearBottom]);

	const flushStreamingToUI = useCallback((force = false) => {
		const pendingChunk = pendingStreamChunkRef.current;
		if (!pendingChunk && !force) return;

		if (pendingChunk) {
			streamingMessageRef.current += pendingChunk;
			pendingStreamChunkRef.current = "";
		}

		const nextText = String(streamingMessageRef.current || "");
		if (!nextText && !force) return;

		applyRealtimeCodeFromTextRef.current(nextText, force);

		const now = Date.now();
		let nextCodeBlocks = parsedCodeBlocksRef.current;
		if (force || now - lastCodeBlockParseAtRef.current >= STREAM_CODEBLOCK_PARSE_MS) {
			nextCodeBlocks = extractCodeBlocks(nextText);
			parsedCodeBlocksRef.current = nextCodeBlocks;
			lastCodeBlockParseAtRef.current = now;
		}

		setMessages((prev) => {
			const updated = [...prev];
			for (let i = updated.length - 1; i >= 0; i -= 1) {
				const lastMsg = updated[i];
				if (lastMsg.role === "assistant" && lastMsg.messageType !== "debug") {
					lastMsg.content = nextText;
					lastMsg.codeBlocks = nextCodeBlocks;
					break;
				}
			}
			return updated;
		});

		scrollToBottom(false);
	}, [scrollToBottom]);

	const scheduleStreamFlush = useCallback(() => {
		if (streamFlushTimerRef.current) return;
		streamFlushTimerRef.current = setTimeout(() => {
			streamFlushTimerRef.current = null;
			flushStreamingToUI(false);
		}, STREAM_UI_FLUSH_MS);
	}, [flushStreamingToUI]);

	const applyRealtimeCodeFromText = useCallback((rawText: string, force = false): boolean => {
		if (!autoApplyEnabled || !turnAllowAutoApplyRef.current || !onCodeInsert) return false;
		const source = String(rawText || "");
		const blocks = extractCodeBlocks(source);
		if (!blocks.length) {
			const openBlock = extractLatestOpenCodeBlock(source);
			if (openBlock?.code) {
				blocks.push(openBlock);
			}
		}
		if (!blocks.length) return false;
		const preferredBlock = pickPreferredCodeBlock(blocks);
		if (!preferredBlock?.code) return false;
		const nextCode = preferredBlock.code;
		if (nextCode === lastAppliedCodeRef.current) return false;

		const now = Date.now();
		if (!force && now - lastRealtimeApplyAtRef.current < 140) {
			if (realtimeApplyTimerRef.current) clearTimeout(realtimeApplyTimerRef.current);
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
	}, [autoApplyEnabled, onCodeInsert, pickPreferredCodeBlock]);

	useEffect(() => {
		applyRealtimeCodeFromTextRef.current = applyRealtimeCodeFromText;
	}, [applyRealtimeCodeFromText]);

	const appendFiles = useCallback(async (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) return;
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
			} catch (error) {
				console.error("Failed to process attachment:", error);
				message.error(uiText(
					`Không đọc được tệp ${file.name}`,
					`Failed to read ${file.name}`,
					`无法读取 ${file.name}`,
				));
			}
		}

		if (nextAttachments.length > 0) {
			setPendingAttachments((prev) => [...prev, ...nextAttachments].slice(0, MAX_ATTACHMENTS));
		}
	}, [contextType, pendingAttachments.length, uiText]);

	const removePendingAttachment = useCallback((id: string) => {
		setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
	}, []);

	// SSE abort ref for canceling in-flight streaming requests
	const sseAbortRef = useRef<AbortController | null>(null);

	// Cleanup on unmount: cancel animation frame, timers, in-flight SSE fetch
	useEffect(() => {
		return () => {
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
			sseAbortRef.current?.abort();
		};
	}, []);
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
			const modeDirective = parseResponseModeDirective(normalizedText);
			const cleanedMessage = modeDirective.cleanedMessage;
			if (!cleanedMessage && pendingAttachments.length === 0) {
				message.warning(uiText(
					"Vui lòng nhập nội dung sau lệnh /analyze hoặc /edit",
					"Please enter content after /analyze or /edit",
					"请在 /analyze 或 /edit 后输入内容",
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
				attachments: outgoingAttachments.map((attachment) => ({
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

			const newMessages = [...messages, userMsg];
			setMessages(newMessages);
			saveChatHistory(newMessages);

			// Add placeholder for assistant response
			const assistantMsg: ChatMessage = {
				id: `assistant_${Date.now()}`,
				role: "assistant",
				messageType: "response",
				content: "",
				timestamp: Date.now(),
			};

			setMessages([...newMessages, assistantMsg]);
			setIsLoading(true);
			setStageEvents([]);
			setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
			stageEventSignaturesRef.current = new Set();
			followBottomRef.current = true;
			streamingMessageRef.current = "";
			pendingStreamChunkRef.current = "";
			parsedCodeBlocksRef.current = [];
			lastCodeBlockParseAtRef.current = 0;
			appendStageEvent({
				stage: "preparing",
				message: uiText("Đang chuẩn bị yêu cầu", "Preparing request", "正在准备请求"),
				percent: 0,
			});
			const responseMode: ResponseMode = modeDirective.overrideMode
				|| (contextType === "menu_json"
					? "edit"
					: (hasEditIntent(cleanedMessage || normalizedText) ? "edit" : "analyze"));
			turnAllowAutoApplyRef.current = responseMode === "edit";
			setInputValue("");
			setPendingAttachments([]);

			try {
				// SSE streaming via Gemini (replaces legacy Socket.IO stream route)
				const controller = new AbortController();
				sseAbortRef.current = controller;
				const authState = useAuthStore.getState();
				const token = authState.token ?? "";
				const refreshToken = authState.refreshToken ?? "";
				const csrfToken = authState.csrfToken
					|| (typeof document !== "undefined" ? decodeURIComponent(document.cookie.match(/(?:^|; )CSRF-TOKEN=([^;]*)/)?.[1] || "") : "");
				const headers: Record<string, string> = {
					"Content-Type": "application/json",
				};
				if (token) {
					headers["csm-token"] = token;
				}
				if (refreshToken) {
					headers["X-Refresh-Token"] = refreshToken;
				}
				if (csrfToken) {
					headers["X-CSRF-Token"] = csrfToken;
				}
				const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/ai-code-stream`, {
					method: "POST",
					headers,
					credentials: "include",
					body: JSON.stringify({
						appId,
						message: cleanedMessage || normalizedText,
						responseMode,
						currentCode,
						language,
						contextType,
						attachments: outgoingAttachments.map((attachment) => ({
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
						})),
					}),
					signal: controller.signal,
				});

				if (!response.ok) {
					const status = response.status;
					if (status === 401) {
						message.error(uiText("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", "Session expired, please log in again", "登录会话已过期，请重新登录"));
					} else {
						message.error(uiText("Gửi tin nhắn thất bại", "Failed to send message", "发送消息失败"));
					}
					setIsLoading(false);
					turnAllowAutoApplyRef.current = false;
					return;
				}

				const reader = response.body!.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.startsWith("data:")) continue;
						const json = line.slice(5).trim();
						if (!json || json === "[DONE]") continue;
						try {
							const evt = JSON.parse(json) as {
								stage: string; chunk?: string; fullResponse?: string; responseMode?: string;
								message?: string; percent?: number; estimatedWaitSecs?: number;
								remainingEstimateSecs?: number; charsReceived?: number; estimatedTotalChars?: number;
								ttftMs?: number; elapsedMs?: number; promptTokens?: number; model?: string;
							};
							if (evt.stage === "preparing") {
								setGeminiProgress(prev => ({
									...prev,
									phase: "waiting",
									percent: evt.percent ?? 0,
									message: evt.message ?? "",
									estimatedWaitSecs: evt.estimatedWaitSecs ?? 0,
									remainingSecs: evt.estimatedWaitSecs ?? 0,
								}));
							} else if (evt.stage === "waiting_gemini") {
								setGeminiProgress(prev => ({
									...prev,
									phase: "waiting",
									percent: evt.percent ?? prev.percent,
									message: evt.message ?? prev.message,
									remainingSecs: evt.remainingEstimateSecs ?? prev.remainingSecs,
								}));
							} else if (evt.stage === "streaming_started") {
								setGeminiProgress(prev => ({
									...prev,
									phase: "streaming",
									percent: 15,
									message: "Đang nhận kết quả từ Gemini...",
									ttftMs: evt.ttftMs,
									estimatedTotalChars: evt.estimatedTotalChars ?? prev.estimatedTotalChars,
									remainingSecs: 0,
								}));
							} else if (evt.stage === "streaming_progress") {
								setGeminiProgress(prev => ({
									...prev,
									phase: "streaming",
									percent: evt.percent ?? prev.percent,
									message: evt.message ?? prev.message,
									charsReceived: evt.charsReceived ?? prev.charsReceived,
									remainingSecs: evt.remainingEstimateSecs ?? prev.remainingSecs,
								}));
							} else if (evt.stage === "analyzing") {
								appendStageEvent({ stage: evt.stage as any, message: evt.message ?? "", percent: evt.percent ?? 0 });
							} else if (evt.stage === "context" || evt.stage === "continuing" || evt.stage === "cached") {
								appendStageEvent({ stage: evt.stage as any, message: evt.message ?? "", percent: evt.percent ?? 0 });
							} else if (evt.stage === "streaming" && evt.chunk) {
								pendingStreamChunkRef.current += evt.chunk;
								scheduleStreamFlush();
							} else if (evt.stage === "complete") {
								setGeminiProgress({ phase: "idle", percent: 100, message: "Hoàn thành", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
								flushStreamingToUI();
								if (evt.fullResponse) {
									applyRealtimeCodeFromText(evt.fullResponse);
								}
								setIsLoading(false);
								turnAllowAutoApplyRef.current = false;
							} else if (evt.stage === "error") {
								setGeminiProgress({ phase: "idle", percent: 0, message: "", estimatedWaitSecs: 0, remainingSecs: 0, charsReceived: 0, estimatedTotalChars: 0 });
								message.error(evt.message || uiText("Chat thất bại", "Chat failed", "对话失败"));
								setIsLoading(false);
								turnAllowAutoApplyRef.current = false;
							}
						} catch (parseErr) {
							console.debug("Failed to parse SSE line:", json, parseErr);
						}
					}
				}
			} catch (error) {
				if ((error as Error)?.name === "AbortError") return;
				console.error("Failed to send message:", error);
				const status = Number((error as any)?.response?.status ?? 0);
				if (status === 401) {
					message.error(uiText("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", "Session expired, please log in again", "登录会话已过期，请重新登录"));
				} else {
					message.error(uiText("Gửi tin nhắn thất bại", "Failed to send message", "发送消息失败"));
				}
				setIsLoading(false);
				turnAllowAutoApplyRef.current = false;
			}
		},
		[appId, autoApplyEnabled, contextType, currentCode, isLoading, language, messages, onUserMessage, onCodeInsert, pendingAttachments, targetPName, targetPType, uiText, appendStageEvent, applyRealtimeCodeFromText, flushStreamingToUI, scheduleStreamFlush, scrollToBottom]
	);

	const handleSend = () => {
		sendMessage(inputValue);
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && e.ctrlKey) {
			handleSend();
		}
	};

	const handleClearHistory = () => {
		setMessages([]);
		localStorage.removeItem(CHAT_HISTORY_KEY);
		message.success(uiText("Đã xóa lịch sử chat", "Chat history cleared", "聊天记录已清除"));
	};

	const handleCopyCode = (code: string) => {
		navigator.clipboard.writeText(code);
		message.success(uiText("Đã sao chép code", "Code copied", "代码已复制"));
	};

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
			extra={
				<Space size="small">
					<Tooltip title={uiText("Tự chèn vào editor khi prompt có ý định chỉnh sửa", "Auto insert into editor when prompt implies editing", "当提示词包含编辑意图时自动插入到编辑器")}> 
						<Switch
							size="small"
							checked={autoApplyEnabled}
							onChange={(checked) => setAutoApplyEnabled(Boolean(checked))}
							checkedChildren="Auto"
							unCheckedChildren="Text"
						/>
					</Tooltip>
					<Tooltip title={uiText("Xóa lịch sử", "Clear history", "清除历史")}> 
						<Button
							type="text"
							size="small"
							icon={<ClearOutlined />}
							onClick={handleClearHistory}
						/>
					</Tooltip>
				</Space>
			}
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
						messages.map((msg) => (
							<div
								key={msg.id}
								className={`${styles.messageItem} ${styles[msg.role]}`}
							>
								<div className={styles.messageContent}>
									<div className={styles.messageText}>
										{msg.role === "user" ? (
											<>
												<span>{msg.content}</span>
												{Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
													<div className={styles.attachmentList}>
														{msg.attachments.map((attachment) => (
															<div key={attachment.id} className={styles.attachmentChip}>
																{attachment.kind === "image" && attachment.previewUrl ? (
																	<img src={attachment.previewUrl} alt={attachment.name} className={styles.attachmentThumb} />
																) : (
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
												{msg.codeBlocks?.map((block) => (
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
																			handleInsertCode(block.code)
																		}
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
										{new Date(msg.timestamp).toLocaleTimeString()}
									</div>
								</div>
							</div>
						))
					)}

					{isLoading && (
						<>
							{/* Gemini Progress Bar — waiting / streaming phase */}
							{geminiProgress.phase !== "idle" && (
								<div className={`${styles.messageItem} ${styles.assistant}`}>
									<div className={styles.geminiProgressCard}>
										<div className={styles.geminiProgressHeader}>
											<span className={styles.geminiProgressIcon}>
												{geminiProgress.phase === "waiting" ? "⏳" : "⚡"}
											</span>
											<span className={styles.geminiProgressLabel}>
												{geminiProgress.message || (geminiProgress.phase === "waiting"
													? "Gemini đang xử lý..."
													: "Đang nhận kết quả...")}
											</span>
											{geminiProgress.remainingSecs > 0 && (
												<span className={styles.geminiProgressCountdown}>
													~{geminiProgress.remainingSecs}s
												</span>
											)}
										</div>
										<div className={styles.geminiProgressBarTrack}>
											<div
												className={`${styles.geminiProgressBarFill} ${geminiProgress.phase === "waiting" ? styles.geminiProgressBarWaiting : styles.geminiProgressBarStreaming}`}
												style={{ width: `${Math.max(2, Math.min(100, geminiProgress.percent))}%` }}
											/>
										</div>
										{geminiProgress.phase === "streaming" && geminiProgress.charsReceived > 0 && (
											<div className={styles.geminiProgressMeta}>
												{geminiProgress.charsReceived.toLocaleString()} ký tự nhận được
												{geminiProgress.ttftMs != null && (
													<span className={styles.geminiProgressTtft}> · TTFT {geminiProgress.ttftMs}ms</span>
												)}
											</div>
										)}
										{geminiProgress.phase === "waiting" && geminiProgress.estimatedWaitSecs > 0 && (
											<div className={styles.geminiProgressMeta}>
												Ước tính ~{geminiProgress.estimatedWaitSecs}s tổng thời gian
											</div>
										)}
									</div>
								</div>
							)}
							{stageEvents.length > 0 && (
								<div className={`${styles.messageItem} ${styles.assistant}`}>
									<div className={`${styles.messageContent} ${styles.stageTimelineCard}`}>
										<div className={styles.stageTimelineTitle}>
											{uiText("Tiến độ xử lý", "Processing timeline", "处理进度")}
										</div>
										<div className={styles.stageTimelineList}>
											{stageEvents.map((event) => {
												const stageLabel = renderProgressText(event.orchestrationPhaseKey, undefined, event.orchestrationPhase || formatStageLabel(event.stage));
												const stageTone = getStageTone(event.stage, event.orchestrationPhase);
												const effectivePercent = Number.isFinite(Number(event.overallPercent)) ? Number(event.overallPercent) : Number(event.percent);
												const percentText = Number.isFinite(effectivePercent) ? ` (${Math.max(0, Math.min(100, effectivePercent))}%)` : "";
												const progressText = Number.isFinite(Number(event.current)) && Number.isFinite(Number(event.total))
													? ` [${Math.max(0, Number(event.current))}/${Math.max(1, Number(event.total))}]`
													: "";
												const timelineMessage = renderProgressText(event.detailKey, event.detailArgs, event.detail || renderProgressText(event.messageKey, event.messageArgs, event.message));
												return (
													<div key={event.id} className={`${styles.stageTimelineItem} ${styles[`stageTimelineItem_${stageTone}`] || ""}`.trim()}>
														<span className={`${styles.stageTimelineBullet} ${styles[`stageTimelineBullet_${stageTone}`] || ""}`.trim()} />
														<div className={styles.stageTimelineText}>
															<div className={`${styles.stageTimelineHead} ${styles[`stageTimelineHead_${stageTone}`] || ""}`.trim()}>
																<span>{stageLabel}{percentText}{progressText}</span>
																{event.rangeLabel && <span className={styles.stageRangeBadge}>{event.rangeLabel}</span>}
															</div>
															{timelineMessage && <div className={styles.stageTimelineMessage}>{timelineMessage}</div>}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								</div>
							)}
						<div className={`${styles.messageItem} ${styles.assistant}`}>
							<Spin size="small" />
						</div>
						</>
					)}
				</div>

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
							{pendingAttachments.map((attachment) => (
								<div key={attachment.id} className={styles.pendingAttachmentItem}>
									{attachment.kind === "image" && attachment.previewUrl ? (
										<img src={attachment.previewUrl} alt={attachment.name} className={styles.pendingAttachmentThumb} />
									) : (
										<Tag color={attachment.kind === "json" ? "processing" : "default"}>{attachment.kind.toUpperCase()}</Tag>
									)}
									<div className={styles.pendingAttachmentMeta}>
										<div>{attachment.name}</div>
										<div className={styles.attachmentSummary}>{attachment.summary}</div>
									</div>
									<Tooltip title={attachment.fullContext
										? uiText("Toàn bộ nội dung (click để tắt)", "Full content (click to disable)", "完整内容（点击关闭）")
										: uiText("Chỉ snippet (click để gửi toàn bộ)", "Snippet only (click to send full)", "仅片段（点击发送完整内容）")}>
										<Button
											type="text"
											size="small"
											style={{ color: attachment.fullContext ? "#52c41a" : undefined, fontSize: 11, padding: "0 4px" }}
											onClick={() => setPendingAttachments((prev) => prev.map((a) => a.id === attachment.id ? { ...a, fullContext: !a.fullContext } : a))}
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
							onChange={(e) => setInputValue(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder={uiText(
								`Hỏi Trợ lý AI (${sendHintKey}+Enter để gửi). Lệnh: /phan-tich hoặc /sua`,
								`Ask AI Assistant (${sendHintKey}+Enter to send). Commands: /analyze or /edit`,
								`向 AI 助手提问（${sendHintKey}+Enter 发送）。命令：/分析 或 /编辑`,
							)}
							rows={3}
							disabled={isLoading}
							maxLength={MAX_CHAT_INPUT_CHARS}
						/>
					</Space.Compact>
					<div className={styles.buttonGroup}>
						<Tooltip title={uiText("Đính kèm file văn bản/JSON", "Attach text/JSON file", "附加文本/JSON 文件")}>
							<Button
								type="text"
								icon={<PaperClipOutlined />}
								onClick={() => fileInputRef.current?.click()}
								disabled={isLoading}
							/>
						</Tooltip>
						<Tooltip title={uiText("Đính kèm hình ảnh", "Attach image", "附加图像")}>
							<Button
								type="text"
								icon={<FileImageOutlined />}
								onClick={() => imageInputRef.current?.click()}
								disabled={isLoading}
							/>
						</Tooltip>
						<Button
							type="primary"
							icon={<SendOutlined />}
							onClick={handleSend}
							disabled={isLoading || (!inputValue.trim() && pendingAttachments.length === 0)}
							loading={isLoading}
						>
							{uiText("Gửi", "Send", "发送")}
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
