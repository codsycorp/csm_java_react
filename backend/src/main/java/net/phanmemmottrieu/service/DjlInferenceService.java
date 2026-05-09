package net.phanmemmottrieu.service;

import ai.djl.MalformedModelException;
import ai.djl.inference.Predictor;
import ai.djl.ndarray.NDArray;
import ai.djl.ndarray.NDList;
import ai.djl.ndarray.NDManager;
import ai.djl.ndarray.types.DataType;
import ai.djl.ndarray.types.Shape;
import ai.djl.repository.zoo.Criteria;
import ai.djl.repository.zoo.ModelNotFoundException;
import ai.djl.repository.zoo.ZooModel;
import ai.djl.translate.TranslateException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * DJL-based inference service supporting ONNX models via ONNX Runtime.
 *
 * <p>Activated when {@code ai.local.djl.enabled=true}. Auto-detects a {@code model.onnx} (or
 * any {@code *.onnx}) file under {@code ai.local.djl.onnx.model-dir} and loads the corresponding
 * {@code tokenizer.json} (HuggingFace BPE format) from the same directory.
 *
 * <p>When active, {@link LlamaCppNativeService} transparently delegates its inference calls here,
 * so no changes to {@code ApiSpringController} are required.
 *
 * <p><b>Setup (one-time):</b>
 * <pre>
 *   pip install optimum[onnxruntime]
 *   optimum-cli export onnx --model Qwen/Qwen2.5-Coder-1.5B-Instruct \
 *       --task text-generation csm_datas/ai_local/model/onnx/
 * </pre>
 * Then add {@code AI_LOCAL_DJL_ENABLED=true} to {@code config.env}.
 */
@Service
@ConditionalOnProperty(name = "ai.local.djl.enabled", havingValue = "true")
public class DjlInferenceService implements AIProvider {

    private static final Logger log = LoggerFactory.getLogger(DjlInferenceService.class);

    // ── Config ────────────────────────────────────────────────────────────────

    @Value("${ai.local.djl.onnx.model-dir:${AI_LOCAL_DJL_ONNX_MODEL_DIR:csm_datas/ai_local/model/onnx}}")
    private String onnxModelDir;

    @Value("${ai.local.djl.max-tokens:${AI_LOCAL_DJL_MAX_TOKENS:8192}}")
    private int maxTokens;

    @Value("${ai.local.djl.context-window:${AI_LOCAL_DJL_CONTEXT_WINDOW:16384}}")
    private int contextWindow;

    @Value("${ai.local.djl.threads:${AI_LOCAL_DJL_THREADS:2}}")
    private int threads;

    @Value("${ai.local.djl.temperature:${AI_LOCAL_DJL_TEMPERATURE:0.2}}")
    private float temperature;

    @Value("${ai.local.djl.top-k:${AI_LOCAL_DJL_TOP_K:40}}")
    private int topK;

    @Value("${ai.local.djl.fast-max-tokens:${AI_LOCAL_DJL_FAST_MAX_TOKENS:256}}")
    private int fastMaxTokens;

    // ── State ─────────────────────────────────────────────────────────────────

    private volatile ZooModel<NDList, NDList> onnxModel;
    private volatile Predictor<NDList, NDList> onnxPredictor;
    private volatile BpeTokenizer tokenizer;
    private volatile int eosTokenId = -1;
    private volatile boolean ready = false;
    private volatile boolean shuttingDown = false;
    private final Object initLock = new Object();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong requestCount = new AtomicLong(0);
    private volatile long failedCount = 0L;
    private volatile String lastError = "";

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @PostConstruct
    public void init() {
        Path dir = resolveDir(onnxModelDir);
        if (!Files.isDirectory(dir)) {
            log.warn("DJL ONNX: model dir '{}' does not exist – service inactive. "
                + "Export model with: optimum-cli export onnx ...", dir);
            return;
        }
        Path onnxFile = findOnnxFile(dir);
        if (onnxFile == null) {
            log.warn("DJL ONNX: no .onnx file found in '{}' – service inactive.", dir);
            return;
        }
        // Run init in background to avoid blocking Spring context startup
        Thread t = new Thread(() -> {
            try {
                doInit(dir, onnxFile);
            } catch (Exception ex) {
                log.error("DJL ONNX: background init failed: {}", ex.getMessage(), ex);
            }
        }, "djl-init");
        t.setDaemon(true);
        t.start();
    }

