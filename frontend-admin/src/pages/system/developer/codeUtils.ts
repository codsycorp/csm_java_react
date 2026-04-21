/**
 * Utility functions for handling code blocks in Copilot chat responses
 */

export type CodeBlock = {
	language: string;
	code: string;
	index: number;
};

/**
 * Extract code blocks from text that contains markdown code fences
 * Format: ```language\ncode\n```
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const codeBlockRegex = /```([a-z0-9]*)\n([\s\S]*?)\n```/gi;
	let match;
	let index = 0;

	while ((match = codeBlockRegex.exec(text)) !== null) {
		const language = match[1] || "plaintext";
		const code = match[2];

		blocks.push({
			language: language.toLowerCase(),
			code: code.trim(),
			index,
		});

		index++;
	}

	return blocks;
}

/**
 * Extract the latest in-progress markdown code block.
 * Supports streaming text where closing ``` has not arrived yet.
 */
export function extractLatestOpenCodeBlock(text: string): CodeBlock | null {
	const source = String(text || "");
	if (!source) return null;

	const fenceMatches = [...source.matchAll(/```([a-z0-9]*)\n?/gi)];
	if (fenceMatches.length === 0) return null;

	const lastFence = fenceMatches[fenceMatches.length - 1];
	const full = String(lastFence[0] || "");
	const lang = String(lastFence[1] || "plaintext").toLowerCase();
	const start = Number(lastFence.index || 0) + full.length;
	const tail = source.slice(start);

	// If tail contains closing fence, this block is already complete.
	if (tail.includes("\n```") || tail.trim() === "```") {
		return null;
	}

	const code = tail.trim();
	if (!code) return null;

	return {
		language: lang,
		code,
		index: Math.max(0, fenceMatches.length - 1),
	};
}

/**
 * Syntax highlight code based on language
 * Returns HTML-safe highlighted code (without executing any code)
 */
export function syntaxHighlightCode(code: string, language: string): string {
	// Simple tokenization for basic syntax highlighting
	// In production, consider using prism.js or highlight.js

	const keywords: Record<string, RegExp> = {
		javascript: /\b(const|let|var|function|if|else|return|for|while|import|export|from|class|async|await|try|catch)\b/g,
		python: /\b(def|class|if|else|return|for|while|import|from|async|await|try|except)\b/g,
		java: /\b(public|private|protected|class|interface|void|int|String|boolean|return|if|else|for|while|import)\b/g,
		html: /(<[^>]+>)/g,
		css: /([.#][a-zA-Z_-][a-zA-Z0-9_-]*)|(\{[^}]*\})/g,
		sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|ON|GROUP BY|ORDER BY|LIMIT)\b/gi,
	};

	let highlighted = code;

	// Apply basic keyword highlighting (escape HTML entities first)
	highlighted = highlighted
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

	const langLower = language.toLowerCase();
	if (keywords[langLower]) {
		highlighted = highlighted.replace(keywords[langLower], (match) => {
			return `<span class="keyword">${match}</span>`;
		});
	}

	return highlighted;
}

/**
 * Remove markdown code fences from text, returning clean text
 */
export function stripCodeFences(text: string): string {
	return text.replace(/```[a-z0-9]*\n/gi, "").replace(/```/g, "");
}

/**
 * Parse markdown-style code blocks and convert to plain structure
 */
export function parseCodeFromMarkdown(text: string): { plainText: string; blocks: CodeBlock[] } {
	const blocks = extractCodeBlocks(text);
	let plainText = stripCodeFences(text);

	// Clean up extra whitespace
	plainText = plainText.trim();

	return { plainText, blocks };
}

/**
 * Format code for display with proper indentation
 */
export function formatCodeForDisplay(code: string, indent: number = 2): string {
	const indentStr = " ".repeat(indent);
	return code
		.split("\n")
		.map((line) => (line.trim() ? indentStr + line : ""))
		.join("\n");
}

/**
 * Detect programming language from code snippet
 */
export function detectLanguage(code: string): string {
	// Python detection
	if (/^\s*import\s+/m.test(code) || /^\s*from\s+/m.test(code)) {
		return "python";
	}

	// JavaScript detection
	if (
		/^\s*import\s+[{\w]/m.test(code) ||
		/^\s*export\s+/m.test(code) ||
		/=>\s*{/.test(code) ||
		/const\s+\w+\s*=/m.test(code)
	) {
		return "javascript";
	}

	// Java detection
	if (
		/^\s*public\s+/m.test(code) ||
		/^\s*class\s+\w+\s*{/.test(code) ||
		/^\s*int\s+/m.test(code)
	) {
		return "java";
	}

	// HTML detection
	if (/^\s*<[a-z]/m.test(code) || /<\/[a-z]/m.test(code)) {
		return "html";
	}

	// CSS detection
	if (
		/^\s*[.#][\w-]+\s*{/m.test(code) ||
		/:\s*[;\s]/m.test(code) ||
		/@media/m.test(code)
	) {
		return "css";
	}

	// SQL detection
	if (/^\s*SELECT\s+/i.test(code) || /^\s*FROM\s+/i.test(code) || /^\s*WHERE\s+/i.test(code)) {
		return "sql";
	}

	return "plaintext";
}
