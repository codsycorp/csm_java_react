package net.phanmemmottrieu.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiStreamPartStoreService {

    private static final Logger log = LoggerFactory.getLogger(AiStreamPartStoreService.class);
    private static final Pattern PART_FILE_PATTERN = Pattern.compile("part-(\\d{6})\\.txt");

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${ai.code-stream.parts.store-dir:csm_datas/ai_local/stream_parts}")
    private String storeDir;

    @Value("${ai.code-stream.parts.retention-hours:72}")
    private int retentionHours;

    @Value("${ai.code-stream.parts.max-page-size:50}")
    private int maxPageSize;

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(resolveStoreRoot());
            cleanupOldJobs();
        } catch (Exception ex) {
            log.warn("AiStreamPartStoreService init failed: {}", ex.getMessage());
        }
    }

    public String normalizeJobId(String raw) {
        String safe = String.valueOf(raw == null ? "" : raw).trim();
        if (safe.isBlank()) {
            safe = "job_" + System.currentTimeMillis();
        }
        safe = safe.replaceAll("[^a-zA-Z0-9_\\-]", "_");
        if (safe.length() > 96) {
            safe = safe.substring(0, 96);
        }
        return safe;
    }

    public Map<String, Object> persistJob(
            String rawJobId,
            String requestId,
            String appId,
            String contextType,
            String responseMode,
            String model,
            List<String> parts,
            int totalChars,
            long createdAtMs) {
        String jobId = normalizeJobId(rawJobId);
        List<String> safeParts = parts == null ? List.of() : parts;
        long now = System.currentTimeMillis();

        synchronized (this) {
            try {
                Path jobDir = resolveJobDir(jobId);
                Files.createDirectories(jobDir);

                for (int i = 0; i < safeParts.size(); i++) {
                    String part = String.valueOf(safeParts.get(i) == null ? "" : safeParts.get(i));
                    String fileName = String.format(Locale.ROOT, "part-%06d.txt", i + 1);
                    writeAtomically(jobDir.resolve(fileName), part);
                }

                Map<String, Object> meta = new LinkedHashMap<>();
                meta.put("jobId", jobId);
                meta.put("requestId", String.valueOf(requestId == null ? "" : requestId));
                meta.put("appId", String.valueOf(appId == null ? "" : appId));
                meta.put("contextType", String.valueOf(contextType == null ? "" : contextType));
                meta.put("responseMode", String.valueOf(responseMode == null ? "" : responseMode));
                meta.put("model", String.valueOf(model == null ? "" : model));
                meta.put("totalParts", safeParts.size());
                meta.put("totalChars", Math.max(0, totalChars));
                meta.put("createdAt", createdAtMs > 0 ? createdAtMs : now);
                meta.put("updatedAt", now);
                meta.put("status", "completed");
                writeAtomically(jobDir.resolve("meta.json"), objectMapper.writeValueAsString(meta));

                cleanupOldJobs();

                return meta;
            } catch (Exception ex) {
                throw new IllegalStateException("Failed to persist job parts: " + ex.getMessage(), ex);
            }
        }
    }

    public Map<String, Object> getManifest(String rawJobId) {
        String jobId = normalizeJobId(rawJobId);
        Path metaPath = resolveJobDir(jobId).resolve("meta.json");
        if (!Files.isRegularFile(metaPath)) {
            return Map.of("exists", false, "jobId", jobId);
        }
        try {
            Map<String, Object> meta = objectMapper.readValue(
                    Files.readString(metaPath, StandardCharsets.UTF_8),
                    new TypeReference<Map<String, Object>>() {}
            );
            meta.put("exists", true);
            return meta;
        } catch (Exception ex) {
            return Map.of(
                    "exists", false,
                    "jobId", jobId,
                    "error", "Failed to read manifest: " + ex.getMessage()
            );
        }
    }

    public Map<String, Object> getPart(String rawJobId, int partIndex) {
        String jobId = normalizeJobId(rawJobId);
        int safePartIndex = Math.max(1, partIndex);
        Path jobDir = resolveJobDir(jobId);
        if (!Files.isDirectory(jobDir)) {
            return Map.of("exists", false, "jobId", jobId, "partIndex", safePartIndex);
        }

        String fileName = String.format(Locale.ROOT, "part-%06d.txt", safePartIndex);
        Path partPath = jobDir.resolve(fileName);
        if (!Files.isRegularFile(partPath)) {
            return Map.of("exists", false, "jobId", jobId, "partIndex", safePartIndex);
        }

        try {
            String content = Files.readString(partPath, StandardCharsets.UTF_8);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("exists", true);
            out.put("jobId", jobId);
            out.put("partIndex", safePartIndex);
            out.put("content", content);
            out.put("chars", content.length());
            out.put("label", "PART " + safePartIndex + "/" + countPartFiles(jobDir));
            return out;
        } catch (Exception ex) {
            return Map.of(
                    "exists", false,
                    "jobId", jobId,
                    "partIndex", safePartIndex,
                    "error", "Failed to read part: " + ex.getMessage()
            );
        }
    }

    public Map<String, Object> getPartsPage(String rawJobId, int page, int size) {
        String jobId = normalizeJobId(rawJobId);
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(Math.max(1, maxPageSize), size <= 0 ? 10 : size));
        Path jobDir = resolveJobDir(jobId);
        if (!Files.isDirectory(jobDir)) {
            return Map.of("exists", false, "jobId", jobId, "items", List.of());
        }

        try {
            List<Path> partFiles = listPartFiles(jobDir);
            int total = partFiles.size();
            int from = Math.min(total, (safePage - 1) * safeSize);
            int to = Math.min(total, from + safeSize);
            List<Map<String, Object>> items = new ArrayList<>();
            for (int i = from; i < to; i++) {
                Path partPath = partFiles.get(i);
                int partIndex = extractPartIndex(partPath.getFileName().toString());
                String content = Files.readString(partPath, StandardCharsets.UTF_8);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("partIndex", partIndex);
                item.put("label", "PART " + partIndex + "/" + total);
                item.put("chars", content.length());
                item.put("content", content);
                items.add(item);
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("exists", true);
            out.put("jobId", jobId);
            out.put("page", safePage);
            out.put("size", safeSize);
            out.put("totalParts", total);
            out.put("totalPages", Math.max(1, (total + safeSize - 1) / safeSize));
            out.put("items", items);
            return out;
        } catch (Exception ex) {
            return Map.of(
                    "exists", false,
                    "jobId", jobId,
                    "error", "Failed to read parts page: " + ex.getMessage()
            );
        }
    }

    public Map<String, Object> getPartsMetaPage(String rawJobId, int page, int size) {
        String jobId = normalizeJobId(rawJobId);
        int safePage = Math.max(1, page);
        int safeSize = Math.max(1, Math.min(Math.max(1, maxPageSize), size <= 0 ? 10 : size));
        Path jobDir = resolveJobDir(jobId);
        if (!Files.isDirectory(jobDir)) {
            return Map.of("exists", false, "jobId", jobId, "items", List.of());
        }

        try {
            List<Path> partFiles = listPartFiles(jobDir);
            int total = partFiles.size();
            int from = Math.min(total, (safePage - 1) * safeSize);
            int to = Math.min(total, from + safeSize);
            List<Map<String, Object>> items = new ArrayList<>();
            for (int i = from; i < to; i++) {
                Path partPath = partFiles.get(i);
                int partIndex = extractPartIndex(partPath.getFileName().toString());
                long chars = Files.size(partPath);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("partIndex", partIndex);
                item.put("label", "PART " + partIndex + "/" + total);
                item.put("chars", chars);
                items.add(item);
            }

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("exists", true);
            out.put("jobId", jobId);
            out.put("page", safePage);
            out.put("size", safeSize);
            out.put("totalParts", total);
            out.put("totalPages", Math.max(1, (total + safeSize - 1) / safeSize));
            out.put("items", items);
            return out;
        } catch (Exception ex) {
            return Map.of(
                    "exists", false,
                    "jobId", jobId,
                    "error", "Failed to read parts metadata page: " + ex.getMessage()
            );
        }
    }

    private Path resolveStoreRoot() {
        Path root = Paths.get(String.valueOf(storeDir == null ? "" : storeDir).trim());
        if (!root.isAbsolute()) {
            root = Paths.get(System.getProperty("user.dir"), root.toString());
        }
        return root.toAbsolutePath().normalize();
    }

    private Path resolveJobDir(String jobId) {
        return resolveStoreRoot().resolve(normalizeJobId(jobId));
    }

    private void writeAtomically(Path target, String content) throws Exception {
        Path parent = target.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Path temp = target.resolveSibling(target.getFileName().toString() + ".tmp");
        Files.writeString(temp, String.valueOf(content == null ? "" : content), StandardCharsets.UTF_8);
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private void cleanupOldJobs() {
        try {
            Path root = resolveStoreRoot();
            if (!Files.isDirectory(root)) {
                return;
            }
            long now = System.currentTimeMillis();
            long ttlMs = Math.max(1L, retentionHours) * 60L * 60L * 1000L;
            Files.list(root)
                    .filter(Files::isDirectory)
                    .forEach(dir -> {
                        try {
                            long lastModified = Files.getLastModifiedTime(dir).toMillis();
                            if ((now - lastModified) > ttlMs) {
                                deleteRecursively(dir);
                            }
                        } catch (Exception ignored) {
                        }
                    });
        } catch (Exception ex) {
            log.debug("cleanupOldJobs skipped: {}", ex.getMessage());
        }
    }

    private void deleteRecursively(Path root) throws Exception {
        if (!Files.exists(root)) {
            return;
        }
        List<Path> all = new ArrayList<>();
        Files.walk(root).forEach(all::add);
        all.sort(Comparator.reverseOrder());
        for (Path path : all) {
            Files.deleteIfExists(path);
        }
    }

    private int countPartFiles(Path jobDir) throws Exception {
        return listPartFiles(jobDir).size();
    }

    private List<Path> listPartFiles(Path jobDir) throws Exception {
        if (!Files.isDirectory(jobDir)) {
            return Collections.emptyList();
        }
        List<Path> parts = new ArrayList<>();
        Files.list(jobDir)
                .filter(Files::isRegularFile)
                .filter(path -> PART_FILE_PATTERN.matcher(path.getFileName().toString()).matches())
                .sorted(Comparator.comparingInt(path -> extractPartIndex(path.getFileName().toString())))
                .forEach(parts::add);
        return parts;
    }

    private int extractPartIndex(String fileName) {
        Matcher matcher = PART_FILE_PATTERN.matcher(String.valueOf(fileName == null ? "" : fileName));
        if (!matcher.matches()) {
            return 0;
        }
        try {
            return Integer.parseInt(matcher.group(1));
        } catch (Exception ex) {
            return 0;
        }
    }
}
