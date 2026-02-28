import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { csmEncrypt, csmDecrypt } from "#src/components/csm-grid/CsmCrypto";

export interface CodeItem {
	id?: string;
	p_name: string;
	p_type: number; // 0 = JS, 1 = HTML
	p_code: string;
}

export interface CodeEditorState {
	codeList: CodeItem[];
	selectedCode: string | null;
	codeContent: string;
	codeType: number;
	loading: boolean;
}

// Use shared crypto helpers from CsmCrypto (Base64 + character substitution)



/**
 * Fetch code list from sys_autos table
 * Uses API: GET /api/get-table-data
 * Query by p_type field
 */
export async function fetchCodeList(appId: string, codeType: number) {
	try {
		const response = await getTableData<CodeItem>({
			app_id: "csm", // sys_autos is stored under app_id=csm
			obj_name: "sys_autos",
			where: {
				field: "p_type",
				type: "eq",
				value: codeType,
			},
		});

		// Backend may return rows[] or data[] depending on record structure
		const rows = (response as any)?.rows || (response as any)?.data || [];
		const sortedRows = rows.sort((a: CodeItem, b: CodeItem) =>
			a.p_name.localeCompare(b.p_name)
		);

		return {
			success: true,
			data: sortedRows,
		};
	} catch (error) {
		console.error("Failed to fetch code list:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			data: [],
		};
	}
}

/**
 * Get single code item by name and type
 */
export function getCodeByName(codeList: CodeItem[], name: string): CodeItem | undefined {
	return codeList.find(c => c.p_name === name);
}

/**
 * Encrypt code content
 * Uses the same mechanism as the HTML version: Base64 + character substitution
 */
export function encryptCode(code: string): string {
	try {
		return csmEncrypt(code);
	} catch (error) {
		console.error("Encryption error:", error);
		return code;
	}
}

/**
 * Decrypt code content
 * Uses the same mechanism as the HTML version: reverse strtr + Base64 decode
 */
export function decryptCode(code: string): string {
	try {
		return csmDecrypt(code);
	} catch (error) {
		console.error("Decryption error:", error);
		return code;
	}
}

/**
 * Save code (create or update)
 * Uses API: POST /api/update-table-data
 * Table: sys_autos, Condition: e_where with p_name and p_type
 */
export async function saveCode(
	appId: string,
	codeName: string,
	codeContent: string,
	codeType: number,
	codeId?: string
) {
	try {
		const encrypted = encryptCode(codeContent);
		const command = codeId ? "update" : "create";
		
		const response = await updateTableData<CodeItem>({
			app_id: "csm", // sys_autos is stored under app_id=csm
			obj_name: "sys_autos",
			command: command,
			obj_update: {
				id: codeId || `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				p_name: codeName,
				p_type: codeType,
				p_code: encrypted,
			},
			pk_fields: ["p_name", "p_type"],
		});

		return {
			success: true,
			message: `Code ${command === "create" ? "created" : "saved"} successfully`,
			data: response,
		};
	} catch (error) {
		console.error("Failed to save code:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to save code",
		};
	}
}

/**
 * Delete code
 * Uses API: POST /api/update-table-data
 * Table: sys_autos, Condition: e_where with p_name and p_type
 */
export async function deleteCode(
	appId: string,
	codeId: string,
	codeName: string,
	codeType: number,
	codeContent: string
) {
	try {
		const response = await updateTableData<CodeItem>({
			app_id: "csm", // sys_autos is stored under app_id=csm
			obj_name: "sys_autos",
			command: "delete",
			obj_update: {
				id: codeId,
				p_name: codeName,
				p_type: codeType,
				p_code: codeContent,
			},
			pk_fields: ["p_name", "p_type"],
		});

		return {
			success: true,
			message: `Code deleted successfully`,
			data: response,
		};
	} catch (error) {
		console.error("Failed to delete code:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to delete code",
		};
	}
}

/**
 * Search in code editor content
 */
export interface SearchResult {
	line: number;
	column: number;
	text: string;
}

export function searchInCode(content: string, searchText: string): SearchResult[] {
	const lines = content.split("\n");
	const results: SearchResult[] = [];

	lines.forEach((line, lineIndex) => {
		let column = 0;
		while ((column = line.indexOf(searchText, column)) !== -1) {
			results.push({
				line: lineIndex,
				column: column,
				text: line.substring(Math.max(0, column - 20), column + searchText.length + 20),
			});
			column += searchText.length;
		}
	});

	return results;
}

/**
 * Replace in code content
 */
export function replaceInCode(
	content: string,
	searchText: string,
	replaceText: string,
	replaceAll: boolean = true
): string {
	if (replaceAll) {
		return content.replace(new RegExp(escapeRegex(searchText), "g"), replaceText);
	} else {
		return content.replace(escapeRegex(searchText), replaceText);
	}
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format code (basic formatting)
 */
export function formatCode(content: string, language: "javascript" | "html" = "javascript"): string {
	// This is a basic implementation. For production, consider using a library like Prettier
	const lines = content.split("\n");
	let indentLevel = 0;
	const formattedLines: string[] = [];

	lines.forEach(line => {
		const trimmed = line.trim();

		if (trimmed === "") {
			formattedLines.push("");
			return;
		}

		// Decrease indent for closing braces
		if (trimmed.startsWith("}") || trimmed.startsWith("]") || trimmed.startsWith(")")) {
			indentLevel = Math.max(0, indentLevel - 1);
		}

		// Add indentation
		const indented = "\t".repeat(indentLevel) + trimmed;
		formattedLines.push(indented);

		// Increase indent for opening braces
		if (trimmed.endsWith("{") || trimmed.endsWith("[") || trimmed.endsWith("(")) {
			indentLevel++;
		}
	});

	return formattedLines.join("\n");
}

/**
 * Validate code syntax (basic validation)
 */
export function validateCode(content: string, language: "javascript" | "html"): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (language === "javascript") {
		// Basic JS validation
		try {
			new Function(content);
		} catch (e) {
			errors.push(e instanceof Error ? e.message : "Invalid JavaScript");
		}

		// Check for common issues
		const braceCount = (content.match(/{/g) || []).length - (content.match(/}/g) || []).length;
		if (braceCount !== 0) {
			errors.push("Mismatched braces");
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
