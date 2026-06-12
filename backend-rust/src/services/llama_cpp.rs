use std::pin::Pin;

use futures_util::Stream;

use crate::config::AppConfig;

/// Native llama.cpp inference — in-process, giống Java `de.kherud.llama`.
#[derive(Clone)]
pub struct LlamaCppService {
    #[cfg(feature = "local-ai")]
    inner: LlamaCppServiceInner,
}

#[cfg(feature = "local-ai")]
#[derive(Clone)]
struct LlamaCppServiceInner {
    config: super::llama_native::NativeConfig,
    default_max_tokens: u32,
}

#[cfg(feature = "local-ai")]
impl LlamaCppService {
    pub fn new(app: &AppConfig) -> Self {
        Self {
            inner: LlamaCppServiceInner {
                config: app.llama_native_config(),
                default_max_tokens: app.effective_llama_max_tokens(),
            },
        }
    }

    pub fn is_available(&self) -> bool {
        super::llama_native::model_file_exists(&self.inner.config.model_path)
    }

    pub async fn complete(&self, prompt: &str) -> anyhow::Result<String> {
        self.complete_with_tokens(prompt, self.inner.default_max_tokens)
            .await
    }

    pub async fn complete_with_tokens(
        &self,
        prompt: &str,
        max_tokens: u32,
    ) -> anyhow::Result<String> {
        use tokio::task::spawn_blocking;

        let config = self.inner.config.clone();
        let prompt = prompt.to_string();
        spawn_blocking(move || super::llama_native::generate(&config, &prompt, Some(max_tokens)))
            .await?
    }

    pub async fn stream_completion(
        &self,
        prompt: &str,
    ) -> anyhow::Result<Pin<Box<dyn Stream<Item = String> + Send>>> {
        use tokio::sync::mpsc;
        use tokio::task::spawn_blocking;

        let config = self.inner.config.clone();
        let prompt = prompt.to_string();
        let max_tokens = self.inner.default_max_tokens;
        let (tx, mut rx) = mpsc::channel::<String>(128);

        spawn_blocking(move || {
            let result = super::llama_native::generate_with_callback(
                &config,
                &prompt,
                Some(max_tokens),
                |piece| {
                    if tx.blocking_send(piece.to_string()).is_err() {
                        return Err(anyhow::anyhow!("stream consumer dropped"));
                    }
                    Ok(())
                },
            );
            if let Err(e) = result {
                let _ = tx.blocking_send(format!("// Local AI error: {e}"));
            }
        });

        let stream = async_stream::stream! {
            while let Some(chunk) = rx.recv().await {
                yield chunk;
            }
        };

        Ok(Box::pin(stream))
    }
}

#[cfg(not(feature = "local-ai"))]
impl LlamaCppService {
    pub fn new(_app: &AppConfig) -> Self {
        Self {}
    }

    pub fn is_available(&self) -> bool {
        false
    }

    pub async fn complete(&self, _prompt: &str) -> anyhow::Result<String> {
        anyhow::bail!(local_ai_disabled_message())
    }

    pub async fn complete_with_tokens(
        &self,
        _prompt: &str,
        _max_tokens: u32,
    ) -> anyhow::Result<String> {
        anyhow::bail!(local_ai_disabled_message())
    }

    pub async fn stream_completion(
        &self,
        _prompt: &str,
    ) -> anyhow::Result<Pin<Box<dyn Stream<Item = String> + Send>>> {
        anyhow::bail!(local_ai_disabled_message())
    }
}

pub fn local_ai_disabled_message() -> &'static str {
    "Local AI disabled in this build (compile with --features local-ai)"
}
