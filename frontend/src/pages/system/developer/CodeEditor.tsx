import { useState, useEffect, useRef } from "react";
import { Button, Select, Card, Space, message, Modal, Input, Form } from "antd";
import {
	SaveOutlined,
	DeleteOutlined,
	SearchOutlined,
	SwapOutlined,
	FormOutlined,
	CheckOutlined,
	UndoOutlined,
	RedoOutlined,
} from "@ant-design/icons";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useAppStore } from "#src/store";
import {
	fetchCodeList,
	getCodeByName,
	encryptCode,
	decryptCode,
	saveCode,
	deleteCode,
	searchInCode,
	replaceInCode,
	formatCode,
	validateCode,
	type CodeItem,
} from "./useCodeEditor";
import styles from "./CodeEditor.module.css";

export default function CodeEditor() {
	const appId = useAppStore(state => state.currentAppId);
	const editorRef = useRef<any>(null);

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
	const [form] = Form.useForm();

	// Load code list based on selected type
	const loadCodeList = async (type: number) => {
		setLoading(true);
		try {
			const response = await fetchCodeList(appId, type);
			if (response.success) {
				setCodeList(response.data);
			} else {
				message.error(response.error || "Failed to load code list");
			}
		} catch (error) {
			message.error("Failed to load code list");
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
				message.error("Failed to decrypt code");
				setCodeContent(code.p_code);
			}
		}
	};

	// Save code
	const handleSaveCode = async () => {
		if (!selectedCode) {
			message.warning("Please select or create a code item first");
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
			message.error("Failed to save code");
			console.error(error);
		}
	};

	// Delete code
	const handleDeleteCode = () => {
		if (!selectedCode) {
			message.warning("Please select a code item to delete");
			return;
		}

		Modal.confirm({
			title: "Delete Code",
			content: `Are you sure you want to delete "${selectedCode}"?`,
			okText: "Yes",
			cancelText: "No",
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
					message.error("Failed to delete code");
					console.error(error);
				}
			},
		});
	};

	// Create new code
	const handleCreateCode = async () => {
		if (!newCodeName.trim()) {
			message.warning("Please enter a code name");
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
			message.warning("Please enter search text");
			return;
		}

		const results = searchInCode(codeContent, searchText);
		if (results.length > 0) {
			message.info(`Found ${results.length} match(es)`);
			// Auto scroll to first result
			if (editorRef.current) {
				const firstResult = results[0];
				editorRef.current.setCursor({ line: firstResult.line, ch: firstResult.column });
				editorRef.current.focus();
			}
		} else {
			message.info("Text not found");
		}
	};

	// Replace functionality
	const handleReplace = () => {
		if (!searchText) {
			message.warning("Please enter search text");
			return;
		}

		const newContent = replaceInCode(codeContent, searchText, replaceText, true);
		setCodeContent(newContent);
		message.success(`Replaced all occurrences of "${searchText}"`);
	};

	// Go to line
	const handleGotoLine = () => {
		if (!gotoLine || !editorRef.current) return;

		const editor = editorRef.current;
		// Line numbers in editors are typically 1-based
		editor.setCursor({ line: Math.max(0, gotoLine - 1), ch: 0 });
		editor.focus();
	};

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
							placeholder="Select code type"
						/>
						<Select
							style={{ width: 250 }}
							placeholder="Select or create code..."
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
							Create New
						</Button>
					</Space>

					{/* Editor Controls */}
					<Space wrap>
						<Button
							icon={<SaveOutlined />}
							onClick={handleSaveCode}
							type="primary"
						>
							Save
						</Button>
						<Button
							icon={<DeleteOutlined />}
							danger
							onClick={handleDeleteCode}
						>
							Delete
						</Button>
					</Space>

					{/* Search and Replace */}
					<Space wrap>
						<Input
							placeholder="Search text..."
							style={{ width: 200 }}
							value={searchText}
							onChange={e => setSearchText(e.target.value)}
							onPressEnter={handleSearch}
						/>
						<Button
							icon={<SearchOutlined />}
							onClick={handleSearch}
						>
							Find
						</Button>

						<Input
							placeholder="Replace with..."
							style={{ width: 200 }}
							value={replaceText}
							onChange={e => setReplaceText(e.target.value)}
						/>
						<Button
							icon={<SwapOutlined />}
							onClick={handleReplace}
						>
							Replace All
						</Button>

						<Input
							placeholder="Go to line"
							type="number"
							style={{ width: 120 }}
							value={gotoLine || ""}
							onChange={e =>
								setGotoLine(e.target.value ? parseInt(e.target.value) : null)
							}
							onPressEnter={handleGotoLine}
						/>
						<Button onClick={handleGotoLine}>Go</Button>
					</Space>
				</Space>
			</Card>

			{/* Code Editor */}
			<Card style={{ marginTop: 16 }}>
				<CodeMirror
					ref={editorRef}
					value={codeContent}
					onChange={setCodeContent}
					extensions={[codeType === 0 ? javascript() : html()]}
					theme={vscodeDark}
					height="600px"
					className={styles.editor}
				/>
			</Card>

			{/* Create Code Modal */}
			<Modal
				title="Create New Code"
				open={createModalOpen}
				onOk={handleCreateCode}
				onCancel={() => setCreateModalOpen(false)}
			>
				<Form form={form} layout="vertical">
					<Form.Item label="Code Name" required>
						<Input
							placeholder="Enter code name"
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
