/// Paths forwarded by Vite proxy after stripping `/api` (e.g. `/login` not `/api/login`).
pub fn is_bare_api_path(uri: &str) -> bool {
    is_direct_ai_path(uri)
        || matches!(
            uri,
            "/login"
                | "/logout"
                | "/refresh-token"
                | "/register"
                | "/user-info"
                | "/create-default-data"
                | "/get-async-routes"
                | "/get-table-data"
                | "/update-table-data"
                | "/create-table"
                | "/drop-table"
                | "/backupdb"
                | "/restoredb"
                | "/bulk-update-table-data"
                | "/update-table-data-index"
                | "/migrateKeys"
                | "/notifications"
                | "/seo"
        )
        || uri.starts_with("/crm/")
        || uri.starts_with("/role-")
        || uri.starts_with("/menu-")
        || uri.starts_with("/chat-")
        || uri.starts_with("/home")
        || uri.starts_with("/facebook/")
        || uri.starts_with("/google/")
        || uri.starts_with("/scrape-web")
        || uri.starts_with("/ai")
        || uri.starts_with("/monitoring")
}

/// AI sync/stream endpoints must always use API auth + dispatch (any host, including admin.*).
pub fn is_direct_ai_path(uri: &str) -> bool {
    matches!(
        uri,
        "/ai-generate-seo-content"
            | "/ai-code-stream"
            | "/aiAssistant-chat-stream"
    ) || uri.starts_with("/ai-local/")
}
