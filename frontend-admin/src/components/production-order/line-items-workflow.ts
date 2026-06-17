import type { LineItemsWorkflowConfig, LineItemsWorkflowStep, OrderHeader } from "./types";
import { resolveTriLangLabel } from "./line-items-label";

export function resolveWorkflowStageField(workflow?: LineItemsWorkflowConfig): string {
  return String(workflow?.stage_field ?? "giai_doan").trim() || "giai_doan";
}

export function resolveWorkflowStep(
  workflow: LineItemsWorkflowConfig | undefined,
  stageValue: string,
): LineItemsWorkflowStep | null {
  if (!workflow?.steps?.length) return null;
  const stage = String(stageValue ?? "").trim();
  return workflow.steps.find(s => String(s.stage ?? "") === stage) ?? null;
}

export function resolveNextWorkflowStep(
  workflow: LineItemsWorkflowConfig | undefined,
  stageValue: string,
): LineItemsWorkflowStep | null {
  const current = resolveWorkflowStep(workflow, stageValue);
  const nextStage = String(current?.next ?? "").trim();
  if (!nextStage) return null;
  return resolveWorkflowStep(workflow, nextStage);
}

export function validateWorkflowPromotion(
  header: OrderHeader,
  step: LineItemsWorkflowStep | null,
  headerFields: Array<{ f_name?: string; f_header?: string }> = [],
): { ok: boolean; message?: string } {
  if (!step?.next) return { ok: false, message: "Không có bước tiếp theo" };
  for (const fieldName of step.require_fields ?? []) {
    const name = String(fieldName ?? "").trim();
    if (!name) continue;
    const val = header[name];
    if (val == null || val === "") {
      const label = headerFields.find(f => String(f.f_name ?? "") === name)?.f_header ?? name;
      return { ok: false, message: `Vui lòng nhập "${label}" trước khi chuyển bước` };
    }
  }
  return { ok: true };
}

export function applyWorkflowPromotion(
  header: OrderHeader,
  workflow: LineItemsWorkflowConfig | undefined,
  stageValue: string,
): OrderHeader | null {
  const current = resolveWorkflowStep(workflow, stageValue);
  if (!current?.next) return null;
  const stageField = resolveWorkflowStageField(workflow);
  const next: OrderHeader = { ...header, [stageField]: current.next };
  if (current.set_fields && typeof current.set_fields === "object") {
    Object.assign(next, current.set_fields);
  }
  return next;
}

export function resolveWorkflowPromoteLabel(
  step: LineItemsWorkflowStep | null,
  lang = "vi",
): string {
  if (!step) return "";
  const custom = resolveTriLangLabel(step, lang, ["next_label"]);
  if (custom) return custom;
  const next = String(step.next ?? "").trim();
  return next ? `Chuyển sang ${next}` : "";
}
