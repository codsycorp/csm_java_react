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
        let model_path = self
            .config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default();

        let model_exists = self
            .config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.exists())
            .unwrap_or(false);

        let ai_enabled = self.config.ai_local_enabled;

        let policy = json!({
            "localOnlyEnabled": ai_enabled,
            "multimodalLocalOnly": true,
            "multimodalRequireVision": false
        });

        let reasoning = json!({
            "provider": "llama.cpp-native",
            "beanPresent": model_exists,
            "available": model_exists,
            "healthy": model_exists && ai_enabled,
            "circuitOpen": false,
            "modelPath": model_path,
            "runtimeProfile": "balanced",
            "contextWindow": 8192,
            "maxTokens": 512,
            "inFlightRequests": 0,
            "inferenceInProgress": false
        });

        let vision = json!({
            "enabled": false,
            "endpoint": "",
            "localVisionReady": false,
            "native": {
                "provider": "llama.cpp-native-vision",
                "enabled": false,
                "ready": false
            }
        });

        let ffmpeg = json!({
            "provider": "jave-all-deps-bundled",
            "ready": false,
            "executablePath": ""
        });

        let character_extract = json!({
            "provider": "onnxruntime-u2netp-bundled",
            "ready": false
        });

        let guest_chat = json!({
            "enabled": false,
            "beanPresent": false
        });

        let tts = json!({
            "enabled": false,
            "ready": false
        });

        let talking_head = json!({
            "enabled": false,
            "ready": false
        });

        let martial_cinematic = json!({
            "enabled": false,
            "engine": "martial_cinematic",
            "ready": false
        });

        let ready = ai_enabled && model_exists;

        json!({
            "success": true,
            "policy": policy,
            "reasoning": reasoning,
            "guestChat": guest_chat,
            "vision": vision,
            "ffmpeg": ffmpeg,
            "characterExtract": character_extract,
            "tts": tts,
            "talkingHead": talking_head,
            "martialCinematic": martial_cinematic,
            "ready": ready
        })
    }

    pub fn list_models(&self) -> Value {
        let model_path = self
            .config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default();

        let model_exists = self
            .config
            .ai_local_llama_model_path
            .as_ref()
            .map(|p| p.exists())
            .unwrap_or(false);

        let reasoning_candidates = if model_exists {
            vec![json!({
                "file": PathBuf::from(&model_path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                "role": "reasoning",
                "profile": "balanced",
                "estimatedRam": "~4.2-5.0GB",
                "weakMachineRecommended": true,
                "configured": true,
                "quantization": detect_quantization(&model_path),
                "path": model_path
            })]
        } else {
            vec![json!({
                "file": "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
                "role": "reasoning",
                "profile": "balanced",
                "estimatedRam": "~4.2-5.0GB",
                "weakMachineRecommended": true,
                "configured": false,
                "quantization": "q4_k_m",
                "weakMachineScore": 75
            })]
        };

        let vision_candidates = vec![
            json!({
                "file": "moondream2-q4_k_m.gguf",
                "role": "vision",
                "profile": "very-light",
                "estimatedRam": "~0.5-0.9GB",
                "weakMachineRecommended": true,
                "configured": false,
                "quantization": "q4_k_m"
            }),
            json!({
                "file": "qwen2-vl-2b-instruct-q4_k_m.gguf",
                "role": "vision",
                "profile": "higher-quality",
                "estimatedRam": "~1.8-2.8GB",
                "weakMachineRecommended": false,
                "configured": false,
                "quantization": "q4_k_m"
            }),
        ];

        let quantization_guide = json!({
            "recommendedOrderWeakMachine": ["q8_0", "q5_k_m", "q4_k_m", "q4_0", "q2_k"],
            "notes": [
                "q4_k_m — worker mặc định server 8GB: qwen2.5-coder-7b (SEO/code chất lượng cao hơn 1.5B)",
                "q8_0 — dev M1 / máy yếu: qwen2.5-coder-1.5b khi thiếu RAM",
                "q5_k_m — fallback nhẹ hơn Q8 một chút",
                "q4_k_m — tiết kiệm RAM hơn trên máy cực yếu",
                "q2_k — chỉ khi RAM cực thấp, có thể giảm độ chính xác"
            ]
        });

        json!({
            "success": true,
            "localOnlyEnabled": self.config.ai_local_enabled,
            "configuredReasoningModel": model_path,
            "configuredModelQuantization": detect_quantization(&model_path),
            "configuredModelExists": model_exists,
            "discoveredCount": if model_exists { 1 } else { 0 },
            "quantizationGuide": quantization_guide,
            "reasoningCandidates": reasoning_candidates,
            "visionCandidates": vision_candidates
        })
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

fn detect_quantization(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.contains("q2_k") { return "q2_k"; }
    if lower.contains("q3_k") { return "q3_k"; }
    if lower.contains("q4_k_m") { return "q4_k_m"; }
    if lower.contains("q4_k_s") { return "q4_k_s"; }
    if lower.contains("q4_0") { return "q4_0"; }
    if lower.contains("q5_k_m") { return "q5_k_m"; }
    if lower.contains("q5_0") { return "q5_0"; }
    if lower.contains("q6_k") { return "q6_k"; }
    if lower.contains("q8_0") { return "q8_0"; }
    "unknown"
}
