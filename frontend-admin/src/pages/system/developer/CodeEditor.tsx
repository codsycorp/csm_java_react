import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button, Select, Card, Space, message, Modal, Input, Form, Row, Col, Tag, Tooltip, Collapse } from "antd";
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
	BookOutlined,
	SyncOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import CodeMirror from "#src/components/editor/CodeMirrorWithAiAssistant";
import { getBusinessMemoryStats, scanIndexBusinessMemoryFromDir } from "#src/api/ai/assistant-engine";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { python } from "@codemirror/lang-python";
import { css } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { search, openSearchPanel, gotoLine } from "@codemirror/search";
import { undo, redo } from "@codemirror/commands";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { useTranslation } from "react-i18next";
import { useAppStore } from "#src/store";
import { usePreferences } from "#src/hooks";
import { AI_TIMEOUT_MS } from "#src/api/ai";
import { request } from "#src/utils";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
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
	createdAt: number;  // Request start time
	completedAt?: number;  // Actual completion time when stream finished
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

type PendingRangeItem = {
	key: string;
	range: DraftLineRange;
	label: string;
};

type PendingDiffPreview = {
	beforeText: string;
	afterText: string;
};

type HotkeyAction = "save" | "find" | "replaceFocus" | "goto" | "askAi" | "continueAi" | "commandPalette";

type HotkeyConfig = Record<HotkeyAction, string>;

const HOTKEY_STORAGE_KEY = "developer.codeeditor.hotkeys.v1";
const AI_SESSION_STORAGE_KEY = "developer.codeeditor.aiSessions.v1";
const AI_SESSION_LOCAL_STORAGE_KEY = "developer.codeeditor.aiSessions.persist.v1";
const NEXT_EDIT_PREDICTION_STORAGE_KEY = "developer.codeeditor.nextEditPrediction.v1";
const AI_HISTORY_LIMIT = 40;
const AI_SESSION_MAX = 50;
const MAX_STRUCTURED_TEXT_EDITS = 160;
const MAX_STRUCTURED_REPLACEMENT_CHARS = 800000;
const NEXT_EDIT_PREDICTION_DEBOUNCE_MS = 1500;
const NEXT_EDIT_PREDICTION_IDLE_MS = 700;
const MAX_IGNORED_PREDICTION_SPOTS = 160;
const PREDICTION_CACHE_MAX = 120;
const PREDICTION_CACHE_TTL_MS = 5 * 60 * 1000;

type StructuredTextEdit = {
	startLine: number;
	endLine: number;
	replacement: string;
	action?: DraftChangeAction;
};

type SearchReplaceBlock = {
	search: string;
	replace: string;
};

function buildRangeKey(range: DraftLineRange): string {
	return `${Number(range.fromLine || 1)}:${Number(range.toLine || 1)}:${String(range.action || "edit")}`;
}

function applySelectedRangesFromChunk(chunk: PendingDraftChunk, selectedRanges: DraftLineRange[]): string {
	if (!chunk || !Array.isArray(selectedRanges) || selectedRanges.length === 0) {
		return String(chunk?.before || "");
	}
	const beforeLines = String(chunk.before || "").split("\n");
	const afterLines = String(chunk.after || "").split("\n");
	const sorted = [...selectedRanges].sort((a, b) => Number(b.fromLine || 1) - Number(a.fromLine || 1));
	for (const range of sorted) {
		const from = Math.max(1, parseLineNumber(range.fromLine, 1));
		const to = Math.max(from, parseLineNumber(range.toLine, from));
		const replacement = afterLines.slice(from - 1, to);
		beforeLines.splice(from - 1, (to - from) + 1, ...replacement);
	}
	return beforeLines.join("\n");
}

function buildSelectedRangePreview(chunk: PendingDraftChunk | null, selectedRanges: DraftLineRange[]): PendingDiffPreview {
	if (!chunk || !Array.isArray(selectedRanges) || selectedRanges.length === 0) {
		return { beforeText: "", afterText: "" };
	}
	const beforeLines = String(chunk.before || "").split("\n");
	const afterLines = String(chunk.after || "").split("\n");
	const sectionsBefore: string[] = [];
	const sectionsAfter: string[] = [];
	const sorted = [...selectedRanges].sort((a, b) => Number(a.fromLine || 1) - Number(b.fromLine || 1));
	for (const range of sorted) {
		const from = Math.max(1, parseLineNumber(range.fromLine, 1));
		const to = Math.max(from, parseLineNumber(range.toLine, from));
		const action = normalizeDraftAction(range.action);
		const marker = action === "add" ? "+" : action === "delete" ? "-" : "~";
		const title = `${marker} L${from}${from === to ? "" : `-L${to}`}`;
		const beforeSnippet = beforeLines.slice(from - 1, to).join("\n");
		const afterSnippet = afterLines.slice(from - 1, to).join("\n");
		sectionsBefore.push(`### ${title}\n${beforeSnippet}`.trim());
		sectionsAfter.push(`### ${title}\n${afterSnippet}`.trim());
	}
	return {
		beforeText: sectionsBefore.join("\n\n"),
		afterText: sectionsAfter.join("\n\n"),
	};
}

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
	const maxConversationTurns = currentCode.length > 12000 ? 4 : 6;
	const recentConversation = messages
		.slice(-maxConversationTurns)
		.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
		.join("\n\n");

	const maxCodeChars = currentCode.length > 30000 ? 12000 : 18000;
	const trimmedCode = currentCode.length > maxCodeChars
		? `${currentCode.slice(0, maxCodeChars)}\n/* truncated for token budget */`
		: currentCode;

	return [
		"You are a senior coding assistant inside a low-code developer editor.",
		"This is the developer code editor workspace, not the menu JSON designer.",
		"Always preserve existing business logic unless the user explicitly asks to rewrite it.",
		"Treat p_name and p_type as the stable identity of the selected sys_autos record.",
		"Do not rename or switch the target record unless the user explicitly requests that.",
		"Your job is only to return an updated draft code suggestion. Database save/delete is handled separately by the UI.",
		"Preferred output for precise patching is SEARCH/REPLACE blocks:",
		"<<<<<<< SEARCH",
		"old code",
		"=======",
		"new code",
		">>>>>>> REPLACE",
		"Prefer strict JSON with position-based edits so the editor can apply only related lines:",
		"{",
		"  \"summary\": \"short explanation\",",
		"  \"textEdits\": [{\"startLine\": 10, \"endLine\": 12, \"replacement\": \"...\", \"action\": \"edit\"}],",
		"  \"changes\": [\"item 1\", \"item 2\"]",
		"}",
		"Fallback only when line edits are impossible:",
		"{\"summary\":\"...\",\"code\":\"full updated code\",\"changes\":[\"...\"]}",
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

function normalizeStructuredTextEdits(raw: any): StructuredTextEdit[] {
	if (!Array.isArray(raw)) return [];
	const out: StructuredTextEdit[] = [];
	for (const item of raw) {
		const startRaw = Number(item?.startLine ?? item?.start_line ?? item?.range?.startLine ?? item?.range?.start?.line ?? item?.line ?? 1);
		const endRaw = Number(item?.endLine ?? item?.end_line ?? item?.range?.endLine ?? item?.range?.end?.line ?? startRaw);
		const startLine = Math.max(1, Number.isFinite(startRaw) ? Math.floor(startRaw) : 1);
		const endLine = Math.max(startLine, Number.isFinite(endRaw) ? Math.floor(endRaw) : startLine);
		const replacement = String(item?.replacement ?? item?.text ?? item?.newText ?? "");
		const action = normalizeDraftAction(item?.action ?? "edit");
		out.push({ startLine, endLine, replacement, action });
		if (out.length >= MAX_STRUCTURED_TEXT_EDITS) break;
	}
	return out;
}

function validateStructuredTextEdits(baseText: string, textEdits: StructuredTextEdit[]): { valid: boolean; reason?: string; edits: StructuredTextEdit[] } {
	if (!Array.isArray(textEdits) || textEdits.length === 0) {
		return { valid: false, reason: "missing_edits", edits: [] };
	}
	if (textEdits.length > MAX_STRUCTURED_TEXT_EDITS) {
		return { valid: false, reason: "too_many_edits", edits: [] };
	}

	const baseLines = String(baseText || "").split("\n");
	const maxLine = Math.max(1, baseLines.length + 1);
	const normalized = [...textEdits].map((edit) => ({
		startLine: Math.max(1, Number.isFinite(Number(edit.startLine)) ? Math.floor(Number(edit.startLine)) : 1),
		endLine: Math.max(
			Math.max(1, Number.isFinite(Number(edit.startLine)) ? Math.floor(Number(edit.startLine)) : 1),
			Number.isFinite(Number(edit.endLine)) ? Math.floor(Number(edit.endLine)) : Math.max(1, Number.isFinite(Number(edit.startLine)) ? Math.floor(Number(edit.startLine)) : 1),
		),
		replacement: String(edit.replacement ?? ""),
		action: normalizeDraftAction(edit.action),
	}));

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
		replacementChars += edit.replacement.length;
		if (replacementChars > MAX_STRUCTURED_REPLACEMENT_CHARS) {
			return { valid: false, reason: "replacement_too_large", edits: [] };
		}
		previousEnd = edit.endLine;
	}

	return { valid: true, edits: normalized };
}

