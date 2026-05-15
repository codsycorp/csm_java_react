package net.phanmemmottrieu.service;

import de.kherud.llama.LlamaModel;
import de.kherud.llama.ModelParameters;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiLocalEmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(AiLocalEmbeddingService.class);
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_\\-$]{2,}");
    private static final String PROVIDER_AUTO = "auto";
    private static final String PROVIDER_HASH = "hash";
    private static final String PROVIDER_LLAMA = "llama_cpp_embedding";
    private static final String DEFAULT_PROBE_TEXT = "embedding probe text";
    private static final String NOMIC_QUERY_PREFIX = "search_query: ";
    private static final String NOMIC_DOCUMENT_PREFIX = "search_document: ";

    @Value("${ai.embedding.provider:auto}")
    private String provider;

    @Value("${ai.embedding.llama.enabled:true}")
    private boolean llamaEnabled;

    @Value("${ai.embedding.llama.model-path:}")
    private String llamaModelPath;

    @Value("${ai.embedding.llama.context-window:2048}")
    private int llamaContextWindow;

    @Value("${ai.embedding.llama.threads:1}")
    private int llamaThreads;

    @Value("${ai.embedding.llama.batch-size:32}")
    private int llamaBatchSize;

    @Value("${ai.embedding.llama.ubatch-size:16}")
    private int llamaUbatchSize;

    @Value("${ai.embedding.llama.gpu-layers:0}")
    private int llamaGpuLayers;

    @Value("${ai.embedding.llama.disable-kv-offload:true}")
    private boolean llamaDisableKvOffload;

    @Value("${ai.embedding.llama.probe-text:" + DEFAULT_PROBE_TEXT + "}")
    private String llamaProbeText;

    @Value("${ai.embedding.hash.dimensions:128}")
    private int hashDimensions;

    @Value("${ai.embedding.hash.fallback-enabled:true}")
    private boolean hashFallbackEnabled;

    private volatile EmbeddingRuntime runtime;
    private volatile String lastFailureReason = "";
    private volatile String lastResolvedProvider = "";

    public float[] embedText(String text) {
        return embedDocumentText(text);
    }

    public float[] embedQueryText(String text) {
        return runtime().embedQuery(String.valueOf(text == null ? "" : text));
    }

    public float[] embedDocumentText(String text) {
        return runtime().embedDocument(String.valueOf(text == null ? "" : text));
    }

    public int dimension() {
        return runtime().dimension();
    }

    public String providerKey() {
        return runtime().providerKey();
    }

    public String indexNamespace() {
        return runtime().indexNamespace();
    }

    public Map<String, Object> getStats() {
        EmbeddingRuntime activeRuntime = runtime();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestedProvider", normalizeProvider(provider));
        out.put("resolvedProvider", String.valueOf(lastResolvedProvider == null ? activeRuntime.providerKey() : lastResolvedProvider));
        out.put("enabledLlamaCppEmbedding", llamaEnabled);
        out.put("llamaEmbeddingModelPath", String.valueOf(llamaModelPath == null ? "" : llamaModelPath));
        out.put("hashFallbackEnabled", hashFallbackEnabled);
        out.put("dimension", activeRuntime.dimension());
        out.put("indexNamespace", activeRuntime.indexNamespace());
        out.put("osName", System.getProperty("os.name", "unknown"));
        out.put("osArch", System.getProperty("os.arch", "unknown"));
        out.put("javaVendor", System.getProperty("java.vendor", "unknown"));
        out.put("javaVersion", System.getProperty("java.version", "unknown"));
        out.put("runtimeStatus", PROVIDER_HASH.equals(activeRuntime.providerKey()) && !String.valueOf(lastFailureReason).isBlank() ? "fallback" : "active");
        out.put("lastFailureReason", String.valueOf(lastFailureReason == null ? "" : lastFailureReason));
        out.put("platformKey", buildPlatformKey());
        out.put("recommendedProvider", llamaEnabled ? PROVIDER_LLAMA : PROVIDER_HASH);
        out.put(
            "platformRecommendation",
            llamaEnabled
                ? "llama.cpp embeddings are enabled; configure ai.embedding.llama.model-path with an embedding-capable GGUF for best retrieval quality."
                : "Hash embeddings are active because llama.cpp embeddings are disabled."
        );
        return out;
    }

    private EmbeddingRuntime runtime() {
        EmbeddingRuntime current = runtime;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            current = runtime;
            if (current == null) {
                current = buildRuntime();
                runtime = current;
            }
            return current;
        }
    }

    private EmbeddingRuntime buildRuntime() {
        String requested = normalizeProvider(provider);
        if (shouldTryLlama(requested)) {
            EmbeddingRuntime llamaRuntime = tryBuildLlamaRuntime(requested);
            if (llamaRuntime != null) {
                lastResolvedProvider = llamaRuntime.providerKey();
                return llamaRuntime;
            }
            if (!hashFallbackEnabled && PROVIDER_LLAMA.equals(requested)) {
                throw new IllegalStateException("llama.cpp embedding runtime unavailable and hash fallback disabled");
            }
        } else if (!PROVIDER_AUTO.equals(requested) && !PROVIDER_HASH.equals(requested)) {
            lastFailureReason = "Unsupported embedding provider requested: " + requested + ". Falling back to hash.";
            if (!hashFallbackEnabled) {
                throw new IllegalStateException(lastFailureReason + " Enable hash fallback or set ai.embedding.provider=hash.");
            }
            log.warn(lastFailureReason);
        } else {
            lastFailureReason = "";
        }
        EmbeddingRuntime hashRuntime = new HashEmbeddingRuntime(Math.max(64, hashDimensions));
        lastResolvedProvider = hashRuntime.providerKey();
        log.info("AI embedding runtime active provider={} dimension={}", hashRuntime.providerKey(), hashRuntime.dimension());
        return hashRuntime;
    }

    private boolean shouldTryLlama(String requested) {
        if (!llamaEnabled) {
            return false;
        }
        return PROVIDER_AUTO.equals(requested) || PROVIDER_LLAMA.equals(requested);
    }

    private String normalizeProvider(String rawProvider) {
        String normalized = String.valueOf(rawProvider == null ? PROVIDER_AUTO : rawProvider).trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return PROVIDER_AUTO;
        }
        if (normalized.equals("llama") || normalized.equals("llama_cpp") || normalized.equals("llama-cpp") || normalized.equals("llama_embedding")) {
            return PROVIDER_LLAMA;
        }
        return normalized;
    }

    private EmbeddingRuntime tryBuildLlamaRuntime(String requestedProvider) {
        if (!llamaEnabled) {
            lastFailureReason = "llama.cpp embedding provider disabled";
            return null;
        }
        String rawPath = String.valueOf(llamaModelPath == null ? "" : llamaModelPath).trim();
        if (rawPath.isBlank()) {
            lastFailureReason = "No llama.cpp embedding GGUF configured (ai.embedding.llama.model-path)";
            if (PROVIDER_LLAMA.equals(requestedProvider)) {
                log.warn(lastFailureReason);
            }
            return null;
        }
        try {
            LlamaCppEmbeddingRuntime runtime = new LlamaCppEmbeddingRuntime(
                resolveModelPath(rawPath),
                llamaContextWindow,
                llamaThreads,
                llamaBatchSize,
                llamaUbatchSize,
                llamaGpuLayers,
                llamaDisableKvOffload,
                llamaProbeText
            );
            int dimension = runtime.dimension();
            lastFailureReason = "";
            log.info(
                "AI embedding runtime active provider={} dimension={} model={}",
                runtime.providerKey(),
                dimension,
                runtime.modelPath()
            );
            return runtime;
        } catch (Throwable ex) {
            lastFailureReason = compactFailureReason(ex);
            log.warn(
                "llama.cpp embedding runtime unavailable on platform={} fallback to hash embeddings: {}",
                buildPlatformKey(),
                lastFailureReason
            );
            return null;
        }
    }

    private String compactFailureReason(Throwable ex) {
        if (ex == null) {
            return "unknown";
        }
        Throwable current = ex;
        StringBuilder sb = new StringBuilder();
        int depth = 0;
        while (current != null && depth < 3) {
            String message = String.valueOf(current.getMessage() == null ? current.getClass().getSimpleName() : current.getMessage()).trim();
            if (!message.isBlank()) {
                if (sb.length() > 0) {
                    sb.append(" | ");
                }
                sb.append(message);
            }
            current = current.getCause();
            depth++;
        }
        return sb.length() > 0 ? sb.toString() : ex.getClass().getSimpleName();
    }

    private String buildPlatformKey() {
        return System.getProperty("os.name", "unknown") + "/" + System.getProperty("os.arch", "unknown");
    }

    private Path resolveModelPath(String rawPath) {
        Path path = Paths.get(String.valueOf(rawPath == null ? "" : rawPath).trim());
        if (!path.isAbsolute()) {
            path = Paths.get("").toAbsolutePath().normalize().resolve(path).normalize();
        }
        return path;
    }

    @PreDestroy
    void shutdown() {
        EmbeddingRuntime current = runtime;
        if (current instanceof AutoCloseable closeable) {
            try {
                closeable.close();
            } catch (Exception ex) {
                log.warn("Failed to close embedding runtime cleanly: {}", ex.getMessage());
            }
        }
    }

    private interface EmbeddingRuntime {
        float[] embedQuery(String text);

        float[] embedDocument(String text);

        int dimension();

        String providerKey();

        String indexNamespace();
    }

    private static final class LlamaCppEmbeddingRuntime implements EmbeddingRuntime, AutoCloseable {
        private final Path modelPath;
        private final int contextWindow;
        private final int threads;
        private final int batchSize;
        private final int ubatchSize;
        private final int gpuLayers;
        private final boolean disableKvOffload;
        private final String probeText;
        private final String modelKey;
        private final Object modelLock = new Object();

        private volatile LlamaModel model;
        private volatile int dimensions;

        private LlamaCppEmbeddingRuntime(
            Path modelPath,
            int contextWindow,
            int threads,
            int batchSize,
            int ubatchSize,
            int gpuLayers,
            boolean disableKvOffload,
            String probeText
        ) {
            this.modelPath = modelPath;
            this.contextWindow = Math.max(256, contextWindow);
            this.threads = Math.max(1, threads);
            this.batchSize = Math.max(16, batchSize);
            this.ubatchSize = Math.max(8, Math.min(this.batchSize, ubatchSize));
            this.gpuLayers = Math.max(0, gpuLayers);
            this.disableKvOffload = disableKvOffload;
            this.probeText = String.valueOf(probeText == null ? DEFAULT_PROBE_TEXT : probeText).trim().isBlank()
                ? DEFAULT_PROBE_TEXT
                : String.valueOf(probeText).trim();
            this.modelKey = sanitizeModelKey(modelPath.getFileName() == null ? "llama_embedding" : modelPath.getFileName().toString());
        }

        @Override
        public float[] embedQuery(String text) {
            return embedInternal(text, EmbeddingIntent.QUERY);
        }

        @Override
        public float[] embedDocument(String text) {
            return embedInternal(text, EmbeddingIntent.DOCUMENT);
        }

        private float[] embedInternal(String text, EmbeddingIntent intent) {
            float[] values;
            synchronized (modelLock) {
                values = ensureModelLoaded().embed(applyEmbeddingPrefix(nonBlank(text), intent));
            }
            if (values == null || values.length == 0) {
                int safeDimensions = dimension();
                float[] fallback = new float[safeDimensions];
                fallback[0] = 1.0f;
                return fallback;
            }
            recordDimensions(values.length);
            return normalize(copy(values), values.length);
        }

        @Override
        public int dimension() {
            int current = dimensions;
            if (current > 0) {
                return current;
            }
            synchronized (modelLock) {
                if (dimensions > 0) {
                    return dimensions;
                }
                float[] probe = ensureModelLoaded().embed(applyEmbeddingPrefix(probeText, EmbeddingIntent.DOCUMENT));
                if (probe == null || probe.length == 0) {
                    throw new IllegalStateException("llama.cpp embedding probe returned empty vector for model: " + modelPath);
                }
                recordDimensions(probe.length);
                return dimensions;
            }
        }

        @Override
        public String providerKey() {
            return PROVIDER_LLAMA;
        }

        @Override
        public String indexNamespace() {
            return "embedding_llama_cpp_" + dimension() + "_" + modelKey;
        }

        @Override
        public void close() {
            synchronized (modelLock) {
                if (model != null) {
                    model.close();
                    model = null;
                }
            }
        }

        private String modelPath() {
            return modelPath.toAbsolutePath().normalize().toString();
        }

        private LlamaModel ensureModelLoaded() {
            LlamaModel current = model;
            if (current != null) {
                return current;
            }
            synchronized (modelLock) {
                if (model != null) {
                    return model;
                }
                if (!Files.isRegularFile(modelPath)) {
                    throw new IllegalStateException("Embedding GGUF not found: " + modelPath.toAbsolutePath().normalize());
                }
                ModelParameters parameters = new ModelParameters()
                    .setModel(modelPath.toAbsolutePath().normalize().toString())
                    .enableEmbedding()
                    .setCtxSize(contextWindow)
                    .setThreads(threads)
                    .setThreadsBatch(threads)
                    .setBatchSize(batchSize)
                    .setUbatchSize(ubatchSize)
                    .setGpuLayers(gpuLayers);
                if (disableKvOffload) {
                    parameters.disableKvOffload();
                }
                model = new LlamaModel(parameters);
                return model;
            }
        }

        private void recordDimensions(int detectedDimensions) {
            if (detectedDimensions <= 0) {
                throw new IllegalStateException("Invalid embedding dimension from llama.cpp model: " + detectedDimensions);
            }
            if (dimensions == 0) {
                dimensions = detectedDimensions;
                return;
            }
            if (dimensions != detectedDimensions) {
                throw new IllegalStateException(
                    "Inconsistent llama.cpp embedding dimensions. expected=" + dimensions + ", actual=" + detectedDimensions
                );
            }
        }

        private String nonBlank(String text) {
            String normalized = String.valueOf(text == null ? "" : text).trim();
            return normalized.isBlank() ? probeText : normalized;
        }

        private String applyEmbeddingPrefix(String text, EmbeddingIntent intent) {
            String normalized = nonBlank(text);
            if (!requiresNomicPrefix()) {
                return normalized;
            }
            if (normalized.regionMatches(true, 0, NOMIC_QUERY_PREFIX, 0, NOMIC_QUERY_PREFIX.length())
                || normalized.regionMatches(true, 0, NOMIC_DOCUMENT_PREFIX, 0, NOMIC_DOCUMENT_PREFIX.length())) {
                return normalized;
            }
            return (intent == EmbeddingIntent.QUERY ? NOMIC_QUERY_PREFIX : NOMIC_DOCUMENT_PREFIX) + normalized;
        }

        private boolean requiresNomicPrefix() {
            return modelKey.contains("nomic_embed_text");
        }

        private static String sanitizeModelKey(String source) {
            String normalized = String.valueOf(source == null ? "llama_embedding" : source)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
            if (normalized.isBlank()) {
                return "llama_embedding";
            }
            return normalized.length() > 48 ? normalized.substring(0, 48) : normalized;
        }
    }

    private static final class HashEmbeddingRuntime implements EmbeddingRuntime {
        private final int dimensions;

        private HashEmbeddingRuntime(int dimensions) {
            this.dimensions = dimensions;
        }

        @Override
        public float[] embedQuery(String text) {
            return embedInternal(text);
        }

        @Override
        public float[] embedDocument(String text) {
            return embedInternal(text);
        }

        private float[] embedInternal(String text) {
            float[] vector = new float[dimensions];
            Matcher matcher = TOKEN_PATTERN.matcher(String.valueOf(text == null ? "" : text).toLowerCase(Locale.ROOT));
            int tokenCount = 0;
            while (matcher.find()) {
                String token = String.valueOf(matcher.group() == null ? "" : matcher.group()).trim();
                if (token.isBlank()) {
                    continue;
                }
                int index = Math.floorMod(token.hashCode(), dimensions);
                vector[index] += 1.0f;
                tokenCount++;
            }
            if (tokenCount <= 0) {
                vector[0] = 1.0f;
                return vector;
            }
            return normalize(vector, dimensions);
        }

        @Override
        public int dimension() {
            return dimensions;
        }

        @Override
        public String providerKey() {
            return PROVIDER_HASH;
        }

        @Override
        public String indexNamespace() {
            return "embedding_hash_" + dimensions;
        }
    }

    private enum EmbeddingIntent {
        QUERY,
        DOCUMENT
    }

    private static float[] copy(float[] source) {
        float[] out = new float[source.length];
        System.arraycopy(source, 0, out, 0, source.length);
        return out;
    }

    private static float[] normalize(float[] vector, int fallbackDimensions) {
        if (vector == null || vector.length == 0) {
            float[] fallback = new float[Math.max(1, fallbackDimensions)];
            fallback[0] = 1.0f;
            return fallback;
        }
        float norm = 0.0f;
        for (float value : vector) {
            norm += value * value;
        }
        norm = (float) Math.sqrt(norm);
        if (norm <= 0.0f) {
            vector[0] = 1.0f;
            return vector;
        }
        for (int i = 0; i < vector.length; i++) {
            vector[i] = vector[i] / norm;
        }
        return vector;
    }
}
