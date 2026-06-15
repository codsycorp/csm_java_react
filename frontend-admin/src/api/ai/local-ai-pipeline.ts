/** SSE stages emitted by backend-go /ai-code-stream (local llama.cpp). */

export const GO_LOCAL_AI_SSE_STAGES = new Set([
	"started",
	"attachment_intake",
	"intent_reasoning",
	"routing",
	"agent_handoff",
	"tool_search",
	"rag_citations",
	"menu_scaffold_assemble",
	"menu_module_step",
	"menu_module_enrich",
	"final_output_gate",
	"retrieval_quality_gate",
	"business_comprehend",
	"business_plan",
	"agentic_plan",
	"agentic_plan_schema",
	"agentic_step",
	"scope_reasoning",
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
		case "attachment_intake": {
			const total = Number(evt.total || 0);
			const images = Number(evt.images || 0);
			return {
				stageKey: "attachment_intake",
				icon: "📎",
				label: uiText("Đính kèm", "Attachments", "附件"),
				detail: total > 0
					? [
						`${total} file`,
						images > 0 ? `${images} ảnh` : "",
						String(evt.scopeSummary || "").trim(),
					].filter(Boolean).join(" · ")
					: undefined,
				status: "done",
			};
		}
		case "intent_reasoning": {
			const reasoning = String(evt.reasoning || evt.message || "").trim();
			return {
				stageKey: "intent_reasoning",
				icon: "🧠",
				label: uiText("Suy luận intent", "Intent reasoning", "意图推理"),
				detail: reasoning || undefined,
				status: "done",
			};
		}
		case "routing": {
			const mode = String(evt.responseMode || "").trim().toLowerCase();
			return {
				stageKey: "routing",
				icon: "🔀",
				label: uiText("Định tuyến", "Routing", "路由"),
				detail: mode || undefined,
				status: "done",
			};
		}
		case "business_comprehend":
			return {
				stageKey: "business_comprehend",
				icon: "📋",
				label: uiText("Comprehend nghiệp vụ", "Business comprehend", "业务理解"),
				detail: String(evt.status || "").trim() || undefined,
				status: String(evt.status || "").trim().toLowerCase() === "running" ? "running" : "done",
			};
		case "agentic_plan":
			return {
				stageKey: "agentic_plan",
				icon: "🗺️",
				label: uiText("Kế hoạch Agentic", "Agentic plan", "Agent 计划"),
				detail: [
					String(evt.routingTier || "").trim(),
					Number.isFinite(Number(evt.planStepCount)) ? `${Number(evt.planStepCount)} steps` : "",
				].filter(Boolean).join(" · ") || undefined,
				status: "done",
			};
		case "agent_handoff":
			return {
				stageKey: "agent_handoff",
				icon: "🤝",
				label: uiText("Agent handoff", "Agent handoff", "Agent 交接"),
				detail: [String(evt.fromAgent || ""), String(evt.toAgent || "")].filter(Boolean).join(" → ") || undefined,
				status: "done",
			};
		case "tool_search": {
			const hits = Number(evt.retrievalHitCount || 0);
			return {
				stageKey: "tool_search",
				icon: "🔍",
				label: uiText("Tìm kiếm tenant RAG", "Tenant RAG search", "租户 RAG 检索"),
				detail: hits > 0 ? `${hits} hits` : uiText("không có hit", "no hits", "无命中"),
				status: "done",
			};
		}
		case "rag_citations": {
			const count = Number(evt.count || 0);
			return {
				stageKey: "rag_citations",
				icon: "📚",
				label: uiText("Trích dẫn RAG", "RAG citations", "RAG 引用"),
				detail: count > 0 ? `${count} nguồn` : undefined,
				status: "done",
			};
		}
		case "menu_scaffold_assemble": {
			const nodes = Number(evt.menuNodes || 0);
			return {
				stageKey: "menu_scaffold_assemble",
				icon: "🧩",
				label: uiText("Ráp menu Lego", "Lego menu scaffold", "Lego 菜单组装"),
				detail: nodes > 0 ? `${nodes} nodes` : undefined,
				status: "done",
			};
		}
		case "menu_module_step": {
			const label = String(evt.module || "").trim();
			const idx = Number(evt.moduleIndex || 0);
			const total = Number(evt.moduleTotal || 0);
			return {
				stageKey: "menu_module_step",
				icon: "📦",
				label: total > 0 ? `Module ${idx}/${total}: ${label}` : label,
				status: "done",
			};
		}
		case "menu_module_enrich": {
			const label = String(evt.module || "").trim();
			const status = String(evt.status || "").trim().toLowerCase();
			const running = status === "running" || status === "replanning";
			return {
				stageKey: "menu_module_enrich",
				icon: status === "replanning" ? "🔁" : Boolean(evt.usedLlm) ? "✨" : "🏷️",
				label: status === "replanning"
					? uiText(`Replan: ${label}`, `Replan: ${label}`, `重规划: ${label}`)
					: running ? `Enrich: ${label}` : label,
				status: running ? "running" : "done",
			};
		}
		case "final_output_gate": {
			const passed = Boolean(evt.passed);
			return {
				stageKey: "final_output_gate",
				icon: passed ? "✅" : "⛔",
				label: uiText("Quality gate", "Quality gate", "质量门"),
				detail: passed ? "passed" : String(evt.reasonCode || "rejected"),
				status: passed ? "done" : "error",
			};
		}
		case "retrieval_quality_gate": {
			const passed = String(evt.status || "") === "passed";
			return {
				stageKey: "retrieval_quality_gate",
				icon: passed ? "✅" : "⚠️",
				label: uiText("RAG quality gate", "RAG quality gate", "RAG 质量门"),
				status: "done",
			};
		}
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
		case "context_compression": {
			if (String(evt.status || "") === "local_map_reduce_plan") {
				const chunks = Number((evt as Record<string, unknown>).chunks) || 0;
				return {
					stageKey: "map_reduce_plan",
					icon: "🧩",
					label: uiText("Map-reduce phân tích code lớn", "Map-reduce large code analysis", "大代码 Map-Reduce 分析"),
					detail: chunks > 0
						? uiText(`${chunks} chunk`, `${chunks} chunks`, `${chunks} 个分块`)
						: undefined,
					status: "running",
				};
			}
			return {
				stageKey: "context_compression",
				icon: "📎",
				label: uiText("Gắn ngữ cảnh orchestration", "Attach orchestration context", "附加编排上下文"),
				status: "done",
			};
		}
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
			if (!isLocalProviderModel(evt.model) && String((evt as Record<string, unknown>).waitState || "") !== "local_map_reduce") {
				return null;
			}
			if (String((evt as Record<string, unknown>).waitState || "") === "local_map_reduce") {
				const phase = String(evt.localPhase || "chunk_analysis").trim().toLowerCase();
				const chunkIndex = Number((evt as Record<string, unknown>).chunkIndex) || 0;
				const chunkTotal = Number((evt as Record<string, unknown>).chunkTotal) || 0;
				const chunkDetail = chunkIndex > 0 && chunkTotal > 0
					? uiText(`Chunk ${chunkIndex}/${chunkTotal}`, `Chunk ${chunkIndex}/${chunkTotal}`, `分块 ${chunkIndex}/${chunkTotal}`)
					: undefined;
				if (phase === "synthesis") {
					return {
						stageKey: "map_reduce_synthesis",
						icon: "🔗",
						label: uiText("Tổng hợp map-reduce", "Map-reduce synthesis", "Map-Reduce 汇总"),
						status: "running",
					};
				}
				return {
					stageKey: "map_reduce_chunk",
					icon: "🧩",
					label: uiText("Phân tích từng chunk", "Analyze each chunk", "分析各分块"),
					detail: chunkDetail,
					status: "running",
				};
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