function applyTextEditsToDraft(baseText: string, textEdits: StructuredTextEdit[]): string {
	if (!Array.isArray(textEdits) || textEdits.length === 0) return baseText;
	const lines = String(baseText || "").split("\n");
	const sorted = [...textEdits].sort((a, b) => b.startLine - a.startLine);
	for (const edit of sorted) {
		const replacementLines = String(edit.replacement || "").split("\n");
		lines.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...replacementLines);
	}
	return lines.join("\n");
}

function summarizeTextEditRanges(edits: StructuredTextEdit[]): string[] {
	if (!Array.isArray(edits) || edits.length === 0) return [];
	return edits.slice(0, 8).map((edit) => {
		const rangeLabel = edit.startLine === edit.endLine
			? `L${edit.startLine}`
			: `L${edit.startLine}-L${edit.endLine}`;
		return `${String(edit.action || "edit").toUpperCase()} ${rangeLabel}`;
	});
}

function extractSearchReplaceBlocks(rawText: string): SearchReplaceBlock[] {
	const raw = String(rawText || "").trim();
	if (!raw) return [];
	const normalized = raw
		.replace(/^```[a-zA-Z]*\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	const regex = /<<<<<<<\s*SEARCH\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>>\s*REPLACE/g;
	const blocks: SearchReplaceBlock[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(normalized)) !== null) {
		const search = String(match[1] || "");
		if (!search.trim()) continue;
		blocks.push({ search, replace: String(match[2] || "") });
		if (blocks.length >= MAX_STRUCTURED_TEXT_EDITS) break;
	}
	return blocks;
}

function applySearchReplaceBlocksToDraft(baseText: string, blocks: SearchReplaceBlock[]): { code: string; applied: number; failed: number } {
	if (!Array.isArray(blocks) || blocks.length === 0) {
		return { code: baseText, applied: 0, failed: 0 };
	}
	let working = String(baseText || "");
	let applied = 0;
	let failed = 0;
	let searchFrom = 0;
	for (const block of blocks) {
		const search = String(block?.search || "");
		if (!search) {
			failed += 1;
			continue;
		}
		let idx = working.indexOf(search, Math.max(0, searchFrom));
		if (idx < 0) {
			idx = working.indexOf(search);
		}
		if (idx < 0) {
			failed += 1;
			continue;
		}
		working = `${working.slice(0, idx)}${String(block?.replace || "")}${working.slice(idx + search.length)}`;
		searchFrom = idx + Math.max(1, String(block?.replace || "").length);
		applied += 1;
	}
	return { code: working, applied, failed };
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

function extractValidJsonCandidate(rawText: string): string | null {
	const text = String(rawText || "").trim();
	if (!text) return null;
	const candidates = [text];

	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenceMatch?.[1]) {
		candidates.push(String(fenceMatch[1]).trim());
	}

	const objStart = text.indexOf("{");
	const objEnd = text.lastIndexOf("}");
	if (objStart >= 0 && objEnd > objStart) {
		candidates.push(text.slice(objStart, objEnd + 1).trim());
	}

	const arrStart = text.indexOf("[");
	const arrEnd = text.lastIndexOf("]");
	if (arrStart >= 0 && arrEnd > arrStart) {
		candidates.push(text.slice(arrStart, arrEnd + 1).trim());
	}

	for (const candidate of candidates) {
		try {
			JSON.parse(candidate);
			return candidate;
		} catch {
			// try next candidate
		}
	}

	return null;
}

function resolveContinueSafeCode(params: {
	continueMode: boolean;
	language: string;
	currentDraft: string;
	candidateCode: string;
}): { shouldApply: boolean; code: string; warning?: string } {
	const continueMode = Boolean(params.continueMode);
	const language = String(params.language || "").toLowerCase();
	const currentDraft = String(params.currentDraft || "");
	const candidateCode = String(params.candidateCode || "").trim();

	if (!candidateCode) {
		return {
			shouldApply: false,
			code: currentDraft,
			warning: "AI chưa trả về mã hợp lệ.",
		};
	}

	if (!continueMode) {
		return { shouldApply: true, code: candidateCode };
	}

	if (language === "json") {
		const validJson = extractValidJsonCandidate(candidateCode);
		if (!validJson) {
			return {
				shouldApply: false,
				code: currentDraft,
				warning: "Kết quả Continue chưa phải JSON hoàn chỉnh, giữ nguyên code cũ để tránh mất dữ liệu.",
			};
		}
		return { shouldApply: true, code: validJson };
	}

	const minExpected = Math.max(200, Math.floor(currentDraft.length * 0.4));
	if (currentDraft && candidateCode.length < minExpected) {
		return {
			shouldApply: false,
			code: currentDraft,
			warning: "Kết quả Continue có dấu hiệu chỉ là đoạn rời, giữ nguyên code cũ để tránh ghi đè nhầm.",
		};
	}

	return { shouldApply: true, code: candidateCode };
}

function tryExtractStructuredStreamingCode(rawText: string): string | null {
	let raw = String(rawText || "").trim();
	if (!raw) return null;
	if (raw.startsWith("```json")) raw = raw.slice(7).trim();
	if (raw.startsWith("```")) raw = raw.slice(3).trim();
	if (raw.endsWith("```")) raw = raw.slice(0, -3).trim();
	try {
		const obj = JSON.parse(raw);
		const code = typeof obj?.code === "string" ? obj.code : "";
		return code.trim() ? code : null;
	} catch {
		return null;
	}
}

function resolveSuggestedCodeFromAiResponse(params: {
	baseCode: string;
	fullResponse: string;
	completePayload?: Record<string, unknown> | null;
}): string | null {
	const baseCode = String(params.baseCode || "");
	const fullResponse = String(params.fullResponse || "").trim();
	const completePayload = params.completePayload;

	const parsed = parseAiCodeResponse({ result: fullResponse });
	if (parsed?.code && parsed.code !== baseCode) {
		return parsed.code;
	}

	const parsedEnvelopeCandidate = (() => {
		if (completePayload && (
			Array.isArray((completePayload as any).textEdits)
			|| Array.isArray((completePayload as any).text_edits)
			|| typeof (completePayload as any).code === "string"
		)) {
			return completePayload as any;
		}
		const raw = extractValidJsonCandidate(fullResponse);
		if (!raw) return null;
		try {
			const parsedJson = JSON.parse(raw);
			return parsedJson && typeof parsedJson === "object" ? parsedJson : null;
		} catch {
			return null;
		}
	})();

	if (!parsedEnvelopeCandidate) {
		return null;
	}

	if (typeof parsedEnvelopeCandidate.code === "string" && parsedEnvelopeCandidate.code !== baseCode) {
		return parsedEnvelopeCandidate.code;
	}

	const textEdits = normalizeStructuredTextEdits(
		parsedEnvelopeCandidate.textEdits ?? parsedEnvelopeCandidate.text_edits,
	);
	if (textEdits.length <= 0) {
		return null;
	}
	const validation = validateStructuredTextEdits(baseCode, textEdits);
	if (!validation.valid) {
		return null;
	}
	const next = applyTextEditsToDraft(baseCode, validation.edits);
	return next !== baseCode ? next : null;
}

function createPredictionSpotKey(params: {
	code: string;
	cursorLine: number;
	language: string;
	targetName?: string | null;
}): string {
	const code = String(params.code || "");
	const language = String(params.language || "text");
	const targetName = String(params.targetName || "__unsaved__");
	const lines = code.split("\n");
	const center = Math.max(1, Math.min(lines.length || 1, Math.floor(Number(params.cursorLine || 1))));
	const from = Math.max(1, center - 2);
	const to = Math.min(lines.length || 1, center + 2);
	const excerpt = lines.slice(from - 1, to).join("\n").slice(0, 320);
	return [targetName, language, center, excerpt].join("::");
}

function resolveCursorOffset(code: string, line: number, column: number): number {
	const lines = String(code || "").split("\n");
	const safeLine = Math.max(1, Math.min(lines.length || 1, Math.floor(Number(line || 1))));
	const safeColumn = Math.max(1, Math.floor(Number(column || 1)));
	let offset = 0;
	for (let i = 0; i < safeLine - 1; i += 1) {
		offset += (lines[i] || "").length + 1;
	}
	const targetLine = lines[safeLine - 1] || "";
	offset += Math.min(targetLine.length, safeColumn - 1);
	return Math.max(0, offset);
}

function buildPredictionCacheKey(params: {
	code: string;
	line: number;
	column: number;
	language: string;
	appId?: string;
	targetName?: string | null;
}): string {
	const code = String(params.code || "");
	const cursorOffset = resolveCursorOffset(code, params.line, params.column);
	const prefix = code.slice(Math.max(0, cursorOffset - 1200), cursorOffset);
	const suffix = code.slice(cursorOffset, Math.min(code.length, cursorOffset + 1200));
	return [
		String(params.appId || "csm"),
		String(params.targetName || "__unsaved__"),
		String(params.language || "text"),
		prefix,
		suffix,
	].join("<::>");
}

// ─── Language map: codeType → language id ────────────────────────────────────
const CODE_TYPE_LANGUAGE: Record<number, string> = {
	0: "javascript",
	1: "html",
	2: "python",
	3: "css",
	4: "sql",
	5: "json",
};

const CODE_TYPE_LABEL: Record<number, string> = {
	0: "JavaScript",
	1: "HTML",
	2: "Python",
	3: "CSS",
	4: "SQL",
	5: "JSON",
};

// ─── SSE streaming helper for /api/ai-code-stream ────────────────────────────
async function streamAiCode(
	params: {
		appId: string;
		message: string;
		currentCode: string;
		cursorLine?: number;
		contextWindowLines?: number;
		baseContentRef?: string;
		baseContent?: string;
		preserveBaseContent?: boolean;
		language: string;
		responseMode: string;
		contextType: string;
		flowType?: "menu_manager" | "code_editor";
		taskType?: string;
		signal?: AbortSignal;
	},
	callbacks: {
		onChunk?: (chunk: string, accumulated: string) => void;
		onStatus?: (status: Record<string, unknown>) => void;
		onComplete?: (event: Record<string, unknown>) => void;
		onError?: (error: string) => void;
	},
): Promise<void> {
	const resolvedFlowType = params.flowType
		|| (params.contextType === "menu_json" ? "menu_manager" : "code_editor");
	const resolvedTaskType = params.taskType
		|| (resolvedFlowType === "menu_manager" ? "menu_design" : "code_assistant");

	let response: Response;
	try {
		response = await request.post("ai-code-stream", {
			signal: params.signal,
			json: {
				...params,
				flowType: resolvedFlowType,
				taskType: resolvedTaskType,
			},
			timeout: AI_TIMEOUT_MS,
			throwHttpErrors: false,
		});
	} catch (err) {
		if ((err as Error)?.name === "AbortError") {
			callbacks.onStatus?.({ stage: "cancelled", status: "cancelled", message: "aborted" });
			return;
		}
		callbacks.onError?.(err instanceof Error ? err.message : "Network error");
		return;
	}

	if (!response.ok || !response.body) {
		callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
		return;
	}

	let accumulated = "";
	let completed = false;
	let streamChunkCount = 0;

	const streamStats = await consumeSseStream(response, {
		onEvent: (evt) => {
			const payload = (evt.payload && typeof evt.payload === "object")
				? (evt.payload as Record<string, unknown>)
				: null;
			if (!payload) {
				return;
			}
			if (String(payload.stage || "") === "streaming") {
				streamChunkCount += 1;
			}
			const result = dispatchAiCodeStreamEvent(payload, accumulated, callbacks);
			accumulated = result.accumulated;
			if (result.completed) {
				completed = true;
			}
		},
	});

	if (!completed) {
		callbacks.onStatus?.({
			stage: "warning",
			status: "incomplete",
			message: "Luồng stream kết thúc trước event complete",
			bytesReceived: streamStats.bytesReceived,
			sseLineCount: streamStats.dataLineCount,
			streamChunkCount,
			accumulatedChars: accumulated.length,
		});
		callbacks.onError?.("Stream ended before complete event");
	} else {
		callbacks.onStatus?.({
			stage: "stream_stats",
			status: "done",
			bytesReceived: streamStats.bytesReceived,
			sseLineCount: streamStats.dataLineCount,
			streamChunkCount,
			accumulatedChars: accumulated.length,
		});
	}
}

export default function CodeEditor() {
	const { t, i18n } = useTranslation();
	const appId = useAppStore(state => state.currentAppId);
	const editorRef = useRef<any>(null);
	const currentDraftRef = useRef("");
	const codeOpenJobRef = useRef(0);
	const manualDraftRevisionRef = useRef(0);
	const aiProgrammaticApplyRef = useRef(false);

	// State Management
	const [codeType, setCodeType] = useState<number>(0); // 0=JS, 1=HTML, 2=Python, 3=CSS, 4=SQL, 5=JSON
	const [codeList, setCodeList] = useState<CodeItem[]>([]);
	const [selectedCode, setSelectedCode] = useState<string | null>(null);
	const [codeContent, setCodeContent] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [openingCode, setOpeningCode] = useState(false);
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

	const [pendingChunk, setPendingChunk] = useState<PendingDraftChunk | null>(null);
	const [pendingRangeSelection, setPendingRangeSelection] = useState<Record<string, boolean>>({});
	const [pendingDiffPreviewOpen, setPendingDiffPreviewOpen] = useState(false);
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
	const [nextEditPredictionEnabled, setNextEditPredictionEnabled] = useState<boolean>(() => {
		try {
			return localStorage.getItem(NEXT_EDIT_PREDICTION_STORAGE_KEY) === "1";
		} catch {
			return false;
		}
	});
	const [inlinePredictedCode, setInlinePredictedCode] = useState<string | null>(null);
	const [ignoredPredictionCount, setIgnoredPredictionCount] = useState(0);
	const { isDark: prefersDarkMode } = usePreferences();
	const [form] = Form.useForm();
	const predictionDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const predictionAbortRef = useRef<AbortController | null>(null);
	const predictionSeqRef = useRef(0);
	const predictionCacheRef = useRef<Map<string, { value: string; ts: number }>>(new Map());
	const lastEditorInteractionAtRef = useRef<number>(Date.now());
	const ignoredPredictionSpotsRef = useRef<Set<string>>(new Set());
	const editorScrollCleanupRef = useRef<(() => void) | null>(null);

	const isMac = useMemo(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || ""), []);
	const modKeyLabel = isMac ? "Cmd" : "Ctrl";
	const selectedCodeItem = useMemo(
		() => codeList.find((item) => item.p_name === selectedCode) || null,
		[codeList, selectedCode],
	);
	const selectedCodeLabel = selectedCode || t("system.developer.ai.unsaved");
	const resolvedPType = selectedCodeItem?.p_type ?? codeType;
	const currentLanguage = CODE_TYPE_LANGUAGE[codeType] ?? "javascript";
	const currentTypeLabel = CODE_TYPE_LABEL[codeType] ?? "JavaScript";
	const aiBaseContentRef = useRef("");
	const LARGE_BASE_CONTENT_THRESHOLD = 120000;
	const aiSessionSnapshotsRef = useRef<Record<string, AiSessionSnapshot>>({});
	const aiSessionKey = useMemo(
		() => `${appId || "unknown"}::${selectedCode || "__unsaved__"}::${resolvedPType}::${currentLanguage}`,
		[appId, selectedCode, resolvedPType, currentLanguage],
	);
	const draftDirty = useMemo(
		() => String(codeContent || "") !== String(savedCodeSnapshot || ""),
		[codeContent, savedCodeSnapshot],
	);

	// ─── Business Memory panel ────────────────────────────────────────────────
	const [bmStats, setBmStats] = useState<Record<string, unknown> | null>(null);
	const [bmIndexing, setBmIndexing] = useState(false);
	const [bmStatsLoading, setBmStatsLoading] = useState(false);

	const refreshBmStats = useCallback(async () => {
		if (!appId) return;
		setBmStatsLoading(true);
		try {
			const stats = await getBusinessMemoryStats(appId);
			setBmStats(stats);
		} catch {
			// silent
		} finally {
			setBmStatsLoading(false);
		}
	}, [appId]);

	useEffect(() => { void refreshBmStats(); }, [refreshBmStats]);

	const handleScanIndex = useCallback(async () => {
		if (!appId) return;
		setBmIndexing(true);
		try {
			const res = await scanIndexBusinessMemoryFromDir(appId);
			if (!res.success) {
				message.error(res.message || "Scan index thất bại");
			} else {
				const count = res.indexed?.length ?? 0;
				message.success(res.message || `Đã index ${count} file(s) từ server`);
				void refreshBmStats();
			}
		} catch (err: any) {
			message.error(err?.message || "Không thể scan index");
		} finally {
			setBmIndexing(false);
		}
	}, [appId, refreshBmStats]);

	const devUiText = (vi: string, en: string, zh: string) => {
		const lang = String(i18n.resolvedLanguage || i18n.language || "vi").toLowerCase();
		if (lang.startsWith("zh")) return zh;
		if (lang.startsWith("en")) return en;
		return vi;
	};

	const updateDraftIndicators = (view: any) => {
		if (!view?.state?.doc) return;
		lastEditorInteractionAtRef.current = Date.now();
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
			lastEditorInteractionAtRef.current = Date.now();
			updateDraftIndicators(update.view);
		}),
		[],
	);

	useEffect(() => {
		return () => {
			editorScrollCleanupRef.current?.();
			editorScrollCleanupRef.current = null;
		};
	}, []);

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

	const pendingRangeItems = useMemo<PendingRangeItem[]>(() => {
		const ranges = pendingChunk?.ranges || [];
		return ranges.map((range) => {
			const from = Math.max(1, Number(range.fromLine || 1));
			const to = Math.max(from, Number(range.toLine || from));
			const marker = range.action === "add" ? "+" : range.action === "delete" ? "-" : "~";
			const label = from === to ? `${marker}L${from}` : `${marker}L${from}-L${to}`;
			return {
				key: buildRangeKey(range),
				range,
				label,
			};
		});
	}, [pendingChunk]);

	const selectedPendingRanges = useMemo<DraftLineRange[]>(() => {
		if (!pendingChunk) return [];
		return pendingRangeItems
			.filter((item) => pendingRangeSelection[item.key] !== false)
			.map((item) => item.range);
	}, [pendingChunk, pendingRangeItems, pendingRangeSelection]);

	const pendingPreviewCode = useMemo(() => {
		if (!pendingChunk) return "";
		return applySelectedRangesFromChunk(pendingChunk, selectedPendingRanges);
	}, [pendingChunk, selectedPendingRanges]);

	const pendingDiffPreview = useMemo(
		() => buildSelectedRangePreview(pendingChunk, selectedPendingRanges),
		[pendingChunk, selectedPendingRanges],
	);

	const pendingMergePreview = useMemo(() => ({
		beforeText: String(pendingChunk?.before || ""),
		afterText: String(pendingPreviewCode || pendingChunk?.after || ""),
	}), [pendingChunk, pendingPreviewCode]);

	const pendingSelectedCount = selectedPendingRanges.length;

	useEffect(() => {
		currentDraftRef.current = aiLastCode;
	}, [aiLastCode]);

	useEffect(() => {
		if (!pendingChunk) {
			setPendingRangeSelection({});
			return;
		}
		const next: Record<string, boolean> = {};
		for (const range of pendingChunk.ranges || []) {
			next[buildRangeKey(range)] = true;
		}
		setPendingRangeSelection(next);
	}, [pendingChunk]);

	useEffect(() => {
		const view = editorRef.current;
		if (!view) return;
		const ranges = selectedPendingRanges;
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
	}, [selectedPendingRanges]);

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
		setOpeningCode(true);
		const jobId = Date.now();
		codeOpenJobRef.current = jobId;
		const code = codeList.find(c => c.p_name === codeName);

		window.requestAnimationFrame(() => {
			if (codeOpenJobRef.current !== jobId) return;
			if (!code) {
				setCodeContent("");
				setAiLastCode("");
				setSavedCodeSnapshot("");
				setPendingChunk(null);
				setOpeningCode(false);
				return;
			}

			try {
				const decrypted = decryptCode(code.p_code);
				if (codeOpenJobRef.current !== jobId) return;
				setCodeContent(decrypted);
				setAiLastCode(decrypted);
				setSavedCodeSnapshot(decrypted);
				setPendingChunk(null);
			} catch (error) {
				message.error(t("system.developer.decryptFailed"));
				if (codeOpenJobRef.current !== jobId) return;
				setCodeContent(code.p_code);
				setAiLastCode(code.p_code);
				setSavedCodeSnapshot(code.p_code);
				setPendingChunk(null);
			} finally {
				if (codeOpenJobRef.current === jobId) {
					setOpeningCode(false);
				}
			}
		});
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
		codeOpenJobRef.current += 1;
		setOpeningCode(false);
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

	const handleAiRewriteSelection = async () => {
		const view = editorRef.current;
		if (!view?.state?.doc) {
			message.warning(devUiText(
				"Editor chưa sẵn sàng.",
				"Editor is not ready.",
				"编辑器尚未就绪。",
			));
			return;
		}
		const selection = view.state.selection?.main;
		if (!selection || selection.empty) {
			message.warning(devUiText(
				"Hãy chọn một đoạn code trước khi yêu cầu AI rewrite.",
				"Select a code range before asking AI to rewrite.",
				"请先选择代码范围再让 AI 重写。",
			));
			return;
		}
		const userPrompt = window.prompt(
			devUiText(
				"Nhập yêu cầu rewrite cho vùng chọn:",
				"Enter rewrite instruction for selected code:",
				"输入针对选中代码的重写指令：",
			),
			"",
		);
		if (!userPrompt || !userPrompt.trim()) {
			return;
		}

		const selectedCode = view.state.doc.sliceString(selection.from, selection.to);
		let fullResponse = "";
		let streamErr = "";

		setAiLoading(true);
		setAiProgress({ status: "preparing", stage: "selection_rewrite", message: devUiText("AI đang rewrite vùng chọn...", "AI is rewriting selection...", "AI 正在重写所选内容..."), percent: 10 });
		try {
			await streamAiCode(
				{
					appId: appId || "",
					message: [
						"Rewrite ONLY the selected code section.",
						"Return only replacement code, no markdown.",
						`Instruction: ${userPrompt.trim()}`,
						"Selected code:",
						selectedCode,
					].join("\n\n"),
					currentCode: String(aiLastCode || ""),
					cursorLine: Number(view.state.doc.lineAt(selection.from).number || draftCursor.line || 1),
					contextWindowLines: 60,
					language: currentLanguage,
					responseMode: "edit",
					contextType: "code",
				},
				{
					onChunk: (_chunk, accumulated) => {
						fullResponse = accumulated;
						setAiProgress({ status: "streaming", stage: "selection_rewrite", message: devUiText("Đang nhận kết quả rewrite...", "Receiving rewrite result...", "正在接收重写结果..."), percent: 60 });
					},
					onComplete: (event) => {
						fullResponse = String(event.fullResponse || fullResponse);
					},
					onError: (err) => {
						streamErr = err;
					},
				},
			);

			if (streamErr) {
				throw new Error(streamErr);
			}
			if (!fullResponse.trim()) {
				throw new Error(devUiText("AI chưa trả về nội dung thay thế.", "AI returned empty replacement.", "AI 未返回替换内容。"));
			}

			const parsed = parseAiCodeResponse({ result: fullResponse });
			const replacement = String(parsed?.code || fullResponse || "").trim();
			if (!replacement) {
				throw new Error(devUiText("Nội dung thay thế rỗng.", "Replacement is empty.", "替换内容为空。"));
			}

			view.dispatch({
				changes: {
					from: selection.from,
					to: selection.to,
					insert: replacement,
				},
			});
			setAiProgress({ status: "completed", stage: "selection_rewrite", message: devUiText("Rewrite vùng chọn thành công.", "Selection rewrite completed.", "选区重写完成。"), percent: 100 });
			message.success(devUiText("Đã rewrite vùng chọn.", "Selection rewritten.", "已重写所选内容。"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : devUiText("Rewrite vùng chọn thất bại.", "Selection rewrite failed.", "选区重写失败。");
			setAiProgress({ status: "failed", stage: "selection_rewrite", message: msg, percent: 0 });
			message.error(msg);
		} finally {
			setAiLoading(false);
		}
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

	const togglePendingRange = (key: string) => {
		setPendingRangeSelection((prev) => ({
			...prev,
			[key]: !(prev[key] !== false),
		}));
	};

	const selectAllPendingRanges = () => {
		const next: Record<string, boolean> = {};
		for (const item of pendingRangeItems) {
			next[item.key] = true;
		}
		setPendingRangeSelection(next);
	};

	const clearPendingRangeSelection = () => {
		const next: Record<string, boolean> = {};
		for (const item of pendingRangeItems) {
			next[item.key] = false;
		}
		setPendingRangeSelection(next);
	};

	const applySelectedPendingRanges = () => {
		if (!pendingChunk) return;
		if (pendingSelectedCount <= 0) {
			message.warning(t("system.developer.ai.pendingApply", "Vui lòng chọn ít nhất 1 vùng thay đổi để áp dụng."));
			return;
		}
		applyDraftFromAi(pendingPreviewCode);
		setPendingChunk(null);
		setPendingDiffPreviewOpen(false);
		message.success(t("system.developer.ai.generatedSuccess"));
	};

	const dropSelectedPendingRanges = () => {
		if (!pendingChunk) return;
		const keep = pendingRangeItems
			.filter((item) => pendingRangeSelection[item.key] === false)
			.map((item) => item.range);
		if (keep.length === 0) {
			setPendingChunk(null);
			setPendingDiffPreviewOpen(false);
			message.info(t("system.developer.ai.pendingApply", "Đã bỏ toàn bộ thay đổi đang chờ."));
			return;
		}
		setPendingChunk({
			...pendingChunk,
			after: applySelectedRangesFromChunk(pendingChunk, keep),
			ranges: keep,
		});
		setPendingDiffPreviewOpen(false);
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
		setInlinePredictedCode(null);
		setAiLastCode(nextCode);
		setCodeContent(nextCode);
		setTimeout(() => {
			aiProgrammaticApplyRef.current = false;
		}, 0);
	};

	const setNextEditPrediction = useCallback((enabled: boolean) => {
		setNextEditPredictionEnabled(Boolean(enabled));
		try {
			localStorage.setItem(NEXT_EDIT_PREDICTION_STORAGE_KEY, enabled ? "1" : "0");
		} catch {
			// ignore localStorage failures
		}
		if (!enabled) {
			setInlinePredictedCode(null);
		}
	}, []);

	const ignorePredictionAtCurrentSpot = useCallback(() => {
		const spotKey = createPredictionSpotKey({
			code: String(aiLastCode || ""),
			cursorLine: draftCursor.line,
			language: currentLanguage,
			targetName: selectedCode,
		});
		const next = new Set(ignoredPredictionSpotsRef.current);
		next.add(spotKey);
		if (next.size > MAX_IGNORED_PREDICTION_SPOTS) {
			const trimmed = Array.from(next).slice(-MAX_IGNORED_PREDICTION_SPOTS);
			ignoredPredictionSpotsRef.current = new Set(trimmed);
			setIgnoredPredictionCount(trimmed.length);
		} else {
			ignoredPredictionSpotsRef.current = next;
			setIgnoredPredictionCount(next.size);
		}
		setInlinePredictedCode(null);
	}, [aiLastCode, currentLanguage, draftCursor.line, selectedCode]);

	const clearIgnoredPredictionSpots = useCallback(() => {
		ignoredPredictionSpotsRef.current = new Set();
		setIgnoredPredictionCount(0);
		message.success(devUiText(
			"Đã xóa danh sách vị trí prediction bị bỏ qua.",
			"Cleared ignored prediction spots.",
			"已清除忽略的预测位置。",
		));
	}, [devUiText]);

	useEffect(() => {
		return () => {
			if (predictionDebounceTimerRef.current) {
				clearTimeout(predictionDebounceTimerRef.current);
				predictionDebounceTimerRef.current = null;
			}
			predictionAbortRef.current?.abort();
			predictionAbortRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (!nextEditPredictionEnabled || aiLoading || openingCode) {
			setInlinePredictedCode(null);
			if (predictionDebounceTimerRef.current) {
				clearTimeout(predictionDebounceTimerRef.current);
				predictionDebounceTimerRef.current = null;
			}
			predictionAbortRef.current?.abort();
			predictionAbortRef.current = null;
			return;
		}

		const sourceCode = String(aiLastCode || "");
		if (!sourceCode.trim() || sourceCode.length > 180000) {
			setInlinePredictedCode(null);
			return;
		}

		const spotKey = createPredictionSpotKey({
			code: sourceCode,
			cursorLine: draftCursor.line,
			language: currentLanguage,
			targetName: selectedCode,
		});
		const cacheKey = buildPredictionCacheKey({
			code: sourceCode,
			line: draftCursor.line,
			column: draftCursor.column,
			language: currentLanguage,
			appId,
			targetName: selectedCode,
		});
		if (ignoredPredictionSpotsRef.current.has(spotKey)) {
			setInlinePredictedCode(null);
			return;
		}

		const cached = predictionCacheRef.current.get(cacheKey);
		if (cached && (Date.now() - cached.ts) <= PREDICTION_CACHE_TTL_MS) {
			setInlinePredictedCode(cached.value || null);
			return;
		}

		if (predictionDebounceTimerRef.current) {
			clearTimeout(predictionDebounceTimerRef.current);
		}

		predictionDebounceTimerRef.current = setTimeout(() => {
			const runPredictionWhenIdle = () => {
				const elapsedIdle = Date.now() - lastEditorInteractionAtRef.current;
				if (elapsedIdle < NEXT_EDIT_PREDICTION_IDLE_MS) {
					predictionDebounceTimerRef.current = setTimeout(
						runPredictionWhenIdle,
						Math.max(100, NEXT_EDIT_PREDICTION_IDLE_MS - elapsedIdle),
					);
					return;
				}

				predictionAbortRef.current?.abort();
				const controller = new AbortController();
				predictionAbortRef.current = controller;
				const seq = predictionSeqRef.current + 1;
				predictionSeqRef.current = seq;

				void (async () => {
				let fullResponse = "";
				let completePayload: Record<string, unknown> | null = null;
				let streamErr = "";

				await streamAiCode(
					{
						appId: appId || "",
						message: [
							"Predict one likely next edit near the current cursor.",
							"Return strict JSON only.",
							"Preferred: {\"textEdits\":[{\"startLine\":X,\"endLine\":Y,\"replacement\":\"...\",\"action\":\"edit\"}],\"summary\":\"...\"}",
							"Fallback: {\"code\":\"full updated code\",\"summary\":\"...\"}",
							"No markdown.",
						].join("\n"),
						currentCode: sourceCode,
						cursorLine: draftCursor.line,
						contextWindowLines: 40,
						language: currentLanguage,
						responseMode: "edit",
						contextType: "code",
						signal: controller.signal,
					},
					{
						onChunk: (_chunk, accumulated) => {
							fullResponse = accumulated;
						},
						onComplete: (event) => {
							completePayload = event;
							fullResponse = String(event.fullResponse || fullResponse);
						},
						onError: (err) => {
							streamErr = err;
						},
					},
				);

				if (controller.signal.aborted || predictionSeqRef.current !== seq) {
					return;
				}
				if (streamErr || !fullResponse.trim()) {
					setInlinePredictedCode(null);
					return;
				}

				const suggestedCode = resolveSuggestedCodeFromAiResponse({
					baseCode: sourceCode,
					fullResponse,
					completePayload,
				});
				if (!suggestedCode || suggestedCode === sourceCode) {
					setInlinePredictedCode(null);
					predictionCacheRef.current.set(cacheKey, { value: "", ts: Date.now() });
					return;
				}
				predictionCacheRef.current.set(cacheKey, { value: suggestedCode, ts: Date.now() });
				if (predictionCacheRef.current.size > PREDICTION_CACHE_MAX) {
					const staleKeys = Array.from(predictionCacheRef.current.entries())
						.sort((a, b) => a[1].ts - b[1].ts)
						.slice(0, predictionCacheRef.current.size - PREDICTION_CACHE_MAX)
						.map((entry) => entry[0]);
					for (const key of staleKeys) {
						predictionCacheRef.current.delete(key);
					}
				}
				setInlinePredictedCode(suggestedCode);
				})();
			};

			runPredictionWhenIdle();
		}, NEXT_EDIT_PREDICTION_DEBOUNCE_MS);

		return () => {
			if (predictionDebounceTimerRef.current) {
				clearTimeout(predictionDebounceTimerRef.current);
				predictionDebounceTimerRef.current = null;
			}
		};
	}, [
		nextEditPredictionEnabled,
		aiLoading,
		openingCode,
		aiLastCode,
		draftCursor.line,
		draftCursor.column,
		appId,
		currentLanguage,
		selectedCode,
	]);

	useEffect(() => {
		ignoredPredictionSpotsRef.current = new Set();
		predictionCacheRef.current = new Map();
		setIgnoredPredictionCount(0);
		setInlinePredictedCode(null);
	}, [aiSessionKey]);

	useEffect(() => {
		aiBaseContentRef.current = "";
	}, [aiSessionKey]);

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
		const realtimeApplyEnabled = false;

		setAiLoading(true);
		setAiSummary("");
		setAiChangeItems([]);
		setPendingChunk(null);
		if (!continueMode && !aiLastCode.trim()) {
			setAiLastCode(codeContent || "");
		}
		setAiProgress({ status: "preparing", stage: "preparing", message: t("system.developer.ai.preparing"), percent: 0 });
		addAiMessage("user", requestText);

		try {
			const sourceCode = continueMode && aiLastCode ? aiLastCode : codeContent;
			const shouldUseBaseRef = sourceCode.length >= LARGE_BASE_CONTENT_THRESHOLD || Boolean(aiBaseContentRef.current);
			const payloadBaseContent = shouldUseBaseRef && !aiBaseContentRef.current ? sourceCode : "";
			const payloadCurrentCode = shouldUseBaseRef ? "" : sourceCode;

			// Build message: user request + recent conversation + JSON format instruction
			const recentConversation = aiMessages
				.slice(-6)
				.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
				.join("\n\n");

			const fullMessage = [
				requestText,
				recentConversation ? `Lịch sử hội thoại gần đây:\n${recentConversation}` : "",
				continueMode
					? "Bạn đang ở chế độ CONTINUE. BẮT BUỘC trả về FULL tài liệu hoàn chỉnh từ đầu đến cuối, không chỉ phần mới."
					: "",
					"Ưu tiên cao nhất: trả về SEARCH/REPLACE blocks để patch chính xác:",
					"<<<<<<< SEARCH\\nold code\\n=======\\nnew code\\n>>>>>>> REPLACE",
				"Ưu tiên trả về chỉnh sửa theo vị trí line để editor áp dụng đúng vùng thay đổi.",
				`Format ưu tiên: {"summary":"mô tả ngắn thay đổi","textEdits":[{"startLine":10,"endLine":12,"replacement":"...","action":"edit"}],"changes":["điểm thay đổi 1","điểm thay đổi 2"]}`,
				`Chỉ fallback sang full code nếu không thể biểu diễn bằng textEdits: {"summary":"...","code":"toàn bộ code hoàn chỉnh","changes":["..."]}`,
			].filter(Boolean).join("\n\n");

			let finalResponse = "";
			let streamErr = "";
			let gotCompleteEvent = false;
			let completePayload: Record<string, unknown> | null = null;

			await streamAiCode(
				{
					appId: appId || "",
					message: fullMessage,
					currentCode: payloadCurrentCode,
					cursorLine: draftCursor.line,
					contextWindowLines: 50,
					baseContent: payloadBaseContent,
					baseContentRef: aiBaseContentRef.current || undefined,
					preserveBaseContent: shouldUseBaseRef,
					language: currentLanguage,
					responseMode: "edit",
					contextType: "code",
				},
				{
					onChunk: (_chunk, accumulated) => {
						finalResponse = accumulated;
						if (realtimeApplyEnabled && shouldAutoApplyAi()) {
							const realtimeCode = tryExtractStructuredStreamingCode(accumulated);
							if (realtimeCode) {
								const liveRanges = buildChangedLineRanges(currentDraftRef.current, realtimeCode);
								if (liveRanges.length > 0) {
									setPendingChunk({
										id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
										before: currentDraftRef.current,
										after: realtimeCode,
										ranges: liveRanges,
										applied: false,
										createdAt: Date.now(),
									});
								}
							}
						}
						setAiProgress({
							stage: "streaming",
							status: "streaming",
							message: "Gemini đang streaming...",
							percent: 50,
						});
					},
					onStatus: (status) => {
						const baseRef = String(status.baseContentRef || "").trim();
						if (baseRef) {
							aiBaseContentRef.current = baseRef;
						}
						const stage = String(status.stage || "preparing");
						if (stage.startsWith("waiting")) {
							return;
						}
						// Map Gemini-specific stages to friendly messages
						const stageMessageMap: Record<string, string> = {
							streaming_started: "Bắt đầu nhận kết quả từ Gemini...",
							streaming_progress: String(status.message || "Đang nhận kết quả..."),
							cached: "Lấy từ cache...",
							context: "Đã tải context code...",
						};
						setAiProgress({
							stage,
							status: String(status.status || stage),
							message: stageMessageMap[stage] ?? String(status.message || ""),
							percent: Number(status.percent || 0),
						});
					},
					onComplete: (event) => {
						gotCompleteEvent = true;
						completePayload = event;
						finalResponse = String(event.fullResponse || finalResponse);
					},
					onError: (err) => {
						streamErr = err;
					},
				},
			);

			if (streamErr) {
				throw new Error(streamErr);
			}
			if (!gotCompleteEvent && !finalResponse) {
				throw new Error(t("system.developer.ai.requestFailed") + " (stream incomplete)");
			}
			if (!finalResponse) {
				throw new Error(t("system.developer.ai.requestFailed"));
			}

			const completeEnvelope = completePayload && typeof completePayload === "object"
				? completePayload
				: null;
			const completeEnvelopeAny = completeEnvelope as any;

			const parsedEnvelopeCandidate = (() => {
				if (completeEnvelope && (Array.isArray((completeEnvelope as any).textEdits)
					|| Array.isArray((completeEnvelope as any).text_edits)
					|| Array.isArray((completeEnvelope as any).lineRanges)
					|| Array.isArray((completeEnvelope as any).changedRanges)
					|| typeof (completeEnvelope as any).summary === "string"
					|| typeof (completeEnvelope as any).code === "string")) {
					return completeEnvelope;
				}
				const raw = extractValidJsonCandidate(finalResponse);
				if (!raw) return null;
				try {
					const parsed = JSON.parse(raw);
					return parsed && typeof parsed === "object" ? parsed : null;
				} catch {
					return null;
				}
			})();

			if (!parsedEnvelopeCandidate) {
				const srBlocks = extractSearchReplaceBlocks(finalResponse);
				if (srBlocks.length > 0) {
					const patched = applySearchReplaceBlocksToDraft(currentDraftRef.current, srBlocks);
					if (patched.applied > 0) {
						finalResponse = JSON.stringify({
							summary: t("system.developer.ai.generatedReady"),
							code: patched.code,
							changes: [
								`SEARCH/REPLACE applied: ${patched.applied}`,
								...(patched.failed > 0 ? [`SEARCH/REPLACE failed: ${patched.failed}`] : []),
							],
						});
					}
				}
			}

			if (Array.isArray(parsedEnvelopeCandidate?.operations) && parsedEnvelopeCandidate.operations.length > 0) {
				const applyResp = await request.post("ai/apply-edits", {
					json: {
						target: {
							kind: "code_doc",
							appId: appId || "",
							pName: selectedCode || "",
							pType: resolvedPType,
							language: currentLanguage,
							contextType: "code",
						},
						baseVersion: 0,
						currentContent: currentDraftRef.current,
						operations: parsedEnvelopeCandidate.operations,
						applyMode: "dry_run",
					},
					throwHttpErrors: false,
				});

				if (!applyResp.ok) {
					throw new Error(t("system.developer.ai.requestFailed"));
				}
				const applied = await applyResp.json() as any;
				const appliedCode = String(applied?.resultContent || "");
				if (appliedCode.trim()) {
					finalResponse = JSON.stringify({
						summary: String(parsedEnvelopeCandidate?.summary || t("system.developer.ai.generatedReady")),
						code: appliedCode,
						changes: Array.isArray(applied?.appliedOperations)
							? applied.appliedOperations.map((x: any) => String(x || "")).filter(Boolean)
							: [],
					});
				}
			}

			const textEditsFromEnvelope = normalizeStructuredTextEdits(
				completeEnvelopeAny?.textEdits
				?? completeEnvelopeAny?.text_edits
				?? parsedEnvelopeCandidate?.textEdits
				?? parsedEnvelopeCandidate?.text_edits,
			);
			if (textEditsFromEnvelope.length > 0) {
				const validation = validateStructuredTextEdits(currentDraftRef.current, textEditsFromEnvelope);
				if (validation.valid) {
					const patchedCode = applyTextEditsToDraft(currentDraftRef.current, validation.edits);
					const envelopeChanges = Array.isArray(parsedEnvelopeCandidate?.changes)
						? parsedEnvelopeCandidate.changes.map((x: any) => String(x || "")).filter(Boolean)
						: [];
					finalResponse = JSON.stringify({
						summary: String(parsedEnvelopeCandidate?.summary || t("system.developer.ai.generatedReady")),
						code: patchedCode,
						changes: envelopeChanges.length > 0 ? envelopeChanges : summarizeTextEditRanges(validation.edits),
						textEdits: validation.edits,
					});
				} else {
					message.warning(t("system.developer.ai.pendingApply", "AI trả về textEdits không hợp lệ, chuyển sang fallback full code nếu có."));
				}
			}

			const parsed = parseAiCodeResponse({ result: finalResponse });
			if (!parsed?.code) {
				throw new Error(t("system.developer.ai.missingCode"));
			}

			const safeResult = resolveContinueSafeCode({
				continueMode,
				language: currentLanguage,
				currentDraft: currentDraftRef.current,
				candidateCode: parsed.code,
			});

			const completedHistoryItem: AiRequestHistoryItem = {
				id: historyId,
				request: requestText,
				status: "completed",
				summary: parsed.summary || t("system.developer.ai.generatedReady"),
				changes: Array.isArray(parsed.changes) ? parsed.changes : [],
				draftCode: safeResult.shouldApply ? safeResult.code : currentDraftRef.current,
				createdAt: requestCreatedAt,
				completedAt: Date.now(),
			};

			if (!safeResult.shouldApply) {
				setAiSummary(parsed.summary || "");
				setAiChangeItems(Array.isArray(parsed.changes) ? parsed.changes : []);
				setAiRequestHistory((prev) => [
					completedHistoryItem,
					...prev,
				].slice(0, AI_HISTORY_LIMIT));
				setSelectedHistoryId(historyId);
				addAiMessage("assistant", parsed.summary || t("system.developer.ai.generatedReady"));
				setAiProgress({ status: "warning", stage: "warning", message: safeResult.warning || t("system.developer.ai.generatedReady"), percent: 100 });
				message.warning(safeResult.warning || t("system.developer.ai.generatedReady"));
				return;
			}

			if (shouldAutoApplyAi()) {
				applyDraftFromAi(safeResult.code);
				setPendingChunk(null);
			} else {
				const before = currentDraftRef.current;
				const ranges = buildRealtimeRangesFromProgress(
					completeEnvelope ?? parsedEnvelopeCandidate ?? {},
					before,
					safeResult.code,
				);
				setPendingChunk({
					id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
					before,
					after: safeResult.code,
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
				completedAt: Date.now(),
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
			<div className={`${styles.vscodeWorkbench} ${styles.vscodeWorkbenchCollapsed}`}>
				<div className={styles.workbenchMain}>
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
										{ label: "Python", value: 2 },
										{ label: "CSS", value: 3 },
										{ label: "SQL", value: 4 },
										{ label: "JSON", value: 5 },
									]}
									placeholder={t("system.developer.selectCodeType")}
								/>
								<Select
									style={{ width: 260 }}
									placeholder={t("system.developer.selectOrCreateCode")}
									value={selectedCode || undefined}
									onChange={handleSelectCode}
									optionLabelProp="label"
									loading={loading || openingCode}
									filterOption={(input, option) => String(option?.value || "").toLowerCase().includes(input.toLowerCase())}
									options={codeList.map(code => ({
										label: code.p_name,
										value: code.p_name,
									}))}
									showSearch
									allowClear
									onClear={() => {
										codeOpenJobRef.current += 1;
										setOpeningCode(false);
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
				<Collapse
					ghost
					size="small"
					style={{ marginBottom: 8 }}
					items={[{
						key: "bm",
						label: (
							<span>
								<BookOutlined style={{ marginRight: 6, color: "#52c41a" }} />
								{devUiText("Bộ nhớ nghiệp vụ (Business Memory)", "Business Memory", "业务记忆")}
								{bmStats != null && (
									<Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>
										{String(bmStats?.totalChunks ?? 0)} chunks
									</Tag>
								)}
							</span>
						),
						children: (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
								<Button icon={<SyncOutlined />} loading={bmIndexing} size="small" onClick={() => void handleScanIndex()}>
									{devUiText("Quét & Index từ server", "Scan & Index from server", "从服务器扫描并索引")}
								</Button>
								<Tooltip title={devUiText("Làm mới thống kê", "Refresh stats", "刷新统计")}>
									<Button icon={<ReloadOutlined />} size="small" loading={bmStatsLoading} onClick={() => void refreshBmStats()} />
								</Tooltip>
								{bmStats != null && (
									<>
										<Tag>{devUiText("Nguồn", "Sources", "来源")}: {String(bmStats?.totalSources ?? 0)}</Tag>
										<Tag>{devUiText("Chunks", "Chunks", "分块")}: {String(bmStats?.totalChunks ?? 0)}</Tag>
										<Tag>{devUiText("App", "App", "应用")}: {String(bmStats?.appId ?? appId)}</Tag>
									</>
								)}
								<span style={{ fontSize: 11, color: "#888" }}>
									{devUiText(
										"Upload tài liệu nghiệp vụ để AI Trợ lý tự động tra cứu khi trả lời.",
										"Upload business docs so AI Assistant auto-searches them when answering.",
										"上传业务文档，AI 助手回答时将自动检索。",
									)}
								</span>
							</div>
						),
					}]}
				/>
				<div className={styles.aiShell}>
					<div className={`${styles.aiBody} ${styles.aiBodyLeftHidden}`}>
					<div className={styles.aiRightColumn}>
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
									<Button onClick={() => void handleAiRewriteSelection()}>
										{devUiText("Rewrite vùng chọn", "Rewrite selection", "重写选区")}
									</Button>
									<Button
										type={nextEditPredictionEnabled ? "primary" : "default"}
										onClick={() => setNextEditPrediction(!nextEditPredictionEnabled)}
									>
										{nextEditPredictionEnabled
											? devUiText("Prediction: Bật", "Prediction: On", "预测：开")
											: devUiText("Prediction: Tắt", "Prediction: Off", "预测：关")}
									</Button>
									{inlinePredictedCode && (
										<Button
											onClick={ignorePredictionAtCurrentSpot}
											title={devUiText(
												"Ẩn gợi ý ở vị trí hiện tại cho đến khi đổi file/record hoặc bấm Clear ignored.",
												"Hide suggestions at this spot until you switch file/record or clear ignored spots.",
												"在切换文件/记录或清空忽略列表前，隐藏此位置建议。",
											)}
										>
											{devUiText("Bỏ gợi ý vị trí này", "Ignore this spot", "忽略此位置")}
										</Button>
									)}
									<Button
										onClick={clearIgnoredPredictionSpots}
										disabled={ignoredPredictionCount <= 0}
										title={devUiText(
											"Xóa toàn bộ vị trí đã Ignore để prediction hoạt động lại đầy đủ.",
											"Reset all ignored spots so prediction can appear again.",
											"清除全部忽略位置，使预测重新生效。",
										)}
									>
										{devUiText("Clear ignored", "Clear ignored", "清空忽略")}
										{ignoredPredictionCount > 0 ? ` (${ignoredPredictionCount})` : ""}
									</Button>
									<div className={styles.quickActionHint}>
										{devUiText(
											"Mobile: mở nhanh Search/Replace và Go to line ngay trong vùng editor này.",
											"Mobile: quick access to Search/Replace and Go to line inside this editor.",
											"移动端：可在此编辑区快速打开查找替换和跳转行。",
										)}
										{nextEditPredictionEnabled && (
											<>
												{" "}
												{devUiText(
													"Prediction chạy khi editor idle; Ignore spot có hiệu lực đến khi đổi file/record hoặc Clear ignored.",
													"Prediction runs when editor is idle; ignored spots stay active until file/record switch or Clear ignored.",
													"预测仅在编辑器空闲时运行；忽略位置在切换文件/记录或清空前持续生效。",
												)}
											</>
										)}
									</div>
								</div>
								{pendingChunk && (
									<div className={styles.aiPatchReviewCard}>
										<div className={styles.aiPatchReviewHead}>
											<div className={styles.aiPatchReviewTitle}>
												{devUiText("AI Patch Review", "AI Patch Review", "AI Patch Review")}
											</div>
											<div className={styles.aiPatchReviewMeta}>
												{pendingSelectedCount}/{pendingRangeItems.length} {devUiText("vùng được chọn", "ranges selected", "已选范围")}
											</div>
										</div>
										<div className={styles.aiPatchRangeList}>
											{pendingRangeItems.map((item) => {
												const active = pendingRangeSelection[item.key] !== false;
												return (
													<button
														type="button"
														key={item.key}
														onClick={() => togglePendingRange(item.key)}
														className={`${styles.aiPatchRangeButton} ${active ? styles.aiPatchRangeButtonActive : ""}`}
													>
														<span>{item.label}</span>
														<span>{active ? devUiText("Giữ", "Keep", "保留") : devUiText("Bỏ", "Drop", "移除")}</span>
													</button>
												);
											})}
										</div>
										<div className={styles.aiPatchReviewSummary}>
											{formatRangesText(selectedPendingRanges)}
										</div>
										<div className={styles.aiPatchReviewActions}>
											<Button onClick={selectAllPendingRanges}>{devUiText("Chọn hết", "Select all", "全选")}</Button>
											<Button onClick={clearPendingRangeSelection}>{devUiText("Bỏ chọn hết", "Clear all", "清除")}</Button>
											<Button onClick={() => setPendingDiffPreviewOpen(true)} disabled={pendingSelectedCount <= 0}>
												{devUiText("Xem diff", "Diff preview", "查看差异")}
											</Button>
											<Button onClick={dropSelectedPendingRanges} danger>{devUiText("Loại phần đã chọn", "Drop selected", "移除所选")}</Button>
											<Button type="primary" onClick={applySelectedPendingRanges}>{devUiText("Áp dụng phần đã chọn", "Apply selected", "应用所选")}</Button>
										</div>
									</div>
								)}
								<CodeMirror
									onCreateEditor={(view) => {
										editorScrollCleanupRef.current?.();
										editorRef.current = view;
										const onEditorScroll = () => {
											lastEditorInteractionAtRef.current = Date.now();
										};
										view.scrollDOM?.addEventListener("scroll", onEditorScroll, { passive: true });
										editorScrollCleanupRef.current = () => {
											view.scrollDOM?.removeEventListener("scroll", onEditorScroll);
										};
										view.dispatch({ effects: setDraftHighlights.of(selectedPendingRanges) });
										updateDraftIndicators(view);
									}}
									aiAssistantContextType="code"
									aiAssistantLanguage={currentLanguage as "javascript" | "html" | "python" | "java" | "css" | "sql" | "json"}
									aiAssistantPName={selectedCode || undefined}
									aiAssistantPType={resolvedPType}
									aiAssistantInlineSuggestedCode={inlinePredictedCode}
									value={aiLastCode}
									onChange={(value) => {
										if (!aiProgrammaticApplyRef.current) {
											manualDraftRevisionRef.current += 1;
										}
										setInlinePredictedCode(null);
										setAiLastCode(value);
										setCodeContent(value);
										setPendingChunk(null);
										setPendingRangeSelection({});
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
										codeType === 0 ? javascript()
											: codeType === 1 ? html()
											: codeType === 2 ? python()
											: codeType === 3 ? css()
											: codeType === 4 ? sql()
											: json(),
									]}
									theme={prefersDarkMode ? vscodeDark : vscodeLight}
									height="360px"
									editable
									className={styles.editor}
								/>
						</div>
					</div>
					</div>
				</div>
			</Card>
				</div>
			</div>

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
				title={devUiText("Merge Review", "Merge Review", "合并审阅")}
				open={pendingDiffPreviewOpen}
				onCancel={() => setPendingDiffPreviewOpen(false)}
				width={1320}
				footer={[
					<Button key="close" onClick={() => setPendingDiffPreviewOpen(false)}>{t("system.developer.close")}</Button>,
					<Button key="apply" type="primary" onClick={applySelectedPendingRanges} disabled={pendingSelectedCount <= 0}>
						{devUiText("Áp dụng phần đã chọn", "Apply selected", "应用所选")}
					</Button>,
				]}
			>
				<div className={styles.aiDiffPreviewShell}>
					<div className={styles.aiDiffColumn}>
						<div className={styles.aiDiffColumnTitle}>{devUiText("Before", "Before", "修改前")}</div>
						<CodeMirror
							aiAssistantEnabled={false}
							value={pendingMergePreview.beforeText || pendingDiffPreview.beforeText}
							onChange={() => {}}
							extensions={[
								search({ top: true }),
								codeType === 0 ? javascript()
									: codeType === 1 ? html()
									: codeType === 2 ? python()
									: codeType === 3 ? css()
									: codeType === 4 ? sql()
									: json(),
							]}
							theme={prefersDarkMode ? vscodeDark : vscodeLight}
							height="56vh"
							editable={false}
							className={styles.aiMergeEditor}
						/>
					</div>
					<div className={styles.aiDiffColumn}>
						<div className={styles.aiDiffColumnTitle}>{devUiText("After", "After", "修改后")}</div>
						<CodeMirror
							aiAssistantEnabled={false}
							value={pendingMergePreview.afterText || pendingDiffPreview.afterText}
							onChange={() => {}}
							extensions={[
								search({ top: true }),
								codeType === 0 ? javascript()
									: codeType === 1 ? html()
									: codeType === 2 ? python()
									: codeType === 3 ? css()
									: codeType === 4 ? sql()
									: json(),
							]}
							theme={prefersDarkMode ? vscodeDark : vscodeLight}
							height="56vh"
							editable={false}
							className={styles.aiMergeEditor}
						/>
					</div>
				</div>
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
