use axum::{
    body::Bytes,
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::state::AppState;

pub async fn handle_upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let upload_dir = state.config.data_dir.join("uploads");
    if let Err(e) = tokio::fs::create_dir_all(&upload_dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    let mut saved = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.file_name().unwrap_or("file").to_string();
        let ext = name.rsplit('.').next().unwrap_or("bin");
        let id = Uuid::new_v4().to_string();
        let filename = format!("{id}.{ext}");
        let path = upload_dir.join(&filename);
        match field.bytes().await {
            Ok(data) => {
                if let Err(e) = tokio::fs::write(&path, &data).await {
                    return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
                }
                saved.push(json!({
                    "originalName": name,
                    "path": format!("/app_images/uploads/{filename}"),
                    "size": data.len(),
                }));
            }
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"error": e.to_string()}))).into_response(),
        }
    }

    (StatusCode::OK, Json(json!({ "success": true, "files": saved }))).into_response()
}

pub async fn serve_upload(state: &AppState, uri: &str) -> Option<Bytes> {
    let rel = uri.trim_start_matches("/app_images/");
    let path = state.config.data_dir.join(rel);
    tokio::fs::read(&path).await.ok().map(Bytes::from)
}
