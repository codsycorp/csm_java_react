# CSM AI Local — Markdown inject (Lego)

Chỉ các file dưới đây được nạp vào model. Mirror dev: `MenuRequirementForm` → `saveMenuStruct` → `use-menu.ts`.

## Phase Lego

| Phase | Việc | File |
|-------|------|------|
| 1 — Cấu trúc | Mảnh Lego (type_form, f_*, trigger, lưu/chạy) | `ai_menu_structure_runtime.md` + compact + dev_workflow |
| 2 — Comprehend | Nghiệp vụ từ USER_REQUEST → BusinessSpec + planned_structure | `ai_business_comprehend_contract.md` + **`ai_greenfield_pipeline_contract.md`** (greenfield) |
| 3 — Lắp ghép | JSON menu theo plan | scaffold Java (ưu tiên) hoặc `ai_menu_greenfield_worker_contract.md` |

## Menu lane

| File | Khi nào |
|------|---------|
| `ai_business_comprehend_contract.md` | Pass 1 Comprehend |
| **`ai_greenfield_pipeline_contract.md`** | Pass 1 greenfield + greenfield worker — **cấm one-shot / template ERP** (PHẦN AF.12) |
| `ai_menu_structure_runtime.md` | Greenfield — **Lego catalog** (mirror frontend dev) |
| `ai_menu_runtime_compact.md` | Comprehend digest + worker |
| `ai_menu_dev_workflow_compact.md` | Comprehend + edit |
| `ai_menu_greenfield_worker_contract.md` | Greenfield worker **fallback** (khi không scaffold-first) |
| `ai_menu_master_prompt.md` | Edit patches |

## Code lane

| File | Khi nào |
|------|---------|
| `ai_business_comprehend_contract.md` | Pass 1 |
| `ai_code_runtime_compact.md` | Comprehend + worker |
| `ai_code_greenfield_worker_contract.md` | Greenfield |
| `ai_code_master_prompt.md` | Edit textEdits |

Runtime: `LIVE_APP_MENU`, TENANT_RAG, attachments — **pattern only**, không copy cây ERP.

Spec: `CSM_AI_LOCAL_CURSOR_MASTER_BRIEF.md` A.5, **PHẦN AF.8–AF.16**
