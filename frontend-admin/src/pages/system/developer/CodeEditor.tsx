import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Select, Card, Space, message, Modal, Input, Form } from "antd";
import type { InputRef } from "antd";
import {
	SaveOutlined,
	DeleteOutlined,
	SearchOutlined,
	SwapOutlined,
	SettingOutlined,
	ExpandOutlined,
	HistoryOutlined,
	PushpinOutlined,
	PushpinFilled,
	MenuFoldOutlined,
	MenuUnfoldOutlined,
} from "@ant-design/icons";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { search, openSearchPanel, gotoLine } from "@codemirror/search";
import { undo, redo } from "@codemirror/commands";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useTranslation } from "react-i18next";
import { useAppStore } from "#src/store";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import {
	fetchCodeList,
	decryptCode,
	saveCode,
	deleteCode,
	type CodeItem,
} from "./useCodeEditor";
import styles from "./CodeEditor.module.css";

type AiRole = "user" | "assistant";

type AiMessage = {
	id: string;
	role: AiRole;
	content: string;
	createdAt: number;
};

type AiProgress = {
	status?: string;
	stage?: string;
	message?: string;
	percent?: number;
	jobId?: string;
	elapsedMs?: number;
};

type AiRequestHistoryItem = {
	id: string;
	request: string;
	status: "completed" | "failed";
	summary: string;
	changes: string[];
	draftCode: string;
	createdAt: number;
	pinned?: boolean;
};

type AiSessionSnapshot = {
	messages: AiMessage[];
	lastCode: string;
	summary: string;
	changeItems: string[];
	history: AiRequestHistoryItem[];
	updatedAt?: number;
};

type AiPanelMode = "normal" | "expanded";
type AiHistoryFilter = "all" | "completed" | "failed" | "pinned";

type DraftChangeAction = "add" | "edit" | "delete";

type DraftLineRange = {
	fromLine: number;
	toLine: number;
	action?: DraftChangeAction;
};

type PendingDraftChunk = {
	id: string;
	before: string;
	after: string;
	ranges: DraftLineRange[];
	applied?: boolean;
	createdAt: number;
};

type HotkeyAction = "save" | "find" | "replaceFocus" | "goto" | "askAi" | "continueAi" | "commandPalette";

type HotkeyConfig = Record<HotkeyAction, string>;

const HOTKEY_STORAGE_KEY = "developer.codeeditor.hotkeys.v1";
const AI_SESSION_STORAGE_KEY = "developer.codeeditor.aiSessions.v1";
const AI_SESSION_LOCAL_STORAGE_KEY = "developer.codeeditor.aiSessions.persist.v1";
const AI_HISTORY_LIMIT = 40;
const AI_SESSION_MAX = 50;

const setDraftHighlights = StateEffect.define<DraftLineRange[]>();

function normalizeDraftAction(raw: any): DraftChangeAction {
	const text = String(raw || "").trim().toLowerCase();
	if (["add", "insert", "create", "new", "+"].includes(text)) return "add";
	if (["delete", "remove", "del", "-"].includes(text)) return "delete";
	return "edit";
}

function parseLineNumber(value: any, fallback: number): number {
	const n = Number(value);
	if (Number.isFinite(n) && n > 0) return Math.floor(n);
	return fallback;
}

function mergeDraftRanges(ranges: DraftLineRange[]): DraftLineRange[] {
	if (!Array.isArray(ranges) || ranges.length === 0) return [];
	const sorted = [...ranges]
		.map((range) => ({
			fromLine: Math.max(1, parseLineNumber(range.fromLine, 1)),
			toLine: Math.max(1, parseLineNumber(range.toLine, parseLineNumber(range.fromLine, 1))),
			action: normalizeDraftAction(range.action),
		}))
		.sort((a, b) => a.fromLine - b.fromLine || a.toLine - b.toLine);

	const merged: DraftLineRange[] = [];
	for (const range of sorted) {
		const prev = merged[merged.length - 1];
		if (prev && prev.action === range.action && range.fromLine <= prev.toLine + 1) {
			prev.toLine = Math.max(prev.toLine, range.toLine);
			continue;
		}
		merged.push(range);
	}

	return merged.slice(0, 60);
}

function buildDraftHighlightDecorations(ranges: DraftLineRange[], doc: any): DecorationSet {
	if (!Array.isArray(ranges) || ranges.length === 0 || !doc) {
		return Decoration.none;
	}
	const marks = [] as any[];
	const totalLines = Math.max(1, Number(doc.lines || 1));
	for (const range of ranges) {
		const from = Math.max(1, Math.min(totalLines, Number(range.fromLine || 1)));
		const to = Math.max(from, Math.min(totalLines, Number(range.toLine || from)));
		const action = normalizeDraftAction(range.action);
		const className = action === "add"
			? "cm-ai-live-line-add"
			: action === "delete"
				? "cm-ai-live-line-delete"
				: "cm-ai-live-line-edit";
		for (let lineNumber = from; lineNumber <= to; lineNumber += 1) {
			const line = doc.line(lineNumber);
			marks.push(Decoration.line({ class: className }).range(line.from));
		}
	}
	return Decoration.set(marks, true);
}

const draftHighlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		let next = deco.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setDraftHighlights)) {
				next = buildDraftHighlightDecorations(effect.value, tr.state.doc);
			}
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

const draftHighlightTheme = EditorView.theme({
	".cm-ai-live-line-edit": {
		backgroundColor: "rgba(250, 204, 21, 0.14)",
	},
	".cm-ai-live-line-add": {
		backgroundColor: "rgba(34, 197, 94, 0.16)",
	},
	".cm-ai-live-line-delete": {
		backgroundColor: "rgba(239, 68, 68, 0.18)",
	},
});

const DEFAULT_HOTKEYS: HotkeyConfig = {
	save: "s",
	find: "f",
	replaceFocus: "f",
	goto: "g",
	askAi: "enter",
	continueAi: "enter",
	commandPalette: "k",
};

function createAiPrompt(params: {
	appId: string;
	language: "javascript" | "html";
	codeName: string | null;
	codeType: number;
	currentCode: string;
	requestText: string;
	messages: AiMessage[];
}) {
	const { appId, language, codeName, codeType, currentCode, requestText, messages } = params;
	const recentConversation = messages
		.slice(-6)
		.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
		.join("\n\n");

	const trimmedCode = currentCode.length > 24000
		? `${currentCode.slice(0, 24000)}\n/* truncated for token budget */`
		: currentCode;

	return [
		"You are a senior coding assistant inside a low-code developer editor.",
		"This is the developer code editor workspace, not the menu JSON designer.",
		"Always preserve existing business logic unless the user explicitly asks to rewrite it.",
		"Treat p_name and p_type as the stable identity of the selected sys_autos record.",
		"Do not rename or switch the target record unless the user explicitly requests that.",
		"Your job is only to return an updated draft code suggestion. Database save/delete is handled separately by the UI.",
		"Return strict JSON only with this shape:",
		"{",
		"  \"summary\": \"short explanation\",",
		"  \"code\": \"full updated code in target language\",",
		"  \"changes\": [\"item 1\", \"item 2\"]",
		"}",
		"No markdown, no code fences.",
		`Current app_id: ${appId}`,
		`Selected p_name: ${codeName || "(unsaved)"}`,
		`Selected p_type: ${codeType}`,
		`Target language: ${language}`,
		`Code item: ${codeName || "(unsaved)"}`,
		"Current code:",
		trimmedCode || "",
		recentConversation ? `Conversation context:\n${recentConversation}` : "",
		`New request: ${requestText}`,
	].filter(Boolean).join("\n\n");
}