    private void doInit(Path modelDir, Path onnxFile) throws IOException, ModelNotFoundException, MalformedModelException {
        synchronized (initLock) {
            if (ready) return;
            log.info("DJL ONNX: loading model '{}' (threads={})", onnxFile.getFileName(), threads);

            // Load tokenizer
            Path tokJson = modelDir.resolve("tokenizer.json");
            if (Files.isRegularFile(tokJson)) {
                tokenizer = BpeTokenizer.load(tokJson, objectMapper);
                eosTokenId = tokenizer.getEosTokenId();
                log.info("DJL ONNX: tokenizer loaded – vocab={}, eos_id={}", tokenizer.getVocabSize(), eosTokenId);
            } else {
                log.warn("DJL ONNX: tokenizer.json not found – decode quality degraded");
            }

            // Derive model name from file (e.g. model.onnx → "model")
            String modelName = onnxFile.getFileName().toString().replaceFirst("\\.onnx$", "");

            Criteria<NDList, NDList> criteria = Criteria.builder()
                .setTypes(NDList.class, NDList.class)
                .optModelPath(modelDir)
                .optModelName(modelName)
                .optEngine("OnnxRuntime")
                .optOption("interOpNumThreads", "1")
                .optOption("intraOpNumThreads", String.valueOf(threads))
                .optOption("executionMode", "SEQUENTIAL")
                .optOption("OptLevel", "BASIC_OPT")
                .build();

            onnxModel = criteria.loadModel();
            onnxPredictor = onnxModel.newPredictor();
            ready = true;
            log.info("DJL ONNX: ready – model='{}', context={}, maxTokens={}",
                onnxFile.getFileName(), contextWindow, maxTokens);
        }
    }

    @PreDestroy
    public void destroy() {
        shuttingDown = true;
        if (onnxPredictor != null) {
            try { onnxPredictor.close(); } catch (Exception ignored) {}
        }
        if (onnxModel != null) {
            try { onnxModel.close(); } catch (Exception ignored) {}
        }
    }

    // ── AIProvider ────────────────────────────────────────────────────────────

    @Override
    public String generateContent(String prompt) {
        return generate(prompt, maxTokens);
    }

    /** Fast variant with a hard output token cap (for classification/intent calls). */
    public String generateFast(String prompt, int capTokens) {
        int cap = capTokens > 0 ? Math.min(capTokens, fastMaxTokens) : fastMaxTokens;
        return generate(prompt, cap);
    }

    @Override
    public boolean isAvailable() {
        return ready && !shuttingDown && onnxPredictor != null;
    }

    @Override
    public String getName() {
        return "DJL-ONNX";
    }

    @Override
    public String getQuotaInfo() {
        return String.format("DJL-ONNX ready=%s requests=%d failed=%d", ready, requestCount.get(), failedCount);
    }

    // ── Inference ─────────────────────────────────────────────────────────────

    private String generate(String prompt, int tokenCap) {
        if (!isAvailable()) {
            return createErrorJson("DJL ONNX model not ready", "DJL_NOT_READY");
        }
        String safe = prompt == null ? "" : prompt.trim();
        if (safe.isEmpty()) {
            return createErrorJson("Empty prompt", "INVALID_PROMPT");
        }

        try {
            String output = runOnnxGeneration(safe, tokenCap);
            requestCount.incrementAndGet();
            Map<String, Object> resp = new HashMap<>();
            resp.put("success", true);
            resp.put("result", output.trim());
            resp.put("provider", getName());
            resp.put("timestamp", System.currentTimeMillis());
            return objectMapper.writeValueAsString(resp);
        } catch (Exception ex) {
            failedCount++;
            lastError = ex.getMessage();
            log.error("DJL ONNX inference failed: {}", ex.getMessage());
            return createErrorJson("DJL inference failed: " + ex.getMessage(), "DJL_INFERENCE_FAILED");
        }
    }

