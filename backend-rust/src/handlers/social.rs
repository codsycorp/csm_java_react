use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::multipart::{Form, Part};
use serde_json::{json, Map, Value};
use tracing::warn;

use crate::model::StandardResponse;
use crate::state::AppState;

const FB_GRAPH: &str = "https://graph.facebook.com/v18.0";

fn param_str(params: &Map<String, Value>, key: &str) -> Option<String> {
    params
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string))
            .collect(),
        Some(Value::String(s)) if !s.trim().is_empty() => vec![s.trim().to_string()],
        _ => vec![],
    }
}

fn fb_error_message(body: &Value, status: reqwest::StatusCode) -> String {
    body.get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Facebook API returned HTTP {status}"))
}

async fn facebook_graph_get(state: &AppState, url: String) -> Result<Value, String> {
    let resp = state.http_client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(json!({}));
    if status.is_success() && body.get("error").is_none() {
        Ok(body)
    } else {
        Err(fb_error_message(&body, status))
    }
}

async fn facebook_graph_post_json(
    state: &AppState,
    url: &str,
    payload: Map<String, Value>,
) -> Result<Value, String> {
    let resp = state
        .http_client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(json!({}));
    if status.is_success() && body.get("error").is_none() {
        Ok(body)
    } else {
        Err(fb_error_message(&body, status))
    }
}

async fn facebook_graph_post_form(
    state: &AppState,
    url: &str,
    fields: Vec<(String, String)>,
) -> Result<Value, String> {
    let resp = state
        .http_client
        .post(url)
        .form(&fields)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(json!({}));
    if status.is_success() && body.get("error").is_none() {
        Ok(body)
    } else {
        Err(fb_error_message(&body, status))
    }
}

async fn facebook_graph_post_multipart(
    state: &AppState,
    url: &str,
    form: Form,
) -> Result<Value, String> {
    let resp = state
        .http_client
        .post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(json!({}));
    if status.is_success() && body.get("error").is_none() {
        Ok(body)
    } else {
        Err(fb_error_message(&body, status))
    }
}

fn relative_path_from_input(input: &str) -> Option<String> {
    if input.starts_with("/app_images/") || input.starts_with("app_images/") {
        return Some(
            input
                .trim_start_matches('/')
                .to_string(),
        );
    }
    if input.starts_with("http://") || input.starts_with("https://") {
        if let Ok(parsed) = url::Url::parse(input) {
            let path = parsed.path();
            if path.starts_with("/app_images/") {
                return Some(path[1..].to_string());
            }
        }
    }
    None
}

async fn load_bytes_from_input(state: &AppState, input: &str) -> Option<Vec<u8>> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with("data:image/") || trimmed.starts_with("data:video/") {
        let comma = trimmed.find(',')?;
        return B64.decode(trimmed[comma + 1..].as_bytes()).ok();
    }

    if let Some(rel) = relative_path_from_input(trimmed) {
        if let Some(path) = state.record_manager.get_static_file(&rel) {
            if let Ok(bytes) = tokio::fs::read(&path).await {
                if !bytes.is_empty() {
                    return Some(bytes);
                }
            }
        }
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Ok(resp) = state.http_client.get(trimmed).send().await {
            if resp.status().is_success() {
                return resp.bytes().await.ok().map(|b| b.to_vec());
            }
        }
    }

    None
}

fn sanitize_images(raw: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for image in raw {
        let n = image.trim().to_string();
        if n.is_empty() {
            continue;
        }
        let ok = n.starts_with("http://")
            || n.starts_with("https://")
            || n.starts_with("data:image/");
        if ok && !out.contains(&n) {
            out.push(n);
        }
    }
    out
}

fn sanitize_videos(raw: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for video in raw {
        let n = video.trim().to_string();
        if n.is_empty() {
            continue;
        }
        let ok = n.starts_with("http://")
            || n.starts_with("https://")
            || n.starts_with("data:video/")
            || n.starts_with("/app_images/")
            || n.starts_with("app_images/");
        if ok && !out.contains(&n) {
            out.push(n);
        }
    }
    out
}

