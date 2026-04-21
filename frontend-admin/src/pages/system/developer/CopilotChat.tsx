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
import { useSocket } from "#src/hooks/useSocket";
import { extractCodeBlocks, extractLatestOpenCodeBlock } from "#src/pages/system/developer/codeUtils";
import { request } from "#src/utils/request";
import styles from "./CopilotChat.module.css";

export type CopilotAttachment = {
	id: string;
	name: string;
	mimeType: string;
	size: number;
	kind: "text" | "json" | "image";
	summary: string;
	textContent?: string;
	dataUrl?: string;
	previewUrl?: string;
};

export type CopilotUserMessagePayload = {
	message: string;
	attachments: CopilotAttachment[];
};

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
	codeBlocks?: CodeBlock[];
	attachments?: Array<Pick<CopilotAttachment, "id" | "name" | "mimeType" | "size" | "kind" | "summary" | "previewUrl">>;
};

type CodeBlock = {
	language: string;
	code: string;
	index: number;
};

type ResponseMode = "analyze" | "edit";

type CopilotChatProps = {
	appId: string;
	currentCode?: string;
	language?: "javascript" | "html" | "python" | "java" | "css" | "sql" | "json";
	contextType?: "code" | "menu_json";
	onCodeInsert?: (code: string) => void;
	onUserMessage?: (payload: CopilotUserMessagePayload) => void;
	autoApplyCodeBlock?: boolean;
};

const CHAT_HISTORY_KEY = "codeeditor.copilot.chat.v1";
const CHAT_STORAGE_LIMIT = 20;
const MAX_ATTACHMENTS = 8;
const MAX_TEXT_ATTACHMENT_CHARS = 50000;
const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
const STREAM_UI_FLUSH_MS = 48;
const STREAM_CODEBLOCK_PARSE_MS = 240;
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

