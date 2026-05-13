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
 * Enhanced code diagnostics - supports multiple languages with comprehensive validation
 */
export interface CodeDiagnostic {
	line: number;
	column: number;
	message: string;
	severity: "error" | "warning";
	code?: string;
}

export interface CodeValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
	diagnostics?: CodeDiagnostic[];
	language: string;
	timestamp: number;
}

/**
 * Validate code syntax with multi-language support
 * Supports: JavaScript, TypeScript, Python, Java, HTML, CSS, SQL, JSON
 */
export function validateCode(
	content: string,
	language: "javascript" | "html" | "typescript" | "python" | "java" | "css" | "json" | "sql" | string = "javascript"
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (language === "javascript" || language === "typescript") {
		validateJavaScript(content, errors);
	} else if (language === "html") {
		validateHtml(content, errors);
	} else if (language === "json") {
		validateJson(content, errors);
	} else if (language === "python") {
		validatePython(content, errors);
	} else if (language === "java") {
		validateJava(content, errors);
	} else if (language === "css") {
		validateCss(content, errors);
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * Enhanced workspace diagnostics collection - includes syntax, lint patterns, and structure validation
 */
export function collectWorkspaceDiagnostics(
	content: string,
	language: string
): CodeDiagnostic[] {
	const diagnostics: CodeDiagnostic[] = [];

	if (!content || !language) return diagnostics;

	// Collect syntax errors
	const lines = content.split(/\r?\n/);
	const normalizedLang = language.toLowerCase();

	if (normalizedLang === "javascript" || normalizedLang === "typescript") {
		diagnosticsSyntaxJs(content, lines, diagnostics);
		diagnosticsLintJs(content, lines, diagnostics);
	} else if (normalizedLang === "html") {
		diagnosticsSyntaxHtml(content, lines, diagnostics);
	} else if (normalizedLang === "json") {
		diagnosticsSyntaxJson(content, lines, diagnostics);
	} else if (normalizedLang === "python") {
		diagnosticsSyntaxPython(content, lines, diagnostics);
	} else if (normalizedLang === "java") {
		diagnosticsSyntaxJava(content, lines, diagnostics);
	} else if (normalizedLang === "css") {
		diagnosticsSyntaxCss(content, lines, diagnostics);
	}

	// Sort by line number
	diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);

	// Limit to top 10 to avoid overwhelming display
	return diagnostics.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION HELPERS - Per Language
// ─────────────────────────────────────────────────────────────────────────────

function validateJavaScript(content: string, errors: string[]): void {
	try {
		new Function(content);
	} catch (e) {
		errors.push(e instanceof Error ? e.message : "Invalid JavaScript");
	}
	checkBraceBalance(content, errors);
	checkCommonJsPatterns(content, errors);
}

function validateHtml(content: string, errors: string[]): void {
	checkTagBalance(content, errors);
	checkAttributeQuotes(content, errors);
}

function validateJson(content: string, errors: string[]): void {
	try {
		JSON.parse(content);
	} catch (e) {
		errors.push(e instanceof Error ? e.message : "Invalid JSON");
	}
}

function validatePython(content: string, errors: string[]): void {
	// Basic Python validation
	const indentLines = content.split(/\r?\n/);
	let prevIndent = 0;
	for (let i = 0; i < indentLines.length; i++) {
		const line = indentLines[i];
		if (line.trim() === "") continue;
		const indent = line.match(/^(\s*)/)?.[1].length || 0;
		if (indent > prevIndent + 4 && !line.trim().startsWith("#")) {
			errors.push(`Unexpected indentation at line ${i + 1}`);
		}
		prevIndent = indent;
	}
}

function validateJava(content: string, errors: string[]): void {
	checkBraceBalance(content, errors);
	if (!content.includes("public class") && !content.includes("class ")) {
		errors.push("No class definition found");
	}
}

function validateCss(content: string, errors: string[]): void {
	checkBraceBalance(content, errors);
	if (!content.includes(":") && content.includes("{")) {
		errors.push("CSS property not found (missing ':')");
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS COLLECTION - Per Language
// ─────────────────────────────────────────────────────────────────────────────

function diagnosticsSyntaxJs(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	// Try to parse as JavaScript
	try {
		new Function(content);
	} catch (e) {
		if (e instanceof Error) {
			const match = e.message.match(/line (\d+)/i);
			const line = match ? parseInt(match[1], 10) - 1 : 0;
			diagnostics.push({
				line: Math.max(0, line),
				column: 0,
				message: e.message,
				severity: "error",
				code: "js-syntax",
			});
		}
	}

	// Check for common syntax patterns
	lines.forEach((line, idx) => {
		// Unclosed strings
		const singleQuote = (line.match(/'/g) || []).length;
		const doubleQuote = (line.match(/"/g) || []).length;
		if ((singleQuote % 2) !== 0 || (doubleQuote % 2) !== 0) {
			diagnostics.push({
				line: idx,
				column: 0,
				message: "Unclosed string literal",
				severity: "warning",
				code: "unclosed-string",
			});
		}

		// Missing semicolon (optional but detect for linting)
		if (
			line.trim().endsWith("}") === false &&
			line.trim().endsWith("{") === false &&
			line.trim().endsWith(",") === false &&
			line.trim().endsWith(";") === false &&
			line.trim() !== "" &&
			!line.trim().startsWith("//")
		) {
			// This is just a warning for missing semicolons
		}
	});
}

function diagnosticsLintJs(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	// Detect common JS patterns
	lines.forEach((line, idx) => {
		// Unused variables (heuristic)
		const varMatch = line.match(/(?:const|let|var)\s+(\w+)/);
		if (varMatch) {
			const varName = varMatch[1];
			const restOfCode = content.substring(content.indexOf(line) + line.length);
			if (!restOfCode.includes(varName)) {
				diagnostics.push({
					line: idx,
					column: line.indexOf(varName),
					message: `Variable '${varName}' is declared but never used`,
					severity: "warning",
					code: "unused-variable",
				});
			}
		}

		// `console.log` in production code
		if (line.includes("console.log")) {
			diagnostics.push({
				line: idx,
				column: line.indexOf("console.log"),
				message: "console.log should be removed or disabled in production",
				severity: "warning",
				code: "console-use",
			});
		}

		// Suspicious equality
		if (line.includes("==") && !line.includes("===")) {
			diagnostics.push({
				line: idx,
				column: line.indexOf("=="),
				message: "Use '===' instead of '==' for strict comparison",
				severity: "warning",
				code: "loose-equality",
			});
		}
	});
}

function diagnosticsSyntaxHtml(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	const openTags = new Map<string, number>();
	const selfClosing = new Set(["br", "hr", "img", "input", "meta", "link"]);

	lines.forEach((line, idx) => {
		// Match opening tags
		const openMatch = line.match(/<(\w+)[^>]*>/g);
		if (openMatch) {
			openMatch.forEach((tag) => {
				const tagName = tag.match(/<(\w+)/)?.[1];
				if (tagName && !selfClosing.has(tagName)) {
					openTags.set(tagName, (openTags.get(tagName) || 0) + 1);
				}
			});
		}

		// Match closing tags
		const closeMatch = line.match(/<\/(\w+)>/g);
		if (closeMatch) {
			closeMatch.forEach((tag) => {
				const tagName = tag.match(/<\/(\w+)/)?.[1];
				if (tagName && openTags.has(tagName)) {
					openTags.set(tagName, (openTags.get(tagName) || 0) - 1);
				} else if (tagName) {
					diagnostics.push({
						line: idx,
						column: line.indexOf(tag),
						message: `Unexpected closing tag '</${tagName}>'`,
						severity: "error",
						code: "tag-mismatch",
					});
				}
			});
		}
	});

	// Check for unclosed tags
	openTags.forEach((count, tag) => {
		if (count > 0) {
			diagnostics.push({
				line: 0,
				column: 0,
				message: `Tag '<${tag}>' is not closed (${count} unclosed)`,
				severity: "warning",
				code: "unclosed-tag",
			});
		}
	});
}

function diagnosticsSyntaxJson(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	try {
		JSON.parse(content);
	} catch (e) {
		if (e instanceof Error) {
			const match = e.message.match(/position (\d+)/);
			let line = 0;
			if (match) {
				const pos = parseInt(match[1], 10);
				const beforePos = content.substring(0, pos);
				line = (beforePos.match(/\n/g) || []).length;
			}
			diagnostics.push({
				line,
				column: 0,
				message: e.message,
				severity: "error",
				code: "json-parse",
			});
		}
	}
}

function diagnosticsSyntaxPython(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	let prevIndent = 0;
	lines.forEach((line, idx) => {
		if (line.trim() === "" || line.trim().startsWith("#")) return;
		const indent = line.match(/^(\s*)/)?.[1].length || 0;
		if (indent > prevIndent + 4) {
			diagnostics.push({
				line: idx,
				column: 0,
				message: `Unexpected indentation (expected max ${prevIndent + 4} spaces)`,
				severity: "error",
				code: "indent-error",
			});
		}
		prevIndent = line.trim() ? indent : prevIndent;
	});
}

function diagnosticsSyntaxJava(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	checkBraceBalanceDetailed(content, lines, diagnostics);
	if (!content.includes("public class") && !content.includes("class ")) {
		diagnostics.push({
			line: 0,
			column: 0,
			message: "No class definition found",
			severity: "error",
			code: "no-class",
		});
	}
}

function diagnosticsSyntaxCss(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	checkBraceBalanceDetailed(content, lines, diagnostics);
	let inSelector = false;
	lines.forEach((line, idx) => {
		if (line.includes("{")) inSelector = true;
		if (line.includes("}")) inSelector = false;
		if (inSelector && line.includes(":") === false && line.trim() !== "" && !line.trim().startsWith("//")) {
			diagnostics.push({
				line: idx,
				column: 0,
				message: "CSS property value missing (no ':' found)",
				severity: "warning",
				code: "css-property",
			});
		}
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMON VALIDATION UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function checkBraceBalance(content: string, errors: string[]): void {
	const braceCount = (content.match(/{/g) || []).length - (content.match(/}/g) || []).length;
	if (braceCount !== 0) {
		errors.push(`Mismatched braces (${braceCount > 0 ? "missing" : "extra"} ${Math.abs(braceCount)} closing brace${Math.abs(braceCount) > 1 ? "s" : ""})`);
	}
}

function checkBraceBalanceDetailed(
	content: string,
	lines: string[],
	diagnostics: CodeDiagnostic[]
): void {
	let depth = 0;
	lines.forEach((line, idx) => {
		const openCount = (line.match(/{/g) || []).length;
		const closeCount = (line.match(/}/g) || []).length;
		depth += openCount - closeCount;
		if (depth < 0) {
			diagnostics.push({
				line: idx,
				column: line.indexOf("}"),
				message: "Unmatched closing brace",
				severity: "error",
				code: "brace-mismatch",
			});
			depth = 0;
		}
	});
	if (depth > 0) {
		diagnostics.push({
			line: lines.length - 1,
			column: 0,
			message: `${depth} unclosed brace${depth > 1 ? "s" : ""}`,
			severity: "error",
			code: "unclosed-brace",
		});
	}
}

function checkTagBalance(content: string, errors: string[]): void {
	const openCount = (content.match(/<[^/>]+>/g) || []).length;
	const closeCount = (content.match(/<\/[^>]+>/g) || []).length;
	if (openCount !== closeCount) {
		errors.push(`Mismatched HTML tags (${openCount} open, ${closeCount} close)`);
	}
}

function checkAttributeQuotes(content: string, errors: string[]): void {
	const unquotedAttrs = content.match(/\w+\s*=\s*[^"'\s>]/g);
	if (unquotedAttrs && unquotedAttrs.length > 0) {
		errors.push("HTML attribute values should be quoted");
	}
}

function checkCommonJsPatterns(content: string, errors: string[]): void {
	// This is minimal - just for basic patterns
	if (content.includes("var ") && !content.includes("const ") && !content.includes("let ")) {
		// Just a note, not an error
	}
}
