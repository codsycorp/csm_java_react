/// Bare API paths — mirrors `backend-go/internal/api/paths/paths.go`.

const BARE_API_PATHS: &[&str] = &[
    "/login",
    "/logout",
    "/refresh-token",
    "/user-info",
    "/register",
    "/create-sub-user",
    "/get-async-routes",
    "/role-list",
    "/role-item",
    "/role-menu",
    "/menu-by-role-id",
    "/menu-list",
    "/menu-item",
    "/notifications",
    "/home",
    "/home/pie",
    "/home/line",
    "/home/googlebot",
    "/home/googlebot/delete",
    "/restoredb",
    "/backupdb",
    "/migrateKeys",
    "/create-table",
    "/drop-table",
    "/get-table-data",
    "/update-table-data",
    "/bulk-update-table-data",
    "/update-table-data-index",
    "/seo",
    "/scrape-web",
    "/execute-js-on-page",
    "/indexgoogle",
    "/create-default-data",
    "/chat-history",
    "/chat-history-guest",
    "/chat-history-app",
    "/apps-list",
    "/traffic/analyze-frame",
    "/chat-guests-list",
    "/chat-mark-read",
    "/chat-mark-all-read",
    "/chat-delete-message",
    "/ai-generate-seo-content",
    "/aiAssistant-chat-stream",
    "/ai/menu-merge",
];

/// Paths forwarded by Vite proxy after stripping `/api` (e.g. `/login` not `/api/login`).
pub fn is_bare_api_path(uri: &str) -> bool {
    if is_direct_ai_path(uri) {
        return true;
    }
    if BARE_API_PATHS.contains(&uri) {
        return true;
    }
    uri.starts_with("/crm/")
        || uri.starts_with("/facebook/")
        || uri.starts_with("/google/")
}

/// AI sync/stream endpoints must always use API auth + dispatch (any host, including admin.*).
pub fn is_direct_ai_path(uri: &str) -> bool {
    uri.starts_with("/ai-local")
        || uri.starts_with("/ai-code-stream")
        || uri == "/aiAssistant-chat-stream"
        || uri == "/ai-generate-seo-content"
        || uri == "/ai/menu-merge"
}
