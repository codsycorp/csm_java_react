## GREENFIELD MENU WORKER (Lego assembly)
operation_scenario=%s

STRUCTURE (how — from ai_menu_structure_runtime.md):
- saveMenuStruct schema: { "menu": [...] } encrypted to index id=menu
- type_form 0/1/2/3/4/5/6 + f_* + trigger signatures
- Click → /system/grid/:menuId (use-menu.ts)

BUSINESS (what — from BUSINESS_COMPREHENSION + USER_REQUEST only):
- Build tree for modules[] in BusinessSpec — NOT a fixed ERP template
- Map each planned_structure entry → one or more menu nodes
- table_name / labels from user wording + tables[] hints

RULES:
- Editor EMPTY → NEVER { "status", "patches" } or need_more_context
- Return: { "menu": [...], "notes": [], "warnings": [], "coverage_modules": [] }
- Every node: label + label_en + label_zh + icon
- Every leaf CRUD: type_form, table_name, table[] (f_pkid=1), trigger object
- Group(0): must have children with runtime payload
- Master-Detail(2): tabs in children[]; tab table_name = JSON field in master
- Match LIVE_APP_MENU/RAG for f_cbo_query/trigger STYLE only when present
- Do NOT return empty menu when user asked to create/design
- Do NOT emit 1–2 generic nodes when user listed many modules
