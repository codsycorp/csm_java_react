use axum::{
    body::{Body, Bytes},
    extract::{Multipart, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

use crate::state::AppState;

// ─── Legacy handler (used by /upload POST) ────────────────────────────────────

pub async fn handle_upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let upload_dir = state.config.data_dir.join("public").join("app_images").join("uploads");
    if let Err(e) = tokio::fs::create_dir_all(&upload_dir).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    let mut saved = Vec::new();
    while let Ok(Some(field)) = multipart.next_field().await {
        let orig_name = field.file_name().unwrap_or("file").to_string();
        let ext = orig_name.rsplit('.').next().unwrap_or("bin");
        let id = Uuid::new_v4().to_string();
        let filename = format!("{id}.{ext}");
        let path = upload_dir.join(&filename);
        match field.bytes().await {
            Ok(data) => {
                if let Err(e) = tokio::fs::write(&path, &data).await {
                    return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
                }
                saved.push(json!({
                    "originalName": orig_name,
                    "path": format!("app_images/uploads/{filename}"),
                    "size": data.len(),
                }));
            }
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({"error": e.to_string()}))).into_response(),
        }
    }

    (StatusCode::OK, Json(json!({ "success": true, "files": saved }))).into_response()
}

// ─── /upload.shtml — full Java-parity handler ─────────────────────────────────

pub async fn handle_upload_shtml(
    state: AppState,
    params: HashMap<String, String>,
    req: axum::extract::Request<Body>,
) -> Response {
    let app_id = params.get("app_id").map(|s| s.as_str()).unwrap_or("").to_string();
    let name_param = params.get("name").map(|s| s.as_str()).unwrap_or("").to_string();

    if app_id.contains("..") || name_param.contains("..") {
        return json_err("Invalid path");
    }

    let ct = req.headers().get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let upload_root = state.config.data_dir.join("public").join("app_images").join(&app_id);
    if let Err(e) = tokio::fs::create_dir_all(&upload_root).await {
        return json_err(&format!("Cannot create upload dir: {e}"));
    }

    if ct.contains("multipart/form-data") {
        return handle_multipart(&state, &app_id, &name_param, &upload_root, req).await;
    }

    // Read body (limit 10MB for base64/link)
    let body_bytes = match axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return json_err("Request body too large or unreadable"),
    };
    let body_str = String::from_utf8_lossy(&body_bytes);

    // Try JSON body first
    let (src, link, file_name) = if ct.contains("application/json") {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body_str) {
            let src = v.get("src").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let link = v.get("link").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let nm = v.get("name").and_then(|x| x.as_str()).unwrap_or(&name_param).to_string();
            (src, link, nm)
        } else {
            (String::new(), String::new(), name_param.clone())
        }
    } else {
        // Form-encoded or query-string body
        let src = qs_val(&body_str, "src");
        let link = qs_val(&body_str, "link");
        let nm_body = qs_val(&body_str, "name");
        let nm = if nm_body.is_empty() { name_param.clone() } else { nm_body };
        (src, link, nm)
    };

    if !src.is_empty() {
        return handle_base64(&state, &app_id, &file_name, &src, &upload_root).await;
    }
    if !link.is_empty() {
        return handle_link_download(&state, &app_id, &file_name, &link, &upload_root).await;
    }

    json_err("No file data provided (need multipart, base64 src, or link)")
}

async fn handle_multipart(
    state: &AppState,
    app_id: &str,
    name_param: &str,
    upload_root: &std::path::Path,
    req: axum::extract::Request<Body>,
) -> Response {
    let boundary = req.headers()
        .get(header::CONTENT_TYPE)
        .and_then(|ct| ct.to_str().ok())
        .and_then(|ct| multer::parse_boundary(ct).ok());
    let boundary = match boundary {
        Some(b) => b,
        None => return json_err("Cannot parse multipart boundary"),
    };

    let body_stream = req.into_body().into_data_stream();
    let mut multipart = multer::Multipart::new(body_stream, boundary);

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") || field.name().is_none() {
            let orig_name = field.file_name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("upload-{}", Uuid::new_v4()));
            let file_name = if name_param.is_empty() { &orig_name } else { name_param };
            let safe_name = sanitize_filename(file_name);

            match field.bytes().await {
                Ok(data) => {
                    if data.len() > 32 * 1024 * 1024 {
                        return (StatusCode::PAYLOAD_TOO_LARGE, "File quá lớn. Giới hạn: 32MB").into_response();
                    }
                    let dest = upload_root.join(&safe_name);
                    if let Err(e) = tokio::fs::write(&dest, &data).await {
                        return json_err(&format!("Cannot save file: {e}"));
                    }
                    let file_url = format!("app_images/{}/{}", app_id, safe_name);
                    return (
                        StatusCode::OK,
                        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
                        json!({"path": file_url}).to_string(),
                    ).into_response();
                }
                Err(e) => return json_err(&format!("Cannot read multipart field: {e}")),
            }
        }
    }
    json_err("No file field in multipart body")
}