function parseAiCodeResponse(response: any): { summary: string; code: string; changes: string[] } | null {
	const payload = response?.result ?? response?.data ?? response;
	if (!payload) return null;

	const parseText = (text: string) => {
		let raw = String(text || "").trim();
		if (!raw) return null;
		if (raw.startsWith("```json")) raw = raw.slice(7).trim();
		if (raw.startsWith("```")) raw = raw.slice(3).trim();
		if (raw.endsWith("```")) raw = raw.slice(0, -3).trim();
		try {
			const obj = JSON.parse(raw);
			return {
				summary: String(obj?.summary || ""),
				code: String(obj?.code || ""),
				changes: Array.isArray(obj?.changes) ? obj.changes.map((x: any) => String(x)) : [],
			};
		} catch {
			return {
				summary: "AI returned plain text.",
				code: raw,
				changes: [],
			};
		}
	};

	if (typeof payload === "string") {
		return parseText(payload);
	}

	if (typeof payload === "object") {
		if (typeof payload.result === "string") return parseText(payload.result);
		if (typeof payload.code === "string") {
			return {
				summary: String(payload.summary || ""),
				code: payload.code,
				changes: Array.isArray(payload.changes) ? payload.changes.map((x: any) => String(x)) : [],
			};
		}
		try {
			return parseText(JSON.stringify(payload));
		} catch {
			return null;
		}
	}

	return null;
}

