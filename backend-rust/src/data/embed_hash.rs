//! Normalized hash embeddings — mirrors `backend-go/internal/data/embed_hash.go`.

use sha2::{Digest, Sha256};

pub const DEFAULT_EMBED_DIM: usize = 384;

pub fn hash_embed(text: &str, dim: usize) -> Vec<f32> {
    let dim = if dim == 0 { DEFAULT_EMBED_DIM } else { dim };
    let mut out = vec![0.0f32; dim];
    for i in 0..dim {
        let digest = Sha256::digest(format!("{text}:{i}"));
        let v = (digest[0] as u32) << 8 | digest[1] as u32;
        out[i] = (v as f32 / 65535.0) * 2.0 - 1.0;
    }
    let mut norm = 0.0f64;
    for v in &out {
        norm += f64::from(*v) * f64::from(*v);
    }
    let norm = norm.sqrt();
    if norm > 0.0 {
        for v in &mut out {
            *v = (*v as f64 / norm) as f32;
        }
    }
    out
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for i in 0..a.len() {
        dot += f64::from(a[i]) * f64::from(b[i]);
        na += f64::from(a[i]) * f64::from(a[i]);
        nb += f64::from(b[i]) * f64::from(b[i]);
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}
