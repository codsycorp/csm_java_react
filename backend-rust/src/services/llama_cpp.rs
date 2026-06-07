use std::path::PathBuf;
use std::pin::Pin;

use futures_util::Stream;
use tokio::sync::mpsc;

use crate::config::AppConfig;

use super::llama_native::{self, NativeConfig};

/// Native llama.cpp inference — in-process, giống Java `de.kherud.llama`.
#[derive(Clone)]
pub struct LlamaCppService {
    config: NativeConfig,
    default_max_tokens: u32,
}

impl LlamaCppService {
    pub fn new(app: &AppConfig) -> Self {
        let model_path = app
            .ai_local_llama_model_path
            .clone()
            .unwrap_or_else(|| PathBuf::from("./csm_datas/ai_local/model/model.gguf"));

        Self {
            config: NativeConfig {
                model_path,
                context_window: app.ai_local_llama_context_window,
                max_tokens: app.ai_local_llama_max_tokens,
                max_prompt_chars: app.ai_local_llama_max_prompt_chars,
                threads: app.ai_local_llama_threads,
                temperature: app.ai_local_llama_temperature,
                top_p: app.ai_local_llama_top_p,
                top_k: app.ai_local_llama_top_k,
                gpu_layers: app.ai_local_llama_gpu_layers,
            },
            default_max_tokens: app.ai_local_llama_max_tokens,
        }
    }

    pub fn is_available(&self) -> bool {
        llama_native::model_file_exists(&self.config.model_path)
    }

    pub async fn complete(&self, prompt: &str) -> anyhow::Result<String> {
        self.complete_with_tokens(prompt, self.default_max_tokens).await
    }

    pub async fn complete_with_tokens(&self, prompt: &str, max_tokens: u32) -> anyhow::Result<String> {
        let config = self.config.clone();
        let prompt = prompt.to_string();
        tokio::task::spawn_blocking(move || llama_native::generate(&config, &prompt, Some(max_tokens)))
            .await?
    }

    pub async fn stream_completion(
        &self,
        prompt: &str,
    ) -> anyhow::Result<Pin<Box<dyn Stream<Item = String> + Send>>> {
        let config = self.config.clone();
        let prompt = prompt.to_string();
        let max_tokens = self.default_max_tokens;
        let (tx, mut rx) = mpsc::channel::<String>(128);

        tokio::task::spawn_blocking(move || {
            let result = llama_native::generate_with_callback(
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
