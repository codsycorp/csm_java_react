package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * In-process embedding service for semantic Lucene retrieval.
 *
 * <p>Uses an improved 384-dim bag-of-words embedding based on:
 * <ul>
 *   <li>Unigram + character 4-gram tokens → higher semantic resolution</li>
 *   <li>Positional decay weights (first/last tokens weighted more)</li>
 *   <li>Murmurhash-style mixing to reduce hash collisions vs Java {@code hashCode()}</li>
 *   <li>L2 normalisation for cosine similarity via Lucene KNN</li>
 * </ul>
 *
 * <p>VECTOR_DIMS = 384 matches {@code all-MiniLM-L6-v2} output dimension so that indices
 * built here can be replaced by a real ONNX embedding model later with zero schema change.
 *
 * <p>If {@code ai.local.embedding.onnx.enabled=true} and the ONNX model + tokenizer files
 * exist at {@code ai.local.embedding.onnx.model-dir}, future neural embeddings can be
 * plugged in by injecting an {@code OnnxEmbeddingEngine} (DJL OnnxRuntime) here.
 *
 * <p><b>Index version</b>: changing VECTOR_DIMS from 128 → 384 requires callers to
 * invalidate their Lucene index directories. Use {@link #INDEX_VERSION} as a marker in a
 * properties file stored alongside the Lucene index to detect stale indices.
 */
@Service
public class LocalEmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(LocalEmbeddingService.class);

    /** Embedding dimension. Matches all-MiniLM-L6-v2 for future ONNX compatibility. */
    public static final int DIMS = 384;

    /**
     * Bump this whenever DIMS or the hashing algorithm changes so callers can detect
     * and rebuild stale Lucene indices automatically.
     */
    public static final String INDEX_VERSION = "emb-v2-384";

    private static final Pattern TOKEN_PATTERN =
        Pattern.compile("[\\p{L}\\p{N}_$\\-]{2,}");

    @Value("${ai.local.embedding.onnx.enabled:false}")
    private boolean onnxEnabled;

    @Value("${ai.local.embedding.onnx.model-dir:csm_datas/ai_local/model/embeddings}")
    private String onnxModelDir;

    /**
     * Returns a 384-dim normalised float vector for {@code text}.
     *
     * <p>Algorithm:
     * <ol>
     *   <li>Tokenise to lower-case word tokens (regex)</li>
     *   <li>Emit each token as unigram AND sliding character 4-grams for sub-word capture</li>
     *   <li>Hash each n-gram with a MurmurHash-inspired 32-bit mix to spread bits evenly</li>
     *   <li>Accumulate weighted (positional decay) counts in a 384-bin vector</li>
     *   <li>L2-normalise</li>
     * </ol>
     */
    public float[] embed(String text) {
        float[] vec = new float[DIMS];
        String safe = String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT);
        if (safe.isBlank()) {
            vec[0] = 1.0f;
            return vec;
        }

        Matcher m = TOKEN_PATTERN.matcher(safe);
        int position = 0;
        int total = countTokens(safe);
        while (m.find()) {
            String token = m.group();
            float posWeight = positionalWeight(position, total);

            // Unigram
            addWeighted(vec, murmurhash32(token.hashCode()), posWeight * 2.0f);

            // Character 4-grams for sub-word / Vietnamese morpheme support
            if (token.length() >= 4) {
                for (int i = 0; i <= token.length() - 4; i++) {
                    int ngHash = murmurhash32(token.substring(i, i + 4).hashCode());
                    addWeighted(vec, ngHash, posWeight * 0.5f);
                }
            } else if (token.length() >= 3) {
                // 3-grams for short tokens
                for (int i = 0; i <= token.length() - 3; i++) {
                    int ngHash = murmurhash32(token.substring(i, i + 3).hashCode());
                    addWeighted(vec, ngHash, posWeight * 0.4f);
                }
            }

            // Bigram with next token (captured on next iteration via lookahead would be complex;
            // use token-pair hash approximation instead)
            addWeighted(vec, murmurhash32(token.hashCode() ^ (position * 31)), posWeight * 0.8f);

            position++;
        }

        return l2Normalize(vec);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private static void addWeighted(float[] vec, int hash, float weight) {
        int idx = Math.floorMod(hash, DIMS);
        vec[idx] += weight;
    }

    /**
     * MurmurHash-inspired 32-bit finalisation mix.
     * Dramatically reduces bucket collisions compared to raw Java {@code hashCode()}.
     */
    private static int murmurhash32(int h) {
        h ^= h >>> 16;
        h *= 0x85ebca6b;
        h ^= h >>> 13;
        h *= 0xc2b2ae35;
        h ^= h >>> 16;
        return h;
    }

    /**
     * Positional decay: tokens near the start and end of text carry more weight
     * (they typically contain the topic/conclusion). Middle tokens weighted at 0.7×.
     */
    private static float positionalWeight(int position, int total) {
        if (total <= 1) return 1.0f;
        float rel = (float) position / (float) (total - 1);
        // U-shaped: high at 0 and 1, lower in the middle
        return 0.7f + 0.3f * (float) Math.pow(2 * rel - 1, 2);
    }

    private static int countTokens(String text) {
        int count = 0;
        Matcher m = TOKEN_PATTERN.matcher(text);
        while (m.find()) count++;
        return Math.max(1, count);
    }

    private static float[] l2Normalize(float[] vec) {
        float norm = 0.0f;
        for (float v : vec) norm += v * v;
        norm = (float) Math.sqrt(norm);
        if (norm <= 0.0f) {
            vec[0] = 1.0f;
            return vec;
        }
        for (int i = 0; i < vec.length; i++) vec[i] /= norm;
        return vec;
    }
}