function extractMenuDraftForEditor(raw: unknown): string {
	const text = String(raw || "").trim();
	if (!text) return "";
	try {
		const parsed = JSON.parse(text);
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
		const stored = localStorage.getItem(CHAT_HISTORY_KEY);
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

export default function CopilotChat({
	appId,
	currentCode = "",
	language = "javascript",
	contextType = "code",
	onCodeInsert,
	onUserMessage,
	autoApplyCodeBlock = false,
}: CopilotChatProps) {
	const { i18n } = useTranslation();
	const [messages, setMessages] = useState<ChatMessage[]>(getChatHistory());
	const [inputValue, setInputValue] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [autoApplyEnabled, setAutoApplyEnabled] = useState<boolean>(autoApplyCodeBlock);
	const [pendingAttachments, setPendingAttachments] = useState<CopilotAttachment[]>([]);
	const messageListRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const streamingMessageRef = useRef<string>("");
	const lastListenerSetupRef = useRef<boolean>(false);
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
	const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
	const sendHintKey = isMac ? "Cmd" : "Ctrl";

	useEffect(() => {
		setAutoApplyEnabled(Boolean(autoApplyCodeBlock));
	}, [autoApplyCodeBlock]);

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
			if (updated.length > 0) {
				const lastMsg = updated[updated.length - 1];
				if (lastMsg.role === "assistant") {
					lastMsg.content = nextText;
					lastMsg.codeBlocks = nextCodeBlocks;
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
		const nextAttachments: CopilotAttachment[] = [];

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
						`${file.name} vượt quá 1MB`,
						`${file.name} exceeds 1MB`,
						`${file.name} 超过 1MB`,
					));
					continue;
				}

				const rawText = await readFileAsText(file);
				const textContent = rawText.length <= MAX_TEXT_ATTACHMENT_CHARS
					? rawText
					: `${rawText.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n...[truncated]`;
				nextAttachments.push({
					id: createAttachmentId("file"),
					name: file.name,
					mimeType: file.type || "text/plain",
					size: file.size,
					kind: getFileExtension(file.name) === "json" ? "json" : "text",
					summary: summarizeFileContent(file, textContent),
					textContent,
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
	}, [pendingAttachments.length, uiText]);

	const removePendingAttachment = useCallback((id: string) => {
		setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
	}, []);

	// Use existing Socket.IO hook
	const { socket, connected: socketConnected } = useSocket({ enabled: !!appId });

	// Setup Socket.IO listeners for copilot events
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
		};
	}, []);

	useEffect(() => {
		if (!socket || !appId) return;
		if (lastListenerSetupRef.current) return; // Prevent duplicate listeners

		lastListenerSetupRef.current = true;

		const handleCopilotChunk = (data: any) => {
			const chunk = String(data?.chunk || "");
			const explicitDraft = String(data?.draftText || data?.partialJson || data?.previewJson || "").trim();
			const textEdits = Array.isArray(data?.textEdits) ? data.textEdits : null;

			if (chunk) {
				pendingStreamChunkRef.current += chunk;
				scheduleStreamFlush();
			}

			// Legacy realtime payload compatibility: apply JSON draft or line edits directly to editor.
			if (autoApplyEnabled && turnAllowAutoApplyRef.current && onCodeInsert && contextType === "menu_json") {
				if (explicitDraft) {
					const menuDraft = extractMenuDraftForEditor(explicitDraft);
					if (menuDraft) {
						onCodeInsert(menuDraft);
						lastAppliedCodeRef.current = menuDraft;
					}
				} else if (textEdits && textEdits.length > 0) {
					const baseText = String(lastAppliedCodeRef.current || currentCode || "");
					const patchedText = applyTextEditsToDraft(baseText, textEdits);
					if (patchedText && patchedText !== lastAppliedCodeRef.current) {
						onCodeInsert(patchedText);
						lastAppliedCodeRef.current = patchedText;
					}
				}
			}

			if (!chunk) {
				scrollToBottom(false);
			}
		};

		const handleCopilotComplete = (data: any) => {
			if (streamFlushTimerRef.current) {
				clearTimeout(streamFlushTimerRef.current);
				streamFlushTimerRef.current = null;
			}
			flushStreamingToUI(true);
			const finalText = String(streamingMessageRef.current || "");
			setIsLoading(false);
			if (realtimeApplyTimerRef.current) {
				clearTimeout(realtimeApplyTimerRef.current);
				realtimeApplyTimerRef.current = null;
			}
			applyRealtimeCodeFromText(finalText, true);
			pendingStreamChunkRef.current = "";
			parsedCodeBlocksRef.current = [];
			lastCodeBlockParseAtRef.current = 0;
			streamingMessageRef.current = "";
			turnAllowAutoApplyRef.current = false;
			scrollToBottom(true);
			console.log("Chat completed:", data);
		};

		const handleCopilotError = (data: any) => {
			setIsLoading(false);
			if (streamFlushTimerRef.current) {
				clearTimeout(streamFlushTimerRef.current);
				streamFlushTimerRef.current = null;
			}
			if (realtimeApplyTimerRef.current) {
				clearTimeout(realtimeApplyTimerRef.current);
				realtimeApplyTimerRef.current = null;
			}
			pendingStreamChunkRef.current = "";
			parsedCodeBlocksRef.current = [];
			lastCodeBlockParseAtRef.current = 0;
			message.error(data.error || uiText("Chat thất bại", "Chat failed", "对话失败"));
			turnAllowAutoApplyRef.current = false;
			console.error("Chat error:", data);
		};

		socket.on("copilot_chat_chunk", handleCopilotChunk);
		socket.on("copilot_chat_complete", handleCopilotComplete);
		socket.on("copilot_chat_error", handleCopilotError);

		return () => {
			if (streamFlushTimerRef.current) {
				clearTimeout(streamFlushTimerRef.current);
				streamFlushTimerRef.current = null;
			}
			if (realtimeApplyTimerRef.current) {
				clearTimeout(realtimeApplyTimerRef.current);
				realtimeApplyTimerRef.current = null;
			}
			socket.off?.("copilot_chat_chunk", handleCopilotChunk);
			socket.off?.("copilot_chat_complete", handleCopilotComplete);
			socket.off?.("copilot_chat_error", handleCopilotError);
			lastListenerSetupRef.current = false;
		};
	}, [socket, appId, applyRealtimeCodeFromText, uiText, onCodeInsert, contextType, currentCode, autoApplyEnabled, scrollToBottom, flushStreamingToUI, scheduleStreamFlush]);

	// Auto-scroll to latest message
	useEffect(() => {
		scrollToBottom(false);
	}, [messages, scrollToBottom]);

	const sendMessage = useCallback(
		async (text: string) => {
			if ((!text.trim() && pendingAttachments.length === 0) || !socketConnected || isLoading) {
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
				content: "",
				timestamp: Date.now(),
			};

			setMessages([...newMessages, assistantMsg]);
			setIsLoading(true);
			followBottomRef.current = true;
			streamingMessageRef.current = "";
			pendingStreamChunkRef.current = "";
			parsedCodeBlocksRef.current = [];
			lastCodeBlockParseAtRef.current = 0;
			const responseMode: ResponseMode = modeDirective.overrideMode
				|| (autoApplyEnabled && hasEditIntent(cleanedMessage || normalizedText) ? "edit" : "analyze");
			turnAllowAutoApplyRef.current = responseMode === "edit";
			setInputValue("");
			setPendingAttachments([]);

			try {
				// Call backend streaming endpoint via shared request client
				await request.post("copilot-chat-stream", {
					json: {
						appId,
						message: cleanedMessage || normalizedText,
						responseMode,
						currentCode,
						language,
						contextType,
						taskType: contextType === "menu_json" ? "menu_design" : "code_assistant",
						attachments: outgoingAttachments.map((attachment) => ({
							id: attachment.id,
							name: attachment.name,
							mimeType: attachment.mimeType,
							size: attachment.size,
							kind: attachment.kind,
							summary: attachment.summary,
							textContent: attachment.textContent,
							dataUrl: attachment.dataUrl,
						})),
					},
					ignoreLoading: true,
				});

				// Backend will emit Socket.IO events for streaming
			} catch (error) {
				console.error("Failed to send message:", error);
				const status = Number((error as any)?.response?.status || 0);
				if (status === 401) {
					message.error(uiText("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", "Session expired, please log in again", "登录会话已过期，请重新登录"));
				} else {
					message.error(uiText("Gửi tin nhắn thất bại", "Failed to send message", "发送消息失败"));
				}
				setIsLoading(false);
				turnAllowAutoApplyRef.current = false;
			}
		},
		[appId, autoApplyEnabled, contextType, currentCode, isLoading, language, messages, onUserMessage, pendingAttachments, socketConnected, uiText]
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
			className={styles.copilotChat}
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
				<div className={styles.messageList} ref={messageListRef} onScroll={handleMessageListScroll}>
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
																{onCodeInsert && (
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
						<div className={`${styles.messageItem} ${styles.assistant}`}>
							<Spin size="small" />
						</div>
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
							disabled={isLoading || !socketConnected}
							maxLength={2000}
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
							disabled={isLoading || !socketConnected || (!inputValue.trim() && pendingAttachments.length === 0)}
							loading={isLoading}
						>
							{uiText("Gửi", "Send", "发送")}
						</Button>
						{!socketConnected && (
							<span className={styles.statusText}>
								{uiText("Đang kết nối Trợ lý AI...", "Connecting to AI Assistant...", "正在连接 AI 助手...")}
							</span>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}
