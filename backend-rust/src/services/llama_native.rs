use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use anyhow::{anyhow, Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::context::LlamaContext;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use tracing::{info, warn};

#[derive(Clone, Debug)]
pub struct NativeConfig {
    pub model_path: PathBuf,
    pub context_window: u32,
    pub max_tokens: u32,
    pub max_prompt_chars: usize,
    pub threads: i32,
    pub temperature: f32,
    pub top_p: f32,
    pub top_k: i32,
    pub gpu_layers: u32,
    pub batch_size: u32,
    pub ubatch_size: u32,
    pub use_mmap: bool,
    pub use_mlock: bool,
}

struct EngineInner {
    backend: LlamaBackend,
    model: LlamaModel,
    // SAFETY: ctx holds C raw pointers into llama.cpp heap (not Rust refs). backend+model live
    // in the same struct inside a 'static OnceLock and are never freed, so ctx is always valid.
    ctx: LlamaContext<'static>,
    config: NativeConfig,
}
// LlamaModel/Backend/Context are C-pointer wrappers; safe to Send since INFER_LOCK serialises access.
unsafe impl Send for EngineInner {}

static ENGINE: OnceLock<Mutex<Option<EngineInner>>> = OnceLock::new();
static INFER_LOCK: Mutex<()> = Mutex::new(());

fn engine_slot() -> &'static Mutex<Option<EngineInner>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

fn lock_engine() -> Result<std::sync::MutexGuard<'static, Option<EngineInner>>> {
    engine_slot()
        .lock()
        .map_err(|_| anyhow!("llama engine lock poisoned"))
}

fn lock_infer() -> Result<std::sync::MutexGuard<'static, ()>> {
    INFER_LOCK
        .lock()
        .map_err(|_| anyhow!("llama inference lock poisoned"))
}

pub fn model_file_exists(path: &PathBuf) -> bool {
    path.exists()
}

pub fn ensure_loaded(config: &NativeConfig) -> Result<()> {
    if !config.model_path.exists() {
        return Err(anyhow!(
            "GGUF model not found: {}",
            config.model_path.display()
        ));
    }

    let mut slot = lock_engine()?;
    if slot.is_some() {
        return Ok(());
    }

    info!(
        "Loading llama.cpp model in-process: {}",
        config.model_path.display()
    );

    let backend = LlamaBackend::init().context("LlamaBackend::init failed")?;

    let mut model_params = LlamaModelParams::default()
        .with_use_mmap(config.use_mmap)
        .with_use_mlock(config.use_mlock);
    if config.gpu_layers > 0 {
        model_params = model_params.with_n_gpu_layers(config.gpu_layers);
    }

    let model = LlamaModel::load_from_file(&backend, &config.model_path, &model_params)
        .with_context(|| format!("failed to load {}", config.model_path.display()))?;

    info!("llama.cpp model loaded — initializing inference context (one-time, cached)");

    let ctx_size = NonZeroU32::new(config.context_window.max(512))
        .ok_or_else(|| anyhow!("invalid context window"))?;
    let n_batch = config.batch_size.max(32).min(config.context_window);
    let n_ubatch = config.ubatch_size.max(16).min(n_batch);

    info!(
        "llama context: n_ctx={} n_batch={} n_ubatch={} threads={} mmap={} mlock={}",
        ctx_size, n_batch, n_ubatch, config.threads, config.use_mmap, config.use_mlock
    );

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(ctx_size))
        .with_n_batch(n_batch)
        .with_n_ubatch(n_ubatch)
        .with_n_threads(config.threads)
        .with_n_threads_batch(config.threads);

    let ctx = model
        .new_context(&backend, ctx_params)
        .context("failed to create llama context")?;

    // SAFETY: backend and model are stored in EngineInner below, inside a 'static OnceLock.
    // They are never freed. LlamaContext holds C raw pointers (not Rust borrows) internally,
    // so moving EngineInner on the stack before inserting into the static is safe.
    let ctx: LlamaContext<'static> = unsafe { std::mem::transmute(ctx) };

    *slot = Some(EngineInner {
        backend,
        model,
        ctx,
        config: config.clone(),
    });

    info!("llama.cpp model + context ready (native in-process)");
    Ok(())
}

