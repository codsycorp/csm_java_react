use anyhow::Result;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;

use crate::config::AppConfig;

pub struct CacheService {
    redis: Option<ConnectionManager>,
    ttl_ms: u64,
}

impl CacheService {
    pub async fn new(config: &AppConfig) -> Result<Self> {
        let redis_enabled = std::env::var("REDIS_ENABLED")
            .map(|v| {
                let v = v.trim().to_ascii_lowercase();
                v != "0" && v != "false" && v != "no"
            })
            .unwrap_or(true);

        let redis = if !redis_enabled {
            tracing::info!("Redis disabled (REDIS_ENABLED=0), using in-memory only");
            None
        } else {
            let client = redis::Client::open(format!(
                "redis://{}:{}/",
                config.redis.host, config.redis.port
            ))?;
            match tokio::time::timeout(
                std::time::Duration::from_secs(2),
                ConnectionManager::new(client),
            )
            .await
            {
                Ok(Ok(conn)) => Some(conn),
                Ok(Err(e)) => {
                    tracing::warn!("Redis unavailable, using in-memory only: {e}");
                    None
                }
                Err(_) => {
                    tracing::warn!("Redis connection timed out after 2s, continuing without cache");
                    None
                }
            }
        };
        Ok(Self {
            redis,
            ttl_ms: config.redis.ttl_ms,
        })
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        if let Some(mut conn) = self.redis.clone() {
            conn.get(key).await.ok()
        } else {
            None
        }
    }

    pub async fn set(&self, key: &str, value: &str) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = conn
                .set_ex(key, value, (self.ttl_ms / 1000).max(1))
                .await;
        }
    }

    pub async fn invalidate(&self, key: &str) {
        if let Some(mut conn) = self.redis.clone() {
            let _: Result<(), _> = conn.del(key).await;
        }
    }
}
