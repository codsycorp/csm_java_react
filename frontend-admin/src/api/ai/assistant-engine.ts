import { request } from "#src/utils";
import { consumeSseStream } from "#src/api/ai/sse-stream";

export interface BusinessMemoryHit {
	appId: string
	sourceName: string
	chunkId: string
	summary: string
	content: string
	score: number
	createdAtMs: number
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
	try {
		response = await request.post("ai-assistant/stream-optimize", {
			json: payload,
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

	let fullText = "";

	await consumeSseStream(response, {
		onEvent: (evt) => {
			const eventName = String(evt.event || "message");
			const payloadObj = (evt.payload && typeof evt.payload === "object")
				? (evt.payload as Record<string, unknown>)
				: null;

			if (eventName === "status") {
				callbacks.onStatus?.(payloadObj || { text: evt.data });
				return;
			}
			if (eventName === "chunk") {
				const chunk = payloadObj ? String(payloadObj?.text || "") : evt.data;
				if (!chunk) {
					return;
				}
				fullText += chunk;
				callbacks.onChunk?.(chunk, fullText);
				return;
			}
			if (eventName === "complete") {
				callbacks.onComplete?.(payloadObj || { text: evt.data });
				return;
			}
			if (eventName === "error") {
				callbacks.onError?.(
					payloadObj
						? String(payloadObj?.message || "Unknown stream error")
						: (evt.data || "Unknown stream error"),
				);
			}
		},
	});
}
