use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl AppError {
    pub fn code(&self) -> u16 {
        match self {
            Self::Unauthorized(_) => 401,
            Self::Forbidden(_) => 403,
            Self::NotFound(_) => 404,
            Self::BadRequest(_) => 400,
            Self::Internal(_) | Self::Anyhow(_) => 500,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let body: Value = json!({
            "code": self.code(),
            "success": false,
            "message": self.to_string(),
        });
        (status, Json(body)).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