    private String runOnnxGeneration(String prompt, int tokenCap) throws TranslateException {
        // 1. Tokenize
        long[] inputIds = tokenizer != null
            ? tokenizer.encode(prompt)
            : fallbackCharTokenize(prompt);

        // 2. Trim prompt to fit context window (keep tail = most recent context)
        int maxPromptLen = Math.max(64, contextWindow - tokenCap - 32);
        if (inputIds.length > maxPromptLen) {
            inputIds = Arrays.copyOfRange(inputIds, inputIds.length - maxPromptLen, inputIds.length);
        }

        // 3. Autoregressive decoding loop (no KV-cache, simpler but compatible with all exports)
        List<Long> generated = new ArrayList<>();
        long[] current = inputIds;

        try (NDManager manager = NDManager.newBaseManager()) {
            for (int step = 0; step < tokenCap; step++) {
                if (shuttingDown) break;

                try (NDManager stepMgr = manager.newSubManager()) {
                    NDArray idsArr = stepMgr.create(current).reshape(1, current.length);
                    NDArray maskArr = stepMgr.ones(new Shape(1, current.length), DataType.INT64);

                    NDList inputs = new NDList(idsArr, maskArr);
                    try (NDList outputs = onnxPredictor.predict(inputs)) {
                        NDArray logits = outputs.head(); // [1, seq_len, vocab_size]
                        // Get last-position logits → [vocab_size]
                        NDArray lastLogits = logits.get("0," + (current.length - 1) + ",:");

                        long nextToken = sampleToken(lastLogits, temperature, topK);

                        if (eosTokenId >= 0 && nextToken == eosTokenId) break;
                        generated.add(nextToken);
                        current = slideAndAppend(current, nextToken, contextWindow - 32);
                    }
                }
            }
        }

        // 4. Decode
        long[] outputIds = toLongArray(generated);
        return tokenizer != null ? tokenizer.decode(outputIds) : fallbackCharDecode(outputIds);
    }

    // ── Sampling ──────────────────────────────────────────────────────────────