pub fn generate(config: &NativeConfig, prompt: &str, max_tokens: Option<u32>) -> Result<String> {
    let mut out = String::new();
    generate_with_callback(config, prompt, max_tokens, |piece| {
        out.push_str(piece);
        Ok(())
    })?;
    Ok(out)
}

pub fn generate_with_callback<F>(
    config: &NativeConfig,
    prompt: &str,
    max_tokens: Option<u32>,
    mut on_piece: F,
) -> Result<()>
where
    F: FnMut(&str) -> Result<()>,
{
    ensure_loaded(config)?;
    let _infer_guard = lock_infer()?;
    let mut slot = lock_engine()?;
    let engine = slot
        .as_mut()
        .ok_or_else(|| anyhow!("llama engine not initialized"))?;

    let prompt = truncate_prompt(prompt, engine.config.max_prompt_chars);

    let n_ctx = engine.ctx.n_ctx() as i32;

    // Clear KV cache so previous request's entries don't bleed into this one
    engine.ctx.clear_kv_cache();

    let mut tokens = engine
        .model
        .str_to_token(&prompt, AddBos::Never)
        .with_context(|| "failed to tokenize prompt")?;

    if tokens.is_empty() {
        return Err(anyhow!("prompt tokenized to empty sequence"));
    }

    // Silently truncate prompt tokens to fit context (leave 1 slot for first output token)
    let max_prompt_tokens = (n_ctx - 1) as usize;
    if tokens.len() > max_prompt_tokens {
        warn!(
            "prompt truncated from {} to {} tokens to fit context window",
            tokens.len(),
            max_prompt_tokens
        );
        tokens.truncate(max_prompt_tokens);
    }

    // 0 env = use configured default cap (never fill entire context on low-RAM)
    let requested = max_tokens.unwrap_or(engine.config.max_tokens);
    let max_new_tokens = if requested == 0 {
        engine.config.max_tokens.max(1) as i32
    } else {
        (requested as i32).min(n_ctx - tokens.len() as i32)
    };

    // Batch capacity = n_batch (NOT full context — n_batch=8192 OOM on 8GB server)
    let batch_cap = engine.config.batch_size.max(32) as usize;
    let mut batch = LlamaBatch::new(batch_cap, 1);
    let last_prompt_idx = (tokens.len() - 1) as i32;
    for (pos, token) in (0_i32..).zip(tokens.into_iter()) {
        batch.add(token, pos, &[0], pos == last_prompt_idx)?;
    }
    engine.ctx.decode(&mut batch).context("prompt decode failed")?;

    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(engine.config.temperature),
        LlamaSampler::top_k(engine.config.top_k),
        LlamaSampler::top_p(engine.config.top_p, 1),
        LlamaSampler::dist(1234),
    ]);

    let mut decoder = encoding_rs::UTF_8.new_decoder();
    let mut n_cur = batch.n_tokens();
    let mut generated = 0_i32;

    while generated < max_new_tokens {
        let token = sampler.sample(&engine.ctx, batch.n_tokens() - 1);
        sampler.accept(token);

        if engine.model.is_eog_token(token) {
            break;
        }

        let piece = engine
            .model
            .token_to_piece(token, &mut decoder, true, None)
            .with_context(|| "failed to decode generated token")?;
        on_piece(&piece)?;

        batch.clear();
        batch.add(token, n_cur, &[0], true)?;
        n_cur += 1;
        engine.ctx.decode(&mut batch).context("token decode failed")?;
        generated += 1;
    }

    Ok(())
}

fn truncate_prompt(prompt: &str, max_chars: usize) -> String {
    if prompt.len() <= max_chars {
        return prompt.to_string();
    }
    warn!(
        "prompt clipped from {} to {} chars",
        prompt.len(),
        max_chars
    );
    prompt.chars().take(max_chars).collect()
}
