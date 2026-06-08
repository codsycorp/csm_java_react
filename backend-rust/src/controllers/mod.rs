mod ai_stream;
pub mod api_spring;

use axum::{
    extract::{Path, State},
    middleware::from_fn_with_state,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::security::middleware::auth_middleware;
use crate::state::AppState;

pub fn routes(state: AppState) -> Router<AppState> {
    Router::new()
        .merge(ai_stream::routes())
        .route("/api/permission/roles", get(permission_roles))
        .route("/api/permission/permissions", get(permission_permissions))
        .route("/api/permission/departments", get(permission_departments))
        .route("/api/permission/departments/tree", get(permission_dept_tree))
        .route("/api/permission/user/{user_id}/permissions", get(permission_user))
        .route(
            "/api/permission/user/{user_id}/check/{code}",
            get(permission_check),
        )
        .route(
            "/api/permission/user/{user_id}/departments",
            get(permission_user_depts),
        )
        .route(
            "/api/permission/role/{role_id}/permissions",
            get(permission_role_perms),
        )
        .route(
            "/api/permission/role/{role_id}/permission/{perm_id}/add",
            post(permission_add),
        )
        .route(
            "/api/permission/role/{role_id}/permission/{perm_id}/remove",
            post(permission_remove),
        )
        .route(
            "/api/permission/user/{user_id}/department/{dept_id}/role/{role_id}/assign",
            post(permission_assign),
        )
        .route("/api/permission/matrix", get(permission_matrix))
        .route("/api/cache/clear-all", post(cache_clear_all))
        .route("/api/cache/stats", post(cache_stats))
        .route("/api/monitoring/metrics", get(monitoring_metrics))
        .route("/api/monitoring/cache/stats", get(cache_stats_get))
        .route("/api/media/call-status", get(media_call_status))
        .route("/api/upload", post(web_upload))
        .route("/upload", post(web_upload))
        .route("/upload.shtml", post(web_upload_shtml))
        .layer(from_fn_with_state(state, auth_middleware))
}

async fn permission_roles(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(state.permission_service.list_roles())
}

async fn permission_permissions(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_all_permissions()
    }))
}

async fn permission_departments(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_all_departments()
    }))
}

async fn permission_dept_tree(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_department_tree()
    }))
}

async fn permission_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_user_permissions(&user_id)
    }))
}

async fn permission_check(
    State(state): State<AppState>,
    Path((user_id, code)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.check_permission(&user_id, &code)
    }))
}

async fn permission_user_depts(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_user_departments(&user_id)
    }))
}

async fn permission_role_perms(
    State(state): State<AppState>,
    Path(role_id): Path<String>,
) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.get_role_permissions(&role_id)
    }))
}

async fn permission_add(
    State(state): State<AppState>,
    Path((role_id, perm_id)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    Json(state.permission_service.add_role_permission(&role_id, &perm_id))
}

async fn permission_remove(
    State(state): State<AppState>,
    Path((role_id, perm_id)): Path<(String, String)>,
) -> Json<serde_json::Value> {
    Json(state.permission_service.remove_role_permission(&role_id, &perm_id))
}

async fn permission_assign(
    State(state): State<AppState>,
    Path((user_id, dept_id, role_id)): Path<(String, String, String)>,
) -> Json<serde_json::Value> {
    Json(state.permission_service.assign_user_department_role(&user_id, &dept_id, &role_id))
}

async fn permission_matrix(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "code": 200,
        "success": true,
        "result": state.permission_service.permission_matrix()
    }))
}

async fn cache_clear_all(State(state): State<AppState>) -> Json<serde_json::Value> {
    state.cache_service.invalidate("all").await;
    Json(json!({ "success": true }))
}

async fn cache_stats(State(_state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({ "stats": {} }))
}

async fn cache_stats_get(State(state): State<AppState>) -> Json<serde_json::Value> {
    cache_stats(State(state)).await
}

async fn web_upload(
    State(state): State<AppState>,
    multipart: axum::extract::Multipart,
) -> impl axum::response::IntoResponse {
    crate::web::upload::handle_upload(State(state), multipart).await
}

async fn web_upload_shtml(
    State(state): State<AppState>,
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
    req: axum::extract::Request<axum::body::Body>,
) -> impl axum::response::IntoResponse {
    crate::web::upload::handle_upload_shtml(state, query.0, req).await
}

async fn media_call_status() -> Json<serde_json::Value> {
    Json(crate::services::media::MediaService::call_status())
}

async fn monitoring_metrics() -> Json<serde_json::Value> {
    Json(json!({
        "heap_used_mb": 0,
        "threads": 0,
        "backend": "rust"
    }))
}