    private static long sampleToken(NDArray logits, float temp, int topK) {
        if (temp <= 0.01f) {
            // Greedy
            return logits.argMax().getLong();
        }
        // Temperature scaling
        NDArray scaled = logits.div(temp);
        // Top-K masking
        if (topK > 1) {
            // Get k-th largest value
            NDArray topKVals = scaled.topK(Math.min(topK, (int) scaled.size()), -1, true, false).get(0);
            float threshold = topKVals.min().getFloat();
            // Zero out tokens below threshold (set to -inf)
            NDArray mask = scaled.gte(threshold);
            NDArray negInf = scaled.zerosLike().sub(1e9f);
            scaled = mask.toType(DataType.FLOAT32, false).mul(scaled)
                .add(mask.logicalNot().toType(DataType.FLOAT32, false).mul(negInf));
        }
        // Softmax → sample via argmax (greedy among top-k)
        // For deterministic top-k, argmax of softmax = argmax of logits
        return scaled.argMax().getLong();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static long[] slideAndAppend(long[] ids, long token, int maxLen) {
        if (ids.length < maxLen) {
            long[] next = Arrays.copyOf(ids, ids.length + 1);
            next[ids.length] = token;
            return next;
        }
        // Slide window: drop first token, append new one
        long[] next = Arrays.copyOfRange(ids, 1, ids.length + 1);
        next[next.length - 1] = token;
        return next;
    }

    private static long[] toLongArray(List<Long> list) {
        long[] arr = new long[list.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = list.get(i);
        return arr;
    }

    private static long[] fallbackCharTokenize(String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        long[] ids = new long[bytes.length];
        for (int i = 0; i < bytes.length; i++) ids[i] = bytes[i] & 0xFF;
        return ids;
    }

    private static String fallbackCharDecode(long[] ids) {
        byte[] bytes = new byte[ids.length];
        for (int i = 0; i < ids.length; i++) bytes[i] = (byte) (ids[i] & 0xFF);
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static Path findOnnxFile(Path dir) {
        // Prefer: model.onnx > decoder_model.onnx > first *.onnx found
        for (String candidate : List.of("model.onnx", "decoder_model.onnx", "decoder_model_merged.onnx")) {
            Path p = dir.resolve(candidate);
            if (Files.isRegularFile(p)) return p;
        }
        try (Stream<Path> s = Files.list(dir)) {
            return s.filter(p -> p.toString().endsWith(".onnx"))
                .findFirst().orElse(null);
        } catch (Exception e) {
            return null;
        }
    }

    private static Path resolveDir(String dir) {
        Path p = Paths.get(dir);
        if (p.isAbsolute()) return p;
        return Paths.get(System.getProperty("user.dir")).resolve(p);
    }

    private String createErrorJson(String message, String code) {
        try {
            Map<String, Object> err = new HashMap<>();
            err.put("error", true);
            err.put("message", message);
            err.put("code", code);
            return objectMapper.writeValueAsString(err);
        } catch (Exception ex) {
            return "{\"error\":true,\"code\":\"" + code + "\"}";
        }
    }

    // ── BPE Tokenizer (GPT-2 byte-level, compatible with Qwen / Mistral / Llama) ─

    /**
     * Byte-level BPE tokenizer that reads {@code tokenizer.json} (HuggingFace format).
     * Supports Qwen2.5, Llama, Mistral, and any model using GPT-2's byte encoding scheme.
     */
    static final class BpeTokenizer {

        // GPT-2 byte encoder: raw byte → unicode codepoint
        private static final int[] BYTE_TO_CP = new int[256];
        // Reverse: unicode codepoint → raw byte (-1 if unmapped)
        private static final int[] CP_TO_BYTE = new int[65536];
        // GPT-2 pre-tokenization pattern (matches words, numbers, punctuation, whitespace)
        private static final Pattern PRE_TOK = Pattern.compile(
            "(?i:'s|'t|'re|'ve|'m|'ll|'d)" +
            "|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+" +
            "|\\p{N}{1,3}" +
            "| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*" +
            "|\\s*[\\r\\n]+" +
            "|\\s+(?!\\S)" +
            "|\\s+",
            Pattern.UNICODE_CHARACTER_CLASS
        );

        static {
            Arrays.fill(CP_TO_BYTE, -1);
            // Printable ASCII 33-126 → themselves
            for (int b = 33; b <= 126; b++) BYTE_TO_CP[b] = b;
            // Latin supplement 161-172, 174-255 → themselves
            for (int b = 161; b <= 172; b++) BYTE_TO_CP[b] = b;
            for (int b = 174; b <= 255; b++) BYTE_TO_CP[b] = b;
            // Non-printable bytes (0-32, 127-160, 173) → codepoints 256..323
            int extra = 256;
            for (int b = 0; b < 256; b++) {
                if (BYTE_TO_CP[b] == 0) BYTE_TO_CP[b] = extra++;
            }
            // Build reverse mapping
            for (int b = 0; b < 256; b++) {
                int cp = BYTE_TO_CP[b];
                if (cp < CP_TO_BYTE.length) CP_TO_BYTE[cp] = b;
            }
        }

        private final Map<String, Integer> vocab;
        private final String[] idToToken;   // indexed by token ID
        private final Map<String, Integer> mergeRanks; // "tokA tokB" → priority rank
        private final int eosTokenId;
        private final int unknownTokenId;

        private BpeTokenizer(Map<String, Integer> vocab,
                             Map<String, Integer> mergeRanks,
                             int eosTokenId,
                             int unknownTokenId) {
            this.vocab = vocab;
            this.mergeRanks = mergeRanks;
            this.eosTokenId = eosTokenId;
            this.unknownTokenId = unknownTokenId;
            int maxId = vocab.values().stream().mapToInt(i -> i).max().orElse(0);
            this.idToToken = new String[maxId + 1];
            vocab.forEach((tok, id) -> { if (id <= maxId) idToToken[id] = tok; });
        }

        int getEosTokenId()  { return eosTokenId; }
        int getVocabSize()   { return vocab.size(); }

        // ── Encode ────────────────────────────────────────────────────────────

        long[] encode(String text) {
            if (text == null || text.isEmpty()) return new long[0];

            List<Long> result = new ArrayList<>();
            Matcher m = PRE_TOK.matcher(text);
            while (m.find()) {
                String word = m.group();
                // Convert word's UTF-8 bytes to byte-unicode representation
                byte[] bytes = word.getBytes(StandardCharsets.UTF_8);
                List<String> chars = new ArrayList<>(bytes.length);
                for (byte b : bytes) chars.add(String.valueOf((char) BYTE_TO_CP[b & 0xFF]));
                // Apply BPE merges
                applyBpe(chars);
                // Map to token IDs
                for (String tok : chars) {
                    result.add((long) vocab.getOrDefault(tok, unknownTokenId));
                }
            }
            return toLongArr(result);
        }

        private void applyBpe(List<String> tokens) {
            while (tokens.size() > 1) {
                int bestRank = Integer.MAX_VALUE;
                int bestPos = -1;
                for (int i = 0; i < tokens.size() - 1; i++) {
                    Integer rank = mergeRanks.get(tokens.get(i) + " " + tokens.get(i + 1));
                    if (rank != null && rank < bestRank) {
                        bestRank = rank;
                        bestPos = i;
                    }
                }
                if (bestPos < 0) break;
                String merged = tokens.get(bestPos) + tokens.get(bestPos + 1);
                tokens.set(bestPos, merged);
                tokens.remove(bestPos + 1);
            }
        }

        // ── Decode ────────────────────────────────────────────────────────────

        String decode(long[] ids) {
            StringBuilder sb = new StringBuilder();
            for (long id : ids) {
                int iid = (int) id;
                if (iid >= 0 && iid < idToToken.length && idToToken[iid] != null) {
                    sb.append(idToToken[iid]);
                }
            }
            // Convert byte-unicode string back to UTF-8
            byte[] raw = new byte[sb.length()];
            int len = 0;
            for (int i = 0; i < sb.length(); i++) {
                int cp = sb.charAt(i);
                int b = (cp < CP_TO_BYTE.length) ? CP_TO_BYTE[cp] : -1;
                if (b >= 0) raw[len++] = (byte) b;
            }
            return new String(raw, 0, len, StandardCharsets.UTF_8);
        }

        // ── Loader ────────────────────────────────────────────────────────────

        static BpeTokenizer load(Path tokenizerJson, ObjectMapper mapper) throws IOException {
            JsonNode root = mapper.readTree(tokenizerJson.toFile());
            JsonNode model = root.path("model");

            // Vocabulary
            Map<String, Integer> vocab = new LinkedHashMap<>();
            model.path("vocab").fields()
                .forEachRemaining(e -> vocab.put(e.getKey(), e.getValue().asInt()));

            // Merges (list of "tokenA tokenB" strings, order = priority rank)
            Map<String, Integer> mergeRanks = new LinkedHashMap<>();
            int rank = 0;
            for (JsonNode merge : model.path("merges")) {
                mergeRanks.put(merge.asText(), rank++);
            }

            // EOS token – check common names in priority order
            int eosId = 0;
            for (String candidate : List.of("<|endoftext|>", "<|im_end|>", "</s>", "<eos>", "<EOS>")) {
                if (vocab.containsKey(candidate)) {
                    eosId = vocab.get(candidate);
                    break;
                }
            }
            // Also check added_tokens for eos_token markers
            for (JsonNode tok : root.path("added_tokens")) {
                boolean isEos = tok.path("special").asBoolean(false)
                    && (tok.path("content").asText("").contains("endoftext")
                        || tok.path("content").asText("").equals("<|im_end|>")
                        || tok.path("content").asText("").equals("</s>"));
                if (isEos) {
                    eosId = tok.path("id").asInt(eosId);
                    break;
                }
            }

            int unkId = vocab.getOrDefault("<unk>", vocab.getOrDefault("[UNK]", 0));
            return new BpeTokenizer(vocab, mergeRanks, eosId, unkId);
        }

        private static long[] toLongArr(List<Long> list) {
            long[] arr = new long[list.size()];
            for (int i = 0; i < arr.length; i++) arr[i] = list.get(i);
            return arr;
        }
    }
}
