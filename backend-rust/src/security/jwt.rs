use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const JWT_EXPIRATION_MS: i64 = 86_400_000; // 24h

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    #[serde(default)]
    pub uid: String,
    #[serde(default)]
    pub ver: i32,
    pub iat: i64,
    pub exp: i64,
}

pub struct JwtUtil {
    encoding: EncodingKey,
    decoding: DecodingKey,
}

impl JwtUtil {
    pub fn new(secret: &str) -> Self {
        let key_bytes = derive_key_bytes(secret);
        Self {
            encoding: EncodingKey::from_secret(&key_bytes),
            decoding: DecodingKey::from_secret(&key_bytes),
        }
    }

    pub fn generate_token(&self, subject: &str, login_version: i32) -> String {
        self.generate_token_with_uid(subject, "", login_version)
    }

    pub fn generate_token_with_uid(&self, subject: &str, user_id: &str, login_version: i32) -> String {
        let now = Utc::now();
        let claims = Claims {
            sub: subject.to_string(),
            uid: user_id.to_string(),
            ver: login_version,
            iat: now.timestamp(),
            exp: (now + Duration::milliseconds(JWT_EXPIRATION_MS)).timestamp(),
        };
        encode(&Header::new(Algorithm::HS256), &claims, &self.encoding)
            .expect("JWT encode failed")
    }

    pub fn validate_token(&self, token: &str) -> bool {
        self.parse_claims(token).is_ok()
    }

    pub fn parse_claims(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let validation = Validation::new(Algorithm::HS256);
        decode::<Claims>(token, &self.decoding, &validation).map(|d| d.claims)
    }

    /// Parse signed JWT claims even when exp has passed — used to bind refresh fallback.
    pub fn parse_claims_allow_expired(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = false;
        decode::<Claims>(token, &self.decoding, &validation).map(|d| d.claims)
    }

    pub fn username_from_token(&self, token: &str) -> Option<String> {
        self.parse_claims(token).ok().map(|c| c.sub)
    }

    pub fn user_id_from_token(&self, token: &str) -> String {
        self.parse_claims(token)
            .ok()
            .map(|c| c.uid)
            .unwrap_or_default()
    }

    pub fn login_version_from_token(&self, token: &str) -> i32 {
        self.parse_claims(token).ok().map(|c| c.ver).unwrap_or(0)
    }
}

fn derive_key_bytes(secret: &str) -> Vec<u8> {
    let raw = secret.trim();
    let bytes = if raw.is_empty() {
        b"change-me-to-a-strong-secretge".to_vec()
    } else {
        raw.as_bytes().to_vec()
    };
    if bytes.len() >= 32 {
        bytes
    } else {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        hasher.finalize().to_vec()
    }
}