async fn handle_base64(
    _state: &AppState,
    app_id: &str,
    file_name: &str,
    src: &str,
    upload_root: &std::path::Path,
) -> Response {
    if file_name.is_empty() {
        return json_err("Tên file là bắt buộc khi upload base64");
    }
    let b64_data = if let Some(comma_pos) = src.find(',') {
        &src[comma_pos + 1..]
    } else {
        return json_err("Dữ liệu base64 không hợp lệ");
    };

    // 8MB limit on decoded size
    let approx_bytes = (b64_data.len() * 3) / 4;
    if approx_bytes > 8 * 1024 * 1024 {
        return (StatusCode::PAYLOAD_TOO_LARGE, "File quá lớn. Giới hạn: 8MB cho base64 upload.").into_response();
    }

    let data = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data.trim()) {
        Ok(d) => d,
        Err(_) => return json_err("Dữ liệu Base64 không hợp lệ"),
    };

    let safe_name = sanitize_filename(file_name);
    let dest = upload_root.join(&safe_name);
    if let Err(e) = tokio::fs::write(&dest, &data).await {
        return json_err(&format!("Cannot save file: {e}"));
    }
    let file_url = format!("app_images/{}/{}", app_id, safe_name);
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        json!({"path": file_url}).to_string(),
    ).into_response()
}

async fn handle_link_download(
    state: &AppState,
    app_id: &str,
    file_name: &str,
    link: &str,
    upload_root: &std::path::Path,
) -> Response {
    if file_name.is_empty() {
        return json_err("Tên file là bắt buộc khi upload từ link");
    }
    if !link.starts_with("http://") && !link.starts_with("https://") {
        return json_err("Link không hợp lệ");
    }

    let client = &state.http_client;
    let resp = match client.get(link).send().await {
        Ok(r) => r,
        Err(e) => return json_err(&format!("Cannot download from link: {e}")),
    };

    let data = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => return json_err(&format!("Cannot read download response: {e}")),
    };

    if data.len() > 32 * 1024 * 1024 {
        return (StatusCode::PAYLOAD_TOO_LARGE, "File từ link quá lớn. Giới hạn: 32MB.").into_response();
    }

    let safe_name = sanitize_filename(file_name);
    let dest = upload_root.join(&safe_name);
    if let Err(e) = tokio::fs::write(&dest, &data).await {
        return json_err(&format!("Cannot save file: {e}"));
    }
    let file_url = format!("app_images/{}/{}", app_id, safe_name);
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        json!({"path": file_url}).to_string(),
    ).into_response()
}

fn sanitize_filename(name: &str) -> String {
    let name = name.trim();
    let safe: String = name.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' })
        .collect();
    // Collapse multiple dashes
    let mut result = String::new();
    let mut last_dash = false;
    for c in safe.chars() {
        if c == '-' {
            if !last_dash { result.push(c); }
            last_dash = true;
        } else {
            result.push(c);
            last_dash = false;
        }
    }
    if result.is_empty() { format!("upload-{}", Uuid::new_v4()) } else { result }
}

fn qs_val(qs: &str, key: &str) -> String {
    for part in qs.split('&') {
        if let Some((k, v)) = part.split_once('=') {
            if k.trim() == key {
                return urlencoding::decode(v.trim()).map(|s| s.into_owned()).unwrap_or_else(|_| v.to_string());
            }
        }
    }
    String::new()
}

fn json_err(msg: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        json!({"success": false, "message": msg}).to_string(),
    ).into_response()
}

pub async fn serve_upload(state: &AppState, uri: &str) -> Option<Bytes> {
    let rel = uri.trim_start_matches("/app_images/");
    let path = state.config.data_dir.join(rel);
    tokio::fs::read(&path).await.ok().map(Bytes::from)
}
