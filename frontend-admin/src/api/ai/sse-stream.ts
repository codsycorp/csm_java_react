export type AiCodeStreamCallbacks = {
	onChunk?: (chunk: string, accumulated: string) => void;
	onStatus?: (event: Record<string, unknown>) => void;
	onComplete?: (event: Record<string, unknown>) => void;
	onError?: (msg: string) => void;
};

/**
 * Dispatches a parsed AI code-stream SSE payload to the appropriate callback
 * based on the `stage` field. Returns updated accumulated text and completion flag.
 */
export function dispatchAiCodeStreamEvent(
	payload: Record<string, unknown>,
	accumulated: string,
	callbacks: AiCodeStreamCallbacks,
): { accumulated: string; completed: boolean } {
	const stage = String(payload.stage || "");
	if (stage === "streaming" && typeof payload.chunk === "string") {
		const newAccumulated = accumulated + payload.chunk;
		callbacks.onChunk?.(payload.chunk, newAccumulated);
		return { accumulated: newAccumulated, completed: false };
	}
	if (stage === "complete") {
		if (typeof payload.fullResponse !== "string") {
			payload.fullResponse = accumulated;
		}
		callbacks.onComplete?.(payload);
		return { accumulated, completed: true };
	}
	if (stage === "error") {
		callbacks.onError?.(String(payload.message || "Unknown error"));
		return { accumulated, completed: false };
	}
	callbacks.onStatus?.(payload);
	return { accumulated, completed: false };
}

export type SseStreamEvent = {
	event: string;
	data: string;
	payload?: unknown;
};

export type ConsumeSseOptions = {
	onEvent: (evt: SseStreamEvent) => void | Promise<void>;
};

export type ConsumeSseResult = {
	bytesReceived: number;
	dataLineCount: number;
	eventCount: number;
};

export async function consumeSseStream(response: Response, options: ConsumeSseOptions): Promise<ConsumeSseResult> {
	if (!response.body) {
		return { bytesReceived: 0, dataLineCount: 0, eventCount: 0 };
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = "";
	let bytesReceived = 0;
	let dataLineCount = 0;
	let eventCount = 0;

	let currentEventName = "message";
	let currentEventData = "";

	const flushEvent = async () => {
		const dataText = currentEventData.trim();
		if (!dataText) {
			currentEventName = "message";
			currentEventData = "";
			return;
		}

		let payload: unknown;
		try {
			payload = JSON.parse(dataText);
		} catch {
			payload = undefined;
		}

		eventCount += 1;
		await options.onEvent({
			event: currentEventName || "message",
			data: dataText,
			payload,
		});

		currentEventName = "message";
		currentEventData = "";
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value) {
				bytesReceived += value.byteLength;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() || "";

			for (const rawLine of lines) {
				const line = String(rawLine || "");
				if (!line.trim()) {
					await flushEvent();
					continue;
				}
				if (line.startsWith("event:")) {
					currentEventName = line.slice(6).trim() || "message";
					continue;
				}
				if (line.startsWith("data:")) {
					dataLineCount += 1;
					currentEventData += `${line.slice(5).trim()}\n`;
				}
			}
		}

		if (buffer.trim()) {
			const line = buffer.trim();
			if (line.startsWith("event:")) {
				currentEventName = line.slice(6).trim() || "message";
			} else if (line.startsWith("data:")) {
				dataLineCount += 1;
				currentEventData += `${line.slice(5).trim()}\n`;
			}
		}

		if (currentEventData.trim()) {
			await flushEvent();
		}
	} finally {
		reader.releaseLock();
	}

	return {
		bytesReceived,
		dataLineCount,
		eventCount,
	};
}
