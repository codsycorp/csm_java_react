use std::path::PathBuf;
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::warn;

use crate::config::AppConfig;

pub struct LlamaCppService {
    model_path: PathBuf,
    max_tokens: u32,
}

impl LlamaCppService {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            model_path: config
                .ai_local_llama_model_path
                .clone()
                .unwrap_or_else(|| PathBuf::from("./csm_datas/ai_local/model/model.gguf")),
            max_tokens: 512,
        }
    }

    pub fn is_available(&self) -> bool {
        self.model_path.exists()
    }

    pub async fn stream_completion(
        &self,
        prompt: &str,
    ) -> anyhow::Result<impl futures_util::Stream<Item = String> + Send> {
        let model = self.model_path.display().to_string();
        let prompt_owned = prompt.to_string();
        let max_tokens = self.max_tokens;

        let stream = async_stream::stream! {
            let mut child = match Command::new("llama-cli")
                .args([
                    "-m", &model,
                    "-p", &prompt_owned,
                    "-n", &max_tokens.to_string(),
                    "--no-display-prompt",
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    warn!("llama-cli not found: {e}");
                    yield format!("// Local AI unavailable: {e}\n");
                    return;
                }
            };

            if let Some(stdout) = child.stdout.take() {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if !line.is_empty() {
                        yield line;
                    }
                }
            }
            let _ = child.wait().await;
        };

        Ok(stream)
    }

    pub async fn complete(&self, prompt: &str) -> anyhow::Result<String> {
        let mut out = String::new();
        let mut stream = Box::pin(self.stream_completion(prompt).await?);
        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            out.push_str(&chunk);
            out.push('\n');
        }
        Ok(out)
    }
}
