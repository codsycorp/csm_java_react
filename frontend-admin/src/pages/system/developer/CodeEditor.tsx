import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Select, Card, Space, message, Modal, Input, Form } from "antd";
import type { InputRef } from "antd";
import {
	SaveOutlined,
	DeleteOutlined,
	SearchOutlined,
	SwapOutlined,
	SettingOutlined,
	FormOutlined,
	CheckOutlined,
	UndoOutlined,
	RedoOutlined,
} from "@ant-design/icons";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useTranslation } from "react-i18next";
import { useAppStore } from "#src/store";
import { generateSeoContentWithPrompt } from "#src/api/ai";
import {
	fetchCodeList,
	decryptCode,
	saveCode,
	deleteCode,
	searchInCode,
	replaceInCode,
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

type HotkeyAction = "save" | "find" | "replaceFocus" | "goto" | "askAi" | "continueAi" | "applyReplace" | "commandPalette";

type HotkeyConfig = Record<HotkeyAction, string>;

const HOTKEY_STORAGE_KEY = "developer.codeeditor.hotkeys.v1";

const DEFAULT_HOTKEYS: HotkeyConfig = {
	save: "s",
	find: "f",
	replaceFocus: "f",
	goto: "g",
	askAi: "enter",
	continueAi: "enter",
	applyReplace: "e",
	commandPalette: "k",
};

function createAiPrompt(params: {
	language: "javascript" | "html";
	codeName: string | null;
	currentCode: string;
	requestText: string;
	messages: AiMessage[];
}) {
	const { language, codeName, currentCode, requestText, messages } = params;
	const recentConversation = messages
		.slice(-6)
		.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`)
		.join("\n\n");

	const trimmedCode = currentCode.length > 24000
		? `${currentCode.slice(0, 24000)}\n/* truncated for token budget */`
		: currentCode;

	return [
		"You are a senior coding assistant inside a low-code developer editor.",
		"Always preserve existing business logic unless the user explicitly asks to rewrite it.",
		"Return strict JSON only with this shape:",
		"{",
		"  \"summary\": \"short explanation\",",
		"  \"code\": \"full updated code in target language\",",
		"  \"changes\": [\"item 1\", \"item 2\"]",
		"}",
		"No markdown, no code fences.",
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
	const { t } = useTranslation();
	const appId = useAppStore(state => state.currentAppId);
	const editorRef = useRef<any>(null);
	const searchInputRef = useRef<InputRef>(null);
	const replaceInputRef = useRef<InputRef>(null);
	const gotoInputRef = useRef<InputRef>(null);
	const aiPromptInputRef = useRef<InputRef>(null);

	// State Management
	const [codeType, setCodeType] = useState<number>(0); // 0 = JS, 1 = HTML
	const [codeList, setCodeList] = useState<CodeItem[]>([]);
	const [selectedCode, setSelectedCode] = useState<string | null>(null);
	const [codeContent, setCodeContent] = useState<string>("");
	const [loading, setLoading] = useState(false);
	const [searchText, setSearchText] = useState("");
	const [replaceText, setReplaceText] = useState("");
	const [gotoLine, setGotoLine] = useState<number | null>(null);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [newCodeName, setNewCodeName] = useState("");
	const [aiPromptText, setAiPromptText] = useState("");
	const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
	const [aiLastCode, setAiLastCode] = useState("");
	const [aiLoading, setAiLoading] = useState(false);
	const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
	const [aiSummary, setAiSummary] = useState("");
	const [hotkeys, setHotkeys] = useState<HotkeyConfig>(DEFAULT_HOTKEYS);
	const [hotkeyModalOpen, setHotkeyModalOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const [commandSearch, setCommandSearch] = useState("");
	const [form] = Form.useForm();

	const isMac = useMemo(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || ""), []);
	const modKeyLabel = isMac ? "Cmd" : "Ctrl";

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
			} catch (error) {
				message.error(t("system.developer.decryptFailed"));
				setCodeContent(code.p_code);
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
	};

	// Search functionality
	const handleSearch = () => {
		if (!searchText) {
			message.warning(t("system.developer.enterSearchText"));
			return;
		}

		const results = searchInCode(codeContent, searchText);
		if (results.length > 0) {
			message.info(t("system.developer.foundMatches", { count: results.length }));
			// Auto scroll to first result
			if (editorRef.current) {
				const firstResult = results[0];
				editorRef.current.setCursor({ line: firstResult.line, ch: firstResult.column });
				editorRef.current.focus();
			}
		} else {
			message.info(t("system.developer.textNotFound"));
		}
	};

	// Replace functionality
	const handleReplace = () => {
		if (!searchText) {
			message.warning(t("system.developer.enterSearchText"));
			return;
		}

		const newContent = replaceInCode(codeContent, searchText, replaceText, true);
		setCodeContent(newContent);
		message.success(t("system.developer.replacedAll", { text: searchText }));
	};

	// Go to line
	const handleGotoLine = () => {
		if (!gotoLine || !editorRef.current) return;

		const editor = editorRef.current;
		// Line numbers in editors are typically 1-based
		editor.setCursor({ line: Math.max(0, gotoLine - 1), ch: 0 });
		editor.focus();
	};

	const currentLanguage = codeType === 0 ? "javascript" : "html";

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

	const handleAskAi = async (continueMode = false) => {
		const requestText = aiPromptText.trim();
		if (!requestText) {
			message.warning(t("system.developer.ai.enterRequest"));
			return;
		}

		setAiLoading(true);
		setAiSummary("");
		setAiProgress({ status: "preparing", stage: "preparing", message: t("system.developer.ai.preparing"), percent: 0 });
		addAiMessage("user", requestText);

		try {
			const prompt = createAiPrompt({
				language: currentLanguage,
				codeName: selectedCode,
				currentCode: continueMode && aiLastCode ? aiLastCode : codeContent,
				requestText,
				messages: aiMessages,
			});

			const response = await generateSeoContentWithPrompt(prompt, {
				onProgress: (progress) => {
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

			setAiLastCode(parsed.code);
			setAiSummary(parsed.summary || "");
			addAiMessage("assistant", parsed.summary || t("system.developer.ai.generatedReady"));
			setAiProgress({ status: "completed", stage: "completed", message: t("system.developer.ai.generatedReady"), percent: 100 });
			setAiPromptText("");
			message.success(t("system.developer.ai.generatedSuccess"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : t("system.developer.ai.requestFailed");
			setAiProgress({ status: "failed", stage: "failed", message: msg, percent: 0 });
			addAiMessage("assistant", `${t("system.developer.ai.errorPrefix")}: ${msg}`);
			message.error(msg);
		} finally {
			setAiLoading(false);
		}
	};

	const handleApplyAiCode = (mode: "replace" | "append" | "selection") => {
		if (!aiLastCode.trim()) {
			message.warning(t("system.developer.ai.noSuggestion"));
			return;
		}
		if (mode === "replace") {
			setCodeContent(aiLastCode);
			message.success(t("system.developer.ai.appliedReplace"));
			return;
		}
		if (mode === "selection") {
			const view = editorRef.current;
			const selection = view?.state?.selection?.main;
			if (!view || !selection || selection.from === selection.to) {
				message.warning(t("system.developer.ai.selectRangeFirst"));
				return;
			}
			view.dispatch({
				changes: {
					from: selection.from,
					to: selection.to,
					insert: aiLastCode,
				},
			});
			const nextCode = String(view.state.doc?.toString?.() || "");
			setCodeContent(nextCode);
			message.success(t("system.developer.ai.appliedSelection"));
			return;
		}
		setCodeContent(prev => `${prev.trimEnd()}\n\n${aiLastCode}`);
		message.success(t("system.developer.ai.appliedAppend"));
	};

	const runCommand = async (commandId: string) => {
		switch (commandId) {
			case "askAi":
				await handleAskAi(false);
				break;
			case "continueAi":
				await handleAskAi(true);
				break;
			case "applyReplace":
				handleApplyAiCode("replace");
				break;
			case "applyAppend":
				handleApplyAiCode("append");
				break;
			case "applySelection":
				handleApplyAiCode("selection");
				break;
			case "save":
				await handleSaveCode();
				break;
			case "find":
				searchInputRef.current?.focus();
				break;
			case "replaceFocus":
				replaceInputRef.current?.focus();
				break;
			case "goto":
				gotoInputRef.current?.focus();
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
			{ id: "applySelection", label: t("system.developer.command.applySelection") },
			{ id: "applyReplace", label: t("system.developer.command.applyReplace") },
			{ id: "applyAppend", label: t("system.developer.command.applyAppend") },
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
		const isTextInputElement = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement)) return false;
			const tag = target.tagName.toLowerCase();
			return tag === "input" || tag === "textarea" || target.isContentEditable;
		};

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
				searchInputRef.current?.focus();
				return;
			}

			if (key === hotkeys.replaceFocus && event.shiftKey) {
				event.preventDefault();
				replaceInputRef.current?.focus();
				return;
			}

			if (key === hotkeys.goto) {
				event.preventDefault();
				gotoInputRef.current?.focus();
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

			if (key === hotkeys.applyReplace && event.altKey && !isTextInputElement(event.target)) {
				event.preventDefault();
				handleApplyAiCode("replace");
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [hotkeys, aiLastCode, aiPromptText, codeContent, codeType, searchText, replaceText, gotoLine, selectedCode, t]);

	return (
		<div className={styles.container}>
			<Card>
				{/* Toolbar */}
				<Space direction="vertical" style={{ width: "100%" }} size="large">
					{/* Code Type and Selection */}
					<Space wrap>
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
							style={{ width: 250 }}
							placeholder={t("system.developer.selectOrCreateCode")}
							value={selectedCode || undefined}
							onChange={handleSelectCode}
							optionLabelProp="label"
							loading={loading}
							filterOption={(input, option) =>
								(option?.label as string)
									?.toLowerCase()
									.includes(input.toLowerCase())
							}
							options={codeList.map(code => ({
								label: code.p_name,
								value: code.p_name,
							}))}
							allowClear
							onClear={() => {
								setSelectedCode(null);
								setCodeContent("");
							}}
						/>
						<Button
							type="primary"
							onClick={() => setCreateModalOpen(true)}
						>
							{t("system.developer.createNew")}
						</Button>
						<Button icon={<SettingOutlined />} onClick={() => setHotkeyModalOpen(true)}>
							{t("system.developer.hotkeys")}
						</Button>
						<Button onClick={() => setCommandPaletteOpen(true)}>
							{t("system.developer.commandPalette")}
						</Button>
					</Space>

					{/* Editor Controls */}
					<Space wrap>
						<Button
							icon={<SaveOutlined />}
							onClick={handleSaveCode}
							type="primary"
						>
							{t("system.developer.save")}
						</Button>
						<Button
							icon={<DeleteOutlined />}
							danger
							onClick={handleDeleteCode}
						>
							{t("system.developer.delete")}
						</Button>
						<div className={styles.shortcutHint}>
							{modKeyLabel}+{String(hotkeys.save || "s").toUpperCase()}
						</div>
					</Space>

					{/* Search and Replace */}
					<Space wrap>
						<Input
							ref={searchInputRef}
							placeholder={t("system.developer.searchPlaceholder")}
							style={{ width: 200 }}
							value={searchText}
							onChange={e => setSearchText(e.target.value)}
							onPressEnter={handleSearch}
						/>
						<Button
							icon={<SearchOutlined />}
							onClick={handleSearch}
						>
							{t("system.developer.find")}
						</Button>

						<Input
							ref={replaceInputRef}
							placeholder={t("system.developer.replacePlaceholder")}
							style={{ width: 200 }}
							value={replaceText}
							onChange={e => setReplaceText(e.target.value)}
						/>
						<Button
							icon={<SwapOutlined />}
							onClick={handleReplace}
						>
							{t("system.developer.replaceAll")}
						</Button>

						<Input
							ref={gotoInputRef}
							placeholder={t("system.developer.gotoLine")}
							type="number"
							style={{ width: 120 }}
							value={gotoLine || ""}
							onChange={e =>
								setGotoLine(e.target.value ? parseInt(e.target.value) : null)
							}
							onPressEnter={handleGotoLine}
						/>
						<Button onClick={handleGotoLine}>{t("system.developer.go")}</Button>
						<div className={styles.shortcutHint}>
							{modKeyLabel}+{String(hotkeys.find || "f").toUpperCase()} | {modKeyLabel}+Shift+{String(hotkeys.replaceFocus || "f").toUpperCase()} | {modKeyLabel}+{String(hotkeys.goto || "g").toUpperCase()}
						</div>
					</Space>
				</Space>
			</Card>

			{/* Code Editor */}
			<Card style={{ marginTop: 16 }}>
				<CodeMirror
					onCreateEditor={(view) => {
						editorRef.current = view;
					}}
					value={codeContent}
					onChange={setCodeContent}
					extensions={[codeType === 0 ? javascript() : html()]}
					theme={vscodeDark}
					height="600px"
					className={styles.editor}
				/>
			</Card>

			<Card style={{ marginTop: 16 }} title={t("system.developer.ai.panelTitle")}>
				<Space direction="vertical" style={{ width: "100%" }} size="middle">
					<div className={styles.aiHints}>
						<div><strong>{t("system.developer.ai.language")}:</strong> {currentLanguage}</div>
						<div><strong>{t("system.developer.ai.currentFile")}:</strong> {selectedCode || t("system.developer.ai.unsaved")}</div>
						<div><strong>{t("system.developer.ai.safetyTitle")}:</strong> {t("system.developer.ai.safetyDesc")}</div>
						<div className={styles.shortcutHint}>
							{modKeyLabel}+{String(hotkeys.askAi || "enter").toUpperCase()} | {modKeyLabel}+Shift+{String(hotkeys.continueAi || "enter").toUpperCase()} | {modKeyLabel}+Alt+{String(hotkeys.applyReplace || "e").toUpperCase()} | {modKeyLabel}+{String(hotkeys.commandPalette || "k").toUpperCase()}
						</div>
					</div>

					<Input.TextArea
						ref={aiPromptInputRef}
						value={aiPromptText}
						onChange={(e) => setAiPromptText(e.target.value)}
						placeholder={t("system.developer.ai.promptPlaceholder")}
						autoSize={{ minRows: 3, maxRows: 8 }}
					/>

					<Space wrap>
						<Button type="primary" loading={aiLoading} onClick={() => handleAskAi(false)}>
							{t("system.developer.ai.ask")}
						</Button>
						<Button loading={aiLoading} onClick={() => handleAskAi(true)}>
							{t("system.developer.ai.continue")}
						</Button>
						<Button disabled={!aiLastCode} onClick={() => handleApplyAiCode("replace")}>
							{t("system.developer.ai.applyReplace")}
						</Button>
						<Button disabled={!aiLastCode} onClick={() => handleApplyAiCode("append")}>
							{t("system.developer.ai.applyAppend")}
						</Button>
						<Button disabled={!aiLastCode} onClick={() => handleApplyAiCode("selection")}>
							{t("system.developer.ai.applySelection")}
						</Button>
					</Space>

					{aiProgress && (
						<div className={styles.aiProgress}>
							{t("system.developer.ai.status")}: {aiProgress.stage || aiProgress.status || t("system.developer.ai.running")}
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

					<div className={styles.aiChat}>
						{aiMessages.length === 0 && <div className={styles.aiEmpty}>{t("system.developer.ai.noConversation")}</div>}
						{aiMessages.map((msg) => (
							<div key={msg.id} className={msg.role === "user" ? styles.aiMsgUser : styles.aiMsgAssistant}>
								<div className={styles.aiMsgRole}>{msg.role === "user" ? t("system.developer.ai.you") : "AI"}</div>
								<div>{msg.content}</div>
							</div>
						))}
					</div>

					<CodeMirror
						value={aiLastCode}
						onChange={() => {}}
						extensions={[codeType === 0 ? javascript() : html()]}
						theme={vscodeDark}
						height="320px"
						editable={false}
						className={styles.editor}
					/>
				</Space>
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
						["applyReplace", t("system.developer.hotkey.applyReplace")],
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
		</div>
	);
}
