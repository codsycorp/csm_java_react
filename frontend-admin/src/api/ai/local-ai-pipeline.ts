/** SSE stages emitted by backend-go /ai-code-stream (local llama.cpp). */

export const GO_LOCAL_AI_SSE_STAGES = new Set([
	"started",
	"local_pre_analysis",
	"context_compression",
	"streaming_started",
	"waiting_gemini",
	"streaming",
	"streaming_progress",
	"complete",
	"request_complete",
	"blocked",
]);

export type LocalAiPipelineStep = {
	stageKey: string;
	icon: string;
	label: string;
	detail?: string;
	status: "running" | "done" | "error";
};

type UiText = (vi: string, en: string, zh: string) => string;

function isLocalProviderModel(model: unknown): boolean {
	const m = String(model || "").trim().toLowerCase();
	return m === "local_provider"
		|| m === "llama.cpp-native"
		|| m.includes("llama");
}

/** Map one Go SSE payload to a compact pipeline step (null = skip / update-only). */
export function mapGoLocalAiStageToStep(
	evt: Record<string, unknown>,
	uiText: UiText,
): LocalAiPipelineStep | null {
	const stage = String(evt.stage || "").trim().toLowerCase();
	if (!GO_LOCAL_AI_SSE_STAGES.has(stage)) {
		return null;
	}

	switch (stage) {
		case "started":
			return {
				stageKey: "started",
				icon: "📥",
				label: uiText("Nhận yêu cầu", "Request accepted", "已接收请求"),
				detail: [
					String(evt.flowType || "").trim(),
					String(evt.taskType || "").trim(),
					Number.isFinite(Number(evt.promptChars))
						? uiText(`${Number(evt.promptChars)} ký tự prompt`, `${Number(evt.promptChars)} prompt chars`, `${Number(evt.promptChars)} 提示字符`)
						: "",
				].filter(Boolean).join(" · ") || undefined,
				status: "done",
			};
		case "local_pre_analysis":
			return {
				stageKey: "local_pre_analysis",
				icon: "🧠",
				label: uiText("Context local sẵn sàng", "Local context ready", "本地上下文就绪"),
				detail: evt.localOnlyEnabled === true
					? uiText("Chỉ AI local", "Local AI only", "仅本地 AI")
					: undefined,
				status: "done",
			};
		case "context_compression":
			return {
				stageKey: "context_compression",
				icon: "📎",
				label: uiText("Gắn ngữ cảnh orchestration", "Attach orchestration context", "附加编排上下文"),
				status: "done",
			};
		case "streaming_started":
			if (!isLocalProviderModel(evt.model)) {
				return null;
			}
			return {
				stageKey: "streaming_started",
				icon: "⚡",
				label: uiText("Khởi động inference local", "Start local inference", "启动本地推理"),
				detail: uiText("llama.cpp in-process", "llama.cpp in-process", "进程内 llama.cpp"),
				status: "running",
			};
		case "waiting_gemini": {
			if (!isLocalProviderModel(evt.model)) {
				return null;
			}
			const phase = String(evt.localPhase || "infer").trim().toLowerCase();
			if (phase === "loading") {
				return {
					stageKey: "waiting_gemini_loading",
					icon: "📦",
					label: uiText("Nạp model GGUF", "Load GGUF model", "加载 GGUF 模型"),
					detail: Number.isFinite(Number(evt.estimatedWaitSecs)) && Number(evt.estimatedWaitSecs) > 0
						? uiText(`~${Number(evt.estimatedWaitSecs)}s`, `~${Number(evt.estimatedWaitSecs)}s`, `约 ${Number(evt.estimatedWaitSecs)} 秒`)
						: undefined,
					status: "running",
				};
			}
			return {
				stageKey: "waiting_gemini_infer",
				icon: "🔄",
				label: uiText("Đang suy luận (CPU)", "Inferring (CPU)", "推理中（CPU）"),
				status: "running",
			};
		}
		case "streaming":
			if (evt.localProviderPrimary !== true) {
				return null;
			}
			return {
				stageKey: "streaming",
				icon: "💬",
				label: uiText("Đang stream câu trả lời", "Streaming answer", "流式返回答案"),
				status: "running",
			};
		case "streaming_progress": {
			const chars = Number(evt.charsReceived);
			if (!Number.isFinite(chars) || chars <= 0) {
				return null;
			}
			return {
				stageKey: "streaming_progress",
				icon: "💬",
				label: uiText("Đang stream câu trả lời", "Streaming answer", "流式返回答案"),
				detail: uiText(`${Math.round(chars)} ký tự`, `${Math.round(chars)} chars`, `${Math.round(chars)} 字符`),
				status: "running",
			};
		}
		case "complete": {
			const mode = String(evt.responseMode || "").trim().toLowerCase();
			const elapsedMs = Number(evt.elapsedMs);
			const streamed = Number(evt.streamedChars ?? evt.outputChars);
			const model = String(evt.model || "llama.cpp-native").trim();
			const parts: string[] = [model];
			if (mode === "analyze") {
				parts.push(uiText("analyze · prose", "analyze · prose", "analyze · 文本"));
			} else if (mode === "edit") {
				parts.push(uiText("edit · patch", "edit · patch", "edit · 补丁"));
			}
			if (Number.isFinite(elapsedMs) && elapsedMs > 0) {
				parts.push(elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${Math.round(elapsedMs)}ms`);
			}
			if (Number.isFinite(streamed) && streamed > 0) {
				parts.push(uiText(`${Math.round(streamed)} ký tự`, `${Math.round(streamed)} chars`, `${Math.round(streamed)} 字符`));
			}
			return {
				stageKey: "complete",
				icon: "✅",
				label: uiText("Hoàn tất", "Completed", "已完成"),
				detail: parts.join(" · "),
				status: "done",
			};
		}
		case "blocked":
			return {
				stageKey: "blocked",
				icon: "⛔",
				label: uiText("Bị chặn", "Blocked", "已阻止"),
				detail: String(evt.message || evt.reason_code || "").trim() || undefined,
				status: "error",
			};
		default:
			return null;
	}
}

export function summarizeLocalPipelineSteps(steps: LocalAiPipelineStep[], uiText: UiText): string {
	if (steps.length === 0) {
		return uiText("0 bước", "0 steps", "0 步");
	}
	const done = steps.filter(s => s.status === "done").length;
	if (done >= steps.length) {
		return uiText(`${steps.length} bước · xong`, `${steps.length} steps · done`, `${steps.length} 步 · 完成`);
	}
	const running = steps.find(s => s.status === "running");
	if (running) {
		return `${done}/${steps.length} · ${running.label}`;
	}
	return uiText(`${done}/${steps.length} bước`, `${done}/${steps.length} steps`, `${done}/${steps.length} 步`);
}
