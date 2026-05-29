## GREENFIELD CODE CONTRACT
operation_scenario=%s
- Return JSON: { "code": "<full DynamicCode>", "summary": "...", "changes": [] }
- Follow patterns from SAMPLE_CODE_DIGEST (attachments) + TENANT_RAG (sys_autos indexed) + ai_code_runtime_*.md — no fixed template file
- Use window.seft / ctx.helperApi; no import/require
- Do NOT return empty code when user asked to create module
