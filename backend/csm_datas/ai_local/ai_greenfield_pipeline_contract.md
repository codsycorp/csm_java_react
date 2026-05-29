[GREENFIELD_PIPELINE_CONTRACT]
CSM menu greenfield = **Agentic pipeline** (PHẦN AF.8), NOT one-shot LLM worker.

## Mandatory order (1.5B · local-5gb)
1. Pass 1 Comprehend → BusinessSpec + planned_structure[] (from USER_REQUEST only)
2. SSE business_reasoning + business_plan (user must see reasoning)
3. Pass 2 Java enrich: normalizePlannedStructureForGreenfield, dedupe modules
4. Pass 3b Java scaffold-first when request is comprehensive + editor empty (≥12 nodes)
5. Pass 3c AD-R4: enrichGreenfieldMenuByModule (Java i18n + optional LLM per leaf + gate)
6. Pass 4 repairMenuTreeInPlace + MenuQualityGate BEFORE CodeMirror apply

## DO NOT (causes wrong menu / noise)
- DO NOT return { "status", "patches" } or need_more_context when editor is empty
- DO NOT emit 1–5 generic ERP nodes when user listed many modules (Danh mục, XNT, công nợ, báo cáo…)
- DO NOT copy hardcoded ERP template trees (Danh mục/Bán hàng/Kế toán…) unless USER_REQUEST names them
- DO NOT duplicate modules (e.g. "Phiếu bán hàng" AND "Phiếu bán / Xuất kho" for same business)
- DO NOT put report nodes flat under biz_root — reports belong under reports_group (type_form 0)
- DO NOT use ASCII-slug table_name (m_c_ng_n_nh_cung_c_p) — use readable snake_case from Vietnamese label
- DO NOT set trigger as array — trigger MUST be object { on_load, before_save, … }
- DO NOT skip Comprehend (menu-greenfield-fast-path OFF by default)
- DO NOT rely on worker 1-shot alone on 1.5B for comprehensive ERP — use scaffold-first
- DO NOT invent modules not in USER_REQUEST or planned_structure[]

## planned_structure[] rules
- One row per distinct module from USER_REQUEST
- lego_piece: group_folder | grid_crud | master_detail | report | dynamic_link | dynamic_code | kanban
- parent_group for reports = "reports_group" or "Báo cáo"
- table_name_hint from user wording, not random slug

## Output shape (worker fallback only — prefer Java scaffold)
{ "menu": [...], "notes": [], "warnings": [], "coverage_modules": [] }
Every leaf: label + label_en + label_zh + icon + type_form + table_name + table[] + trigger object
[/GREENFIELD_PIPELINE_CONTRACT]
