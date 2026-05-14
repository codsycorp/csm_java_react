import { request } from "#src/utils";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";

export interface BusinessMemoryHit {
	appId: string
	sourceName: string
	chunkId: string
	summary: string
	content: string
	score: number
	createdAtMs: number
}

export interface WorkspaceSourceFile {
	path: string
	scope: string
	content: string
	truncated: boolean
	sizeBytes: number
}

export interface StreamOptimizePayload {
	appId: string
	instruction: string
	selection?: string
	currentCode: string
	language: "html" | "javascript" | "json"
	model?: string
	topK?: number
}

export interface StreamOptimizeCallbacks {
	onStatus?: (status: Record<string, unknown>) => void
	onChunk?: (chunk: string, fullText: string) => void
	onComplete?: (payload: Record<string, unknown>) => void
	onError?: (message: string) => void
}

export async function indexBusinessMarkdown(params: {
	appId: string
	file: File
	tags?: string
}): Promise<{ success: boolean, message?: string, result?: unknown }> {
	const formData = new FormData();
	formData.append("appId", params.appId);
	formData.append("file", params.file);
	if (params.tags) {
		formData.append("tags", params.tags);
	}

	const res = await request
		.post("ai-assistant/business-memory/index-md", {
			body: formData,
			timeout: 120_000,
		})
		.json<any>();

	return {
		success: Boolean(res?.success),
		message: String(res?.message || ""),
		result: res?.result,
	};
}

export async function searchBusinessMemory(params: {
	appId: string
	q: string
	k?: number
}): Promise<BusinessMemoryHit[]> {
	const search = new URLSearchParams();
	search.set("appId", params.appId);
	search.set("q", params.q);
	if (typeof params.k === "number" && Number.isFinite(params.k)) {
		search.set("k", String(params.k));
	}

	const res = await request
		.get(`ai-assistant/business-memory/search?${search.toString()}`, {
			timeout: 30_000,
		})
		.json<any>();

	const result = res?.result;
	return Array.isArray(result) ? result as BusinessMemoryHit[] : [];
}

export async function getBusinessMemoryStats(appId: string): Promise<Record<string, unknown>> {
	const search = new URLSearchParams();
	search.set("appId", appId);
	const res = await request
		.get(`ai-assistant/business-memory/stats?${search.toString()}`, {
			timeout: 30_000,
		})
		.json<any>();
	return (res?.result || {}) as Record<string, unknown>;
}

export async function fetchWorkspaceSourceFile(params: {
	path: string
	contextType?: "code" | "menu_json"
}): Promise<WorkspaceSourceFile | null> {
	const search = new URLSearchParams();
	search.set("path", params.path);
	if (params.contextType) {
		search.set("contextType", params.contextType);
	}

	const res = await request
		.get(`ai-assistant/workspace-source?${search.toString()}`, {
			timeout: 30_000,
		})
		.json<any>();

	return res?.success && res?.result ? res.result as WorkspaceSourceFile : null;
}

export async function scanIndexBusinessMemoryFromDir(appId: string): Promise<{
	success: boolean
	message?: string
	indexed?: Array<{ file: string, chunks: number, chars: number }>
	skipped?: string[]
}> {
	const res = await request
		.post("ai-assistant/business-memory/scan-index", {
			json: { appId },
			timeout: 60_000,
		})
		.json<any>();
	return {
		success: Boolean(res?.success),
		message: String(res?.message || ""),
		indexed: Array.isArray(res?.indexed) ? res.indexed : [],
		skipped: Array.isArray(res?.skipped) ? res.skipped : [],
	};
}

export async function streamOptimizeWithBusinessMemory(
	payload: StreamOptimizePayload,
	callbacks: StreamOptimizeCallbacks = {},
): Promise<void> {
	let response: Response;
	const selection = String(payload.selection || "").trim();
	const effectiveCurrentCode = selection || String(payload.currentCode || "");
	const instruction = String(payload.instruction || "").trim();

	try {
		response = await request.post("ai-code-stream", {
			json: {
				appId: payload.appId,
				message: instruction,
				currentCode: effectiveCurrentCode,
				language: payload.language,
				contextType: "code",
				flowType: "code_editor",
				taskType: "code_assistant",
				responseMode: "edit",
				model: payload.model,
			},
			timeout: 300_000,
			throwHttpErrors: false,
		});
	}
	catch (error: any) {
		const errMsg = String(error?.message || "Request failed");
		callbacks.onError?.(errMsg);
		return;
	}

	if (!response.ok || !response.body) {
		callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
		return;
	}

	let accumulated = "";
	let completed = false;

	await consumeSseStream(response, {
		onEvent: (evt) => {
			const payloadObj = (evt.payload && typeof evt.payload === "object")
				? (evt.payload as Record<string, unknown>)
				: null;
			if (!payloadObj) {
				return;
			}

			const result = dispatchAiCodeStreamEvent(payloadObj, accumulated, {
				onChunk: (chunk, full) => {
					callbacks.onChunk?.(chunk, full);
				},
				onStatus: (event) => {
					callbacks.onStatus?.(event);
				},
				onComplete: (event) => {
					const normalized = {
						...event,
						text: String(event.fullResponse || ""),
					};
					callbacks.onComplete?.(normalized);
				},
				onError: (msg) => {
					callbacks.onError?.(msg);
				},
			});

			accumulated = result.accumulated;
			if (result.completed) {
				completed = true;
			}
		},
	});

	if (!completed) {
		callbacks.onError?.("Stream ended before complete event");
	}
}
