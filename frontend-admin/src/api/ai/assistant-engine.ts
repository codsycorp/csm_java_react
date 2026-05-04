import { request } from "#src/utils";

export type BusinessMemoryHit = {
  appId: string;
  sourceName: string;
  chunkId: string;
  summary: string;
  content: string;
  score: number;
  createdAtMs: number;
};

export type StreamOptimizePayload = {
  appId: string;
  instruction: string;
  selection?: string;
  currentCode: string;
  language: "html" | "javascript" | "json";
  model?: string;
  topK?: number;
};

export type StreamOptimizeCallbacks = {
  onStatus?: (status: Record<string, unknown>) => void;
  onChunk?: (chunk: string, fullText: string) => void;
  onComplete?: (payload: Record<string, unknown>) => void;
  onError?: (message: string) => void;
};

export async function indexBusinessMarkdown(params: {
  appId: string;
  file: File;
  tags?: string;
}): Promise<{ success: boolean; message?: string; result?: unknown }> {
  const formData = new FormData();
  formData.append("appId", params.appId);
  formData.append("file", params.file);
  if (params.tags) {
    formData.append("tags", params.tags);
  }

  const res = await request
    .post("api/ai-assistant/business-memory/index-md", {
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
  appId: string;
  q: string;
  k?: number;
}): Promise<BusinessMemoryHit[]> {
  const search = new URLSearchParams();
  search.set("appId", params.appId);
  search.set("q", params.q);
  if (typeof params.k === "number" && Number.isFinite(params.k)) {
    search.set("k", String(params.k));
  }

  const res = await request
    .get(`api/ai-assistant/business-memory/search?${search.toString()}`, {
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
    .get(`api/ai-assistant/business-memory/stats?${search.toString()}`, {
      timeout: 30_000,
    })
    .json<any>();
  return (res?.result || {}) as Record<string, unknown>;
}

export async function scanIndexBusinessMemoryFromDir(appId: string): Promise<{
  success: boolean;
  message?: string;
  indexed?: Array<{ file: string; chunks: number; chars: number }>;
  skipped?: string[];
}> {
  const res = await request
    .post("api/ai-assistant/business-memory/scan-index", {
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
  const apiBase = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const url = `${apiBase}/api/ai-assistant/stream-optimize`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    callbacks.onError?.(`HTTP ${response.status}: ${response.statusText}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let eventName = "message";
  let eventData = "";
  let fullText = "";

  const flushEvent = () => {
    const dataText = eventData.trim();
    if (!dataText) {
      eventName = "message";
      eventData = "";
      return;
    }

    try {
      const payloadObj = JSON.parse(dataText) as Record<string, unknown>;
      if (eventName === "status") {
        callbacks.onStatus?.(payloadObj);
      } else if (eventName === "chunk") {
        const chunk = String(payloadObj?.text || "");
        fullText += chunk;
        callbacks.onChunk?.(chunk, fullText);
      } else if (eventName === "complete") {
        callbacks.onComplete?.(payloadObj);
      } else if (eventName === "error") {
        callbacks.onError?.(String(payloadObj?.message || "Unknown stream error"));
      }
    } catch {
      if (eventName === "chunk") {
        fullText += dataText;
        callbacks.onChunk?.(dataText, fullText);
      }
    }

    eventName = "message";
    eventData = "";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = String(rawLine || "");
      if (!line.trim()) {
        flushEvent();
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        eventData += `${line.slice(5).trim()}\n`;
      }
    }
  }

  if (eventData.trim()) {
    flushEvent();
  }
}