export default function CodeEditor() {
	const { t, i18n } = useTranslation();
	const appId = useAppStore(state => state.currentAppId);
	const editorRef = useRef<any>(null);
	const currentDraftRef = useRef("");
	const aiPromptInputRef = useRef<InputRef>(null);
	const manualDraftRevisionRef = useRef(0);
	const aiProgrammaticApplyRef = useRef(false);

	// State Management
	const [codeType, setCodeType] = useState<number>(0); // 0 = JS, 1 = HTML
	const [codeList, setCodeList] = useState<CodeItem[]>([]);
	const [selectedCode, setSelectedCode] = useState<string | null>(null);
	const [codeContent, setCodeContent] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [newCodeName, setNewCodeName] = useState("");
	const [aiPromptText, setAiPromptText] = useState("");
	const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
	const [aiLastCode, setAiLastCode] = useState("");
	const [aiChangeItems, setAiChangeItems] = useState<string[]>([]);
	const [aiRequestHistory, setAiRequestHistory] = useState<AiRequestHistoryItem[]>([]);
	const [aiLoading, setAiLoading] = useState(false);
	const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
	const [aiSummary, setAiSummary] = useState("");
	const [aiPanelMode, setAiPanelMode] = useState<AiPanelMode>("normal");
	const [aiLeftPanelHidden, setAiLeftPanelHidden] = useState(false);
	const [pendingChunk, setPendingChunk] = useState<PendingDraftChunk | null>(null);
	const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
	const [historyFilter, setHistoryFilter] = useState<AiHistoryFilter>("all");
	const [historyKeyword, setHistoryKeyword] = useState("");
	const [aiSessionStorageReady, setAiSessionStorageReady] = useState(false);
	const [sessionHydratedKey, setSessionHydratedKey] = useState("");
	const [gotoModalOpen, setGotoModalOpen] = useState(false);
	const [gotoLineInput, setGotoLineInput] = useState("");
	const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS);
	const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [commandSearch, setCommandSearch] = useState("");
	const [draftCursor, setDraftCursor] = useState({ line: 1, column: 1 });
	const [draftStats, setDraftStats] = useState({ lines: 1, chars: 0 });
	const [savedCodeSnapshot, setSavedCodeSnapshot] = useState("");
	const [form] = Form.useForm();

	const isMac = useMemo(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || ""), []);
	const modKeyLabel = isMac ? "Cmd" : "Ctrl";
	const selectedCodeItem = useMemo(
		() => codeList.find((item) => item.p_name === selectedCode) || null,
		[codeList, selectedCode],
	);
	const selectedCodeLabel = selectedCode || t("system.developer.ai.unsaved");
	const aiStatusText = aiProgress?.stage || aiProgress?.status || t("system.developer.ai.running");
	const resolvedPType = selectedCodeItem?.p_type ?? codeType;
	const currentLanguage = codeType === 0 ? "javascript" : "html";
	const currentTypeLabel = codeType === 0 ? "JavaScript" : "HTML";
	const aiSessionSnapshotsRef = useRef<Record<string, AiSessionSnapshot>>({});
	const aiSessionKey = useMemo(
		() => `${appId || "unknown"}::${selectedCode || "__unsaved__"}::${resolvedPType}::${currentLanguage}`,
		[appId, selectedCode, resolvedPType, currentLanguage],
	);
	const draftDirty = useMemo(
		() => String(codeContent || "") !== String(savedCodeSnapshot || ""),
		[codeContent, savedCodeSnapshot],
	);
	const devUiText = (vi: string, en: string, zh: string) => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh")) return zh;
		if (lang.startsWith("en")) return en;
		return vi;
	};

	const updateDraftIndicators = (view: any) => {
		if (!view?.state?.doc) return;
		const head = Number(view.state.selection?.main?.head ?? 0);
		const lineInfo = view.state.doc.lineAt(head);
		setDraftCursor({
			line: Number(lineInfo?.number || 1),
			column: Math.max(1, head - Number(lineInfo?.from || 0) + 1),
		});
		setDraftStats({
			lines: Math.max(1, Number(view.state.doc.lines || 1)),
			chars: Number(view.state.doc.length || 0),
		});
	};

	const draftMetricsExtension = useMemo(
		() => EditorView.updateListener.of((update) => {
			if (!update.docChanged && !update.selectionSet) return;
			updateDraftIndicators(update.view);
		}),
		[],
	);

	const visibleAiRequestHistory = useMemo(() => {
		const keyword = historyKeyword.trim().toLowerCase();
		const source = Array.isArray(aiRequestHistory) ? aiRequestHistory : [];
		return source.filter((item) => {
			if (historyFilter === "completed" && item.status !== "completed") return false;
			if (historyFilter === "failed" && item.status !== "failed") return false;
			if (historyFilter === "pinned" && !item.pinned) return false;
			if (!keyword) return true;
			return (
				String(item.request || "").toLowerCase().includes(keyword)
				|| String(item.summary || "").toLowerCase().includes(keyword)
			);
		});
	}, [aiRequestHistory, historyFilter, historyKeyword]);

	useEffect(() => {
		currentDraftRef.current = aiLastCode;
	}, [aiLastCode]);

	useEffect(() => {
		const view = editorRef.current;
		if (!view) return;
		const ranges = pendingChunk?.ranges || [];
		const firstRange = ranges[0];
		if (firstRange && view?.state?.doc) {
			const totalLines = Math.max(1, Number(view.state.doc.lines || 1));
			const fromLine = Math.max(1, Math.min(totalLines, Number(firstRange.fromLine || 1)));
			const toLine = Math.max(fromLine, Math.min(totalLines, Number(firstRange.toLine || fromLine)));
			const from = view.state.doc.line(fromLine).from;
			const to = view.state.doc.line(toLine).to;
			view.dispatch({
				effects: setDraftHighlights.of(ranges),
				selection: { anchor: from, head: to },
				scrollIntoView: true,
			});
			return;
		}
		view.dispatch({ effects: setDraftHighlights.of(ranges) });
	}, [pendingChunk]);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(HOTKEY_STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw || "{}") as Partial<HotkeyConfig>;
			setHotkeys({ ...DEFAULT_HOTKEYS, ...parsed });
		} catch {
			setHotkeys(DEFAULT_HOTKEYS);
		}
	}, []);

	useEffect(() => {
		try {
			const raw = sessionStorage.getItem(AI_SESSION_STORAGE_KEY)
				|| localStorage.getItem(AI_SESSION_LOCAL_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw || "{}") as Record<string, AiSessionSnapshot>;
				if (parsed && typeof parsed === "object") {
					aiSessionSnapshotsRef.current = parsed;
				}
			}
		} catch {
			aiSessionSnapshotsRef.current = {};
		}
		setAiSessionStorageReady(true);
	}, []);

	useEffect(() => {
		if (!aiSessionStorageReady) return;
		setSessionHydratedKey("");
		const snapshot = aiSessionSnapshotsRef.current[aiSessionKey];
		setAiMessages(snapshot?.messages || []);
		setAiLastCode(snapshot?.lastCode || codeContent || "");
		setAiSummary(snapshot?.summary || "");
		setAiChangeItems(snapshot?.changeItems || []);
		setAiRequestHistory(snapshot?.history || []);
		setAiProgress(null);
		setSelectedHistoryId(null);
		setSessionHydratedKey(aiSessionKey);
		// IMPORTANT: do not depend on codeContent here.
		// If this effect reruns on each keystroke, it rehydrates stale snapshot and overrides user edits.
	}, [aiSessionKey, aiSessionStorageReady]);

	useEffect(() => {
		if (!aiSessionStorageReady || sessionHydratedKey !== aiSessionKey) return;
		const nextSnapshots: Record<string, AiSessionSnapshot> = {
			...aiSessionSnapshotsRef.current,
			[aiSessionKey]: {
			messages: aiMessages,
			lastCode: aiLastCode,
			summary: aiSummary,
			changeItems: aiChangeItems,
			history: aiRequestHistory.slice(0, AI_HISTORY_LIMIT),
				updatedAt: Date.now(),
			},
		};

		const snapshotEntries = Object.entries(nextSnapshots)
			.sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0))
			.slice(0, AI_SESSION_MAX);
		aiSessionSnapshotsRef.current = Object.fromEntries(snapshotEntries);
		try {
			sessionStorage.setItem(AI_SESSION_STORAGE_KEY, JSON.stringify(aiSessionSnapshotsRef.current));
			localStorage.setItem(AI_SESSION_LOCAL_STORAGE_KEY, JSON.stringify(aiSessionSnapshotsRef.current));
		} catch {
			// Ignore quota errors in session storage.
		}
	}, [
		aiSessionStorageReady,
		sessionHydratedKey,
		aiSessionKey,
		aiMessages,
		aiLastCode,
		aiSummary,
		aiChangeItems,
		aiRequestHistory,
	]);

	const updateHotkey = (action: HotkeyAction, value: string) => {
		const key = String(value || "").trim().toLowerCase();
		setHotkeys((prev) => {
			const next = { ...prev, [action]: key || DEFAULT_HOTKEYS[action] };
			localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(next));
			return next;
		});
	};

	const resetHotkeys = () => {
		setHotkeys(DEFAULT_HOTKEYS);
		localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(DEFAULT_HOTKEYS));
	};

	// Load code list based on selected type
	const loadCodeList = async (type: number) => {
		setLoading(true);
		try {
			const response = await fetchCodeList(appId, type);
			if (response.success) {
				setCodeList(response.data);
			} else {
				message.error(response.error || t("system.developer.loadListFailed"));
			}
		} catch (error) {
			message.error(t("system.developer.loadListFailed"));
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	// Load code list on component mount and when code type changes
	useEffect(() => {
		loadCodeList(codeType);
	}, [codeType, appId]);

	// Load selected code
	const handleSelectCode = (codeName: string) => {
		setSelectedCode(codeName);
		const code = codeList.find(c => c.p_name === codeName);
		if (code) {
			try {
				const decrypted = decryptCode(code.p_code);
				setCodeContent(decrypted);
				setAiLastCode(decrypted);
				setSavedCodeSnapshot(decrypted);
				setPendingChunk(null);
			} catch (error) {
				message.error(t("system.developer.decryptFailed"));
				setCodeContent(code.p_code);
				setAiLastCode(code.p_code);
				setSavedCodeSnapshot(code.p_code);
				setPendingChunk(null);
			}
		}
	};

	// Save code
	const handleSaveCode = async () => {
		if (!selectedCode) {
			message.warning(t("system.developer.selectOrCreateFirst"));
			return;
		}

		try {
			const code = codeList.find(c => c.p_name === selectedCode);
			const result = await saveCode(appId, selectedCode, codeContent, codeType, code?.id);

			if (result.success) {
				message.success(result.message);
				setSavedCodeSnapshot(codeContent);
				loadCodeList(codeType);
			} else {
				message.error(result.error);
			}
		} catch (error) {
			message.error(t("system.developer.saveFailed"));
			console.error(error);
		}
	};

	// Delete code
	const handleDeleteCode = () => {
		if (!selectedCode) {
			message.warning(t("system.developer.selectToDelete"));
			return;
		}

		Modal.confirm({
			title: t("system.developer.deleteTitle"),
			content: t("system.developer.deleteConfirm", { name: selectedCode }),
			okText: t("system.developer.yes"),
			cancelText: t("system.developer.no"),
			onOk: async () => {
				try {
					const code = codeList.find(c => c.p_name === selectedCode);
					if (!code) return;

					const result = await deleteCode(appId, code.id || "", selectedCode, codeType, code.p_code);

					if (result.success) {
						message.success(result.message);
						loadCodeList(codeType);
					} else {
						message.error(result.error);
					}
				} catch (error) {
					message.error(t("system.developer.deleteFailed"));
					console.error(error);
				}
			},
		});
	};

	// Create new code
	const handleCreateCode = async () => {
		if (!newCodeName.trim()) {
			message.warning(t("system.developer.enterCodeName"));
			return;
		}

		setCreateModalOpen(false);
		setNewCodeName("");
		setSelectedCode(newCodeName.trim());
		setCodeContent("");
		setAiLastCode("");
		setSavedCodeSnapshot("");
		setPendingChunk(null);
	};

	const runEditorCommand = (command: (view: any) => boolean, fallbackMessage?: string) => {
		const view = editorRef.current;
		if (!view) return;
		view.focus();
		const handled = command(view);
		if (!handled && fallbackMessage) {
			message.info(fallbackMessage);
		}
	};

	const openEditorSearch = () => {
		runEditorCommand(openSearchPanel, t("system.developer.ai.searchPanelUnavailable", "Không mở được thanh tìm kiếm của editor."));
	};

	const openEditorGotoLine = () => {
		const view = editorRef.current;
		if (!view) return;
		view.focus();
		const handled = gotoLine(view);
		if (!handled) {
			setGotoModalOpen(true);
		}
	};

	const applyGotoLine = () => {
		const view = editorRef.current;
		if (!view) {
			setGotoModalOpen(false);
			return;
		}

		const raw = Number(gotoLineInput);
		if (!Number.isFinite(raw)) {
			message.warning(t("system.developer.ai.gotoEnterNumber", "Vui lòng nhập số dòng hợp lệ."));
			return;
		}

		const totalLines = Math.max(1, Number(view.state.doc?.lines || 1));
		const lineNumber = Math.max(1, Math.min(totalLines, Math.floor(raw)));
		const line = view.state.doc.line(lineNumber);

		view.dispatch({
			selection: { anchor: line.from },
			scrollIntoView: true,
		});
		view.focus();
		setGotoModalOpen(false);
		setGotoLineInput(String(lineNumber));
		message.success(t("system.developer.ai.gotoMoved", "Đã di chuyển tới dòng {{line}}.", { line: lineNumber }));
	};

	const handleUndo = () => {
		runEditorCommand(undo);
	};

	const handleRedo = () => {
		runEditorCommand(redo);
	};

	const formatHistoryTime = (timestamp: number) => {
		try {
			return new Date(timestamp).toLocaleString();
		} catch {
			return "";
		}
	};

	const buildChangedLineRanges = (beforeText: string, afterText: string): DraftLineRange[] => {
		const beforeLines = String(beforeText || "").split("\n");
		const afterLines = String(afterText || "").split("\n");
		const max = Math.max(beforeLines.length, afterLines.length);
		const changedRanges: DraftLineRange[] = [];
		for (let index = 0; index < max; index += 1) {
			const beforeLine = beforeLines[index];
			const afterLine = afterLines[index];
			if (beforeLine !== afterLine) {
				const line = Math.max(1, index + 1);
				const action: DraftChangeAction = beforeLine === undefined
					? "add"
					: afterLine === undefined
						? "delete"
						: "edit";
				changedRanges.push({ fromLine: line, toLine: line, action });
			}
		}
		return mergeDraftRanges(changedRanges).slice(0, 24);
	};

	const buildRealtimeRangesFromProgress = (progress: any, beforeText: string, afterText: string): DraftLineRange[] => {
		const rangeCollections = [
			progress?.textEdits,
			progress?.lineRanges,
			progress?.ranges,
			progress?.changedRanges,
			progress?.lineChanges,
			progress?.changes,
			progress?.patchOps,
		].filter((entry) => Array.isArray(entry) && entry.length > 0) as any[];

		for (const collection of rangeCollections) {
			const parsed: DraftLineRange[] = collection.map((item: any) => {
				const rawStart = item?.startLine ?? item?.fromLine ?? item?.line ?? item?.range?.startLine ?? item?.range?.start?.line;
				const startLine = parseLineNumber(rawStart, 1);
				const rawEnd = item?.endLine ?? item?.toLine ?? item?.range?.endLine ?? item?.range?.end?.line;
				const endLine = Math.max(startLine, parseLineNumber(rawEnd, startLine));
				const action = normalizeDraftAction(item?.action ?? item?.type ?? item?.op ?? item?.kind);
				return { fromLine: startLine, toLine: endLine, action };
			}).filter((range: DraftLineRange) => Number.isFinite(range.fromLine) && Number.isFinite(range.toLine));

			if (parsed.length > 0) {
				return mergeDraftRanges(parsed);
			}
		}

		return buildChangedLineRanges(beforeText, afterText);
	};

	const formatRangesText = (ranges: DraftLineRange[]): string => {
		if (!Array.isArray(ranges) || ranges.length === 0) {
			return t("system.developer.ai.noLineChanges", "Không có thay đổi dòng cụ thể.");
		}
		return ranges
			.map((range) => {
				const marker = range.action === "add" ? "+" : range.action === "delete" ? "-" : "~";
				return range.fromLine === range.toLine
					? `${marker}L${range.fromLine}`
					: `${marker}L${range.fromLine}-L${range.toLine}`;
			})
			.join(", ");
	};

	const addAiMessage = (role: AiRole, content: string) => {
		setAiMessages(prev => [
			...prev,
			{
				id: `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
				role,
				content,
				createdAt: Date.now(),
			},
		]);
	};

	const applyDraftFromAi = (nextCode: string) => {
		aiProgrammaticApplyRef.current = true;
		setAiLastCode(nextCode);
		setCodeContent(nextCode);
		setTimeout(() => {
			aiProgrammaticApplyRef.current = false;
		}, 0);
	};

	const handleAskAi = async (continueMode = false) => {
		const requestText = aiPromptText.trim();
		if (!requestText) {
			message.warning(t("system.developer.ai.enterRequest"));
			return;
		}

		const requestCreatedAt = Date.now();
		const historyId = `${requestCreatedAt}_${Math.random().toString(16).slice(2, 10)}`;
		const requestBaseRevision = manualDraftRevisionRef.current;
		const shouldAutoApplyAi = () => manualDraftRevisionRef.current === requestBaseRevision;

		setAiLoading(true);
		setAiSummary("");
		setAiChangeItems([]);
		setPendingChunk(null);
		// Keep draft editor active during request so AI can stream/update directly on it.
		if (!continueMode && !aiLastCode.trim()) {
			setAiLastCode(codeContent || "");
		}
		setAiProgress({ status: "preparing", stage: "preparing", message: t("system.developer.ai.preparing"), percent: 0 });
		addAiMessage("user", requestText);

		try {
			const prompt = createAiPrompt({
				appId,
				language: currentLanguage,
				codeName: selectedCode,
				codeType: resolvedPType,
				currentCode: continueMode && aiLastCode ? aiLastCode : codeContent,
				requestText,
				messages: aiMessages,
			});

			const response = await generateSeoContentWithPrompt(prompt, {
				onProgress: (progress) => {
					const liveDraft = [
						progress?.draftCode,
						progress?.code,
						progress?.partialCode,
						progress?.previewCode,
					].find((item) => typeof item === "string" && String(item).trim().length > 0);
					if (typeof liveDraft === "string") {
						const before = currentDraftRef.current;
						if (liveDraft !== before) {
							const ranges = buildRealtimeRangesFromProgress(progress, before, liveDraft);
							if (shouldAutoApplyAi()) {
								setPendingChunk({
									id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
									before,
									after: liveDraft,
									ranges,
									applied: true,
									createdAt: Date.now(),
								});
								applyDraftFromAi(liveDraft);
							} else {
								setPendingChunk({
									id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
									before,
									after: liveDraft,
									ranges,
									applied: false,
									createdAt: Date.now(),
								});
							}
						}
					}
					setAiProgress({
						status: progress?.status,
						stage: progress?.stage,
						message: progress?.message,
						percent: Number(progress?.percent ?? 0),
						jobId: progress?.jobId,
						elapsedMs: Number(progress?.elapsedMs ?? 0),
					});
				},
			});

			if (!response?.success) {
				throw new Error(response?.message || t("system.developer.ai.requestFailed"));
			}

			const parsed = parseAiCodeResponse(response);
			if (!parsed?.code) {
				throw new Error(t("system.developer.ai.missingCode"));
			}

			const completedHistoryItem: AiRequestHistoryItem = {
				id: historyId,
				request: requestText,
				status: "completed",
				summary: parsed.summary || t("system.developer.ai.generatedReady"),
				changes: Array.isArray(parsed.changes) ? parsed.changes : [],
				draftCode: parsed.code,
				createdAt: requestCreatedAt,
			};

			if (shouldAutoApplyAi()) {
				applyDraftFromAi(parsed.code);
				setPendingChunk(null);
			} else {
				const before = currentDraftRef.current;
				const ranges = buildChangedLineRanges(before, parsed.code);
				setPendingChunk({
					id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
					before,
					after: parsed.code,
					ranges,
					applied: false,
					createdAt: Date.now(),
				});
				message.info(t("system.developer.ai.pendingApply", "AI đã tạo bản nháp mới. Bạn đang chỉnh tay nên AI không tự ghi đè. Nhấn Accept chunk để áp dụng."));
			}
			setAiSummary(parsed.summary || "");
			setAiChangeItems(Array.isArray(parsed.changes) ? parsed.changes : []);
			setAiRequestHistory((prev) => [
				completedHistoryItem,
				...prev,
			].slice(0, AI_HISTORY_LIMIT));
			setSelectedHistoryId(historyId);
			addAiMessage("assistant", parsed.summary || t("system.developer.ai.generatedReady"));
			setAiProgress({ status: "completed", stage: "completed", message: t("system.developer.ai.generatedReady"), percent: 100 });
			setAiPromptText("");
			message.success(t("system.developer.ai.generatedSuccess"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : t("system.developer.ai.requestFailed");
			setPendingChunk(null);
			const failedHistoryItem: AiRequestHistoryItem = {
				id: historyId,
				request: requestText,
				status: "failed",
				summary: msg,
				changes: [],
				draftCode: "",
				createdAt: requestCreatedAt,
			};
			setAiProgress({ status: "failed", stage: "failed", message: msg, percent: 0 });
			setAiRequestHistory((prev) => [
				failedHistoryItem,
				...prev,
			].slice(0, AI_HISTORY_LIMIT));
			setSelectedHistoryId(historyId);
			addAiMessage("assistant", `${t("system.developer.ai.errorPrefix")}: ${msg}`);
			message.error(msg);
		} finally {
			setAiLoading(false);
		}
	};

	const handleAcceptChunk = () => {
		if (pendingChunk && pendingChunk.applied === false) {
			applyDraftFromAi(pendingChunk.after);
		}
		setPendingChunk(null);
		message.success(t("system.developer.ai.chunkAccepted", "Đã chấp nhận phần AI vừa cập nhật."));
	};

	const handleRejectChunk = () => {
		if (!pendingChunk) return;
		if (pendingChunk.applied !== false) {
			applyDraftFromAi(pendingChunk.before);
		}
		setPendingChunk(null);
		message.info(t("system.developer.ai.chunkRejected", "Đã hoàn tác phần AI vừa cập nhật."));
	};

	const handleRestoreHistoryItem = (item: AiRequestHistoryItem) => {
		setSelectedHistoryId(item.id);
		setPendingChunk(null);
		setAiPromptText(item.request || "");
		setAiSummary(item.summary || "");
		setAiChangeItems(Array.isArray(item.changes) ? item.changes : []);
		if (item.draftCode) {
			setAiLastCode(item.draftCode);
			setCodeContent(item.draftCode);
		}
	};

	const handleTogglePinHistoryItem = (id: string) => {
		setAiRequestHistory((prev) => prev.map((item) => {
			if (item.id !== id) return item;
			return { ...item, pinned: !item.pinned };
		}));
	};

	const handleClearCurrentAiSession = () => {
		setAiMessages([]);
		setAiSummary("");
		setAiChangeItems([]);
		setAiRequestHistory([]);
		setAiProgress(null);
		setPendingChunk(null);
		setSelectedHistoryId(null);
		delete aiSessionSnapshotsRef.current[aiSessionKey];
		try {
			sessionStorage.setItem(AI_SESSION_STORAGE_KEY, JSON.stringify(aiSessionSnapshotsRef.current));
			localStorage.setItem(AI_SESSION_LOCAL_STORAGE_KEY, JSON.stringify(aiSessionSnapshotsRef.current));
		} catch {
			// Ignore storage write errors.
		}
	};

	const runCommand = async (commandId: string) => {
		switch (commandId) {
			case "askAi":
				await handleAskAi(false);
				break;
			case "continueAi":
				await handleAskAi(true);
				break;
			case "save":
				await handleSaveCode();
				break;
			case "find":
				openEditorSearch();
				break;
			case "replaceFocus":
				openEditorSearch();
				break;
			case "goto":
				openEditorGotoLine();
				break;
			default:
				break;
		}
		setCommandPaletteOpen(false);
	};

	const commandItems = useMemo(() => {
		const rows = [
			{ id: "askAi", label: t("system.developer.command.askAi") },
			{ id: "continueAi", label: t("system.developer.command.continueAi") },
			{ id: "save", label: t("system.developer.command.save") },
			{ id: "find", label: t("system.developer.command.find") },
			{ id: "replaceFocus", label: t("system.developer.command.replace") },
			{ id: "goto", label: t("system.developer.command.goto") },
			{ id: "hotkeys", label: t("system.developer.command.hotkeys") },
		] as Array<{ id: string; label: string }>;
		const kw = commandSearch.trim().toLowerCase();
		if (!kw) return rows;
		return rows.filter((x) => x.label.toLowerCase().includes(kw));
	}, [commandSearch, t]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const key = String(event.key || "").toLowerCase();
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;

			if (key === hotkeys.save) {
				event.preventDefault();
				void handleSaveCode();
				return;
			}

			if (key === hotkeys.find && !event.shiftKey) {
				event.preventDefault();
				openEditorSearch();
				return;
			}

			if (key === hotkeys.replaceFocus && event.shiftKey) {
				event.preventDefault();
				openEditorSearch();
				return;
			}

			if (key === hotkeys.goto) {
				event.preventDefault();
				openEditorGotoLine();
				return;
			}

			if (key === hotkeys.continueAi && event.shiftKey) {
				event.preventDefault();
				void handleAskAi(true);
				return;
			}

			if (key === hotkeys.askAi) {
				event.preventDefault();
				void handleAskAi(false);
				return;
			}

			if (key === hotkeys.commandPalette && !event.shiftKey) {
				event.preventDefault();
				setCommandPaletteOpen(true);
				return;
			}

		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [hotkeys, aiPromptText, codeContent, codeType, selectedCode, t]);

	return (
		<div className={styles.container}>
			{/* Code Editor */}
			<Card className={styles.surfaceCard}>
				<div className={styles.editorShell}>
					<div className={styles.editorToolbar}>
						<div className={styles.editorToolbarTitleRow}>
							<div className={styles.editorMeta}>
								<div className={styles.editorMetaTitle}>{t("system.developer.command.save")}</div>
								<div className={styles.editorMetaLine}>{t("system.developer.ai.currentFile")}: {selectedCodeLabel}</div>
								<div className={styles.editorMetaLine}>p_type={resolvedPType} • {currentTypeLabel} • app_id={appId}</div>
							</div>
							<div className={styles.editorToolbarActions}>
								<Button onClick={() => setCommandPaletteOpen(true)}>
									{t("system.developer.commandPalette")}
								</Button>
								<Button icon={<SettingOutlined />} onClick={() => setHotkeyModalOpen(true)}>
									{t("system.developer.hotkeys")}
								</Button>
								<Button icon={<SaveOutlined />} onClick={handleSaveCode} type="primary">
									{t("system.developer.command.save")}
								</Button>
								<Button icon={<DeleteOutlined />} danger onClick={handleDeleteCode}>
									{t("system.developer.delete")}
								</Button>
							</div>
						</div>

						<div className={styles.editorControlRow}>
							<div className={styles.toolbarCluster}>
								<Select
									style={{ width: 150 }}
									value={codeType}
									onChange={setCodeType}
									options={[
										{ label: "JavaScript", value: 0 },
										{ label: "HTML", value: 1 },
									]}
									placeholder={t("system.developer.selectCodeType")}
								/>
								<Select
									style={{ width: 260 }}
									placeholder={t("system.developer.selectOrCreateCode")}
									value={selectedCode || undefined}
									onChange={handleSelectCode}
									optionLabelProp="label"
									loading={loading}
									filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())}
									options={codeList.map(code => ({
										label: code.p_name,
										value: code.p_name,
									}))}
									allowClear
									onClear={() => {
										setSelectedCode(null);
										setCodeContent("");
										setAiLastCode("");
										setSavedCodeSnapshot("");
									}}
								/>
								<Button type="primary" onClick={() => setCreateModalOpen(true)}>
									{t("system.developer.createNew")}
								</Button>
							</div>
							<div className={styles.toolbarCluster}>
								<div className={styles.shortcutHint}>{modKeyLabel}+{String(hotkeys.save || "s").toUpperCase()}</div>
								<div className={styles.shortcutHint}>{modKeyLabel}+{String(hotkeys.find || "f").toUpperCase()}</div>
								<div className={styles.shortcutHint}>{modKeyLabel}+Shift+{String(hotkeys.replaceFocus || "f").toUpperCase()}</div>
								<div className={styles.shortcutHint}>{modKeyLabel}+{String(hotkeys.goto || "g").toUpperCase()}</div>
							</div>
						</div>

						<div className={styles.boundaryNote}>
							{t("system.developer.ai.saveBoundary", "Lưu hoặc Xóa tại đây sẽ cập nhật trực tiếp mã đang sử dụng trên hệ thống. Vui lòng kiểm tra kỹ trước khi thực hiện.")}
						</div>

					</div>

				</div>
			</Card>

			<Card className={styles.surfaceCard} style={{ marginTop: 16 }}>
				<div className={`${styles.aiShell} ${aiPanelMode === "expanded" ? styles.aiShellExpanded : ""}`}>
					<div className={styles.aiToolbar}>
						<div className={styles.surfaceHeader}>
							<div className={styles.surfaceMeta}>
								<div className={styles.surfaceTitle}>{t("system.developer.ai.workspaceTitle", "Copilot Chat cho Code Editor")}</div>
								<div>{t("system.developer.ai.workspaceDesc", "Chat này chỉ tạo bản nháp sửa code theo p_name và p_type đang chọn. Bạn vẫn phải tự bấm Lưu code ở khung trên khi muốn ghi DB.")}</div>
							</div>
							<div className={styles.surfaceBadgeRow}>
								<div className={styles.surfaceBadge}>p_name={selectedCodeLabel}</div>
								<div className={styles.surfaceBadge}>p_type={resolvedPType}</div>
								<div className={styles.surfaceBadge}>{currentTypeLabel}</div>
								<div className={styles.surfaceBadge}>{t("system.developer.ai.sessionCount", "Lịch sử phiên")}: {aiRequestHistory.length}</div>
								<div className={styles.aiPanelControls}>
									<Button size="small" icon={<HistoryOutlined />} onClick={handleClearCurrentAiSession}>
										{t("system.developer.ai.clearSession", "Xóa phiên")}
									</Button>
									<Button
										size="small"
										icon={aiLeftPanelHidden ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
										onClick={() => setAiLeftPanelHidden((prev) => !prev)}
									>
										{aiLeftPanelHidden
											? t("system.developer.ai.showLeftPanel", "Hiện panel trái")
											: t("system.developer.ai.hideLeftPanel", "Ẩn panel trái")}
									</Button>
									<Button
										size="small"
										icon={<ExpandOutlined />}
										onClick={() => setAiPanelMode((prev) => (prev === "expanded" ? "normal" : "expanded"))}
									>
										{aiPanelMode === "expanded"
											? t("system.developer.ai.exitFullscreen", "Thoát toàn màn")
											: t("system.developer.ai.fullscreen", "Toàn màn")}
									</Button>
								</div>
								<div className={styles.shortcutHint}>
									{modKeyLabel}+{String(hotkeys.askAi || "enter").toUpperCase()} | {modKeyLabel}+Shift+{String(hotkeys.continueAi || "enter").toUpperCase()}
								</div>
							</div>
						</div>

						<div className={styles.aiStatusRow}>
							{aiProgress && (
								<div className={styles.aiProgress}>
									{t("system.developer.ai.status")}: {aiStatusText}
									{aiProgress.message ? ` | ${aiProgress.message}` : ""}
									{aiProgress.percent != null ? ` | ${Math.max(0, Math.min(100, aiProgress.percent))}%` : ""}
									{aiProgress.jobId ? ` | ${t("system.developer.ai.job")}: ${aiProgress.jobId}` : ""}
								</div>
							)}

							{aiSummary && (
								<div className={styles.aiSummary}>
									<strong>{t("system.developer.ai.summary")}:</strong> {aiSummary}
								</div>
							)}
						</div>
					</div>

						<div className={`${styles.aiBody} ${aiLeftPanelHidden ? styles.aiBodyLeftHidden : ""}`}>
						{!aiLeftPanelHidden && (
						<div className={`${styles.aiColumn} ${styles.aiLeftColumn}`}>
							<div className={styles.aiSectionTitle}>{t("system.developer.ai.conversationTitle", "Hội thoại chỉnh sửa")}</div>
							<div className={styles.chatWorkspace}>
								<div className={styles.aiHistoryCard}>
									<div className={styles.aiHistoryTitle}>{t("system.developer.ai.currentSessionHistory", "Lịch sử yêu cầu trong phiên hiện tại")}</div>
									<div className={styles.aiHistoryToolbar}>
										<Select
											size="small"
											value={historyFilter}
											onChange={(value) => setHistoryFilter(value as AiHistoryFilter)}
											style={{ width: 140 }}
											options={[
												{ value: "all", label: t("system.developer.ai.filterAll", "Tất cả") },
												{ value: "completed", label: t("system.developer.ai.filterCompleted", "Thành công") },
												{ value: "failed", label: t("system.developer.ai.filterFailed", "Lỗi") },
												{ value: "pinned", label: t("system.developer.ai.filterPinned", "Đã ghim") },
											]}
										/>
										<Input
											size="small"
											value={historyKeyword}
											onChange={(e) => setHistoryKeyword(e.target.value)}
											placeholder={t("system.developer.ai.filterSearch", "Tìm trong lịch sử")}
											allowClear
										/>
									</div>
									<div className={styles.aiHistoryList}>
										{visibleAiRequestHistory.length === 0 && (
											<div className={styles.aiEmpty}>{t("system.developer.ai.noSessionHistory", "Chưa có request nào trong phiên này.")}</div>
										)}
										{visibleAiRequestHistory.map((item) => (
											<button
												type="button"
												key={item.id}
												onClick={() => handleRestoreHistoryItem(item)}
												className={`${styles.aiHistoryItem} ${selectedHistoryId === item.id ? styles.aiHistoryItemActive : ""}`}
											>
												<div className={styles.aiHistoryItemTop}>
													<div className={styles.aiHistoryItemMeta}>
														<span className={styles.aiHistoryStatus}>{item.status === "completed" ? t("system.developer.ai.historyCompleted", "Thành công") : t("system.developer.ai.historyFailed", "Lỗi")}</span>
														{item.pinned && <span className={styles.aiHistoryPinnedTag}>{t("system.developer.ai.pinned", "Đã ghim")}</span>}
													</div>
													<span className={styles.aiHistoryTime}>{formatHistoryTime(item.createdAt)}</span>
												</div>
												<div className={styles.aiHistoryRequest}>{item.request}</div>
												<div className={styles.aiHistorySummary}>{item.summary}</div>
												<div className={styles.aiHistoryItemActions}>
													<Button
														size="small"
														type={item.pinned ? "primary" : "default"}
														icon={item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
														onClick={(event) => {
															event.preventDefault();
															event.stopPropagation();
															handleTogglePinHistoryItem(item.id);
														}}
													>
														{item.pinned
															? t("system.developer.ai.unpin", "Bỏ ghim")
															: t("system.developer.ai.pin", "Ghim")}
													</Button>
												</div>
											</button>
										))}
									</div>
								</div>
								<div className={styles.aiChatMetaCard}>
									<div className={styles.aiChatMetaTitle}>{t("system.developer.ai.contextTitle", "Ngữ cảnh gửi cho Copilot")}</div>
									<div className={styles.aiChatMetaItem}>app_id: {appId}</div>
									<div className={styles.aiChatMetaItem}>p_name: {selectedCodeLabel}</div>
									<div className={styles.aiChatMetaItem}>p_type: {resolvedPType}</div>
									<div className={styles.aiChatMetaItem}>{t("system.developer.ai.language")}: {currentTypeLabel}</div>
								</div>
								<div className={styles.aiChat}>
									{aiMessages.length === 0 && <div className={styles.aiEmpty}>{t("system.developer.ai.noConversation")}</div>}
									{aiMessages.map((msg) => (
										<div key={msg.id} className={msg.role === "user" ? styles.aiMsgUser : styles.aiMsgAssistant}>
											<div className={styles.aiMsgRole}>{msg.role === "user" ? t("system.developer.ai.you") : "Copilot"}</div>
											<div>{msg.content}</div>
										</div>
									))}
								</div>
								<div className={styles.aiComposer}>
									<Input.TextArea
										ref={aiPromptInputRef}
										value={aiPromptText}
										onChange={(e) => setAiPromptText(e.target.value)}
										placeholder={t("system.developer.ai.promptPlaceholder")}
										rows={5}
										style={{ resize: "vertical", minHeight: 120 }}
									/>
									<div className={styles.aiComposerActions}>
										<div className={styles.aiComposerHint}>{t("system.developer.ai.composerHint", "Hãy mô tả cụ thể logic cần sửa, input/output mong muốn, và ràng buộc nghiệp vụ.")}</div>
										<div className={styles.aiActionRow}>
											<Button type="primary" loading={aiLoading} onClick={() => handleAskAi(false)}>
												{t("system.developer.ai.ask")}
											</Button>
											<Button loading={aiLoading} onClick={() => handleAskAi(true)}>
												{t("system.developer.ai.continue")}
											</Button>
										</div>
									</div>
								</div>
							</div>
						</div>
						)}

						<div className={`${styles.aiColumn} ${styles.aiRightColumn}`}>
							<div className={styles.aiSectionTitle}>
								{devUiText("Gợi ý từ AI (bạn có thể chỉnh sửa)", "AI suggestion (you can edit)", "AI 建议内容（可编辑）")}
							</div>
							{aiLeftPanelHidden && (
								<div className={styles.aiHiddenLeftHint}>
									{t("system.developer.ai.hiddenLeftHint", "Panel chat bên trái đang ẩn để mở rộng vùng soạn code. Bạn có thể bật lại bất cứ lúc nào.")}
									<Button size="small" onClick={() => setAiLeftPanelHidden(false)}>
										{t("system.developer.ai.showLeftPanel", "Hiện panel trái")}
									</Button>
								</div>
							)}
							{pendingChunk && (
								<div className={styles.aiChunkCard}>
									<div className={styles.aiChunkTitle}>{t("system.developer.ai.liveChunkTitle", "AI vừa cập nhật draft")}</div>
									<div className={styles.aiChunkMeta}>{formatRangesText(pendingChunk.ranges)}</div>
									<div className={styles.aiChunkActions}>
										<Button size="small" type="primary" onClick={handleAcceptChunk}>
											{t("system.developer.ai.acceptChunk", "Accept chunk")}
										</Button>
										<Button size="small" danger onClick={handleRejectChunk}>
											{t("system.developer.ai.rejectChunk", "Reject chunk")}
										</Button>
									</div>
								</div>
							)}
							{aiChangeItems.length > 0 && (
								<div className={styles.aiChangesCard}>
									<div className={styles.aiPreviewMetaTitle}>{t("system.developer.ai.changesTitle", "Điểm AI dự định chỉnh")}</div>
									<div className={styles.aiChangesList}>
										{aiChangeItems.map((item, index) => (
											<div key={`${index}_${item}`} className={styles.aiChangeItem}>{item}</div>
										))}
									</div>
								</div>
							)}
							<div className={styles.aiDraftEditorShell}>
								<div className={styles.aiDraftStatusBar}>
									<span className={draftDirty ? styles.aiDraftDirty : styles.aiDraftSaved}>
										{draftDirty ? t("system.developer.ai.unsaved", "Unsaved") : t("system.developer.ai.saved", "Saved")}
									</span>
									<span>{currentTypeLabel}</span>
									<span>L{draftCursor.line}:C{draftCursor.column}</span>
									<span>{draftStats.lines} lines</span>
									<span>{draftStats.chars} chars</span>
								</div>
								<div className={styles.aiDraftQuickActions}>
									<div className={styles.aiEditorToolsTitle}>
										{devUiText("Công cụ chỉnh sửa trong CodeMirror", "CodeMirror Editing Tools", "CodeMirror 编辑工具")}
									</div>
									<Button icon={<SearchOutlined />} onClick={openEditorSearch}>
										{devUiText("Tìm/Thay thế tất cả", "Find/Replace all", "查找/全部替换")}
									</Button>
									<Button icon={<SwapOutlined />} onClick={openEditorGotoLine}>
										{devUiText("Đi tới dòng", "Go to line", "跳转到行")}
									</Button>
									<Button onClick={handleUndo}>
										{devUiText("Hoàn tác", "Undo", "撤销")}
									</Button>
									<Button onClick={handleRedo}>
										{devUiText("Làm lại", "Redo", "重做")}
									</Button>
									<div className={styles.quickActionHint}>
										{devUiText(
											"Mobile: mở nhanh Search/Replace và Go to line ngay trong vùng editor này.",
											"Mobile: quick access to Search/Replace and Go to line inside this editor.",
											"移动端：可在此编辑区快速打开查找替换和跳转行。",
										)}
									</div>
								</div>
								<CodeMirror
									onCreateEditor={(view) => {
										editorRef.current = view;
										view.dispatch({ effects: setDraftHighlights.of(pendingChunk?.ranges || []) });
										updateDraftIndicators(view);
									}}
									value={aiLastCode}
									onChange={(value) => {
										if (!aiProgrammaticApplyRef.current) {
											manualDraftRevisionRef.current += 1;
										}
										setAiLastCode(value);
										setCodeContent(value);
										setPendingChunk(null);
										const view = editorRef.current;
										if (view) {
											updateDraftIndicators(view);
										}
									}}
									extensions={[
										search({ top: true }),
										draftMetricsExtension,
										draftHighlightField,
										draftHighlightTheme,
										codeType === 0 ? javascript() : html(),
									]}
									theme={vscodeDark}
									height="360px"
									editable
									className={styles.editor}
								/>
							</div>
						</div>
						</div>
				</div>
			</Card>

			{/* Create Code Modal */}
			<Modal
				title={t("system.developer.hotkeys")}
				open={hotkeyModalOpen}
				onCancel={() => setHotkeyModalOpen(false)}
				footer={[
					<Button key="reset" onClick={resetHotkeys}>{t("system.developer.hotkeyReset")}</Button>,
					<Button key="close" type="primary" onClick={() => setHotkeyModalOpen(false)}>{t("system.developer.close")}</Button>,
				]}
			>
				<Space direction="vertical" style={{ width: "100%" }}>
					{([
						["save", t("system.developer.hotkey.save")],
						["find", t("system.developer.hotkey.find")],
						["replaceFocus", t("system.developer.hotkey.replace")],
						["goto", t("system.developer.hotkey.goto")],
						["askAi", t("system.developer.hotkey.askAi")],
						["continueAi", t("system.developer.hotkey.continueAi")],
						["commandPalette", t("system.developer.hotkey.commandPalette")],
					] as Array<[HotkeyAction, string]>).map(([action, label]) => (
						<div key={action} className={styles.hotkeyRow}>
							<div className={styles.hotkeyLabel}>{label}</div>
							<Input
								value={hotkeys[action]}
								onChange={(e) => updateHotkey(action, e.target.value)}
								placeholder={t("system.developer.hotkey.singleKey")}
							/>
							<div className={styles.shortcutHint}>{modKeyLabel}+{String(hotkeys[action] || "").toUpperCase()}</div>
						</div>
					))}
				</Space>
			</Modal>

			<Modal
				title={t("system.developer.commandPalette")}
				open={commandPaletteOpen}
				onCancel={() => setCommandPaletteOpen(false)}
				footer={null}
			>
				<Space direction="vertical" style={{ width: "100%" }}>
					<Input
						value={commandSearch}
						onChange={(e) => setCommandSearch(e.target.value)}
						placeholder={t("system.developer.command.search")}
					/>
					<div className={styles.commandList}>
						{commandItems.map((item) => (
							<Button key={item.id} block onClick={() => {
								if (item.id === "hotkeys") {
									setCommandPaletteOpen(false);
									setHotkeyModalOpen(true);
									return;
								}
								void runCommand(item.id);
							}}>
								{item.label}
							</Button>
						))}
					</div>
				</Space>
			</Modal>

			<Modal
				title={t("system.developer.createNewCode")}
				open={createModalOpen}
				onOk={handleCreateCode}
				onCancel={() => setCreateModalOpen(false)}
			>
				<Form form={form} layout="vertical">
					<Form.Item label={t("system.developer.codeName")} required>
						<Input
							placeholder={t("system.developer.enterCodeName")}
							value={newCodeName}
							onChange={e => setNewCodeName(e.target.value)}
							onPressEnter={handleCreateCode}
						/>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t("system.developer.gotoLine")}
				open={gotoModalOpen}
				onOk={applyGotoLine}
				onCancel={() => setGotoModalOpen(false)}
				okText={t("system.developer.go", "Đi")}
				cancelText={t("system.developer.close")}
			>
				<Form layout="vertical">
					<Form.Item label={t("system.developer.gotoLine", "Đi tới dòng")}> 
						<Input
							autoFocus
							value={gotoLineInput}
							onChange={(e) => setGotoLineInput(e.target.value.replace(/[^0-9]/g, ""))}
							onPressEnter={applyGotoLine}
							placeholder={t("system.developer.ai.gotoPlaceholder", "Nhập số dòng (1, 2, 3...)")}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
