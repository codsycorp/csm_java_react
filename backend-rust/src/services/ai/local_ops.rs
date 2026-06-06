use std::path::PathBuf;

use serde_json::{json, Value};

use crate::config::AppConfig;

pub struct AiLocalOpsService {
    config: AppConfig,
}

impl AiLocalOpsService {
    pub fn new(config: AppConfig) -> Self {
        Self { config }
    }

    pub fn health(&self) -> Value {
        json!({
            "status": "ok",
            "ai_local_enabled": self.config.ai_local_enabled,
            "model_path": self.config.ai_local_llama_model_path.as_ref().map(|p| p.display().to_string()),
        })
    }

    pub fn list_models(&self) -> Value {
        let mut models = Vec::new();
        if let Some(path) = &self.config.ai_local_llama_model_path {
            if path.exists() {
                models.push(json!({
                    "id": "local_llama",
                    "path": path.display().to_string(),
                    "type": "gguf",
                }));
            }
        }
        json!({ "models": models })
    }

    pub async fn run_llama_sidecar(&self, prompt: &str) -> anyhow::Result<String> {
        let model = self
            .config
            .ai_local_llama_model_path
            .clone()
            .unwrap_or_else(|| PathBuf::from("./csm_datas/ai_local/model/model.gguf"));

        let output = tokio::process::Command::new("llama-cli")
            .args(["-m", &model.display().to_string(), "-p", prompt, "--no-display-prompt"])
            .output()
            .await?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "llama-cli failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}
