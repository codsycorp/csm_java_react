# Author Style DNA — CSM (chỉnh sửa file này theo phong cách code của bạn)

> File này được **index vào Lucene** cùng codebase. AI local đọc qua RAG — không nhét full vào mọi prompt.
> Sau khi sửa: `./scripts/csm-knowledge-pack.sh rebuild --full-code` (máy mạnh) hoặc restart backend.

## 1. Triết lý thiết kế

- **NẠP ĐỦ VÀO HỆ THỐNG, KHÔNG NẠP HẾT VÀO MODEL** — index vector + region plan.
- DynamicCode: browser-only, không `import`/`export`/`require` Node.
- Ưu tiên **sửa surgical** (textEdits nhỏ) thay vì regenerate file lớn.
- Menu: giữ `parentId`, `role_code` dedupe, cascade branch→dept.

## 2. Quy ước đặt tên

| Ngữ cảnh | Quy tắc | Ví dụ |
|----------|---------|-------|
| DynamicCode hàm | camelCase, prefix `fn` cho lifecycle | `fnResetIP`, `closeAllTabsAndCleanup` |
| DynamicCode private helper | `__` prefix | `__forceKillWebviewProcess` |
| Java service | `*Service`, inject `@Autowired` | `AiLocalOrchestrationService` |
| Java controller API | `/api/...`, SSE cho stream | `ApiSpringController` |
| Menu node id | stable string, không đổi khi sửa label | `system_admin_users` |

## 3. Patterns code hay dùng (copy mindset)

### DynamicCode — webview / process lifecycle

```javascript
// Luôn: clearInterval + kill process + đợi exit trước khi chạy lại auto
// Tránh: bulk delete cả block; sửa từng nhánh if/else
```

### Spring — AI local routing

- Classify intent (~64 tokens) → orchestration bounded → minimal prompt → gate → SSE.
- Weak 5GB: prompt ≤18k, async ingest code >45k, không cloud fallback khi local-only.

### Frontend admin

- `CsmDynamicGrid` + `system-user-menu-config.ts` schema-driven.
- i18n vi/en/zh song song cho label fields.

## 4. Anti-patterns (KHÔNG làm)

- Regenerate full menu JSON khi chỉ sửa 1 node.
- Xóa hàng loạt >15 dòng trong DynamicCode (bulk delete).
- Dùng cloud model khi user bật `AI_LOCAL_ONLY_ENABLED=true`.
- Combo `group_id` duplicate (cả id lẫn role_code làm 2 option).

## 5. Tối ưu theo thời gian (cập nhật hàng tuần)

Ghi các quyết định mới — AI sẽ học qua RAG + menu learning + pack export:

| Ngày | Quyết định | Lý do |
|------|------------|-------|
| YYYY-MM-DD | (ví dụ) webview close dùng `__forceKillWebviewProcess` | tránh treo proxy |
| | | |

## 6. Nghiệp vụ ưu tiên (AI phải hiểu)

1. ERP CSM: org branch/dept/roles, sub-user, DynamicCode runtime.
2. AI local: edit CodeMirror textEdits, menu patch JSON, SEO lane tách creative-params.
3. LMKT: SEO content + creative params, không trộn contract code editor.

---

*Cập nhật file này thường xuyên — đây là "ADN phong cách" portable cùng knowledge pack.*