/// POST /facebook/post — mirrors Java handleFacebookPost
pub async fn handle_facebook_post(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let Some(page_id) = param_str(params, "pageId") else {
        return fb_err(400, "Missing pageId or pageAccessToken");
    };
    let Some(page_access_token) = param_str(params, "pageAccessToken") else {
        return fb_err(400, "Missing pageId or pageAccessToken");
    };
    let Some(message) = param_str(params, "message") else {
        return fb_err(400, "Missing message");
    };
    let image_url = param_str(params, "imageUrl");
    let link = param_str(params, "link");

    let (fb_url, mut payload) = if let Some(img) = image_url.filter(|s| !s.is_empty()) {
        (
            format!("{FB_GRAPH}/{page_id}/photos"),
            Map::from_iter([
                ("url".into(), json!(img)),
                ("caption".into(), json!(message)),
                ("access_token".into(), json!(page_access_token)),
            ]),
        )
    } else {
        (
            format!("{FB_GRAPH}/{page_id}/feed"),
            Map::from_iter([
                ("message".into(), json!(message)),
                ("access_token".into(), json!(page_access_token)),
            ]),
        )
    };

    if let Some(l) = link.filter(|s| !s.is_empty()) {
        payload.insert("link".into(), json!(l));
    }

    match facebook_graph_post_json(state, &fb_url, payload).await {
        Ok(body) => {
            let post_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let mut r = StandardResponse::new();
            r.set("code", 200);
            r.set("success", true);
            r.set("message", "Post published successfully");
            r.set(
                "data",
                json!({
                    "post_id": post_id,
                    "pageId": page_id,
                }),
            );
            r
        }
        Err(e) => fb_err(500, format!("Error: {e}")),
    }
}

/// POST /facebook/post-with-images — mirrors Java handleFacebookPostWithImages
pub async fn handle_facebook_post_with_images(
    state: &AppState,
    params: &Map<String, Value>,
) -> StandardResponse {
    let Some(page_id) = param_str(params, "pageId") else {
        return fb_err(400, "Missing pageId or pageAccessToken");
    };
    let Some(page_access_token) = param_str(params, "pageAccessToken") else {
        return fb_err(400, "Missing pageId or pageAccessToken");
    };
    let Some(message) = param_str(params, "message") else {
        return fb_err(400, "Missing message");
    };
    let link = param_str(params, "link");

    let sanitized_images = sanitize_images(string_list(params.get("images")));
    let sanitized_videos = sanitize_videos(string_list(params.get("videos")));

    let mut main_post_id: Option<String> = None;
    let mut extra_post_ids: Vec<String> = Vec::new();
    let mut images_posted = 0i32;
    let mut videos_posted = 0i32;
    let mut video_failure_reason: Option<String> = None;

    // Post each video separately
    for video_input in &sanitized_videos {
        let mut video_post_id: Option<String> = None;
        let video_upload_url = format!("{FB_GRAPH}/{page_id}/videos");
        let mut video_description = message.clone();
        if let Some(ref l) = link {
            if !video_description.contains(l) {
                video_description.push_str("\n\n");
                video_description.push_str(l);
            }
        }

        if video_input.starts_with("data:video/") {
            if let Some(bytes) = load_bytes_from_input(state, video_input).await {
                let part = Part::bytes(bytes)
                    .file_name("video.mp4")
                    .mime_str("video/mp4")
                    .expect("video/mp4 mime");
                let form = Form::new()
                    .part("source", part)
                    .text("description", video_description.clone())
                    .text("access_token", page_access_token.clone());
                if let Ok(body) = facebook_graph_post_multipart(state, &video_upload_url, form).await {
                    video_post_id = body.get("id").and_then(|v| v.as_str()).map(str::to_string);
                }
            } else if video_failure_reason.is_none() {
                video_failure_reason = Some("Invalid base64 video payload".into());
            }
        } else if let Some(bytes) = load_bytes_from_input(state, video_input).await {
            let part = Part::bytes(bytes)
                .file_name("video.mp4")
                .mime_str("video/mp4")
                .unwrap_or_else(|_| Part::bytes(vec![]));
            let form = Form::new()
                .part("source", part)
                .text("description", video_description.clone())
                .text("access_token", page_access_token.clone());
            if let Ok(body) = facebook_graph_post_multipart(state, &video_upload_url, form).await {
                video_post_id = body.get("id").and_then(|v| v.as_str()).map(str::to_string);
            }
        } else if video_input.starts_with("http://") || video_input.starts_with("https://") {
            let fields = vec![
                ("file_url".into(), video_input.clone()),
                ("description".into(), video_description),
                ("access_token".into(), page_access_token.clone()),
            ];
            if let Ok(body) = facebook_graph_post_form(state, &video_upload_url, fields).await {
                video_post_id = body.get("id").and_then(|v| v.as_str()).map(str::to_string);
            } else if video_failure_reason.is_none() {
                video_failure_reason = Some(format!("Cannot download or upload video URL: {video_input}"));
            }
        }

        if let Some(pid) = video_post_id.filter(|s| !s.is_empty()) {
            if main_post_id.is_none() {
                main_post_id = Some(pid);
            } else {
                extra_post_ids.push(pid);
            }
            videos_posted += 1;
        }
    }

    if !sanitized_videos.is_empty() && sanitized_images.is_empty() && videos_posted == 0 {
        let mut r = StandardResponse::new();
        r.set("code", 502);
        r.set("success", false);
        r.set(
            "message",
            "Video upload failed. Post was not published to avoid text-only fallback.",
        );
        r.set(
            "data",
            json!({
                "pageId": page_id,
                "videos_count": 0,
                "images_count": 0,
                "reason": video_failure_reason.unwrap_or_else(|| "Video upload failed".into()),
            }),
        );
        return r;
    }

    // Multi-photo album
    if !sanitized_images.is_empty() {
        let photo_upload_url = format!("{FB_GRAPH}/{page_id}/photos");
        let mut media_fb_ids: Vec<String> = Vec::new();

        for image_url in &sanitized_images {
            if let Some(bytes) = load_bytes_from_input(state, image_url).await {
                let part = Part::bytes(bytes)
                    .file_name("image.jpg")
                    .mime_str("image/jpeg")
                    .expect("image/jpeg mime");
                let form = Form::new()
                    .part("source", part)
                    .text("published", "false")
                    .text("access_token", page_access_token.clone());
                if let Ok(body) = facebook_graph_post_multipart(state, &photo_upload_url, form).await {
                    if let Some(id) = body.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                        media_fb_ids.push(id.to_string());
                    }
                }
            } else {
                warn!("Empty image data from {image_url}");
            }
        }

        if !media_fb_ids.is_empty() {
            let feed_url = format!("{FB_GRAPH}/{page_id}/feed");
            let mut photo_message = message.clone();
            if main_post_id.is_some() {
                photo_message.push_str("\n\n📷 Bộ ảnh minh họa bổ sung cho video ở trên.");
            }
            let mut fields = vec![
                ("message".into(), photo_message),
                ("access_token".into(), page_access_token.clone()),
            ];
            for (i, media_id) in media_fb_ids.iter().enumerate() {
                fields.push((
                    format!("attached_media[{i}]"),
                    format!(r#"{{"media_fbid":"{media_id}"}}"#),
                ));
            }
            if let Ok(body) = facebook_graph_post_form(state, &feed_url, fields).await {
                images_posted = media_fb_ids.len() as i32;
                if let Some(pid) = body.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    if main_post_id.is_none() {
                        main_post_id = Some(pid.to_string());
                    } else {
                        extra_post_ids.push(pid.to_string());
                    }
                }
            }
        }
    }

    // Fallback: single image or text-only
    if main_post_id.is_none() {
        if let Some(image_url) = sanitized_images.first() {
            let fb_url = format!("{FB_GRAPH}/{page_id}/photos");
            let payload = Map::from_iter([
                ("url".into(), json!(image_url)),
                ("caption".into(), json!(message)),
                ("access_token".into(), json!(page_access_token)),
            ]);
            if let Ok(body) = facebook_graph_post_json(state, &fb_url, payload).await {
                if let Some(pid) = body.get("id").and_then(|v| v.as_str()) {
                    main_post_id = Some(pid.to_string());
                    images_posted = 1;
                }
            }
        }

        if main_post_id.is_none() {
            let fb_url = format!("{FB_GRAPH}/{page_id}/feed");
            let mut payload = Map::from_iter([
                ("message".into(), json!(message)),
                ("access_token".into(), json!(page_access_token)),
            ]);
            if let Some(ref l) = link {
                payload.insert("link".into(), json!(l));
            }
            match facebook_graph_post_json(state, &fb_url, payload).await {
                Ok(body) => {
                    main_post_id = body.get("id").and_then(|v| v.as_str()).map(str::to_string);
                }
                Err(e) => return fb_err(500, format!("Error: {e}")),
            }
        }
    }

    if let Some(post_id) = main_post_id {
        let mut all_post_ids = vec![post_id.clone()];
        all_post_ids.extend(extra_post_ids.clone());
        let mut r = StandardResponse::new();
        r.set("code", 200);
        r.set("success", true);
        r.set("message", "Post published successfully");
        r.set(
            "data",
            json!({
                "post_id": post_id,
                "extra_post_ids": extra_post_ids,
                "all_post_ids": all_post_ids,
                "pageId": page_id,
                "images_count": images_posted,
                "videos_count": videos_posted,
            }),
        );
        r
    } else {
        fb_err(500, "Facebook API error: failed to publish post")
    }
}

/// POST /facebook/me — validate access token via Graph API /me
pub async fn handle_facebook_me(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let Some(access_token) = param_str(params, "accessToken") else {
        return fb_err(400, "Missing accessToken");
    };
    let url = format!(
        "{FB_GRAPH}/me?access_token={}",
        urlencoding::encode(&access_token)
    );
    match facebook_graph_get(state, url).await {
        Ok(body) => {
            let mut r = StandardResponse::new();
            r.set("code", 200);
            r.set("success", true);
            r.set("data", body);
            r.set("message", "Token valid");
            r
        }
        Err(e) => fb_err(500, format!("Error: {e}")),
    }
}

/// POST /facebook/exchange-token — short-lived → long-lived (60 days)
pub async fn handle_facebook_exchange_token(
    state: &AppState,
    params: &Map<String, Value>,
) -> StandardResponse {
    let Some(access_token) = param_str(params, "accessToken") else {
        return fb_err(400, "Missing accessToken");
    };
    let Some(client_id) = param_str(params, "clientId") else {
        return fb_err(400, "Missing clientId");
    };
    let Some(app_secret) = param_str(params, "appSecret") else {
        return fb_err(400, "Missing appSecret");
    };
    let url = format!(
        "{FB_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id={}&client_secret={}&fb_exchange_token={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&app_secret),
        urlencoding::encode(&access_token)
    );
    match facebook_graph_get(state, url).await {
        Ok(body) => {
            let mut r = StandardResponse::new();
            r.set("code", 200);
            r.set("success", true);
            r.set("data", body);
            r.set("message", "Token exchanged successfully");
            r
        }
        Err(e) => fb_err(500, format!("Error: {e}")),
    }
}

/// POST /facebook/pages — list pages with page access tokens
pub async fn handle_facebook_pages(state: &AppState, params: &Map<String, Value>) -> StandardResponse {
    let Some(access_token) = param_str(params, "accessToken") else {
        return fb_err(400, "Missing accessToken");
    };
    let url = format!(
        "{FB_GRAPH}/me/accounts?fields=id,name,access_token,category,tasks&access_token={}",
        urlencoding::encode(&access_token)
    );
    match facebook_graph_get(state, url).await {
        Ok(body) => {
            let mut r = StandardResponse::new();
            r.set("code", 200);
            r.set("success", true);
            r.set("data", body);
            r.set("message", "Pages retrieved successfully");
            r
        }
        Err(e) => fb_err(500, format!("Error: {e}")),
    }
}

fn fb_err(code: u16, message: impl Into<String>) -> StandardResponse {
    let mut r = StandardResponse::new();
    r.set("code", code);
    r.set("success", false);
    r.set("message", message.into());
    r
}
