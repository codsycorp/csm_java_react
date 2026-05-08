package net.phanmemmottrieu.data;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;

import jakarta.annotation.PostConstruct;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

// import net.phanmemmottrieu.util.OSSUtil;

import org.rocksdb.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.*;
import java.util.stream.Collectors;

import javax.annotation.PreDestroy;

import java.util.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import org.apache.lucene.document.*;
import org.apache.lucene.index.*;
import org.apache.lucene.search.*;
import org.apache.lucene.store.FSDirectory;
import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.store.AlreadyClosedException;

@Component
public class RecordManager {

    private static final Logger logger = LoggerFactory.getLogger(RecordManager.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ConcurrentHashMap<String, RocksDBWrapper> dbMap = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, Object> dbLocks = new ConcurrentHashMap<>();
    // Lucene Indexing management
    private static final ConcurrentHashMap<String, IndexWriter> indexWriterCache = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, FSDirectory> indexDirectoryCache = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, Analyzer> indexAnalyzerCache = new ConcurrentHashMap<>();
    // Use a separate lock map for Lucene index operations to avoid deadlocks with RocksDB locks
    private static final ConcurrentHashMap<String, Object> luceneIndexLocks = new ConcurrentHashMap<>(); 
    private static final ConcurrentHashMap<String, SearcherManager> searcherManagerCache = new ConcurrentHashMap<>();
    
    // 🚀 PERFORMANCE OPTIMIZATION: Update Batching
    // Batch updates to reduce commit frequency and improve throughput
    private static final ConcurrentHashMap<String, UpdateBatchBuffer> updateBatchBuffers = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, ScheduledFuture<?>> batchFlushTasks = new ConcurrentHashMap<>();
    private static final int BATCH_SIZE = 50;  // Batch updates in groups of 50
    private static final long BATCH_TIMEOUT_MS = 50;   // Flush after 50ms (reduced from 100ms for near-real-time search consistency)
    private static final int DEFAULT_FILTER_TAKE = 500;
    private static final int MAX_FILTER_TAKE = 1000;
    private static final int MAX_LUCENE_SEARCH_HITS = 2000;
    private static final long MAX_RESPONSE_PAYLOAD_BYTES = 64L * 1024L * 1024L;
    private static final int MAX_FALLBACK_SCAN_KEYS = 500;
    private static final int REBUILD_REPAIR_BATCH_SIZE = 2000;
    private static final int MAX_SAFE_JSON_RECORD_BYTES = 32 * 1024 * 1024;
    private static final int MAX_FIND_SCAN_RECORDS = 2000;
    private static final int MAX_SAFE_FIND_RECORD_BYTES = 4 * 1024 * 1024;
    private static final long MAX_FIND_SCAN_BYTES = 16L * 1024L * 1024L;
    private static final int MAX_CONCURRENT_FIND_SCANS = 2;
    private static final int MAX_LUCENE_KEY_COLLECTION = 2000000;
    private static final int SMART_SCAN_BACKPRESSURE_STEP = 2000;
    private static final long SMART_SCAN_LOW_HEAP_BYTES = 256L * 1024L * 1024L;
    private static final int SMART_SCAN_SLEEP_MS = 1;
    private static final int SMART_SCAN_SLEEP_MS_LOW_HEAP = 8;

    private static final Set<String> STRICT_NO_SCAN_FIND_FIELDS = Set.of("refresh_token", "refresh", "app_token");
    private static final java.util.concurrent.Semaphore findScanConcurrencyGuard =
            new java.util.concurrent.Semaphore(MAX_CONCURRENT_FIND_SCANS, true);
    private static final ConcurrentHashMap<String, java.util.concurrent.atomic.LongAdder> luceneSearchTotal = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, java.util.concurrent.atomic.LongAdder> luceneSearchHit = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, java.util.concurrent.atomic.LongAdder> luceneSearchMiss = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, java.util.concurrent.atomic.LongAdder> luceneSearchRejected = new ConcurrentHashMap<>();
    private static final java.util.concurrent.atomic.AtomicBoolean shutdownInProgress = new java.util.concurrent.atomic.AtomicBoolean(false);
    // Guard: only one async Lucene rebuild per table at a time
    private static final ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicBoolean> tableRepairScheduled = new ConcurrentHashMap<>();
    // Timestamp (System.nanoTime) of last completed rebuild per table — prevents re-scheduling during in-flight queries
    private static final ConcurrentHashMap<String, Long> tableLastRebuildNanos = new ConcurrentHashMap<>();
    private static final long REBUILD_COOL_DOWN_NANOS = 3_000_000_000L; // 3 seconds
    // Schema cache: avoid hitting Lucene on every write just to look up table field lists
    private static final ConcurrentHashMap<String, List<String>> tableSchemaCache = new ConcurrentHashMap<>();
    private static final java.util.concurrent.ExecutorService repairExecutor =
        java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "LuceneRepair-Worker");
            t.setDaemon(true);
            return t;
        });

    private static final ScheduledExecutorService batchExecutor = 
        new java.util.concurrent.ScheduledThreadPoolExecutor(
            Math.max(2, Runtime.getRuntime().availableProcessors() / 2),
            r -> {
                Thread t = new Thread(r, "BatchFlush-Worker");
                t.setDaemon(true);
                return t;
            }
        );

    private static class UpdateBatchBuffer {
        final List<PendingIndexUpdate> updates = Collections.synchronizedList(new ArrayList<>());
        final Object lock = new Object();
        long lastFlushTime = System.currentTimeMillis();
    }

    private static class PendingIndexUpdate {
        String key;
        Map<String, Object> record;
        boolean isDelete;
        
        PendingIndexUpdate(String key, Map<String, Object> record, boolean isDelete) {
            this.key = key;
            this.record = record;
            this.isDelete = isDelete;
        }
    }

    public static final String PHONE = "0937.528.839";
    public static final String WRITEBY = "base._co.osa";

    // Stable key ordering for pagination/cursor. Prefer larger numeric IDs first.
    private static final Comparator<String> RECORD_KEY_COMPARATOR_DESC = (a, b) -> {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        try {
            long la = Long.parseLong(a);
            long lb = Long.parseLong(b);
            return Long.compare(lb, la);
        } catch (Exception ignored) {
        }
        return b.compareTo(a);
    };

    private static final Comparator<Map<String, Object>> RECORD_ROW_COMPARATOR_DESC = (a, b) -> {
        long ta = resolveRecordSortTimestamp(a);
        long tb = resolveRecordSortTimestamp(b);
        int tsCmp = Long.compare(tb, ta);
        if (tsCmp != 0) return tsCmp;

        String ida = a != null ? String.valueOf(a.getOrDefault("id", "")) : "";
        String idb = b != null ? String.valueOf(b.getOrDefault("id", "")) : "";
        try {
            long la = Long.parseLong(ida);
            long lb = Long.parseLong(idb);
            return Long.compare(lb, la);
        } catch (Exception ignored) {
        }
        return idb.compareTo(ida);
    };

    private static long resolveRecordSortTimestamp(Map<String, Object> row) {
        if (row == null) return 0L;
        long ts = parseEpochMillisLike(row.get("publish_date"));
        if (ts <= 0L) ts = parseEpochMillisLike(row.get("updated_at"));
        if (ts <= 0L) ts = parseEpochMillisLike(row.get("created_at"));
        if (ts <= 0L) ts = parseEpochMillisLike(row.get("id"));
        return ts;
    }

    private static long parseEpochMillisLike(Object value) {
        if (value == null) return 0L;

        if (value instanceof Number n) {
            long raw = n.longValue();
            if (raw > 0 && raw < 1_000_000_000_000L) {
                return raw * 1000L;
            }
            return Math.max(raw, 0L);
        }

        String s = String.valueOf(value).trim();
        if (s.isEmpty()) return 0L;

        try {
            long raw = Long.parseLong(s);
            if (raw > 0 && raw < 1_000_000_000_000L) {
                return raw * 1000L;
            }
            return Math.max(raw, 0L);
        } catch (Exception ignored) {
        }

        try {
            return Instant.parse(s).toEpochMilli();
        } catch (Exception ignored) {
        }

        try {
            return Instant.parse(s.replace(" ", "T") + "Z").toEpochMilli();
        } catch (Exception ignored) {
        }

        try {
            LocalDateTime dt = LocalDateTime.parse(s, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            return dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignored) {
        }

        try {
            LocalDateTime dt = LocalDateTime.parse(s, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            return dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignored) {
        }

        try {
            LocalDateTime dt = LocalDateTime.parse(s, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            return dt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        } catch (Exception ignored) {
        }

        return 0L;
    }

    private static void applySmartBackpressure(int processed) {
        if (processed <= 0 || (processed % SMART_SCAN_BACKPRESSURE_STEP) != 0) {
            return;
        }

        Runtime rt = Runtime.getRuntime();
        long usedHeap = rt.totalMemory() - rt.freeMemory();
        long freeHeap = rt.maxMemory() - usedHeap;
        int sleepMs = freeHeap < SMART_SCAN_LOW_HEAP_BYTES ? SMART_SCAN_SLEEP_MS_LOW_HEAP : SMART_SCAN_SLEEP_MS;
        if (sleepMs <= 0) {
            return;
        }

        try {
            Thread.sleep(sleepMs);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private String DIR_PATH; // <--- BỎ TỪ KHÓA 'static'

    // Spring sẽ inject giá trị từ application.properties vào biến này
    @Value("${app.data.dir}")
    private String injectedDirPath; // <--- Biến tạm để nhận giá trị

    
    // Static block chỉ còn giữ lại những thứ không phụ thuộc vào instance
    static {
        RocksDB.loadLibrary(); // RocksDB.loadLibrary() không phụ thuộc vào instance nào
    }
    
    @PostConstruct
    public void init() {
        // Gán DIR_PATH
        this.DIR_PATH = injectedDirPath; // Gán giá trị đã inject cho DIR_PATH
        logger.info("Đường dẫn dữ liệu đã được khởi tạo: {}", this.DIR_PATH);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            markShutdownAndStopRepairWorker();
            shutdownAllDatabases();
        }));

        // Background periodic Lucene commit — keeps writes durable without blocking every write request.
        // NRT SearcherManager already makes writes visible immediately via maybeRefresh();
        // this commit is only needed for crash-safety (survive restart from RocksDB rebuild).
        batchExecutor.scheduleWithFixedDelay(() -> {
            for (Map.Entry<String, IndexWriter> entry : indexWriterCache.entrySet()) {
                IndexWriter w = entry.getValue();
                if (w == null || !w.isOpen()) continue;
                try {
                    if (w.hasUncommittedChanges()) {
                        w.commit();
                        SearcherManager sm = searcherManagerCache.get(entry.getKey());
                        if (sm != null) sm.maybeRefresh();
                        logger.debug("Background commit flushed for {}", entry.getKey());
                    }
                } catch (Exception e) {
                    logger.warn("Background Lucene commit failed for {}: {}", entry.getKey(), e.getMessage());
                }
            }
        }, 10, 10, java.util.concurrent.TimeUnit.SECONDS);

        // Clean up RocksDB log files in all database folders
        String dbRoot = this.DIR_PATH + "/database";
        File dbRootDir = new File(dbRoot);
        if (dbRootDir.exists() && dbRootDir.isDirectory()) {
            File[] appDirs = dbRootDir.listFiles(File::isDirectory);
            if (appDirs != null) {
                for (File appDir : appDirs) {
                    File[] tableDirs = appDir.listFiles(File::isDirectory);
                    if (tableDirs != null) {
                        for (File tableDir : tableDirs) {
                            cleanRocksDBLogs(tableDir.getAbsolutePath());
                        }
                    }
                }
            }
        }
    }
    /**
     * Xóa các file log không cần thiết trong thư mục RocksDB (LOG, LOG.old, LOG.old.*, MANIFEST-*.old, *.old).
     * Không xóa file .sst, .ldb, CURRENT, MANIFEST, hoặc file đang sử dụng. Cẩn trọng như Rust.
     */
    private void cleanRocksDBLogs(String dbDirPath) {
        File dbDir = new File(dbDirPath);
        if (dbDir.exists() && dbDir.isDirectory()) {
            File[] files = dbDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    String name = file.getName();
                    boolean isLog = name.equals("LOG") || name.equals("LOG.old") || name.matches("LOG\\.old(\\..*)?");
                    boolean isManifestOld = name.matches("MANIFEST-\\d+\\.old") || (name.startsWith("MANIFEST-") && name.endsWith(".old"));
                    boolean isObsolete = name.endsWith(".old") && !name.endsWith(".sst.old") && !name.endsWith(".ldb.old");
                    boolean isCurrent = name.equals("CURRENT");
                    boolean isDataFile = name.endsWith(".sst") || name.endsWith(".ldb");
                    boolean isManifest = name.equals("MANIFEST") || name.matches("MANIFEST-\\d+");

                    // Chỉ xóa nếu là log hoặc manifest cũ, không xóa file dữ liệu hoặc file CURRENT/MANIFEST hiện tại
                    if ((isLog || isManifestOld || isObsolete) && !isCurrent && !isDataFile && !isManifest) {
                        boolean deleted = file.delete();
                        if (deleted) {
                            logger.info("Đã xóa file log không cần thiết: {}", file.getAbsolutePath());
                        } else {
                            logger.warn("Không thể xóa file log: {}", file.getAbsolutePath());
                        }
                    }
                }
            }
        }
    }
    public void shutdownAllDatabases() {
        shutdownInProgress.set(true);
        for (Map.Entry<String, RocksDBWrapper> entry : dbMap.entrySet()) {
            RocksDBWrapper wrapper = entry.getValue();
            if (wrapper != null) {
                try {
                    wrapper.close();
                    logger.info("Đã đóng DB: {}", entry.getKey());
                } catch (Exception e) {
                    logger.error("❌ Lỗi khi đóng DB {}: {}", entry.getKey(), e.getMessage());
                }
            }
        }
        // Keep dbMap entries (just closed) so isOwningHandle() returns false
        // and any concurrent request can detect stale handles instead of attempting a fresh open
        // against a still-registered native RocksDB path.
        dbMap.clear();
        dbLocks.clear();
    }    

    private void markShutdownAndStopRepairWorker() {
        shutdownInProgress.set(true);
        try {
            repairExecutor.shutdown();
            if (!repairExecutor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                repairExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            repairExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
    
    // 🚀 PERFORMANCE OPTIMIZATION: Batch flushing methods
    /**
     * Queue an index update (add/update) for batching.
     * Automatically flushes when batch reaches size limit or timeout occurs.
     */
    private void queueIndexUpdateForBatch(String appId, String tableName, String key, 
                                         Map<String, Object> record) {
        String indexKey = appId + "_" + tableName;
        UpdateBatchBuffer buffer = updateBatchBuffers.computeIfAbsent(indexKey, 
            k -> new UpdateBatchBuffer());
        
        synchronized (buffer.lock) {
            buffer.updates.add(new PendingIndexUpdate(key, record, false));
            
            // Check if should flush immediately (batch full)
            if (buffer.updates.size() >= BATCH_SIZE) {
                flushBatchUpdatesSync(indexKey);
            } else if (batchFlushTasks.get(indexKey) == null) {
                // Schedule timeout flush if not already scheduled
                scheduleBatchFlushTimer(indexKey);
            }
        }
    }
    
    /**
     * Queue an index deletion for batching.
     */
    private void queueIndexDeleteForBatch(String appId, String tableName, String key) {
        String indexKey = appId + "_" + tableName;
        UpdateBatchBuffer buffer = updateBatchBuffers.computeIfAbsent(indexKey, 
            k -> new UpdateBatchBuffer());
        
        synchronized (buffer.lock) {
            buffer.updates.add(new PendingIndexUpdate(key, null, true));
            
            if (buffer.updates.size() >= BATCH_SIZE) {
                flushBatchUpdatesSync(indexKey);
            } else if (batchFlushTasks.get(indexKey) == null) {
                scheduleBatchFlushTimer(indexKey);
            }
        }
    }
    
    /**
     * Schedule automatic flush after timeout
     */
    private void scheduleBatchFlushTimer(String indexKey) {
        batchFlushTasks.compute(indexKey, (k, existingTask) -> {
            if (existingTask != null && !existingTask.isDone()) {
                return existingTask;
            }
            return batchExecutor.schedule(() -> {
                try {
                    flushBatchUpdatesSync(indexKey);
                } catch (Exception e) {
                    logger.error("Error flushing batch for {}: {}", indexKey, e.getMessage(), e);
                } finally {
                    batchFlushTasks.remove(indexKey);
                }
            }, BATCH_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS);
        });
    }
    
    /**
     * PUBLIC method to force flush pending batch updates for a table
     * Called before socket notifications to ensure SearcherManager is refreshed
     */
    public void flushPendingBatchUpdates(String appId, String tableName) {
        String indexKey = appId + "_" + tableName;
        flushBatchUpdatesSync(indexKey);
    }

    /**
     * Flush all batched updates for a given index - SYNCHRONOUS
     * This ensures all updates are committed and SearcherManager is refreshed.
     */
    private void flushBatchUpdatesSync(String indexKey) {
        UpdateBatchBuffer buffer = updateBatchBuffers.get(indexKey);
        if (buffer == null || buffer.updates.isEmpty()) {
            return;
        }
        
        List<PendingIndexUpdate> updates;
        synchronized (buffer.lock) {
            if (buffer.updates.isEmpty()) {
                return;
            }
            updates = new ArrayList<>(buffer.updates);
            buffer.updates.clear();
            buffer.lastFlushTime = System.currentTimeMillis();
        }
        
        try {
            // Apply all updates to index
            String[] parts = indexKey.split("_", 2);
            String appId = parts[0];
            String tableName = parts.length > 1 ? parts[1] : "";
            
            IndexWriter writer = indexWriterCache.get(indexKey);
            if (writer != null && writer.isOpen()) {
                for (PendingIndexUpdate update : updates) {
                    if (update.isDelete) {
                        writer.deleteDocuments(new Term("_key", update.key));
                        logger.debug("Batch queued delete for key: {}", update.key);
                    } else {
                        Document doc = buildLuceneDocument(appId, tableName, update.key, update.record);
                        writer.updateDocument(new Term("_key", update.key), doc);
                        logger.debug("Batch queued update for key: {}", update.key);
                    }
                }
                
                // Single commit for entire batch
                writer.commit();
                logger.info("✅ Batch flushed {} updates for {}, single commit", updates.size(), indexKey);
                
                // Force refresh after commit
                SearcherManager searcherManager = searcherManagerCache.get(indexKey);
                if (searcherManager != null) {
                    boolean refreshed = searcherManager.maybeRefresh();
                    if (refreshed) {
                        logger.info("✅ SearcherManager REFRESHED after batch commit for: {}", indexKey);
                    }
                }
            }
        } catch (IOException e) {
            logger.error("Error flushing batch for {}: {}", indexKey, e.getMessage(), e);
        }
    }
    
    /**
     * Build a Lucene Document from key and record data
     */
    private Document buildLuceneDocument(String appId, String tableName, String key, Map<String, Object> record) {
        Document doc = new Document();

        // Store the RocksDB key
        doc.add(new StringField("_key", key, Field.Store.YES));

        // Keep Lucene document slim: only id + configured fieldsSearch.
        addSearchFieldsToDocument(doc, appId, tableName, key, record);

        return doc;
    }

    private List<String> resolveEffectiveSearchFields(String appId, String tableName) {
        LinkedHashSet<String> fields = new LinkedHashSet<>();
        fields.add("id");

        List<String> configured = getTableSearchKeys(appId, tableName, "fieldsSearch");
        if (configured != null) {
            for (String field : configured) {
                if (field == null) continue;
                String normalized = field.trim();
                if (normalized.isEmpty()) continue;
                fields.add(normalized);
            }
        }

        return new ArrayList<>(fields);
    }

    private static long bumpMetric(ConcurrentHashMap<String, java.util.concurrent.atomic.LongAdder> metrics, String tableKey) {
        java.util.concurrent.atomic.LongAdder adder = metrics.computeIfAbsent(tableKey, k -> new java.util.concurrent.atomic.LongAdder());
        adder.increment();
        return adder.longValue();
    }

    private static void collectQueryFields(SearchFilter filter, Set<String> fields) {
        if (filter == null) return;

        if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
            for (SearchFilter sub : filter.getConditions()) {
                collectQueryFields(sub, fields);
            }
            return;
        }

        String field = filter.getField();
        if (field != null) {
            String normalized = field.trim();
            if (!normalized.isEmpty()) {
                fields.add(normalized);
            }
        }
    }

    private static SearchFilter unwrapSingleLeafCondition(SearchFilter filter) {
        if (filter == null) return null;

        if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
            if (filter.getConditions().size() != 1) {
                return null;
            }
            return unwrapSingleLeafCondition(filter.getConditions().get(0));
        }
        return filter;
    }

    private static boolean isBlankLikeValue(Object value) {
        if (value == null) return true;
        String s = String.valueOf(value).trim();
        return s.isEmpty()
                || "*".equals(s)
                || "%".equals(s)
                || "**".equals(s)
                || "%%".equals(s)
                || "*%".equals(s)
                || "%*".equals(s);
    }

    private static boolean isStrictNoScanFindFilter(SearchFilter filter) {
        SearchFilter leaf = unwrapSingleLeafCondition(filter);
        if (leaf == null || leaf.getField() == null || leaf.getType() == null) {
            return false;
        }

        if (!"eq".equalsIgnoreCase(leaf.getType().trim())) {
            return false;
        }

        String normalizedField = leaf.getField().trim().toLowerCase(Locale.ROOT);
        return STRICT_NO_SCAN_FIND_FIELDS.contains(normalizedField);
    }

    private boolean isDirectRocksDbBypassFilter(SearchFilter filter) {
        SearchFilter leaf = unwrapSingleLeafCondition(filter);
        if (leaf == null) return false;

        String field = leaf.getField();
        String type = leaf.getType();
        if (field == null || type == null) return false;

        String normalizedType = type.trim().toLowerCase(Locale.ROOT);
        if (!"like".equals(normalizedType)) {
            return false;
        }

        // Special-case optimization: only bypass Lucene for single-condition `id like ""` style queries.
        if (!"id".equalsIgnoreCase(field.trim())) {
            return false;
        }

        return isBlankLikeValue(leaf.getValue());
    }

    private boolean isFilterLuceneCompatible(String appId, String tableName, SearchFilter filters) {
        if (filters == null) {
            return true;
        }

        Set<String> queriedFields = new HashSet<>();
        collectQueryFields(filters, queriedFields);
        if (queriedFields.isEmpty()) {
            return true;
        }

        Set<String> allowedFields = new HashSet<>(resolveEffectiveSearchFields(appId, tableName));
        allowedFields.add("_key");

        for (String field : queriedFields) {
            if (!allowedFields.contains(field)) {
                return false;
            }
        }
        return true;
    }

    private void addSearchFieldsToDocument(Document doc, String appId, String tableName, String key, Map<String, Object> record) {
        Map<String, Object> safeRecord = record != null ? record : Collections.emptyMap();
        List<String> effectiveSearchFields = resolveEffectiveSearchFields(appId, tableName);

        for (String field : effectiveSearchFields) {
            Object rawValue = "id".equals(field) ? safeRecord.getOrDefault("id", key) : safeRecord.get(field);
            if (rawValue == null) continue;

            String valueText = String.valueOf(rawValue);
            if (valueText.length() > 32766) {
                logger.warn("⚠ Trường '{}' của bản ghi với RocksDB key '{}' quá dài ({} ký tự), bỏ qua lập chỉ mục.",
                        field, key, valueText.length());
                continue;
            }

            String keywordValue = valueText.toLowerCase(Locale.ROOT);
            if ("id".equals(field)) {
                doc.add(new StringField("id", valueText, Field.Store.YES));
                doc.add(new StringField("id.keyword", keywordValue, Field.Store.NO));
            } else {
                doc.add(new StringField(field + ".keyword", keywordValue, Field.Store.NO));
            }
        }
    }
    
    @PreDestroy // Crucial for automatic resource cleanup on application shutdown
    private void closeAllManagedLuceneResources() {
        markShutdownAndStopRepairWorker();

        // Flush any remaining batched updates before shutdown
        logger.info("Flushing {} batched update buffers before shutdown", updateBatchBuffers.size());
        for (String indexKey : updateBatchBuffers.keySet()) {
            try {
                flushBatchUpdatesSync(indexKey);
            } catch (Exception e) {
                logger.warn("Error flushing batch during shutdown for {}: {}", indexKey, e.getMessage());
            }
        }
        updateBatchBuffers.clear();
        
        // Cancel any pending timers
        for (ScheduledFuture<?> task : batchFlushTasks.values()) {
            if (task != null) {
                task.cancel(false);
            }
        }
        batchFlushTasks.clear();
        
        // Shutdown batch executor
        try {
            batchExecutor.shutdown();
            if (!batchExecutor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                batchExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            batchExecutor.shutdownNow();
        }

        shutdownAllDatabases();
        logger.info("Starting cleanup: Closing all Lucene IndexWriters, Directories, and Analyzers.");

        // 1. Close IndexWriters and commit any pending changes
        logger.info("Closing all Lucene IndexWriters.");
        for (Map.Entry<String, IndexWriter> entry : indexWriterCache.entrySet()) {
            String indexKey = entry.getKey();
            // Ensure a lock object exists for this indexKey, creating if absent.
            // This is important for synchronized access during shutdown.
            Object lock = luceneIndexLocks.computeIfAbsent(indexKey, k -> new Object());

            synchronized (lock) { // Synchronize to prevent concurrent modifications/access
                try {
                    IndexWriter writer = entry.getValue();
                    if (writer != null && writer.isOpen()) {
                        logger.debug("Committing changes for IndexWriter: {}", indexKey);
                        writer.commit(); // Ensure all pending changes are flushed to disk
                        logger.debug("Closing IndexWriter: {}", indexKey);
                        writer.close();
                        logger.info("Successfully closed IndexWriter for index: {}", indexKey);
                    } else {
                        logger.warn("IndexWriter for index {} is null or not open. Skipping close.", indexKey);
                    }
                } catch (IOException e) {
                    logger.error("Error closing IndexWriter for index {}: {}", indexKey, e.getMessage(), e);
                }
            }
        }
        indexWriterCache.clear(); // Clear the cache after attempting to close all writers
        logger.info("All Lucene IndexWriters have been processed and cache cleared.");

        // 2. Close Lucene Directories
        logger.info("Closing all Lucene Directories.");
        for (Map.Entry<String, FSDirectory> entry : indexDirectoryCache.entrySet()) {
            String indexKey = entry.getKey();
            try {
                FSDirectory dir = entry.getValue();
                if (dir != null) {
                    logger.debug("Closing Directory for index: {}", indexKey);
                    dir.close();
                    logger.info("Successfully closed Directory for index: {}", indexKey);
                } else {
                    logger.warn("Directory for index {} is null. Skipping close.", indexKey);
                }
            } catch (IOException e) {
                logger.error("Error closing Directory for index {}: {}", indexKey, e.getMessage(), e);
            }
        }
        indexDirectoryCache.clear(); // Clear the cache after attempting to close all directories
        logger.info("All Lucene Directories have been processed and cache cleared.");

        // 3. Close Lucene Analyzers
        logger.info("Closing all Lucene Analyzers.");
        for (Map.Entry<String, Analyzer> entry : indexAnalyzerCache.entrySet()) {
            String indexKey = entry.getKey();
            try {
                Analyzer analyzer = entry.getValue();
                if (analyzer != null) {
                    logger.debug("Closing Analyzer for index: {}", indexKey);
                    analyzer.close();
                    logger.info("Successfully closed Analyzer for index: {}", indexKey);
                } else {
                    logger.warn("Analyzer for index {} is null. Skipping close.", indexKey);
                }
            } catch (Exception e) { // Analyzer.close() can throw a generic Exception
                logger.error("Error closing Analyzer for index {}: {}", indexKey, e.getMessage(), e);
            }
        }
        indexAnalyzerCache.clear(); // Clear the cache after attempting to close all analyzers
        logger.info("All Lucene Analyzers have been processed and cache cleared.");

        // 4. Clear the locks map
        luceneIndexLocks.clear();
        logger.info("Lucene index locks cache cleared.");

        logger.info("Cleanup completed: All Lucene resources have been processed.");
    }
    public File getStaticFile(String relativePath) {
        String basePath = DIR_PATH + "/public/"; // Ví dụ: /path/to/app/public/
        File file = new File(basePath, relativePath); // Ví dụ: /path/to/app/public/assets/dxdatagrid/css/icons/dxicons.woff2
    
        // logger.debug() instead of logger.info() to reduce verbose logging for every static file request
        logger.debug("DIR_PATH value: {}", DIR_PATH);
        logger.debug("Calculated basePath: {}", basePath);
        logger.debug("Requested relativePath: {}", relativePath);
        logger.debug("Full absolute path being checked by Java: {}", file.getAbsolutePath());
    
        if (!file.exists()) {
            logger.warn("File does NOT exist at the path: {}", file.getAbsolutePath());
            // Kiểm tra quyền của thư mục cha
            File parentDir = file.getParentFile();
            if (parentDir != null && parentDir.exists() && !parentDir.canRead()) {
                 logger.error("Parent directory '{}' exists but is NOT readable by the application!", parentDir.getAbsolutePath());
            }
            return null;
        }
    
        if (!file.isFile()) {
            logger.warn("Path exists but is NOT a regular file: {}", file.getAbsolutePath());
            return null;
        }
    
        logger.info("File found and is a regular file: {}", file.getAbsolutePath());
        return file;
    }
    
    public void downloadAndUnzipFromOSS(String duong_dan_zip,Integer state,String toi_duong_dan) {
        String duong_dan=DIR_PATH;
        if(toi_duong_dan!=null && !toi_duong_dan.isEmpty())
            duong_dan=duong_dan+"/"+toi_duong_dan;
        if(state==1||state==2)
            deleteAllFilesInFolder(duong_dan);
        // if(state==2||state==3)
        //     OSSUtil.downloadAndUnzipFromOSS(duong_dan_zip, Paths.get(duong_dan));
    }

    public void backupDbM(String appId, String tableName) {
        String dbRootDir = DIR_PATH + "/database";
        String backupRootDir = "backups";
        String ossPrefixBase = "csm_backups";
    
        File rootDir = new File(dbRootDir);
        if (!rootDir.exists() || !rootDir.isDirectory()) {
            // OSSUtil.log("⚠️ Không tìm thấy thư mục gốc: " + dbRootDir);
            return;
        }
    
        File[] appDirs = rootDir.listFiles(File::isDirectory);
        if (appDirs == null || appDirs.length == 0) {
            // OSSUtil.log("⚠️ Không có app nào trong thư mục: " + dbRootDir);
            return;
        }
    
        for (File appDir : appDirs) {
            String currentAppId = appDir.getName();
    
            // Nếu có appId và appId không khớp với currentAppId, bỏ qua
            if (appId != null && !appId.isEmpty() && !currentAppId.equals(appId)) {
                continue;
            }
    
            File[] tableDirs = appDir.listFiles(File::isDirectory);
            if (tableDirs == null || tableDirs.length == 0) continue;
    
            for (File tableDir : tableDirs) {
                String currentTable = tableDir.getName();
    
                // Nếu có tableName và tableName không khớp với currentTable, bỏ qua
                if (tableName != null && !tableName.isEmpty() && !currentTable.equals(tableName)) {
                    continue;
                }
    
                String dbPath = tableDir.getAbsolutePath();
                File currentFile = new File(dbPath + "/CURRENT");
    
                // Kiểm tra xem thư mục có phải là RocksDB không
                if (!currentFile.exists()) {
                    // OSSUtil.log("⚠️ Bỏ qua vì không phải RocksDB: " + currentAppId + "/" + currentTable);
                    continue;
                }
    
                // Đường dẫn backup
                String backupDir = Paths.get(backupRootDir, currentAppId, currentTable).toString();
                String ossPrefix = ossPrefixBase + "/" + currentAppId + "/" + currentTable;
    
                try {
                    // Mở DB trước khi backup
                    RocksDBBackupManager manager = new RocksDBBackupManager(dbPath, backupDir, ossPrefix);
                    // OSSUtil.log("✅ Chuẩn bị backup database: " + dbPath);
                    RocksDB db = getDatabaseWithBloomFilter(currentAppId, currentTable);
                    // Backup về local
                    // OSSUtil.log("📦 Backup về local tại: " + backupDir);
                    manager.backupToLocal(db);
    
                    // Kiểm tra backupDir đã chứa các file backup hay chưa
                    File backupDirFile = new File(backupDir);
                    boolean hasData = containsBackupData(backupDirFile);
                    if (!hasData) {
                        // OSSUtil.log("❌ Không tìm thấy dữ liệu backup hợp lệ (.sst, MANIFEST, LATEST_BACKUP...) trong: " + backupDir);
                        continue;
                    }
    
                    // Upload backup lên OSS
                    // OSSUtil.log("⬆️ Upload backup lên OSS: " + ossPrefix);
                    // OSSUtil.uploadFolder(backupDirFile.toPath(), ossPrefix);
                    // OSSUtil.log("✅ Đã hoàn tất backup và upload cho: " + currentAppId + "/" + currentTable);
                } catch (Exception e) {
                    // OSSUtil.log("❌ Lỗi khi backup " + currentAppId + "/" + currentTable + ": " + e.getMessage());
                    e.printStackTrace();
                }
            }
        }
    }
    
    // 🔍 Kiểm tra xem thư mục backup có chứa file dữ liệu thật sự chưa (file .sst, MANIFEST, LATEST_BACKUP, ...)
    private static boolean containsBackupData(File backupDir) {
        if (!backupDir.exists() || !backupDir.isDirectory()) return false;
    
        // Kiểm tra các thư mục phiên bản trong backupDir
        File[] versionDirs = backupDir.listFiles(File::isDirectory);
        if (versionDirs == null || versionDirs.length == 0) return false;
    
        // Kiểm tra các file trong mỗi thư mục phiên bản
        for (File version : versionDirs) {
            File[] files = version.listFiles();
            if (files == null) continue;
    
            // Kiểm tra các file dữ liệu quan trọng như .sst, MANIFEST, LATEST_BACKUP
            for (File file : files) {
                String name = file.getName().toLowerCase();
                if (name.endsWith(".sst") || name.contains("manifest") || name.contains("latest")) {
                    return true; // Đảm bảo backup có dữ liệu quan trọng
                }
            }
        }
        return false; // Không tìm thấy dữ liệu hợp lệ
    }        

    public void restoreDbM(String appId, String tableName) {
        String dbRootDir = DIR_PATH + "/database";
        String backupRootDir = "backups";
        String ossPrefixBase = "csm_backups";
    
        try {
            if (appId == null || appId.isEmpty()) {
                // Tải toàn bộ thư mục csm_backups/*
                // logger.info("⬇️ Tải toàn bộ backup từ OSS: {}", ossPrefixBase);
                // OSSUtil.downloadFolder(ossPrefixBase, Paths.get(backupRootDir));
                // OSSUtil.log("✅ Đã tải toàn bộ backup từ OSS.");
    
                // Loop từng app → bảng → restore
                File backupRoot = new File(backupRootDir);
                for (File appFolder : backupRoot.listFiles(File::isDirectory)) {
                    String appIdFound = appFolder.getName();
                    for (File tableFolder : appFolder.listFiles(File::isDirectory)) {
                        String tableNameFound = tableFolder.getName();
                        restoreSingleTable(appIdFound, tableNameFound, dbRootDir, backupRootDir, ossPrefixBase);
                    }
                }
                return;
            }
    
            if (tableName == null || tableName.isEmpty()) {
                // Tải toàn bộ appId/*
                String ossPrefix = ossPrefixBase + "/" + appId;
                Path localBackupDir = Paths.get(backupRootDir, appId);
                // logger.info("⬇️ Tải toàn bộ dữ liệu appId={} từ OSS: {}", appId, ossPrefix);
                // OSSUtil.downloadFolder(ossPrefix, localBackupDir);
                // OSSUtil.log("✅ Đã tải toàn bộ database của appId: " + appId);
    
                // Loop từng bảng trong app → restore
                File appFolder = new File(localBackupDir.toString());
                for (File tableFolder : appFolder.listFiles(File::isDirectory)) {
                    String tableNameFound = tableFolder.getName();
                    restoreSingleTable(appId, tableNameFound, dbRootDir, backupRootDir, ossPrefixBase);
                }
                return;
            }
    
            // Trường hợp cụ thể 1 bảng
            restoreSingleTable(appId, tableName, dbRootDir, backupRootDir, ossPrefixBase);
    
        } catch (Exception e) {
            String errorMsg = "❌ Lỗi khi khôi phục dữ liệu: " + e.getMessage();
            // OSSUtil.log(errorMsg);
            logger.error(errorMsg, e);
        }
    }
    public static Map<String, Object> deserializeToMap(byte[] data) throws IOException {
        // Tạo ObjectMapper từ Jackson
        ObjectMapper objectMapper = new ObjectMapper();
        
        // Chuyển byte[] thành Map<String, Object>
        return objectMapper.readValue(data, Map.class);
    }
    private static Object deserializeToObject(byte[] data) {
        try {
            return new ObjectMapper().readValue(data, Object.class);
        } catch (Exception e) {
            logger.warn("Lỗi deserialize: {}", e.getMessage());
            return null;
        }
    }
    
    public List<String> getTableSearchKeys(String appId, String tableName, String fieldType) {
        if ("index".equalsIgnoreCase(tableName)) {
            return List.of("id");
        }
        // Cache schema per (appId, tableName, fieldType) — normalize key nhất quán với getDatabaseWithBloomFilter.
        // Tránh cache miss khi cùng table nhưng appId khác case/whitespace.
        String safeAppId;
        String safeTableName;
        try {
            safeAppId = sanitizePathSegment(appId, "app_id");
            safeTableName = sanitizePathSegment(tableName, "table_name");
        } catch (IllegalArgumentException e) {
            logger.warn("getTableSearchKeys: appId/tableName không hợp lệ — {}", e.getMessage());
            return List.of();
        }
        String cacheKey = safeAppId + "_" + safeTableName + "_" + fieldType;
        List<String> cached = tableSchemaCache.get(cacheKey);
        if (cached != null) return cached;

        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue(tableName);
        try {
            Map<String, Object> tableStruct = find(safeAppId, "index", filter);
            if (tableStruct == null) {
                logger.warn("Không tìm thấy cấu trúc bảng '{}' trong bảng 'index'.", tableName);
                return List.of();
            }
            Object structObj = tableStruct.get("struct");
            if (structObj instanceof Map<?, ?> structMapRaw) {
                Object pkObj = structMapRaw.get(fieldType);
                if (pkObj instanceof List<?> list) {
                    List<String> result = list.stream()
                            .filter(o -> o instanceof String)
                            .map(Object::toString)
                            .toList();
                    tableSchemaCache.put(cacheKey, result);
                    return result;
                }
            }
        } catch (Exception e) {
            logger.error("❌ Lỗi khi lấy {} cho bảng {}: {}", fieldType, tableName, e.getMessage(), e);
        }
        return List.of();
    }
        
    // Manages a single, shared IndexWriter instance per index
    // FALLBACK SAFETY: If write lock is unavailable (contention during heavy concurrent load),
    // gracefully degrade to read-only SearcherManager instead of blocking indefinitely
    private IndexWriter getOrCreateSharedIndexWriter(String appId, String tableName) throws IOException {
        // Chuẩn hóa qua sanitizePathSegment — nhất quán với getDatabaseWithBloomFilter
        String safeAppId = sanitizePathSegment(appId, "app_id");
        String safeTableName = sanitizePathSegment(tableName, "table_name");
        String indexKey = safeAppId + "_" + safeTableName;
        luceneIndexLocks.putIfAbsent(indexKey, new Object()); // Ensure a lock object exists for this index

        // Attempt to acquire lock with timeout to avoid indefinite blocking during heavy contention
        Object lockObj = luceneIndexLocks.get(indexKey);
        boolean lockAcquired = false;
        try {
            // Use a short timeout (500ms) to detect if we're in a contention situation
            lockAcquired = ((Object) lockObj instanceof java.util.concurrent.locks.ReentrantLock) 
                ? ((java.util.concurrent.locks.ReentrantLock) lockObj).tryLock(500, java.util.concurrent.TimeUnit.MILLISECONDS)
                : true; // Fall back to synchronized if not a ReentrantLock
            
            if (!lockAcquired) {
                // Lock acquisition timeout — likely heavy contention on this index
                // Log warning and attempt to return cached writer if available
                logger.warn("⚠️ Write lock acquisition timeout for index {} — possible Lucene contention under concurrent load. Will attempt to use cached writer if available.", indexKey);
                IndexWriter cachedWriter = indexWriterCache.get(indexKey);
                if (cachedWriter != null && cachedWriter.isOpen()) {
                    logger.info("✅ Returning cached IndexWriter for {} despite lock timeout (fallback to potentially stale index)", indexKey);
                    return cachedWriter;
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.warn("Write lock acquisition interrupted for index {}", indexKey);
        }

        synchronized (lockObj) {
            // Double-check after acquiring lock
            // Check if writer already exists in cache and is open
            IndexWriter existingWriter = indexWriterCache.get(indexKey);
            if (existingWriter != null && existingWriter.isOpen()) {
                return existingWriter;
            }

            // If not open or not in cache, create a new one
            Path indexPath = Paths.get(DIR_PATH, "lucene_index", safeAppId, safeTableName).normalize();
            Files.createDirectories(indexPath); // Ensure directory exists

            FSDirectory directory = indexDirectoryCache.computeIfAbsent(indexKey, k -> {
                try {
                    return FSDirectory.open(indexPath);
                } catch (IOException e) {
                    logger.error("Failed to open FSDirectory for indexKey {}: {}", indexKey, e.getMessage(), e);
                    throw new UncheckedIOException(e);
                }
            });

            Analyzer analyzer = indexAnalyzerCache.computeIfAbsent(indexKey, k -> new StandardAnalyzer());

            IndexWriterConfig config = new IndexWriterConfig(analyzer);
            config.setRAMBufferSizeMB(128); // 128MB — tăng từ 64MB, giảm flush frequency của Lucene
            config.setOpenMode(IndexWriterConfig.OpenMode.CREATE_OR_APPEND); // Create if not exists, append if it does

            IndexWriter writer = new IndexWriter(directory, config);
            indexWriterCache.put(indexKey, writer);
            logger.info("Initialized shared IndexWriter for index: {}", indexKey);
            return writer;
        }
    }
    /**
     * Initializes/populates the Lucene index for a given application and table from RocksDB.
     * This method iterates through all records in RocksDB, extracts relevant fields
     * (including 'id' and primary keys), and adds them to the Lucene index.
     *
     * @param appId The application ID.
     * @param tableName The table name.
     * @throws IOException if an error occurs during index initialization.
     */
    private void initializeLuceneIndexFromRocksDB(String appId, String tableName) throws IOException {
        String indexKey = appId + "_" + tableName;
        // Lock is already acquired in getSearcherManager or indexExistingRecords if called from there.
        // Assuming this method is called within a synchronized block if concurrent access is an issue.

        RocksDB db = null;
        IndexWriter writer = null;
        RocksIterator iterator = null;

        try {
            // migrateKeys(appId,tableName); // Giả định bạn đã chạy migrateKeys riêng hoặc không cần ở đây

            db = getDatabaseWithBloomFilter(appId, tableName); // Get RocksDB instance
            writer = getOrCreateSharedIndexWriter(appId, tableName); // Get IndexWriter

            logger.info("Starting to populate Lucene index for {} from RocksDB.", indexKey);

            // Always clear existing docs before repopulating to prevent duplicate Lucene documents.
            writer.deleteAll();

            iterator = db.newIterator();
            iterator.seekToFirst();
            List<Document> buffer = new ArrayList<>();
            int count = 0;
            final int batchSize = 1000; // Batch size for adding documents

            while (iterator.isValid()) {
                byte[] keyBytes = iterator.key();
                byte[] valueBytes = iterator.value();

                Object obj = deserializeToObject(valueBytes); // Giả định hàm này chuyển byte[] thành Object
                if (!(obj instanceof Map<?, ?> rawMap)) {
                    logger.warn("Bản ghi với key '{}' không phải là Map, bỏ qua lập chỉ mục.", new String(keyBytes, StandardCharsets.UTF_8));
                    iterator.next();
                    continue;
                }

                Map<String, Object> record = new HashMap<>();
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    if (entry.getKey() instanceof String keyStr) {
                        record.put(keyStr, entry.getValue());
                    }
                }

                String keyStr = new String(keyBytes, StandardCharsets.UTF_8);
                Document doc = buildLuceneDocument(appId, tableName, keyStr, record);

                buffer.add(doc);
                count++;

                if (count % batchSize == 0) {
                    writer.addDocuments(buffer);
                    buffer.clear();
                    logger.debug("Indexed {} documents for {}. Current count: {}", batchSize, indexKey, count);
                }

                iterator.next();
            }

            if (!buffer.isEmpty()) {
                writer.addDocuments(buffer);
            }

            writer.commit(); // IMPORTANT: Commit changes to write index files to disk
            logger.info("Successfully populated Lucene index for {} with {} documents from RocksDB.", indexKey, count);

        } catch (IOException e) { // Catch IOException explicitly for better handling
            logger.error("Lỗi I/O khi khởi tạo Lucene index cho {}: {}", indexKey, e.getMessage(), e);
            throw e; // Re-throw to be handled upstream
        } catch (Exception e) {
            logger.error("Lỗi không mong muốn khi khởi tạo Lucene index cho {}: {}", indexKey, e.getMessage(), e);
            // Re-throw as IOException to be handled upstream
            throw new IOException("Failed to initialize Lucene index from RocksDB: " + e.getMessage(), e);
        } finally {
            // Do NOT close writer here as it's a shared instance managed by cache.
            // RocksDB instance should also be managed by dbMap.
            if (iterator != null) {
                try {
                    iterator.close();
                } catch (Exception ignore) {
                    logger.warn("Lỗi khi đóng RocksDB iterator: {}", ignore.getMessage());
                }
            }
        }
    }

    /**
     * Cập nhật đồng bộ tạo index để tìm kiếm nhanh nhất đối với dữ liệu cũ.
     * Hàm này duyệt qua tất cả các bản ghi, tạo chỉ mục Lucene cho các trường khóa chính
     * và **thêm trường 'id'** để tìm kiếm nhanh hơn.
     *
     * @param appId The application ID.
     * @param tableName The table name.
     */
    public void indexExistingRecords(String appId, String tableName) {
        RocksDB db = null;
        String indexKey = appId + "_" + tableName;
        // Đảm bảo luceneIndexLocks là một ConcurrentHashMap<String, Object>
        // Ví dụ: private final ConcurrentHashMap<String, Object> luceneIndexLocks = new ConcurrentHashMap<>();
        luceneIndexLocks.putIfAbsent(indexKey, new Object());

        synchronized (luceneIndexLocks.get(indexKey)) { // Synchronize for bulk indexing
            try {
                db = getDatabaseWithBloomFilter(appId, tableName); // Giả định hàm này trả về RocksDB instance

                List<String> fieldsSearch = resolveEffectiveSearchFields(appId, tableName);
                logger.info("Dùng các trường search {} để build Lucene index cho bảng {} trong app {}", fieldsSearch, tableName, appId);

                // Use the shared IndexWriter
                IndexWriter writer = getOrCreateSharedIndexWriter(appId, tableName); // Giả định hàm này trả về IndexWriter

                // Rebuild mode: clear the whole Lucene index first to avoid stale/duplicate docs.
                writer.deleteAll();
                logger.info("Đang rebuild sạch Lucene index cho bảng '{}'.", tableName);

                RocksIterator iterator = db.newIterator();
                iterator.seekToFirst();
                List<Document> buffer = new ArrayList<>();
                int count = 0;
                final int batchSize = 1000;

                while (iterator.isValid()) {
                    byte[] keyBytes = iterator.key();
                    byte[] valueBytes = iterator.value();
                    String key = new String(keyBytes, StandardCharsets.UTF_8);

                    // Giả định deserializeToObject là hàm của bạn để chuyển byte[] thành Object
                    Object obj = deserializeToObject(valueBytes);
                    if (!(obj instanceof Map<?, ?> rawMap)) {
                        iterator.next();
                        continue;
                    }

                    Map<String, Object> record = new HashMap<>();
                    for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                        if (entry.getKey() instanceof String keyStr) {
                            record.put(keyStr, entry.getValue());
                        }
                    }

                    Document doc = buildLuceneDocument(appId, tableName, key, record);

                    buffer.add(doc);
                    count++;

                    if (count % batchSize == 0) {
                        writer.addDocuments(buffer);
                        buffer.clear();
                        // logger.debug("Đã thêm {} tài liệu vào bộ đệm và ghi ra Lucene Index.", batchSize);
                    }

                    iterator.next();
                }

                if (!buffer.isEmpty()) {
                    writer.addDocuments(buffer);
                }

                // Đảm bảo đóng IndexWriter sau khi hoàn tất để ghi các thay đổi.
                // Có thể bạn đã có logic đóng trong getOrCreateSharedIndexWriter hoặc một hàm cleanup.
                // Nếu không, cần cân nhắc vị trí đóng phù hợp.
                // writer.close(); // Nếu IndexWriter không được quản lý dùng chung hoặc sẽ được đóng sau đó.
                writer.commit(); // Commit changes after the entire batch operation

                logger.info("✅ Đã lập chỉ mục Lucene cho bảng '{}' ({} bản ghi).", tableName, count);
                iterator.close(); // Close the iterator
            } catch (Exception e) {
                logger.error("❌ Lỗi khi lập chỉ mục Lucene cho bảng '{}': {}", tableName, e.getMessage(), e);
            }
        }
    }
    /**
     * Retrieves or creates an FSDirectory for a given index key and path.
     * This method is made robust to handle AlreadyClosedException by re-opening
     * the directory if a cached instance is found to be closed.
     *
     * @param indexKey The unique key for the Lucene index.
     * @param indexPath The file system path where the index should be located.
     * @return An open FSDirectory instance.
     * @throws IOException If there's an error opening or accessing the directory.
     */
    public FSDirectory getIndexDirectory(String indexKey, Path indexPath) throws IOException {
        // Try to get the directory from the cache first
        FSDirectory directory = indexDirectoryCache.get(indexKey);

        if (directory != null) {
            try {
                // Attempt a simple operation to check if the directory is still open/functional.
                // listAll() is a good lightweight way to test.
                directory.listAll();
                logger.debug("Successfully retrieved and verified open Directory for indexKey: {}", indexKey);
                return directory; // Directory is open and usable
            } catch (AlreadyClosedException e) {
                // If it's already closed, it means our cached reference is stale.
                logger.warn("Cached Directory for indexKey {} was already closed. Removing stale entry and attempting to re-open.", indexKey, e);
                indexDirectoryCache.remove(indexKey, directory); // Remove the closed instance from cache
                // Fall through to re-open the directory
            } catch (IOException e) {
                // Handle other IOExceptions that might indicate a problem
                logger.error("IOError while verifying cached Directory for indexKey {}: {}. Attempting to re-open.", indexKey, e.getMessage(), e);
                indexDirectoryCache.remove(indexKey, directory); // Remove potentially problematic instance
                // Fall through to re-open the directory
            }
        }

        // If the directory was null, or removed because it was closed/problematic,
        // computeIfAbsent will ensure it's opened exactly once and cached.
        return indexDirectoryCache.computeIfAbsent(indexKey, k -> {
            try {
                logger.info("Opening new FSDirectory for indexKey {}.", indexKey);
                // Ensure the parent directory exists
                Files.createDirectories(indexPath);
                return FSDirectory.open(indexPath);
            } catch (IOException e) {
                logger.error("Failed to open FSDirectory for indexKey {}: {}", indexKey, e.getMessage(), e);
                // Crucial: If opening fails, remove the key to prevent caching a null or error state
                indexDirectoryCache.remove(k);
                throw new UncheckedIOException(e); // Wrap in UncheckedIOException for functional interface
            }
        });
    }

    /**
     * Indexes a single record into the Lucene index. This method updates an existing document
     * or adds a new one based on the RocksDB key. It includes indexing the 'id' field
     * along with traditional primary keys.
     *
     * @param appId The application ID.
     * @param tableName The table name.
     * @param key The RocksDB key of the record.
     * @param record The record data as a Map.
     * @throws IOException if an error occurs during indexing.
     */
    public void indexRecord(String appId, String tableName, String key, Map<String, Object> record) throws IOException {
        // NOTE: field-filling removed — Lucene only needs configured search fields, not all fields.
        // Querying the schema table on every write caused 3 recursive Lucene lookups per record.
        String indexKey = appId + "_" + tableName;
        // Đảm bảo luceneIndexLocks là một ConcurrentHashMap<String, Object>
        // Ví dụ: private final ConcurrentHashMap<String, Object> luceneIndexLocks = new ConcurrentHashMap<>();
        luceneIndexLocks.putIfAbsent(indexKey, new Object());

        synchronized (luceneIndexLocks.get(indexKey)) { // Đồng bộ hóa cho các thao tác trên từng bản ghi
            IndexWriter writer = getOrCreateSharedIndexWriter(appId, tableName); // Lấy IndexWriter dùng chung
            Document doc = buildLuceneDocument(appId, tableName, key, record);


            // updateDocument sẽ thay thế tài liệu hiện có với cùng Term (_key, key)
            writer.updateDocument(new Term("_key", key), doc);

            logger.debug("Queued record for indexing with key: {}", key);

            // Kích hoạt làm mới SearcherManager để cập nhật tức thời
            try {
                // searcherManagerCache: Giả định là một ConcurrentHashMap<String, SearcherManager>
                SearcherManager searcherManager = searcherManagerCache.get(indexKey);
                if (searcherManager != null) {
                    searcherManager.maybeRefresh();
                    logger.debug("SearcherManager for {} refreshed after indexing record with key: {}.", indexKey, key);
                }
            } catch (AlreadyClosedException ace) {
                logger.warn("SearcherManager for index {} was closed during refresh attempt after indexing record with key {}. Detail: {}", indexKey, key, ace.getMessage());
            } catch (IOException e) {
                logger.error("Error refreshing SearcherManager for index {} after indexing record with key {}: {}", indexKey, key, e.getMessage(), e);
            }
        }
    }
    
    public void deleteFromIndex(String appId, String tableName, String key) throws IOException {
        String indexKey = appId + "_" + tableName;
        luceneIndexLocks.putIfAbsent(indexKey, new Object());
    
        synchronized (luceneIndexLocks.get(indexKey)) {
            IndexWriter writer = getOrCreateSharedIndexWriter(appId, tableName);
            writer.deleteDocuments(new Term("_key", key));
            logger.debug("Queued deletion for key: {} from index {}.", key, indexKey);
    
            // Kích hoạt làm mới SearcherManager để cập nhật tức thời sau khi xóa
            try {
                SearcherManager searcherManager = searcherManagerCache.get(indexKey);
                if (searcherManager != null) {
                    searcherManager.maybeRefresh();
                    logger.debug("SearcherManager for {} refreshed after deleting record with key: {}.", indexKey, key);
                }
            } catch (AlreadyClosedException ace) {
                logger.warn("SearcherManager for index {} was closed during refresh attempt after deleting record with key {}. Detail: {}", indexKey, key, ace.getMessage());
            } catch (IOException e) {
                logger.error("Error refreshing SearcherManager for index {} after deleting record with key {}: {}", indexKey, key, e.getMessage(), e);
            }
        }
    }

    // New method to explicitly commit changes to a specific Lucene index
    public void commitLuceneIndex(String appId, String tableName) throws IOException {
        String indexKey = appId + "_" + tableName;
        luceneIndexLocks.putIfAbsent(indexKey, new Object());

        synchronized (luceneIndexLocks.get(indexKey)) {
            IndexWriter writer = indexWriterCache.get(indexKey);
            if (writer != null && writer.isOpen()) {
                writer.commit();
                logger.info("Committed Lucene Index for: {}", indexKey);
                
                // 🔥 CRITICAL FIX: Force refresh SearcherManager AFTER commit
                // This ensures that subsequent queries will see the newly committed changes
                // Without this, searchers may still use the old index until maybeRefresh() is called
                try {
                    SearcherManager searcherManager = searcherManagerCache.get(indexKey);
                    if (searcherManager != null) {
                        boolean refreshed = searcherManager.maybeRefresh();
                        if (refreshed) {
                            logger.info("✅ SearcherManager REFRESHED after commit for: {}", indexKey);
                        } else {
                            logger.debug("SearcherManager already up-to-date for: {}", indexKey);
                        }
                    }
                } catch (AlreadyClosedException ace) {
                    logger.warn("SearcherManager for index {} was closed during refresh after commit. Detail: {}", indexKey, ace.getMessage());
                } catch (IOException e) {
                    logger.error("❌ Error refreshing SearcherManager after commit for index {}: {}", indexKey, e.getMessage(), e);
                    throw e;
                }
            } else {
                logger.warn("No active IndexWriter found for index: {}. Nothing to commit.", indexKey);
            }
        }
    }

    // 🔁 Hàm xử lý restore cho 1 bảng cụ thể
    private static void restoreSingleTable(String appId, String tableName, String dbRootDir, String backupRootDir, String ossPrefixBase) {
        try {
            String ossPrefix = ossPrefixBase + "/" + appId + "/" + tableName;
            String dbPath = Paths.get(dbRootDir, appId, tableName).toString();
            String localBackupDir = Paths.get(backupRootDir, appId, tableName).toString();
    
            // logger.info("📦 Khôi phục DB: appId={}, tableName={}", appId, tableName);
            // logger.info("⬇️ Tải từ OSS: {} → {}", ossPrefix, localBackupDir);
            Files.createDirectories(Paths.get(localBackupDir));
            // OSSUtil.downloadFolder(ossPrefix, Paths.get(localBackupDir));
    
            File dbDir = new File(dbPath);
            if (!dbDir.exists() && !dbDir.mkdirs()) {
                throw new IOException("❌ Không thể tạo thư mục DB local: " + dbPath);
            }
    
            // logger.info("♻️ Đang khôi phục từ local backup: {}", localBackupDir);
            RocksDBBackupManager manager = new RocksDBBackupManager(dbPath, localBackupDir, ossPrefix);
            manager.restoreFromLocal();
    
            // OSSUtil.log("✅ Đã khôi phục database: " + appId + "/" + tableName);
            // logger.info("✅ Khôi phục thành công database: {}/{}", appId, tableName);
        } catch (Exception e) {
            String errorMsg = "❌ Lỗi khi khôi phục " + appId + "/" + tableName + ": " + e.getMessage();
            // OSSUtil.log(errorMsg);
            logger.error(errorMsg, e);
        }
    }      

    public void backupDb(String appId, String tableName) {
        if (tableName == null || tableName.trim().isEmpty()) {
            Path appPath = Paths.get(DIR_PATH,"database", appId);
            File[] tables = appPath.toFile().listFiles(File::isDirectory);
            if (tables != null) {
                for (File table : tables) {
                    backupDb(appId, table.getName());
                }
            }
            return;
        }
        Path dbPath = Paths.get(DIR_PATH,"database", appId, tableName);
        String ossPrefix = DIR_PATH + "/database/"+appId + "/" + tableName;
        // OSSUtil.log("🆙 Begin Backup DB: " + DIR_PATH + "/database/"+appId + "/" + tableName + " to OSS");
        // OSSUtil.uploadFolder(dbPath, ossPrefix);
        // OSSUtil.log("🆙 End Backup DB: " + DIR_PATH + "/database/"+appId + "/" + tableName + " to OSS");
    }

    public void restoreDb(String appId, String tableName) {
        // OSSUtil.log("Starting restoreDb for appId: " + appId + " with tableName: " + tableName);
        
        // Khởi tạo client OSS một lần duy nhất
        // OSS ossClient = OSSUtil.initClient();
        
        try {
            // Nếu tableName đã được chỉ định, tải dữ liệu của tableName về local
            Path dbPath = Paths.get(DIR_PATH,"database", appId, tableName);
            String ossPrefix = DIR_PATH + "/database/"+appId + "/" + tableName;
            ossPrefix = ossPrefix.replaceAll("^/+", "");  // Loại bỏ tất cả "/" ở đầu
            // Log thông tin khi bắt đầu tải về
            // OSSUtil.log("Downloading folder from OSS with prefix: " + ossPrefix + " to local path: " + dbPath);
        
            // Tải dữ liệu từ OSS về local
            try {
                // OSSUtil.downloadFolder(ossPrefix, dbPath);
                // OSSUtil.log("⬇️ Successfully restored DB: " + DIR_PATH + "/database/"+appId + "/" + tableName + " from OSS");
            } catch (Exception e) {
                // OSSUtil.log("❌ Error downloading folder: " + e.getMessage());
            }
        
        } catch (Exception e) {
            // OSSUtil.log("❌ Error while processing restoreDb for appId " + appId + ": " + e.getMessage());
        } finally {
            // ossClient.shutdown();
        }
    }      

    public void deleteAllDatabasesFolder()
    {
        deleteAllFilesInFolder(DIR_PATH + "/database");
    }

    private void deleteAllFilesInFolder(String folderPath) {
        File folder = new File(folderPath);
        if (!folder.exists() || !folder.isDirectory()) {
            // OSSUtil.log("Path không tồn tại hoặc không phải thư mục: " + folderPath);
            System.out.println("Path không tồn tại hoặc không phải thư mục: " + folderPath);
            return;
        }

        for (File file : folder.listFiles()) {
            if (file.isDirectory()) {
                deleteAllFilesInFolder(file.getAbsolutePath()); // Đệ quy
                // OSSUtil.log("Deleting "+file.getAbsolutePath());
                file.delete(); // Xóa thư mục sau khi đã xóa bên trong
            } else {
                // OSSUtil.log("Deleting "+file.getAbsolutePath()+file.getName());
                file.delete(); // Xóa file
            }
        }
    }

    /**
     * Chuẩn hóa appId / tableName trước khi dùng làm segment đường dẫn filesystem.
     * <ul>
     *   <li>Trim whitespace để tránh tạo thư mục trùng ("csm" vs " csm").</li>
     *   <li>Lowercase để tránh tạo thư mục trùng do khác case ("CSM" vs "csm").</li>
     *   <li>Từ chối chuỗi rỗng — appId rỗng tạo path "database//table" → file thoát ra ngoài database/.</li>
     *   <li>Từ chối path traversal (".", "..", hay bất kỳ segment nào chứa "/", "\", null byte).</li>
     * </ul>
     */
    private static String sanitizePathSegment(String segment, String label) {
        if (segment == null || segment.isBlank()) {
            throw new IllegalArgumentException(label + " không được rỗng hoặc null — sẽ gây ra đường dẫn sai trong filesystem.");
        }
        String s = segment.trim().toLowerCase(Locale.ROOT);
        // Reject path traversal characters
        if (s.contains("/") || s.contains("\\") || s.contains("\0") || s.equals(".") || s.equals("..") || s.contains("..")) {
            throw new IllegalArgumentException(label + " chứa ký tự không hợp lệ (path traversal): '" + segment + "'");
        }
        return s;
    }

    public RocksDB getDatabaseWithBloomFilter(String appId, String tableName) {
        // Fail fast during shutdown to prevent opening new DBs after cleanup
        if (shutdownInProgress.get()) {
            throw new RuntimeException("Server đang tắt, không mở RocksDB mới cho: " + appId + "/" + tableName);
        }

        // ✅ Chuẩn hóa trước khi dùng làm path — đây là điểm duy nhất mọi path RocksDB đi qua.
        // Ngăn: (1) appId rỗng → file thoát ra database/ root, (2) case khác nhau → 2 thư mục trùng,
        // (3) whitespace → 2 thư mục trùng, (4) path traversal → escape khỏi database/.
        String safeAppId = sanitizePathSegment(appId, "app_id");
        String safeTableName = sanitizePathSegment(tableName, "table_name");

        String dbKey = safeAppId + "_" + safeTableName;
        dbLocks.putIfAbsent(dbKey, new Object());
    
        synchronized (dbLocks.get(dbKey)) {
            RocksDBWrapper wrapper = dbMap.get(dbKey);
            if (wrapper != null && wrapper.db != null) {
                // isOwningHandle() returns false when db.close() was called — detect stale cached handles
                if (wrapper.db.isOwningHandle()) {
                    return wrapper.db;
                }
                // Closed handle in cache: remove it so we can reopen below
                logger.warn("⚠️ Phát hiện RocksDB handle đã đóng trong cache cho {}, sẽ mở lại", dbKey);
                dbMap.remove(dbKey);
            }
    
            try {
                // OPTIMIZED: RocksDB tuning cho SSR + Googlebot crawl
                // Bloom Filter: 10 bits/key = ~1% false positive (đủ tốt)
                BloomFilter bloomFilter = new BloomFilter(10);
                
                // Table format: tối ưu cho read-heavy workload (SSR queries)
                BlockBasedTableConfig tableConfig = new BlockBasedTableConfig()
                    .setFilterPolicy(bloomFilter)
                    .setBlockSize(16 * 1024)                    // 16KB blocks — tốt hơn cho JSON records
                    .setBlockRestartInterval(16)
                    .setCacheIndexAndFilterBlocks(true)
                    .setPinL0FilterAndIndexBlocksInCache(true)  // giữ filter/index trong cache
                    .setWholeKeyFiltering(true);
    
                Options options = new Options()
                        .setCreateIfMissing(true)
                    .setMaxOpenFiles(2048)
                        .setIncreaseParallelism(Runtime.getRuntime().availableProcessors())
                    .setCompressionType(CompressionType.LZ4_COMPRESSION) // LZ4: nhanh nhất, giảm 60-70% disk I/O
                    // 32MB write buffer — ít flush hơn 8MB, giảm write amplification đáng kể
                    .setWriteBufferSize(32 * 1024 * 1024)
                    .setMaxWriteBufferNumber(2)
                    .setDbWriteBufferSize(64 * 1024 * 1024)     // global cap 64MB (was 32MB)
                        .optimizeLevelStyleCompaction()
                        .setTableFormatConfig(tableConfig);

                // Dùng Paths.get để ghép path an toàn — tránh double slash hay escape ký tự đặc biệt.
                Path dbPathObj = Paths.get(DIR_PATH, "database", safeAppId, safeTableName).normalize();

                // Xác minh path nằm trong thư mục database/ (defense-in-depth chống path traversal)
                Path dbRootPath = Paths.get(DIR_PATH, "database").normalize().toAbsolutePath();
                Path resolvedPath = dbPathObj.toAbsolutePath();
                if (!resolvedPath.startsWith(dbRootPath)) {
                    throw new SecurityException("Path RocksDB thoát ra ngoài thư mục database: " + resolvedPath);
                }

                String dbPath = dbPathObj.toString();
                Files.createDirectories(dbPathObj);

                RocksDB db;
                try {
                    db = RocksDB.open(options, dbPath);
                } catch (RocksDBException openEx) {
                    String openErrMsg = openEx.getMessage() != null ? openEx.getMessage().toLowerCase(Locale.ROOT) : "";
                    boolean isStaleLock = openErrMsg.contains("lock hold by current process")
                            || openErrMsg.contains("no locks available");
                    if (isStaleLock) {
                        // Same-JVM stale lock: native RocksDB C++ registry still has this path open
                        // (e.g., from DevTools restart or failed shutdown). Force GC to finalize
                        // orphaned native RocksDB objects, then retry.
                        logger.warn("⚠️ RocksDB stale lock cho {} — forcing GC để giải phóng native handles cũ, sau đó retry...", dbKey);
                        System.gc();
                        System.runFinalization();
                        try { Thread.sleep(200); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                        try {
                            db = RocksDB.open(options, dbPath);
                            logger.info("✅ RocksDB {} mở thành công sau khi giải phóng stale lock", dbKey);
                        } catch (RocksDBException retryEx) {
                            // GC didn't help; for index table quarantine+recreate; others propagate
                            if (shouldAutoRecoverRocksDb(safeTableName)) {
                                logger.error("❌ Stale lock vẫn còn cho {} — thử quarantine+recreate", dbKey, retryEx);
                                quarantineCorruptedRocksDirectory(dbPath, dbKey);
                                db = RocksDB.open(options, dbPath);
                                logger.warn("⚠️ RocksDB {} đã được tự phục hồi sau stale lock", dbKey);
                            } else {
                                throw retryEx;
                            }
                        }
                    } else if (shouldAutoRecoverRocksDb(safeTableName) && isRecoverableOpenError(openEx)) {
                        logger.error("❌ RocksDB bị lỗi/corrupt cho {} tại {}. Thử tự phục hồi...", dbKey, dbPath, openEx);
                        quarantineCorruptedRocksDirectory(dbPath, dbKey);
                        db = RocksDB.open(options, dbPath);
                        logger.warn("⚠️ RocksDB {} đã được tự phục hồi bằng cách tạo DB mới", dbKey);
                    } else {
                        throw openEx;
                    }
                }
    
                RocksDBWrapper newWrapper = new RocksDBWrapper(db, options, tableConfig, bloomFilter);
                dbMap.put(dbKey, newWrapper);
    
                return db;
            } catch (Exception e) {
                logger.error("❌ Không thể mở RocksDB cho {}: {}", dbKey, e.getMessage(), e);
                throw new RuntimeException("Lỗi khi mở RocksDB", e);
            }
        }
    }

    private boolean shouldAutoRecoverRocksDb(String tableName) {
        // index table stores search metadata and can be rebuilt safely.
        return "index".equalsIgnoreCase(String.valueOf(tableName));
    }

    private boolean isRecoverableOpenError(Throwable throwable) {
        if (!(throwable instanceof RocksDBException)) {
            return false;
        }
        String message = String.valueOf(throwable.getMessage()).toLowerCase(Locale.ROOT);
        return message.contains("corruption")
                || message.contains("manifest")
                || message.contains("no such file or directory")
                || message.contains("while open a file for random read");
    }

    private void quarantineCorruptedRocksDirectory(String dbPath, String dbKey) throws IOException {
        Path source = Paths.get(dbPath);
        if (!Files.exists(source)) {
            Files.createDirectories(source);
            return;
        }

        Path quarantine = Paths.get(dbPath + ".corrupt-" + System.currentTimeMillis());
        try {
            Files.move(source, quarantine);
            logger.error("⚠️ Đã cô lập thư mục RocksDB lỗi cho {} sang {}", dbKey, quarantine);
        } catch (IOException moveError) {
            logger.warn("Không thể move thư mục RocksDB lỗi cho {}. Thử xóa thư mục cũ để tạo lại. Lỗi: {}", dbKey, moveError.getMessage());
            deleteDirectory(source.toFile());
        }

        Files.createDirectories(source);
    }

    /**
     * Phương thức đếm số lượng record thực tế trong RocksDB.
     * Nên đặt ở đây để có thể truy cập dễ dàng.
     */
    public long countActualRecords(RocksDB db) throws RocksDBException {
        if (db == null) {
            throw new IllegalStateException("RocksDB không hợp lệ (null) khi đếm bản ghi");
        }
    
        long count = 0;
        RocksIterator iterator = null;
        try {
            iterator = db.newIterator();
            iterator.seekToFirst();
            while (iterator.isValid()) {
                String key = new String(iterator.key(), StandardCharsets.UTF_8);
                if (!key.startsWith("__meta_")) {
                    count++;
                }
                iterator.next();
            }
        } catch (Exception e) {
            throw new RocksDBException("Lỗi khi đếm bản ghi thực tế: " + e.getMessage());
        } finally {
            if (iterator != null) {
                try {
                    iterator.close();
                } catch (Exception ignore) {}
            }
        }
        return count;
    }    

    public void deleteDatabase(String appId, String tableName) {
        String dbPath = DIR_PATH + "/database/"+appId + "/" + tableName;
        Path path = Paths.get(dbPath);

        try {
            if (Files.exists(path)) {
                Files.walk(path)
                        .sorted(Comparator.reverseOrder())
                        .map(Path::toFile)
                        .forEach(File::delete);

                logger.info("Deleted RocksDB directory: {}", dbPath);
            }
        } catch (IOException e) {
            logger.error("Failed to delete RocksDB path: {} - {}", dbPath, e.getMessage());
        }
    }

    public void deleteAllDatabases() {
        dbMap.keySet().forEach(key -> {
            String[] parts = key.split("_", 2);
            if (parts.length == 2) {
                deleteDatabase(parts[0], parts[1]);
            }
        });
    }

    /**
     * Xóa triệt để Lucene index của một bảng: đóng và giải phóng tất cả tài nguyên
     * (IndexWriter, SearcherManager, FSDirectory, Analyzer) khỏi cache, sau đó xóa
     * thư mục vật lý trên đĩa. Cần gọi trước khi rebuild index theo cấu trúc mới.
     */
    public void deleteLuceneIndex(String appId, String tableName) {
        String indexKey = appId + "_" + tableName;
        luceneIndexLocks.putIfAbsent(indexKey, new Object());
        synchronized (luceneIndexLocks.get(indexKey)) {
            // 1. Đóng và xóa IndexWriter
            IndexWriter writer = indexWriterCache.remove(indexKey);
            if (writer != null) {
                try {
                    if (writer.isOpen()) writer.close();
                } catch (Exception e) {
                    logger.warn("Lỗi đóng IndexWriter khi xóa lucene index {}: {}", indexKey, e.getMessage());
                }
            }
            // 2. Đóng và xóa SearcherManager
            SearcherManager sm = searcherManagerCache.remove(indexKey);
            if (sm != null) {
                try { sm.close(); } catch (Exception e) {
                    logger.warn("Lỗi đóng SearcherManager khi xóa lucene index {}: {}", indexKey, e.getMessage());
                }
            }
            // 3. Đóng và xóa FSDirectory
            FSDirectory dir = indexDirectoryCache.remove(indexKey);
            if (dir != null) {
                try { dir.close(); } catch (Exception e) {
                    logger.warn("Lỗi đóng FSDirectory khi xóa lucene index {}: {}", indexKey, e.getMessage());
                }
            }
            // 4. Xóa Analyzer khỏi cache
            Analyzer analyzer = indexAnalyzerCache.remove(indexKey);
            if (analyzer != null) {
                try { analyzer.close(); } catch (Exception e) {
                    logger.warn("Lỗi đóng Analyzer khi xóa lucene index {}: {}", indexKey, e.getMessage());
                }
            }
            // 5. Xóa thư mục lucene_index trên đĩa
            Path indexPath = Paths.get(DIR_PATH, "lucene_index", appId, tableName);
            File indexDir = indexPath.toFile();
            if (indexDir.exists()) {
                deleteDirectory(indexDir);
                logger.info("Đã xóa hoàn toàn Lucene index vật lý tại: {}", indexPath);
            }
        }
    }

    // Cập nhật các hàm createRecord và deleteRecord để cập nhật __meta_totalCount

    /**
     * Batch update nhiều records trong cùng một bảng: 1 WriteBatch, 1 lần Lucene commit.
     * Dùng khi cần persist nhiều rows cùng lúc để tránh N lần flush Lucene (rất chậm).
     */
    public void batchUpdateRecords(String appId, String tableName, List<Map<String, Object>> records, List<String> primaryKeys) {
        if (records == null || records.isEmpty()) return;
        RocksDB db = null;
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
            try (WriteBatch writeBatch = new WriteBatch();
                 WriteOptions writeOptions = new WriteOptions()) {
                for (Map<String, Object> record : records) {
                    String key = generateKey(appId, tableName, record, primaryKeys);
                    writeBatch.put(key.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                                   objectMapper.writeValueAsBytes(record));
                    queueIndexUpdateForBatch(appId, tableName, key, record);
                }
                db.write(writeOptions, writeBatch);
            }
            logger.info("✅ batchUpdateRecords: updated {} records in {}.{}", records.size(), appId, tableName);
        } catch (Exception e) {
            logger.error("❌ batchUpdateRecords failed for {}.{}: {}", appId, tableName, e.getMessage(), e);
        }
    }

    public String createRecord(String appId, String tableName, Map<String, Object> record, List<String>... customKey) {
        RocksDB db = null;
        String command="";
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);

            List<String> primaryKeys;
            if (customKey != null && customKey.length > 0 && customKey[0] != null && !customKey[0].isEmpty()) {
                primaryKeys = new ArrayList<>(customKey[0]);
                logger.info("Sử dụng custom primary keys cho {}.{}: {}", appId, tableName, primaryKeys);
            } else if ("index".equalsIgnoreCase(tableName)) {
                primaryKeys = List.of("id");
            } else {
                primaryKeys = getTableSearchKeys(appId, tableName, "fieldsPK");

                if (primaryKeys == null || primaryKeys.isEmpty()) {
                    logger.warn("Không có khóa chính được định nghĩa cho bảng '{}'. Sử dụng UUID làm khóa.", tableName);
                    createRecordWithUUID(appId, tableName, record, db);
                    return "";
                }
            }

            Object idVal = record.get("id");
            if (!"index".equalsIgnoreCase(tableName) && (idVal == null || idVal.toString().isBlank())) {
                record.put("id", UUID.randomUUID().toString());
            }

            String canonicalKey = generateKey(appId, tableName, record, primaryKeys);
            String keyById = resolveStorageKeyById(db, appId, tableName, record);
            String keyToPersist = keyById != null ? keyById : resolveExistingStorageKey(db, appId, tableName, canonicalKey);
            byte[] keyBytes = keyToPersist.getBytes(StandardCharsets.UTF_8);

            byte[] existing = db.get(keyBytes);
            if (existing != null) {
                command="update";
                logger.warn("Ghi đè bản ghi đã tồn tại với key: {}", keyToPersist);
            }
            else
                command="create";
            try (WriteBatch writeBatch = new WriteBatch();
                WriteOptions writeOptions = new WriteOptions()) {

                if ("update".equals(command) && keyById != null && !keyById.equals(canonicalKey)) {
                    writeBatch.delete(keyById.getBytes(StandardCharsets.UTF_8));
                    keyToPersist = canonicalKey;
                    keyBytes = keyToPersist.getBytes(StandardCharsets.UTF_8);
                    logger.info("Chuẩn hóa key theo id cho {}.{}: oldKey={} -> canonicalKey={}", appId, tableName, keyById, canonicalKey);
                }

                writeBatch.put(keyBytes, objectMapper.writeValueAsBytes(record));
                // Chỉ tăng meta count khi tạo mới, không khi cập nhật
                if ("create".equals(command)) {
                    incrementMetaCount(db, 1);
                }
                db.write(writeOptions, writeBatch);
                logger.info("✅ Đã tạo/cập nhật bản ghi thành công với key: {}", keyToPersist);

                // Invalidate schema cache when the "index" table (table metadata) is modified
                if ("index".equalsIgnoreCase(tableName)) {
                    String tableId = String.valueOf(record.getOrDefault("id", ""));
                    if (!tableId.isBlank()) {
                        tableSchemaCache.remove(appId + "_" + tableId + "_fieldsSearch");
                        tableSchemaCache.remove(appId + "_" + tableId + "_fieldsPK");
                        tableSchemaCache.remove(appId + "_" + tableId + "_fields");
                        logger.debug("Invalidated schema cache for table: {}", tableId);
                    }
                }

                if ("update".equals(command) && keyById != null && !keyById.equals(keyToPersist)) {
                    queueIndexDeleteForBatch(appId, tableName, keyById);
                }

                // Queue Lucene update to reduce per-request write amplification.
                queueIndexUpdateForBatch(appId, tableName, keyToPersist, record);
            }
        } catch (IllegalArgumentException e) {
            logger.error("Lỗi dữ liệu khi tạo bản ghi: {}", e.getMessage());
            throw e;
        } catch (Exception e) {
            logger.error("❌ Lỗi khi tạo bản ghi cho bảng {}: {}", tableName, e.getMessage(), e);
            throw new RuntimeException("Lỗi hệ thống khi tạo bản ghi", e);
        }
        return command;
    }

    private void createRecordWithUUID(String appId, String tableName, Map<String, Object> record, RocksDB db) throws Exception {
        String key = tableName + "_" + UUID.randomUUID();
        byte[] keyBytes = key.getBytes(StandardCharsets.UTF_8);
        try (WriteBatch writeBatch = new WriteBatch();
             WriteOptions writeOptions = new WriteOptions()) {
            writeBatch.put(keyBytes, objectMapper.writeValueAsBytes(record));
            incrementMetaCount(db, 1);
            db.write(writeOptions, writeBatch);
            logger.info("✅ Đã tạo bản ghi thành công với UUID key: {}", key);

            queueIndexUpdateForBatch(appId, tableName, key, record);
        }
    }

    public void deleteRecord(String appId, String tableName, Map<String, Object> record) {
        RocksDB db = null;
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
    
            List<String> primaryKeys;
            if ("index".equalsIgnoreCase(tableName)) {
                primaryKeys = List.of("id");
            } else {
                primaryKeys = getTableSearchKeys(appId, tableName,"fieldsPK");
            }
    
            String canonicalKey = generateKey(appId, tableName, record, primaryKeys);
            String keyById = resolveStorageKeyById(db, appId, tableName, record);
            String keyToDelete = keyById != null ? keyById : resolveExistingStorageKey(db, appId, tableName, canonicalKey);

            Set<String> storageKeysToDelete = new LinkedHashSet<>();
            if (keyById != null) {
                storageKeysToDelete.addAll(findStorageKeysById(db, appId, tableName, String.valueOf(record.get("id"))));
            }
            storageKeysToDelete.add(keyToDelete);
            storageKeysToDelete.addAll(buildLegacyKeyCandidates(appId, tableName, canonicalKey));

            boolean deletedAny = false;
            for (String storageKey : storageKeysToDelete) {
                if (storageKey == null || storageKey.isBlank()) {
                    continue;
                }
                byte[] keyBytes = storageKey.getBytes(StandardCharsets.UTF_8);
                byte[] value = db.get(keyBytes);
                if (value == null) {
                    continue;
                }
                try (WriteOptions writeOptions = new WriteOptions()) {
                    db.delete(writeOptions, keyBytes); // Sử dụng phương thức delete với WriteOptions
                    decrementMetaCount(db, 1);
                    deletedAny = true;
                    logger.info("✅ Đã xóa bản ghi từ RocksDB: {}", storageKey);
                }
    
                queueIndexDeleteForBatch(appId, tableName, storageKey);
            }

            for (String candidate : buildLegacyKeyCandidates(appId, tableName, canonicalKey)) {
                if (candidate != null && !candidate.isBlank()) {
                    queueIndexDeleteForBatch(appId, tableName, candidate);
                }
            }
                
            if (!deletedAny) {
                logger.warn("⚠️ Không tìm thấy bản ghi để xóa với key: {} (canonical={})", keyToDelete, canonicalKey);
            }
        } catch (IllegalArgumentException e) {
            logger.error("Lỗi dữ liệu khi xóa bản ghi: {}", e.getMessage());
            throw e;
        } catch (Exception e) {
            logger.error("❌ Lỗi khi xóa bản ghi cho bảng {}: {}", tableName, e.getMessage(), e);
            throw new RuntimeException("Lỗi hệ thống khi xóa bản ghi", e);
        }
    }

    /**
     * Retrieves or creates a SearcherManager for a given Lucene index.
     * If the index does not exist, it will be populated from RocksDB data.
     *
     * @param appId The application ID.
     * @param tableName The table name.
     * @return An initialized SearcherManager.
     * @throws IOException if there's an error with Lucene directory operations.
     */
    public SearcherManager getSearcherManager(String appId, String tableName) throws IOException {
        String indexKey = appId + "_" + tableName;
        luceneIndexLocks.putIfAbsent(indexKey, new Object()); // Đảm bảo đối tượng khóa tồn tại

        synchronized (luceneIndexLocks.get(indexKey)) {
            SearcherManager manager = searcherManagerCache.get(indexKey);
            if (manager != null) {
                try {
                    manager.acquire(); // Thử acquire để kiểm tra xem nó còn sử dụng được không
                    manager.release(manager.acquire()); // Release ngay lập tức sau khi acquire thành công
                    return manager;
                } catch (AlreadyClosedException e) {
                    logger.warn("Cached SearcherManager for {} was already closed. Removing stale entry and recreating.", indexKey);
                    searcherManagerCache.remove(indexKey, manager); // Xóa entry cũ
                } catch (Exception e) {
                    logger.error("Error verifying cached SearcherManager for {}: {}. Attempting to recreate.", indexKey, e.getMessage(), e);
                    searcherManagerCache.remove(indexKey, manager); // Xóa entry lỗi
                }
            }

            // Nếu không tìm thấy trong cache, hoặc bị lỗi, tạo mới
            return searcherManagerCache.computeIfAbsent(indexKey, k -> {
                Path indexPath = Paths.get(DIR_PATH, "lucene_index", appId, tableName);
                FSDirectory dir = null;
                IndexWriter writer = null; // Khai báo IndexWriter

                try {
                    Files.createDirectories(indexPath); // Đảm bảo thư mục tồn tại
                    dir = getIndexDirectory(indexKey, indexPath); // Lấy hoặc tạo FSDirectory

                    // Lấy instance IndexWriter đã được chia sẻ và đang mở
                    // Đây là Writer mà bạn đang thêm các Document vào
                    writer = getOrCreateSharedIndexWriter(appId, tableName);

                    // QUAN TRỌNG: Kiểm tra xem chỉ mục có tồn tại không. Nếu không, khởi tạo từ RocksDB.
                    // Việc này phải được thực hiện TRƯỚC khi tạo SearcherManager
                    // vì SearcherManager mong đợi một chỉ mục đã được populate (nếu cần).
                    if (!DirectoryReader.indexExists(dir)) {
                        logger.info("Lucene index for {} does not exist. Initializing from RocksDB.", indexKey);
                        initializeLuceneIndexFromRocksDB(appId, tableName);
                        // Sau khi khởi tạo ban đầu, nên commit writer để đảm bảo dữ liệu ban đầu bền vững
                        // và được thấy bởi các SearcherManager mới nếu writer bị đóng và mở lại.
                        writer.commit();
                        logger.info("Initial Lucene index for {} populated and committed from RocksDB.", indexKey);
                    }

                    // TẠO SearcherManager TỪ IndexWriter cho khả năng NRT
                    // Đây là thay đổi cốt lõi. SearcherManager này sẽ thấy các thay đổi chưa được commit từ writer này.
                    SearcherManager newManager = new SearcherManager(writer, new SearcherFactory());

                    logger.info("Initialized NRT SearcherManager for index: {}", indexKey);
                    return newManager;
                } catch (IOException e) {
                    logger.error("Failed to create NRT SearcherManager for indexKey {}: {}", indexKey, e.getMessage(), e);
                    // Không xóa key khỏi cache ở đây để tránh các vấn đề cập nhật đệ quy.
                    // Hàm ánh xạ của computeIfAbsent bị lỗi sẽ ngăn nó được thêm vào.
                    throw new UncheckedIOException(e);
                }
            });
        }
    }
    /**
     * Searches for keys in a Lucene index based on provided filters,
     * using a managed SearcherManager for efficient IndexSearcher acquisition.
     *
     * @param appId The application ID.
     * @param tableName The table name (used as part of the index path).
     * @param filters The search filters to build the Lucene query.
     * @return A list of keys found in the index, or an empty list if an error occurs.
     */
    public List<String> searchKeys(String appId, String tableName, SearchFilter filters) {
        // Tự động chuẩn hóa điều kiện ngày trước khi truy vấn
        LinkedHashSet<String> uniqueKeys = new LinkedHashSet<>();
        LinkedHashSet<String> staleKeys = new LinkedHashSet<>();
        String indexKey = appId + "_" + tableName;
        if (!isFilterLuceneCompatible(appId, tableName, filters)) {
            logger.warn("Rejected Lucene query using non-indexed field(s) for {}.{}; allowed fields are only fieldsSearch + id", appId, tableName);
            return Collections.emptyList();
        }
        // The original method signature had indexPath, but getSearcherManager only needs appId and tableName
        // Path indexPath = Paths.get(DIR_PATH, "lucene_index", appId, tableName); 
        IndexSearcher searcher = null; 
        RocksDB db = null;

        try {
            // Updated call to match the existing getSearcherManager signature
            SearcherManager searcherManager = getSearcherManager(appId, tableName); 
            // Non-blocking refresh to keep query latency stable under load.
            searcherManager.maybeRefresh();
            searcher = searcherManager.acquire(); 
            db = getDatabaseWithBloomFilter(appId, tableName);

            Query query = buildLuceneQuery(filters);
            ScoreDoc lastScoreDoc = null;
            int fetchedDocs = 0;
            int duplicateCount = 0;
            int processedDocs = 0;

            while (true) {
                TopDocs docs = (lastScoreDoc == null)
                        ? searcher.search(query, MAX_LUCENE_SEARCH_HITS)
                        : searcher.searchAfter(lastScoreDoc, query, MAX_LUCENE_SEARCH_HITS);

                if (docs == null || docs.scoreDocs == null || docs.scoreDocs.length == 0) {
                    break;
                }

                for (ScoreDoc scoreDoc : docs.scoreDocs) {
                    processedDocs++;
                    applySmartBackpressure(processedDocs);

                    Document doc = searcher.doc(scoreDoc.doc);
                    String key = doc.get("_key");
                    if (key == null) {
                        logger.warn("Document {} found without '_key' field in index {}.", scoreDoc.doc, indexKey);
                        continue;
                    }

                    try {
                        byte[] value = db.get(key.getBytes(StandardCharsets.UTF_8));
                        if (value == null) {
                            staleKeys.add(key);
                            continue;
                        }
                    } catch (Exception ex) {
                        logger.warn("Failed to verify RocksDB value for Lucene key {} in {}: {}", key, indexKey, ex.getMessage());
                        continue;
                    }

                    if (uniqueKeys.contains(key)) {
                        // Lucene duplicate (_key) detected; keep newest by doc order and cleanup later.
                        duplicateCount++;
                        staleKeys.add(key);
                    } else {
                        uniqueKeys.add(key);
                    }
                }

                fetchedDocs += docs.scoreDocs.length;
                lastScoreDoc = docs.scoreDocs[docs.scoreDocs.length - 1];

                if (docs.scoreDocs.length < MAX_LUCENE_SEARCH_HITS) {
                    break;
                }

                if (fetchedDocs >= MAX_LUCENE_KEY_COLLECTION) {
                    logger.warn("Lucene key collection reached safety limit {} for {}.{}, stopping additional searchAfter pages.",
                            MAX_LUCENE_KEY_COLLECTION, appId, tableName);
                    break;
                }
            }

            if (duplicateCount > 0) {
                logger.warn("Detected {} duplicate Lucene docs (same _key) for {}.{}; auto-deduped query result.", duplicateCount, appId, tableName);
            }

            if (!staleKeys.isEmpty()) {
                logger.warn("Detected {} stale Lucene keys for {}.{}; removing stale docs from index.", staleKeys.size(), appId, tableName);
                String staleIndexKey = appId + "_" + tableName;
                luceneIndexLocks.putIfAbsent(staleIndexKey, new Object());
                synchronized (luceneIndexLocks.get(staleIndexKey)) {
                    IndexWriter writer = getOrCreateSharedIndexWriter(appId, tableName);
                    for (String staleKey : staleKeys) {
                        writer.deleteDocuments(new Term("_key", staleKey));
                    }
                    SearcherManager sm = searcherManagerCache.get(staleIndexKey);
                    if (sm != null) {
                        sm.maybeRefresh();
                    }
                }
            }

            List<String> keys = new ArrayList<>(uniqueKeys);
            // Ensure deterministic ordering across requests (independent of Lucene score/docId changes).
            keys.sort(RECORD_KEY_COMPARATOR_DESC);
            logger.debug("Found {} keys in table {} for app {}.", keys.size(), tableName, appId);
            return keys;

        } catch (IOException e) {
            logger.error("IOException during key search for appId {}, tableName {}: {}", appId, tableName, e.getMessage(), e);
        } catch (Exception e) {
            logger.error("An unexpected error occurred during key search for appId {}, tableName {}: {}", appId, tableName, e.getMessage(), e);
        } finally {
            if (searcher != null) {
                try {
                    SearcherManager searcherManager = searcherManagerCache.get(indexKey);
                    if (searcherManager != null) {
                        searcherManager.release(searcher); 
                    }
                } catch (IOException e) {
                    logger.error("Error releasing IndexSearcher for index {}: {}", indexKey, e.getMessage(), e);
                }
            }
        }
        return Collections.emptyList();
    }

    private List<String> scanMatchingKeysFromRocksDB(String appId, String tableName, SearchFilter filters, RocksDB db, int maxKeys) {
        if (db == null) {
            return Collections.emptyList();
        }

        List<String> keys = new ArrayList<>();
        try (RocksIterator iterator = db.newIterator()) {
            iterator.seekToFirst();
            while (iterator.isValid()) {
                String key = new String(iterator.key(), StandardCharsets.UTF_8);
                if (key.startsWith("__meta_")) {
                    iterator.next();
                    continue;
                }

                byte[] valueBytes = iterator.value();
                if (valueBytes == null) {
                    iterator.next();
                    continue;
                }

                try {
                    Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                    if (recordMatchesFilterObject(record, filters)) {
                        keys.add(key);
                        if (keys.size() >= maxKeys) {
                            logger.warn("Fallback RocksDB scan reached key cap {} for {}.{}", maxKeys, appId, tableName);
                            break;
                        }
                    }
                } catch (Exception ex) {
                    logger.warn("Skip unreadable record during fallback scan for key {}: {}", key, ex.getMessage());
                }
                iterator.next();
            }
        } catch (Exception ex) {
            logger.error("Fallback RocksDB scan failed for {}.{}: {}", appId, tableName, ex.getMessage(), ex);
        }

        keys.sort(RECORD_KEY_COMPARATOR_DESC);
        return keys;
    }

    private List<String> scanAllDataKeysFromRocksDB(RocksDB db) {
        if (db == null) {
            return Collections.emptyList();
        }

        List<String> keys = new ArrayList<>();
        try (RocksIterator iterator = db.newIterator()) {
            iterator.seekToFirst();
            while (iterator.isValid()) {
                String key = new String(iterator.key(), StandardCharsets.UTF_8);
                if (!key.startsWith("__meta_")) {
                    keys.add(key);
                }
                iterator.next();
            }
        } catch (Exception ex) {
            logger.error("Direct RocksDB key scan failed: {}", ex.getMessage(), ex);
            return Collections.emptyList();
        }

        keys.sort(RECORD_KEY_COMPARATOR_DESC);
        return keys;
    }

    private void repairLuceneIndexForKeys(String appId, String tableName, List<String> keys, RocksDB db) {
        if (keys == null || keys.isEmpty() || db == null) {
            return;
        }

        int repaired = 0;
        for (String key : keys) {
            if (key == null || key.isBlank()) {
                continue;
            }
            try {
                byte[] valueBytes = db.get(key.getBytes(StandardCharsets.UTF_8));
                if (valueBytes == null) {
                    continue;
                }
                Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                indexRecord(appId, tableName, key, record);
                repaired++;
            } catch (Exception ex) {
                logger.warn("Failed to repair Lucene doc for key {} in {}.{}: {}", key, appId, tableName, ex.getMessage());
            }
        }

        if (repaired > 0) {
            logger.info("Repaired {} Lucene docs from RocksDB for {}.{}", repaired, appId, tableName);
        }
    }

    private List<String> searchKeysConsistent(String appId, String tableName, SearchFilter filters, RocksDB db) {
        String metricKey = appId + "_" + tableName;
        bumpMetric(luceneSearchTotal, metricKey);

        if (isDirectRocksDbBypassFilter(filters)) {
            logger.info("Bypass Lucene search for {}.{} due to single id like/prefix empty filter", appId, tableName);
            List<String> directKeys = scanAllDataKeysFromRocksDB(db);
            if (!directKeys.isEmpty()) {
                bumpMetric(luceneSearchHit, metricKey);
            } else {
                bumpMetric(luceneSearchMiss, metricKey);
            }
            return directKeys;
        }

        if (!isFilterLuceneCompatible(appId, tableName, filters)) {
            long rejected = bumpMetric(luceneSearchRejected, metricKey);
            if (rejected % 200 == 1) {
                logger.warn("Lucene compatibility reject stats for {}: rejected={} total={}", metricKey, rejected,
                        luceneSearchTotal.get(metricKey) != null ? luceneSearchTotal.get(metricKey).longValue() : 0L);
            }
            return Collections.emptyList();
        }

        List<String> keys = searchKeys(appId, tableName, filters);
        if (keys != null && !keys.isEmpty()) {
            bumpMetric(luceneSearchHit, metricKey);
            return keys;
        }

        bumpMetric(luceneSearchMiss, metricKey);

        scheduleAsyncLuceneRebuild(appId, tableName);

        // Tránh full-scan fallback cho truy vấn rộng để không gây áp lực heap trong request thread.
        if (filters == null) {
            logger.warn("Lucene miss on broad query for {}.{} - skipping fallback full scan", appId, tableName);
            return Collections.emptyList();
        }

        Set<String> eqFields = collectEqFields(filters);
        if (!eqFields.contains("id")) {
            logger.warn("Lucene miss on non-id query for {}.{} - skipping fallback full scan", appId, tableName);
            return Collections.emptyList();
        }

        List<String> fallbackKeys = scanMatchingKeysFromRocksDB(appId, tableName, filters, db, MAX_FALLBACK_SCAN_KEYS);
        if (!fallbackKeys.isEmpty()) {
            return fallbackKeys;
        }
        return Collections.emptyList();
    }

    private void scheduleAsyncLuceneRebuild(String appId, String tableName) {
        if (shutdownInProgress.get() || repairExecutor.isShutdown()) {
            return;
        }

        String tableKey = appId + ":" + tableName;

        // Suppress re-schedule if a rebuild finished within the cool-down window.
        // Queries that were in-flight when the rebuild committed still see empty results;
        // they should resolve on the next natural retry without forcing another rebuild.
        Long lastRebuild = tableLastRebuildNanos.get(tableKey);
        if (lastRebuild != null && (System.nanoTime() - lastRebuild) < REBUILD_COOL_DOWN_NANOS) {
            return;
        }

        tableRepairScheduled.putIfAbsent(tableKey, new java.util.concurrent.atomic.AtomicBoolean(false));
        if (tableRepairScheduled.get(tableKey).compareAndSet(false, true)) {
            logger.warn("Lucene miss for {}.{} — scheduling async full index rebuild.", appId, tableName);
            repairExecutor.submit(() -> {
                try {
                    if (shutdownInProgress.get()) {
                        return;
                    }
                    rebuildFullLuceneIndex(appId, tableName);
                } catch (Exception ex) {
                    logger.error("Async Lucene rebuild failed for {}.{}: {}", appId, tableName, ex.getMessage(), ex);
                } finally {
                    tableLastRebuildNanos.put(tableKey, System.nanoTime());
                    tableRepairScheduled.get(tableKey).set(false);
                }
            });
        }
    }

    /** Rebuild the entire Lucene index for a table from RocksDB. Called async; must not block HTTP threads. */
    private void rebuildFullLuceneIndex(String appId, String tableName) {
        if (shutdownInProgress.get()) return;

        RocksDB db;
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
        } catch (Exception ex) {
            logger.error("Failed to acquire RocksDB for Lucene rebuild of {}.{}: {}", appId, tableName, ex.getMessage(), ex);
            return;
        }

        int scanned = 0;
        int repaired = 0;
        List<String> batchKeys = new ArrayList<>(REBUILD_REPAIR_BATCH_SIZE);

        try (RocksIterator iterator = db.newIterator()) {
            iterator.seekToFirst();
            while (iterator.isValid()) {
                if (shutdownInProgress.get()) {
                    return;
                }

                String key = new String(iterator.key(), java.nio.charset.StandardCharsets.UTF_8);
                if (!key.startsWith("__meta_")) {
                    batchKeys.add(key);
                    scanned++;
                    if (batchKeys.size() >= REBUILD_REPAIR_BATCH_SIZE) {
                        if (shutdownInProgress.get()) {
                            return;
                        }
                        repairLuceneIndexForKeys(appId, tableName, batchKeys, db);
                        repaired += batchKeys.size();
                        batchKeys.clear();
                    }
                }
                iterator.next();
            }
        } catch (Exception ex) {
            logger.error("Failed to iterate RocksDB for Lucene rebuild of {}.{}: {}", appId, tableName, ex.getMessage(), ex);
            return;
        }

        if (!batchKeys.isEmpty()) {
            if (shutdownInProgress.get()) {
                return;
            }
            repairLuceneIndexForKeys(appId, tableName, batchKeys, db);
            repaired += batchKeys.size();
            batchKeys.clear();
        }

        logger.info("Starting full Lucene rebuild for {}.{}: scanned={}, repaired={}", appId, tableName, scanned, repaired);
        try {
            if (shutdownInProgress.get()) {
                return;
            }
            IndexWriter writer = getOrCreateSharedIndexWriter(appId, tableName);
            writer.commit();
            String indexKey = appId + "_" + tableName;
            SearcherManager sm = searcherManagerCache.get(indexKey);
            if (sm != null) sm.maybeRefresh();
            logger.info("Full Lucene rebuild complete for {}.{}: repaired={} records.", appId, tableName, repaired);
        } catch (IOException ex) {
            logger.error("Failed to commit after Lucene rebuild for {}.{}: {}", appId, tableName, ex.getMessage(), ex);
        }
    }
    /**
     * Iterates through all RocksDB instances (appId/tableName combinations)
     * and calls the migrateKeys function for each.
     * This function can be used to trigger a full key migration across all databases.
     *
     * @param appId Optional: If provided, only databases for this appId will be migrated.
     * @param tableName Optional: If provided, only this table within the specified appId (or all apps if appId is null) will be migrated.
     */
    public void migrateKeys(String appId, String tableName) {
        String dbRootDir = DIR_PATH + "/database";

        File rootDir = new File(dbRootDir);
        if (!rootDir.exists() || !rootDir.isDirectory()) {
            logger.warn("⚠️ Không tìm thấy thư mục gốc: {}", dbRootDir);
            return;
        }

        File[] appDirs = rootDir.listFiles(File::isDirectory);
        if (appDirs == null || appDirs.length == 0) {
            logger.info("⚠️ Không có app nào trong thư mục: {}", dbRootDir);
            return;
        }

        logger.info("Bắt đầu duyệt và di chuyển khóa cho tất cả các database.");

        for (File appDir : appDirs) {
            String currentAppId = appDir.getName();

            // Nếu có appId và appId không khớp với currentAppId, bỏ qua
            if (appId != null && !appId.isEmpty() && !currentAppId.equals(appId)) {
                continue;
            }

            File[] tableDirs = appDir.listFiles(File::isDirectory);
            if (tableDirs == null || tableDirs.length == 0) continue;

            for (File tableDir : tableDirs) {
                String currentTable = tableDir.getName();

                // Nếu có tableName và tableName không khớp với currentTable, bỏ qua
                if (tableName != null && !tableName.isEmpty() && !currentTable.equals(tableName)) {
                    continue;
                }

                String dbPath = tableDir.getAbsolutePath();
                File currentFile = new File(dbPath + "/CURRENT");

                // Kiểm tra xem thư mục có phải là RocksDB không
                if (!currentFile.exists()) {
                    logger.warn("⚠️ Bỏ qua vì không phải RocksDB: {}/{}", currentAppId, currentTable);
                    continue;
                }

                logger.info("Đang xử lý di chuyển khóa cho app: {}, table: {}", currentAppId, currentTable);
                try {
                    // Gọi hàm migrateKeys đã định nghĩa trước đó
                    migrateKeysOne(currentAppId, currentTable);
                } catch (Exception e) {
                    logger.error("❌ Lỗi khi di chuyển khóa cho {}/{}: {}", currentAppId, currentTable, e.getMessage(), e);
                }
            }
        }
        logger.info("Hoàn tất duyệt và di chuyển khóa cho tất cả các database đã chọn.");
    }
    /**
     * Migrates existing RocksDB keys to the new key generation format.
     * This method iterates through all records, regenerates keys based on the new logic,
     * and updates them in the database.
     *
     * @param appId The application ID.
     * @param tableName The table name.
     */
    public void migrateKeysOne(String appId, String tableName) {
        RocksDB db = null;
        RocksIterator iterator = null;
        WriteBatch writeBatch = new WriteBatch();
        WriteOptions writeOptions = new WriteOptions();
        logger.info("Starting key migration for app: {}, table: {}", appId, tableName);

        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
            iterator = db.newIterator();
            iterator.seekToFirst();

            List<String> primaryKeys = getTableSearchKeys(appId, tableName,"fieldsPK");
            if (primaryKeys == null || primaryKeys.isEmpty()) {
                logger.warn("Không có khóa chính được định nghĩa cho bảng '{}'. Không thể di chuyển khóa.", tableName);
                return;
            }

            int migratedCount = 0;
            while (iterator.isValid()) {
                byte[] oldKeyBytes = iterator.key();
                byte[] valueBytes = iterator.value();

                String oldKeyString = new String(oldKeyBytes, StandardCharsets.UTF_8);

                // Skip meta keys
                if (oldKeyString.startsWith("__meta_")) {
                    iterator.next();
                    continue;
                }

                Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                
                // Generate the new key using the updated logic
                String newKeyString = generateKey(appId, tableName, record, primaryKeys);

                if (!oldKeyString.equals(newKeyString)) {
                    logger.debug("Migrating key: Old='{}', New='{}'", oldKeyString, newKeyString);
                    writeBatch.delete(oldKeyBytes);
                    writeBatch.put(newKeyString.getBytes(StandardCharsets.UTF_8), valueBytes);
                    migratedCount++;
                }
                iterator.next();
            }

            if (migratedCount > 0) {
                db.write(writeOptions, writeBatch);
                logger.info("Hoàn thành di chuyển {} khóa cho app: {}, table: {}", migratedCount, appId, tableName);
            } else {
                logger.info("Không có khóa nào cần di chuyển cho app: {}, table: {}", appId, tableName);
            }

        } catch (JsonProcessingException e) {
            logger.error("Lỗi deserialize dữ liệu trong quá trình di chuyển khóa: {}", e.getMessage(), e);
        } catch (RocksDBException e) {
            logger.error("Lỗi RocksDB trong quá trình di chuyển khóa: {}", e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            logger.error("Lỗi dữ liệu (thiếu khóa chính) trong quá trình di chuyển khóa: {}", e.getMessage(), e);
        } catch (Exception e) {
            logger.error("Lỗi không mong muốn trong quá trình di chuyển khóa: {}", e.getMessage(), e);
        } finally {
            if (iterator != null) {
                iterator.close();
            }
            if (writeBatch != null) {
                writeBatch.close();
            }
            if (writeOptions != null) {
                writeOptions.close();
            }
        }
    }

    public static SearchFilter createCondition(String field, String type, Object value) {
        SearchFilter f = new SearchFilter();
        f.setField(field);
        f.setType(type);
        f.setValue(value);
        return f;
    }

    /**
     * Xây dựng một Lucene Query từ đối tượng SearchFilter.
     * Hỗ trợ các toán tử logic (AND/OR) và một tập hợp phong phú các điều kiện lá,
     * bao gồm các cặp đối lập như eq/noteq, in/notin, gt/lte, lt/gte, like/notlike, prefix/notprefix, isnull/isnotnull.
     *
     * @param filter Đối tượng SearchFilter chứa các điều kiện tìm kiếm.
     * @return Một đối tượng Lucene Query tương ứng.
     */
    public static Query buildLuceneQuery(SearchFilter filter) {
        // Tự động chuẩn hóa điều kiện ngày trước khi truy vấn
        if (filter == null) {
            logger.warn("buildLuceneQuery nhận một SearchFilter là null. Trả về MatchNoDocsQuery (không lấy bản ghi nào).");
            return new MatchNoDocsQuery();
        }

        // --- Xử lý các điều kiện con (nhóm điều kiện với AND/OR) ---
        if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
            BooleanQuery.Builder builder = new BooleanQuery.Builder();
            BooleanClause.Occur occur = "OR".equalsIgnoreCase(filter.getOperator()) ?
                    BooleanClause.Occur.SHOULD : BooleanClause.Occur.MUST;

            for (SearchFilter subFilter : filter.getConditions()) {
                builder.add(buildLuceneQuery(subFilter), occur);
            }
            return builder.build();
        } else {
            // --- Xử lý điều kiện lá (leaf condition - điều kiện tìm kiếm cụ thể) ---
            String field = filter.getField();
            String type = filter.getType();
            Object value = filter.getValue();

            // Nếu filter trống rỗng, coi như MatchAllDocsQuery.
            if ((field == null || field.isEmpty()) &&
                (type == null || type.isEmpty()) &&
                (value == null)) {
                return new MatchAllDocsQuery();
            }

            // Kiểm tra các trường bắt buộc cho một điều kiện lá hợp lệ.
            if (field == null || field.isEmpty() || type == null || type.isEmpty()) {
                logger.warn("Điều kiện filter thiếu 'field' hoặc 'type'. Trả về MatchNoDocsQuery.");
                return new MatchNoDocsQuery();
            }

            // Xác định tên trường để truy vấn. (_key không thêm .keyword, các trường khác thêm .keyword cho tìm kiếm chính xác)
            String queryField = "_key".equals(field) ? "_key" : field + ".keyword";
            // Đối với các truy vấn số, chúng ta sẽ cần sử dụng tên trường gốc (không có .keyword)
            // hoặc một tên trường khác được lập chỉ mục riêng cho số.
            String numericField = field; // Giả định trường số không có ".keyword"

            switch (type.toLowerCase()) {
                // --- Cặp EQ / NOTEQ ---
                case "eq":
                    // Convert value to lowercase để tìm kiếm không phân biệt chữ hoa/thường
                    String eqValue = value instanceof String ? ((String) value).toLowerCase() : value.toString();
                    return new TermQuery(new Term(queryField, eqValue));

                case "noteq":
                    // Tài liệu phải có trường VÀ giá trị không bằng 'value'.
                    if (value == null) {
                        // "noteq null" tương đương với "is not null" (field exists and has a non-null value)
                        // Chúng ta sẽ xử lý nó như "isnotnull"
                        return buildLuceneQuery(createCondition(field, "isnotnull", null));
                    }
                    // Convert value to lowercase để tìm kiếm không phân biệt chữ hoa/thường
                    String noteqValue = value instanceof String ? ((String) value).toLowerCase() : value.toString();
                    BooleanQuery.Builder notEqBuilder = new BooleanQuery.Builder();
                    notEqBuilder.add(new WildcardQuery(new Term(queryField, "?*")), BooleanClause.Occur.MUST); // Trường phải tồn tại
                    notEqBuilder.add(new TermQuery(new Term(queryField, noteqValue)), BooleanClause.Occur.MUST_NOT);
                    return notEqBuilder.build();

                case "eqignorecase":
                    if (value instanceof String) {
                        return new TermQuery(new Term(queryField, ((String) value).toLowerCase()));
                    }
                    logger.warn("Loại truy vấn 'eqIgnoreCase' yêu cầu giá trị String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                // --- Cặp LIKE / NOTLIKE ---
                case "like":
                    if (value instanceof String) {
                        String v = ((String) value).toLowerCase();
                        // Convert value to lowercase để tìm kiếm không phân biệt chữ hoa/thường
                        return new WildcardQuery(new Term(queryField, "*" + v + "*"));
                    }
                    logger.warn("Loại truy vấn 'like' yêu cầu giá trị String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                case "notlike":
                    // Tài liệu phải có trường VÀ không chứa chuỗi con 'value'.
                    if (value instanceof String) {
                        String v = ((String) value).toLowerCase();
                        BooleanQuery.Builder notLikeBuilder = new BooleanQuery.Builder();
                        notLikeBuilder.add(new WildcardQuery(new Term(queryField, "?*")), BooleanClause.Occur.MUST); // Trường phải tồn tại
                        notLikeBuilder.add(new WildcardQuery(new Term(queryField, "*" + v + "*")), BooleanClause.Occur.MUST_NOT);
                        return notLikeBuilder.build();
                    }
                    logger.warn("Loại truy vấn 'notlike' yêu cầu giá trị String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                // --- Cặp PREFIX / NOTPREFIX ---
                case "prefix":
                    if (value instanceof String) {
                        return new PrefixQuery(new Term(queryField, ((String) value).toLowerCase()));
                    }
                    logger.warn("Loại truy vấn 'prefix' yêu cầu giá trị String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                case "notprefix":
                    // Tài liệu phải có trường VÀ không bắt đầu bằng chuỗi 'value'.
                    if (value instanceof String) {
                        BooleanQuery.Builder notPrefixBuilder = new BooleanQuery.Builder();
                        notPrefixBuilder.add(new WildcardQuery(new Term(queryField, "?*")), BooleanClause.Occur.MUST); // Trường phải tồn tại
                        notPrefixBuilder.add(new PrefixQuery(new Term(queryField, ((String) value).toLowerCase())), BooleanClause.Occur.MUST_NOT);
                        return notPrefixBuilder.build();
                    }
                    logger.warn("Loại truy vấn 'notprefix' yêu cầu giá trị String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                // --- Cặp IN / NOTIN ---
                case "in":
                    if (value instanceof List<?>) {
                        BooleanQuery.Builder inBuilder = new BooleanQuery.Builder();
                        List<?> valuesList = (List<?>) value;
                        if (valuesList.isEmpty()) {
                            return new MatchNoDocsQuery();
                        }
                        for (Object item : valuesList) {
                            if (item != null) {
                                String itemStr = item instanceof String ? ((String) item).toLowerCase() : item.toString();
                                inBuilder.add(new TermQuery(new Term(queryField, itemStr)), BooleanClause.Occur.SHOULD);
                            }
                        }
                        return inBuilder.build();
                    } else {
                        logger.warn("Loại truy vấn 'in' yêu cầu một List<?> làm giá trị, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                        return new MatchNoDocsQuery();
                    }

                case "notin":
                    // Tài liệu phải có trường VÀ giá trị không nằm trong danh sách.
                    if (value instanceof List<?>) {
                        BooleanQuery.Builder notInBuilder = new BooleanQuery.Builder();
                        List<?> valuesList = (List<?>) value;
                        notInBuilder.add(new WildcardQuery(new Term(queryField, "?*")), BooleanClause.Occur.MUST); // Trường phải tồn tại
                        for (Object item : valuesList) {
                            if (item != null) {
                                String itemStr = item instanceof String ? ((String) item).toLowerCase() : item.toString();
                                notInBuilder.add(new TermQuery(new Term(queryField, itemStr)), BooleanClause.Occur.MUST_NOT);
                            }
                        }
                        return notInBuilder.build();
                    } else {
                        logger.warn("Loại truy vấn 'notin' yêu cầu một List<?> làm giá trị, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                        return new MatchNoDocsQuery();
                    }

                // --- Cặp ISNULL / ISNOTNULL ---
                case "isnull":
                    // Tìm các tài liệu KHÔNG có trường này.
                    // Tạo một BooleanQuery tổng thể, bao gồm tất cả tài liệu, sau đó loại trừ những tài liệu CÓ trường đó.
                    BooleanQuery.Builder isNullBuilder = new BooleanQuery.Builder();
                    isNullBuilder.add(new MatchAllDocsQuery(), BooleanClause.Occur.MUST); // Bắt đầu với tất cả tài liệu
                    // Loại trừ tài liệu có bất kỳ giá trị nào cho trường đó
                    isNullBuilder.add(new WildcardQuery(new Term(queryField, "?*")), BooleanClause.Occur.MUST_NOT);
                    return isNullBuilder.build();

                case "isnotnull":
                    // Tìm các tài liệu CÓ trường này (có bất kỳ giá trị nào không rỗng).
                    // Đây chính là chức năng của WildcardQuery("?*")
                    return new WildcardQuery(new Term(queryField, "?*"));


                // --- Toán tử so sánh (GT, LT, GTE, LTE) ---
                // Hỗ trợ cả so sánh số (Number) và so sánh lexicographic (String)
                case "gt": // Greater Than (lớn hơn)
                    if (value instanceof Number) {
                        double doubleValue = ((Number) value).doubleValue();
                        return DoublePoint.newRangeQuery(numericField, Math.nextUp(doubleValue), Double.POSITIVE_INFINITY);
                    } else if (value instanceof String) {
                        // So sánh lexicographic: giá trị > value (không bao gồm value)
                        return TermRangeQuery.newStringRange(queryField, (String) value, null, false, false);
                    }
                    logger.warn("Loại truy vấn 'gt' yêu cầu giá trị Number hoặc String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                case "gte": // Greater Than or Equal (lớn hơn hoặc bằng)
                    if (value instanceof Number) {
                        double doubleValue = ((Number) value).doubleValue();
                        return DoublePoint.newRangeQuery(numericField, doubleValue, Double.POSITIVE_INFINITY);
                    } else if (value instanceof String) {
                        // So sánh lexicographic: giá trị >= value (bao gồm value)
                        return TermRangeQuery.newStringRange(queryField, (String) value, null, true, false);
                    }
                    logger.warn("Loại truy vấn 'gte' yêu cầu giá trị Number hoặc String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                case "lt": // Less Than (nhỏ hơn)
                    if (value instanceof Number) {
                        double doubleValue = ((Number) value).doubleValue();
                        return DoublePoint.newRangeQuery(numericField, Double.NEGATIVE_INFINITY, Math.nextDown(doubleValue));
                    } else if (value instanceof String) {
                        // So sánh lexicographic: giá trị < value (không bao gồm value)
                        return TermRangeQuery.newStringRange(queryField, null, (String) value, false, false);
                    }
                    logger.warn("Loại truy vấn 'lt' yêu cầu giá trị Number hoặc String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                case "lte": // Less Than or Equal (nhỏ hơn hoặc bằng)
                    if (value instanceof Number) {
                        double doubleValue = ((Number) value).doubleValue();
                        return DoublePoint.newRangeQuery(numericField, Double.NEGATIVE_INFINITY, doubleValue);
                    } else if (value instanceof String) {
                        // So sánh lexicographic: giá trị <= value (bao gồm value)
                        return TermRangeQuery.newStringRange(queryField, null, (String) value, false, true);
                    }
                    logger.warn("Loại truy vấn 'lte' yêu cầu giá trị Number hoặc String, nhưng nhận được: {}", Objects.nonNull(value) ? value.getClass().getName() : "null");
                    return new MatchNoDocsQuery();

                default:
                    throw new IllegalArgumentException("Unsupported query type: " + type);
            }
        }
    }

    private void incrementMetaCount(RocksDB db, int delta) throws RocksDBException {
        byte[] metaKey = "__meta_totalCount".getBytes(StandardCharsets.UTF_8);
        byte[] currentValue = db.get(metaKey);
        long current = currentValue == null ? 0 : Long.parseLong(new String(currentValue));
        db.put(metaKey, String.valueOf(current + delta).getBytes(StandardCharsets.UTF_8));
    }

    private void decrementMetaCount(RocksDB db, int delta) throws RocksDBException {
        incrementMetaCount(db, -delta);
    }

    private final String SEPARATOR = "\u001F"; // ASCII 31 - Unit Separator

    private String generateKey(String appId, String tableName, Map<String, Object> filters, List<String>... customKeyArrays) {
        List<String> keyFields;
    
        logger.debug("Tìm trong chương trình {} bảng {} tìm kiếm {} với customKey là {}", appId, tableName, filters, (customKeyArrays.length > 0 && customKeyArrays[0] != null) ? customKeyArrays[0] : "[]");
    
        // Trường hợp đặc biệt cho bảng "index": chỉ dùng giá trị của trường "id" làm key.
        if ("index".equalsIgnoreCase(tableName)) {
            Object idValue = extractValueForKey(filters, "id");
            if (idValue == null) {
                logger.warn("Thiếu trường 'id' cho bảng index '{}' trong chương trình '{}'.", tableName, appId);
                throw new IllegalArgumentException("Missing 'id' field for index table.");
            }
            return urlEncode(idValue.toString());
        }
    
        // Xác định keyFields dựa trên customKeyArrays.
        // customKeyArrays là một varargs của List<String>.
        // Ta chỉ quan tâm đến List<String> đầu tiên nếu nó tồn tại và không rỗng.
        if (customKeyArrays.length > 0 && customKeyArrays[0] != null && !customKeyArrays[0].isEmpty()) {
            keyFields = customKeyArrays[0];
            logger.debug("Sử dụng customKey truyền vào cho bảng {} chương trình {}: {}", tableName, appId, keyFields);
        } else {
            // Nếu customKeyArrays rỗng, null, hoặc List đầu tiên rỗng, mặc định dùng "id".
            logger.warn("⚠️ Không có customKey truyền vào hoặc customKey rỗng/null, dùng mặc định ['id'] cho bảng {} chương trình {}", tableName, appId);
            keyFields = Collections.singletonList("id");
        }
    
        // Tạo keySuffix từ các giá trị của keyFields trong filters
        String keySuffix = keyFields.stream()
            .map(k -> {
                Object value = extractValueForKey(filters, k);
                if (value == null) {
                    // Expected during dedup-key generation: not all PK fields are present in every filter/record.
                    logger.debug("⚠ Trường khóa chính '{}' không có giá trị trong filters cho bảng {} chương trình {}. Key có thể không đầy đủ.", k, tableName, appId);
                }
                return urlEncode(value != null ? value.toString() : "");
            })
            .collect(Collectors.joining(":")); // Nối các giá trị bằng dấu ":"
    
        return keySuffix;
    }   

    public String buildPrimaryKeyKey(String appId, String tableName, Map<String, Object> record, List<String> pkFields) {
        if (pkFields == null || pkFields.isEmpty()) {
            return null;
        }
        return generateKey(appId, tableName, record, pkFields);
    }

    public boolean existsByPrimaryKey(String appId, String tableName, Map<String, Object> record, List<String> pkFields) {
        String key = buildPrimaryKeyKey(appId, tableName, record, pkFields);
        if (key == null || key.isBlank()) {
            return false;
        }
        RocksDB db = null;
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
            byte[] value = db.get(key.getBytes(StandardCharsets.UTF_8));
            return value != null;
        } catch (Exception e) {
            logger.error("Failed to check existing record by primary key for {}.{}: {}", appId, tableName, e.getMessage(), e);
            return false;
        }
    }
    
    // Mã hóa URL-safe (giống encodeURIComponent của JS)
    private static String urlEncode(String input) {
        try {
            return URLEncoder.encode(input, StandardCharsets.UTF_8.toString());
        } catch (Exception e) {
            throw new RuntimeException("Error encoding value: " + input, e);
        }
    }  

    private List<String> buildLegacyKeyCandidates(String appId, String tableName, String canonicalKey) {
        List<String> candidates = new ArrayList<>();
        if (canonicalKey == null || canonicalKey.isBlank()) {
            return candidates;
        }
        candidates.add(canonicalKey);
        candidates.add(tableName + "_" + canonicalKey);
        candidates.add(appId + "_" + tableName + "_" + canonicalKey);
        return candidates;
    }

    private String resolveExistingStorageKey(RocksDB db, String appId, String tableName, String canonicalKey) {
        if (db == null || canonicalKey == null || canonicalKey.isBlank()) {
            return canonicalKey;
        }
        try {
            for (String candidate : buildLegacyKeyCandidates(appId, tableName, canonicalKey)) {
                byte[] existing = db.get(candidate.getBytes(StandardCharsets.UTF_8));
                if (existing != null) {
                    return candidate;
                }
            }
        } catch (Exception e) {
            logger.warn("Không thể resolve storage key cho {}.{} canonicalKey={}: {}", appId, tableName, canonicalKey, e.getMessage());
        }
        return canonicalKey;
    }

    private String resolveStorageKeyById(RocksDB db, String appId, String tableName, Map<String, Object> record) {
        if (db == null || record == null) {
            return null;
        }
        Object idObj = record.get("id");
        if (idObj == null || String.valueOf(idObj).isBlank()) {
            return null;
        }
        try {
            List<String> keys = findStorageKeysById(db, appId, tableName, String.valueOf(idObj));
            if (!keys.isEmpty()) {
                return keys.get(0);
            }
        } catch (Exception e) {
            logger.warn("Không thể resolve key theo id cho {}.{} id={}: {}", appId, tableName, idObj, e.getMessage());
        }
        return null;
    }

    private List<String> findStorageKeysById(RocksDB db, String appId, String tableName, String idValue) {
        if (db == null || idValue == null || idValue.isBlank()) {
            return Collections.emptyList();
        }

        SearchFilter idFilter = new SearchFilter();
        idFilter.setField("id");
        idFilter.setType("eq");
        idFilter.setValue(idValue);

        List<String> keysFromLucene = searchKeys(appId, tableName, idFilter);
        if (keysFromLucene == null || keysFromLucene.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> existingKeys = new ArrayList<>();
        for (String key : keysFromLucene) {
            if (key == null || key.isBlank()) {
                continue;
            }
            try {
                byte[] value = db.get(key.getBytes(StandardCharsets.UTF_8));
                if (value != null) {
                    existingKeys.add(key);
                }
            } catch (Exception e) {
                logger.debug("Bỏ qua key theo id không đọc được {}: {}", key, e.getMessage());
            }
        }
        return existingKeys;
    }

    // --- Phương thức deserializeValueToMap (không thay đổi) ---
    /**
     * Helper method to deserialize byte array to Map, handling primitive types.
     * If the value is a primitive, it's wrapped into a Map with a special key "_value".
     * @param valueBytes The byte array to deserialize.
     * @param key The key associated with the value, for logging purposes.
     * @return A Map<String, Object> representing the record, or null if unprocessable.
          * @throws IOException 
          */
         private Map<String, Object> deserializeValueToMap(byte[] valueBytes, String key, String tableName) throws IOException {
        if (valueBytes == null || valueBytes.length == 0) {
            return null;
        }

        boolean isMetaKey = key != null && key.startsWith("__meta_");

        if (valueBytes.length > MAX_SAFE_JSON_RECORD_BYTES) {
            logger.error("❌ Bỏ qua record key '{}' vì kích thước {} bytes vượt ngưỡng an toàn {} bytes.",
                    key, valueBytes.length, MAX_SAFE_JSON_RECORD_BYTES);
            return null;
        }

        try {
            // Bước 1: Thử deserialize trực tiếp thành Map
            return objectMapper.readValue(valueBytes, Map.class);
        } catch (MismatchedInputException e) {
            // Lỗi mismatch, có thể là giá trị nguyên thủy.
            // Bước 2: Thử deserialize thành một kiểu Object chung, Jackson sẽ tự động đoán kiểu nguyên thủy.
            try {
                Object primitiveValue = objectMapper.readValue(valueBytes, Object.class);
                // Bước 3: Nếu là giá trị nguyên thủy, bao bọc nó vào một Map với khóa đặc biệt
                Map<String, Object> wrappedMap = new HashMap<>();
                wrappedMap.put("_value", primitiveValue); // Sử dụng khóa đặc biệt "_value"
                if (!isMetaKey) {
                    logger.warn("⚠️ Bản ghi với key '{}' có giá trị nguyên thủy '{}'. Đã được bao bọc thành Map với khóa '_value'.",
                               key, primitiveValue);
                }
                return wrappedMap;
            } catch (JsonProcessingException innerEx) {
                // Vẫn không thể xử lý (ví dụ: JSON bị hỏng hoàn toàn)
                if (!isMetaKey) {
                    logger.warn("⚠️ Bỏ qua bản ghi với key '{}' vì không thể deserialize giá trị. Lỗi: {}",
                               key, innerEx.getMessage());
                }
                return null;
            }
        } catch (JsonProcessingException e) {
            // Bắt các lỗi JsonProcessingException khác (ví dụ: JSON malformed nhưng không phải mismatch)
            if (!isMetaKey) {
                logger.warn("⚠️ Bỏ qua bản ghi với key '{}' vì giá trị không phải JSON hợp lệ. Lỗi: {}",
                           key, e.getMessage());
            }
            return null;
        } catch (Exception e) {
            // Bắt các lỗi bất ngờ khác trong quá trình deserialize
            logger.error("❌ Lỗi không mong muốn khi deserialize bản ghi với key '{}'. Lỗi: {}",
                         key, e.getMessage(), e);
            return null;
        }
    }

    // --- HÀM FIND ĐÃ ĐƯỢC CẬP NHẬT (KHÔNG DÙNG COLUMNFAMILYHANDLE) ---
    public Map<String, Object> find(String appId, String tableName, SearchFilter filter) {
        RocksDB db = null;
        RocksIterator iterator = null; // Khai báo iterator ở đây để đảm bảo nó được đóng trong finally
        boolean scanPermitAcquired = false;

        try {
            db = getDatabaseWithBloomFilter(appId, tableName); // Giả định RocksDB instance đã sẵn sàng
            if (db == null) throw new IllegalStateException("RocksDB null cho " + tableName);
    
            // Tìm primary key nếu có: try multiple candidate key formats (canonical, present-only, prefixed)
            Map<String, Object> pkRecord = tryFindRecordByPrimaryKeyVariants(db, appId, tableName, filter);
            if (pkRecord != null) {
                return pkRecord;
            }

            // Fast path cho lookup eq phổ biến (refresh/app_token/id) để tránh full-scan dưới tải cao.
            Map<String, Object> directEqRecord = tryFindByDirectEqKey(db, appId, tableName, filter);
            if (directEqRecord != null) {
                return directEqRecord;
            }

            // Ưu tiên dùng key từ Lucene (nếu có) để chỉ đọc một vài bản ghi thay vì duyệt toàn bộ RocksDB.
            Map<String, Object> luceneCandidateRecord = tryFindByLuceneKeyCandidates(appId, tableName, filter, db);
            if (luceneCandidateRecord != null) {
                return luceneCandidateRecord;
            }

            if (isStrictNoScanFindFilter(filter)) {
                logger.warn("find() strict no-scan mode for {}.{} on auth/token field; skip RocksDB fallback scan", appId, tableName);
                return Collections.emptyMap();
            }

            if (!findScanConcurrencyGuard.tryAcquire()) {
                logger.warn("find() fallback scan throttled for {}.{} to protect heap under concurrent load", appId, tableName);
                return Collections.emptyMap();
            }
            scanPermitAcquired = true;
    
            // Nếu không có primary key hoặc tìm theo PK không thấy/không khớp → dùng iterator cẩn thận
            iterator = db.newIterator(); // KHÔNG dùng CFH cho iterator
            iterator.seekToFirst(); // Bắt đầu từ bản ghi đầu tiên trong DEFAULT_COLUMN_FAMILY

            // LƯU Ý: Nếu bạn đang lưu trữ dữ liệu của nhiều "bảng" trong cùng một DEFAULT_COLUMN_FAMILY,
            // vòng lặp này sẽ duyệt qua TẤT CẢ dữ liệu. Bạn cần đảm bảo các key của bạn được tiền tố
            // bằng appId và tableName (ví dụ: "appId_tableName_your_key") và
            // recordMatchesFilterObject của bạn có thể lọc ra các bản ghi đúng.
            
            int scanned = 0;
            long scannedBytes = 0L;
            while (iterator.isValid() && scanned < MAX_FIND_SCAN_RECORDS) {
                byte[] keyBytes = iterator.key();
                byte[] valueBytes = iterator.value();
                String currentKeyForLog = new String(keyBytes, StandardCharsets.UTF_8); // Để dùng cho logging

                if (valueBytes != null) {
                    scannedBytes += valueBytes.length;
                    if (scannedBytes > MAX_FIND_SCAN_BYTES) {
                        logger.warn("find() scan byte budget reached for {}.{} ({} bytes), stopping early to protect heap",
                                appId, tableName, scannedBytes);
                        break;
                    }
                    try {
                        if (valueBytes.length > MAX_SAFE_FIND_RECORD_BYTES) {
                            logger.warn("Skip key '{}' in find() because record size {} exceeds safe find limit {} bytes",
                                    currentKeyForLog, valueBytes.length, MAX_SAFE_FIND_RECORD_BYTES);
                            iterator.next();
                            scanned++;
                            continue;
                        }

                        // Sử dụng hàm deserializeValueToMap đã được cải tiến để xử lý lỗi kiểu dữ liệu
                        Map<String, Object> record = deserializeValueToMap(valueBytes, currentKeyForLog, tableName);
                        
                        if (record != null && recordMatchesFilterObject(record, filter)) {
                            return record;
                        }
                    } catch (Exception ex) {
                        // Bắt các lỗi xảy ra trong quá trình xử lý TỪNG bản ghi
                        // (ngoài lỗi deserialize đã được handle bởi deserializeValueToMap)
                        logger.warn("Lỗi khi xử lý bản ghi với key '{}': {}", currentKeyForLog, ex.getMessage(), ex);
                    }
                }
                iterator.next(); // Di chuyển đến bản ghi tiếp theo
                scanned++;
            }

            if (scanned >= MAX_FIND_SCAN_RECORDS) {
                logger.warn("find() scan limit reached for {}.{} ({} records). Preventing unbounded full scan under load.",
                        appId, tableName, MAX_FIND_SCAN_RECORDS);
            }
            
            return Collections.emptyMap(); // Nếu duyệt hết mà không tìm thấy
        } catch (Exception e) {
            // Lỗi cấp cao hơn liên quan đến RocksDB hoặc logic tổng thể của hàm find
            String jsonComplexFilter = null;
            try {
                jsonComplexFilter = objectMapper.writeValueAsString(filter);
            } catch (JsonProcessingException jsonEx) {
                logger.error("Lỗi khi chuyển đổi filter thành JSON trong catch block của find: {}", jsonEx.getMessage());
            }
            
            if (jsonComplexFilter != null) {
                System.out.println("JSON từ SearchFilter phức tạp (trong lỗi find): " + jsonComplexFilter);
            }
            logger.error("❌ Lỗi khi find dữ liệu {} (table: {}): {}", appId, tableName, e.getMessage(), e);
            return Collections.emptyMap(); // Trả về Map rỗng khi có lỗi
        } finally {
            // Đảm bảo iterator luôn được đóng trong mọi trường hợp
            if (iterator != null) {
                try {
                    iterator.close();
                } catch (Exception e) {
                    logger.error("Error closing RocksIterator in find's finally block: {}", e.getMessage());
                }
            }
            if (scanPermitAcquired) {
                findScanConcurrencyGuard.release();
            }
        }
    } 
    
    private String tryGeneratePrimaryKey(String appId, String tableName, SearchFilter filter) {
        try {
            Map<String, Object> map = new HashMap<>();
            extractEqualityConditions(filter, map);
            List<String> primaryKeys;
            if ("index".equalsIgnoreCase(tableName)) {
                primaryKeys = List.of("id");
            } else {
                primaryKeys = getTableSearchKeys(appId, tableName, "fieldsPK");
                String jsonFilter = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(filter);
                logger.info("Xem bảng {} với trường khoá chính là {} trong {} xét filter {}", tableName, primaryKeys, map, jsonFilter);

                // Build canonical primary key even if only one of the PK fields present
                // Requirement: if at least one PK present, use it and set remaining PK fields to empty string
                List<String> presentKeyFields = primaryKeys.stream()
                    .filter(pk -> map.containsKey(pk) && map.get(pk) != null && !map.get(pk).toString().isEmpty())
                    .collect(Collectors.toList());

                if (presentKeyFields.isEmpty()) {
                    // No equality conditions found for any primary key field -> cannot generate canonical PK
                    logger.info("Bỏ qua generate PK cho {} vì filter không chứa bất kỳ khóa chính nào: {}", tableName, primaryKeys);
                    return null; // fallback to full scan
                }

                // Ensure all primaryKeys exist in map: fill missing with empty string
                for (String pk : primaryKeys) {
                    if (!map.containsKey(pk) || map.get(pk) == null) {
                        map.put(pk, "");
                    }
                }

                String canonicalKey = generateKey(appId, tableName, map, primaryKeys);
                logger.debug("Generated canonical PK (filled missing PKs with empty) using present fields {} => {}", presentKeyFields, canonicalKey);
                return canonicalKey;
            }
            return generateKey(appId, tableName, map, primaryKeys);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Try to find a record in RocksDB using primary-key equality conditions from the filter.
     * This method will attempt several candidate key formats to be tolerant with legacy keys:
     * - canonical key (all PKs present, missing filled with empty)
     * - present-only key (only PK fields that appear in the filter)
     * - prefixed variants (tableName_ + key, appId_tableName_ + key)
     * Returns the deserialized record Map if found and matching, otherwise null.
     */
    private Map<String, Object> tryFindRecordByPrimaryKeyVariants(RocksDB db, String appId, String tableName, SearchFilter filter) {
        try {
            if (db == null) return null;

            Map<String, Object> map = new HashMap<>();
            extractEqualityConditions(filter, map);
            if (map.isEmpty()) return null;

            if ("index".equalsIgnoreCase(tableName)) {
                Object idValue = extractValueForKey(map, "id");
                if (idValue == null) return null;
                String base = urlEncode(idValue.toString());
                List<String> candidates = List.of(base, tableName + "_" + base, appId + "_" + tableName + "_" + base);
                for (String k : candidates) {
                    byte[] vb = db.get(k.getBytes(StandardCharsets.UTF_8));
                    if (vb != null) {
                        Map<String, Object> record = deserializeValueToMap(vb, k, tableName);
                        if (record != null && recordMatchesFilterObject(record, filter)) return record;
                    }
                }
                return null;
            }

            // Use cached PK definition to avoid recursive metadata lookups in hot path.
            List<String> primaryKeys = getTableSearchKeys(appId, tableName, "fieldsPK");
            if (primaryKeys == null || primaryKeys.isEmpty()) return null;

            // present-only keys
            List<String> presentKeyFields = primaryKeys.stream()
                    .filter(pk -> map.containsKey(pk) && map.get(pk) != null && !map.get(pk).toString().isEmpty())
                    .collect(Collectors.toList());

            if (presentKeyFields.isEmpty()) return null;

            // Build canonical (fill missing with empty)
            Map<String, Object> mapFilled = new HashMap<>(map);
            for (String pk : primaryKeys) {
                if (!mapFilled.containsKey(pk) || mapFilled.get(pk) == null) mapFilled.put(pk, "");
            }
            String canonical = generateKey(appId, tableName, mapFilled, primaryKeys);

            // Build present-only key
            String presentOnly = generateKey(appId, tableName, map, presentKeyFields);

            List<String> bases = new ArrayList<>();
            bases.add(canonical);
            if (!presentOnly.equals(canonical)) bases.add(presentOnly);

            for (String base : bases) {
                List<String> candidates = List.of(base, tableName + "_" + base, appId + "_" + tableName + "_" + base);
                for (String k : candidates) {
                    try {
                        byte[] vb = db.get(k.getBytes(StandardCharsets.UTF_8));
                        if (vb != null) {
                            Map<String, Object> record = deserializeValueToMap(vb, k, tableName);
                            if (record != null && recordMatchesFilterObject(record, filter)) return record;
                        }
                    } catch (RocksDBException ex) {
                        logger.warn("RocksDBException while trying candidate key {}: {}", k, ex.getMessage());
                    }
                }
            }

        } catch (Exception e) {
            logger.warn("Error while trying primary-key variants for {}.{}: {}", appId, tableName, e.getMessage());
        }
        return null;
    }
    
    private void extractEqualityConditions(SearchFilter filter, Map<String, Object> result) {
        if (filter == null) return;
    
        if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
            for (SearchFilter sub : filter.getConditions()) {
                extractEqualityConditions(sub, result);
            }
        } else if ("eq".equalsIgnoreCase(filter.getType()) && filter.getField() != null) {
            result.put(filter.getField(), filter.getValue());
        }
    }

    private Map<String, Object> tryFindByDirectEqKey(RocksDB db, String appId, String tableName, SearchFilter filter) {
        if (db == null) return null;

        SearchFilter leaf = unwrapSingleLeafCondition(filter);
        if (leaf == null || leaf.getField() == null || leaf.getType() == null) {
            return null;
        }
        if (!"eq".equalsIgnoreCase(leaf.getType().trim())) {
            return null;
        }

        String field = leaf.getField().trim();
        boolean supportedField = "id".equals(field)
                || "app_token".equals(field)
                || "refresh".equals(field)
                || "refresh_token".equals(field);
        if (!supportedField) {
            return null;
        }

        Object rawValue = leaf.getValue();
        if (rawValue == null) return null;
        String value = String.valueOf(rawValue).trim();
        if (value.isEmpty()) return null;

        String base = urlEncode(value);
        List<String> candidates = List.of(base, tableName + "_" + base, appId + "_" + tableName + "_" + base);
        for (String key : candidates) {
            try {
                byte[] valueBytes = db.get(key.getBytes(StandardCharsets.UTF_8));
                if (valueBytes == null) {
                    continue;
                }
                if (valueBytes.length > MAX_SAFE_FIND_RECORD_BYTES) {
                    logger.warn("Skip direct find key '{}' because record size {} exceeds safe find limit {} bytes", key,
                            valueBytes.length, MAX_SAFE_FIND_RECORD_BYTES);
                    continue;
                }
                Map<String, Object> record = deserializeValueToMap(valueBytes, key, tableName);
                if (record != null && recordMatchesFilterObject(record, filter)) {
                    return record;
                }
            } catch (Exception ex) {
                logger.debug("Direct eq lookup failed for candidate key {}: {}", key, ex.getMessage());
            }
        }
        return null;
    }

    private Map<String, Object> tryFindByLuceneKeyCandidates(String appId, String tableName, SearchFilter filter, RocksDB db) {
        SearchFilter leaf = unwrapSingleLeafCondition(filter);
        if (leaf == null || leaf.getType() == null || !"eq".equalsIgnoreCase(leaf.getType().trim())) {
            return null;
        }

        try {
            List<String> keys = searchKeysConsistent(appId, tableName, filter, db);
            if (keys == null || keys.isEmpty()) {
                return null;
            }

            int maxKeysToCheck = Math.min(20, keys.size());
            for (int i = 0; i < maxKeysToCheck; i++) {
                String key = keys.get(i);
                if (key == null || key.isBlank()) continue;

                byte[] valueBytes = db.get(key.getBytes(StandardCharsets.UTF_8));
                if (valueBytes == null) continue;
                if (valueBytes.length > MAX_SAFE_FIND_RECORD_BYTES) {
                    logger.warn("Skip Lucene candidate key '{}' because record size {} exceeds safe find limit {} bytes", key,
                            valueBytes.length, MAX_SAFE_FIND_RECORD_BYTES);
                    continue;
                }

                Map<String, Object> record = deserializeValueToMap(valueBytes, key, tableName);
                if (record != null && recordMatchesFilterObject(record, filter)) {
                    return record;
                }
            }
        } catch (Exception ex) {
            logger.warn("Lucene-assisted find failed for {}.{}: {}", appId, tableName, ex.getMessage());
        }

        return null;
    }
    
    public Map<String, Object> filter(String appId, String tableName, SearchFilter searchFilter) {
        List<Map<String, Object>> results = new ArrayList<>();
        Set<String> seenDedupKeys = new HashSet<>();
        RocksDB db = null;
        long totalCount = 0L; // Tổng số bản ghi, nếu có metadata
        long filteredCount = 0L;
        boolean truncated = false;
        String nextCursor = null;
        long payloadBytes = 0L;
    
        try {
            // Lấy RocksDB instance từ RocksDBManager hoặc phương thức quản lý DB của bạn
            // Giả định getDatabaseWithBloomFilter trả về một instance RocksDB đã được mở
            // và được quản lý vòng đời bên ngoài phương thức này.
            db = getDatabaseWithBloomFilter(appId, tableName);
            if (db == null) {
                // Đây là một lỗi nghiêm trọng, nên throw một ngoại lệ rõ ràng hơn
                // để caller có thể bắt hoặc để Spring xử lý.
                throw new IllegalStateException("Không thể lấy RocksDB instance cho bảng: " + tableName + ". Vui lòng kiểm tra cấu hình hoặc quyền truy cập.");
            }

            // Truy vấn chỉ có 1 điều kiện like rỗng nghĩa là lấy toàn bộ dữ liệu:
            // dùng đường RocksDB trực tiếp để tránh chi phí Lucene + allKeys trên RAM.
            if (searchFilter == null || isDirectRocksDbBypassFilter(searchFilter)) {
                logger.info("Bypass Lucene in filter() for {}.{} due to full-fetch like-empty condition", appId, tableName);
                return filterWithPaginationNoFilter(appId, tableName, null, null, db);
            }
    
            // --- BẮT ĐẦU ĐỌC TỔNG SỐ BẢN GHI (Metadata) ---
            // Cố gắng đọc tổng số bản ghi nếu có key metadata như "__meta_totalCount"
            try {
                byte[] metaCountBytes = db.get("__meta_totalCount".getBytes(StandardCharsets.UTF_8));
                if (metaCountBytes != null) {
                    totalCount = Long.parseLong(new String(metaCountBytes, StandardCharsets.UTF_8));
                }
            } catch (NumberFormatException e) {
                // Nên log với cấp độ INFO hoặc DEBUG nếu đây là hành vi mong đợi khi meta không tồn tại/invalid
                logger.warn("Không đọc được tổng số dòng từ __meta_totalCount cho {}_{}. Tiếp tục với totalCount = 0. Chi tiết: {}", appId, tableName, e.getMessage());
            } catch (RocksDBException e) { // Bắt RocksDBException cụ thể
                logger.warn("RocksDBException khi đọc metadata totalCount cho {}_{}. Chi tiết: {}", appId, tableName, e.getMessage(), e);
            } catch (Exception e) {
                logger.warn("Lỗi không xác định khi đọc metadata totalCount cho {}_{}. Chi tiết: {}", appId, tableName, e.getMessage(), e);
            }
            // --- KẾT THÚC ĐỌC TỔNG SỐ BẢN GHI ---
    
            // --- BẮT ĐẦU TÌM KIẾM CÁC KEY PHÙ HỢP (Luôn dùng Lucene hoặc tương tự) ---
            // Hàm này (searchKeys) nên trả về các key đã được lọc và sắp xếp.
            // Giả định searchKeys không ném IOException hoặc RocksDBException
            List<String> allKeys = searchKeysConsistent(appId, tableName, searchFilter, db);
    
            if (allKeys == null || allKeys.isEmpty()) {
                logger.debug("Không tìm thấy key nào phù hợp cho appId: {}, tableName: {}, filter: {}", appId, tableName, searchFilter);
                Map<String, Object> emptyResult = new HashMap<>();
                emptyResult.put("rows", Collections.emptyList());
                emptyResult.put("totalCount", totalCount);
                emptyResult.put("nextCursor", null);
                emptyResult.put("truncated", false);
                return emptyResult;
            }
            filteredCount = allKeys.size();
            // --- KẾT THÚC TÌM KIẾM CÁC KEY PHÙ HỢP ---
    
            // --- BẮT ĐẦU ĐỌC DỮ LIỆU TỪ ROCKSDB SỬ DỤNG ITERATOR (hoặc get từng key) ---
            // Có thể dùng db.multiGet() để đọc nhiều key hiệu quả hơn nếu số lượng key lớn
            // và RocksDB phiên bản của bạn hỗ trợ tốt multiGet với Bloom Filter.
            // Hiện tại, giữ nguyên logic đọc từng key như bản gốc của bạn.
            int safeLimit = allKeys.size();
            for (int i = 0; i < safeLimit; i++) {
                applySmartBackpressure(i + 1);
                String key = allKeys.get(i);
                try {
                    // LỖI SIGSEGV CỦA BẠN SẼ XẢY RA TRONG HÀM db.get() NÀY.
                    // try-catch này sẽ bắt được RocksDBException, nhưng không bắt được SIGSEGV.
                    byte[] valueBytes = db.get(key.getBytes(StandardCharsets.UTF_8));
                    if (valueBytes != null) {
                        if (!results.isEmpty() && payloadBytes + valueBytes.length > MAX_RESPONSE_PAYLOAD_BYTES) {
                            truncated = true;
                            nextCursor = key;
                            logger.warn("Filter result truncated by payload budget for {}.{} ({} bytes)", appId, tableName, MAX_RESPONSE_PAYLOAD_BYTES);
                            break;
                        }
                        payloadBytes += valueBytes.length;

                        // Deserialize dữ liệu JSON thành Map
                        Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                        String dedupKey = buildRecordDedupKey(appId, tableName, record, key);
                        if (seenDedupKeys.add(dedupKey)) {
                            results.add(record);
                        }
                    } else {
                        logger.warn("Giá trị rỗng cho key '{}' trong RocksDB. Có thể key tồn tại trong Lucene nhưng không có trong RocksDB. (appId: {}, tableName: {})", key, appId, tableName);
                    }
                } catch (RocksDBException ex) { // Thêm RocksDBException ở đây
                    logger.error("RocksDBException khi đọc key '{}' từ RocksDB (appId: {}, tableName: {}): {}", key, appId, tableName, ex.getMessage(), ex);
                    // Bạn có thể quyết định bỏ qua key này hoặc re-throw tùy theo yêu cầu
                } catch (IOException ex) { // Bắt lỗi deserialization
                    logger.warn("Lỗi deserialize dữ liệu cho key '{}' (appId: {}, tableName: {}): {}", key, appId, tableName, ex.getMessage());
                } catch (Exception ex) { // Bắt các ngoại lệ khác (general catch-all, nên tránh nếu có thể)
                    logger.warn("Lỗi không xác định khi xử lý key '{}' (appId: {}, tableName: {}): {}", key, appId, tableName, ex.getMessage());
                }
            }

            if (allKeys.size() >= MAX_LUCENE_KEY_COLLECTION) {
                truncated = true;
                if (nextCursor == null && !allKeys.isEmpty()) {
                    nextCursor = allKeys.get(allKeys.size() - 1);
                }
                logger.warn("Filter may be incomplete due to Lucene key safety limit {} for {}.{}", MAX_LUCENE_KEY_COLLECTION, appId, tableName);
            }
            // --- KẾT THÚC ĐỌC DỮ LIỆU TỪ ROCKSDB ---
    
        } catch (IllegalStateException e) {
            // Lỗi khi không thể lấy/mở RocksDB instance
            logger.error("Lỗi cấu hình hoặc trạng thái RocksDB cho {}_{}: {}", appId, tableName, e.getMessage(), e);
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("rows", Collections.emptyList());
            errorResult.put("totalCount", 0L);
            errorResult.put("nextCursor", null);
            errorResult.put("error", "RocksDB configuration or state error: " + e.getMessage());
            return errorResult;
        } catch (Exception e) {
            // Bắt các ngoại lệ chung khác. Nên cố gắng bắt các ngoại lệ cụ thể hơn.
            logger.error("Lỗi tổng quát khi filter bảng '{}_{}': {}", appId, tableName, e.getMessage(), e);
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("rows", Collections.emptyList());
            errorResult.put("totalCount", 0L);
            errorResult.put("nextCursor", null);
            errorResult.put("error", "General processing error: " + e.getMessage());
            return errorResult;
        } finally {
            // Nếu bạn quản lý vòng đời của iterator, hãy đóng nó.
            // Trong trường hợp này, vì không dùng RocksIterator cho vòng lặp chính,
            // nên không cần đóng iterator ở đây. Nếu bạn chuyển sang dùng iterator.seek(),
            // thì cần đóng nó trong finally.
            // KHÔNG ĐÓNG RocksDB instance ở đây! Nó được quản lý bởi RocksDBManager.
            // closeDatabase(appId, tableName); // Chỉ gọi nếu bạn quản lý RocksDB trực tiếp ở đây
        }
    
        // --- TRẢ VỀ KẾT QUẢ ---
        Map<String, Object> result = new HashMap<>();
        result.put("rows", results);
        // Bạn đang trả về (long) results.size(), đây là tổng số bản ghi đã được lọc.
        // Nếu bạn muốn trả về totalCount từ metadata, hãy sử dụng biến totalCount đã đọc.
        // Quyết định này phụ thuộc vào định nghĩa "totalCount" trong API của bạn.
        // Nếu "totalCount" là tổng số bản ghi TRONG TOÀN BỘ DB (trước khi phân trang/lọc),
        // thì dùng biến totalCount đã đọc từ metadata.
        // Nếu "totalCount" là tổng số bản ghi ĐÃ LỌC, thì dùng results.size().
        result.put("totalCount", filteredCount);
        result.put("truncated", truncated);
        result.put("nextCursor", nextCursor);
        // Hoặc: result.put("totalCount", totalCount); // Tổng số bản ghi TỪ METADATA (nếu có)
        return result;
    }

    /**
     * Thu thập tất cả trường có điều kiện eq (bằng) trong SearchFilter, lồng sâu bao nhiêu cũng được.
     */
    private static Set<String> collectEqFields(SearchFilter filter) {
        Set<String> fields = new HashSet<>();
        if (filter == null) return fields;

        if (filter.getConditions() != null && !filter.getConditions().isEmpty()) {
            // Đệ quy trên từng điều kiện con
            for (SearchFilter sub : filter.getConditions()) {
                fields.addAll(collectEqFields(sub));
            }
        } else {
            // Nếu là điều kiện đơn, kiểm tra type và field
            if ("eq".equalsIgnoreCase(filter.getType()) && filter.getField() != null) {
                fields.add(filter.getField());
            }
        }
        return fields;
    }

    /**
     * Kiểm tra xem SearchFilter có đủ điều kiện eq cho tất cả các trường khóa chính hay không.
     */
    public static boolean isPrimaryKeyQuery(List<String> primaryKeys, SearchFilter filter) {
        if (primaryKeys == null || primaryKeys.isEmpty()) return false;
        if (filter == null) return false;

        Set<String> eqFields = collectEqFields(filter);
        return eqFields.containsAll(primaryKeys);
    }
    
    /**
     * Lấy dữ liệu từ RocksDB với tính năng phân trang và lọc.
     *
     * @param appId Mã ứng dụng.
     * @param tableName Tên bảng dữ liệu.
     * @param searchFilter Đối tượng chứa các tiêu chí tìm kiếm.
     * @param take Số lượng bản ghi cần lấy (tối đa). Mặc định 100 nếu null hoặc <= 0.
     * @param lastKey Key của bản ghi cuối cùng của trang trước đó để tiếp tục phân trang.
     * @return Map chứa danh sách các bản ghi (rows), tổng số bản ghi (totalCount), và nextCursor.
     */
    public Map<String, Object> filterWithPagination(
        String appId,
        String tableName,
        SearchFilter searchFilter,
        Integer take,
        String lastKey
    ) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> seenDedupKeys = new HashSet<>();
        String nextCursor = null;
        long totalCount = 0;
        long payloadBytes = 0L;
        boolean truncatedByPayload = false;
        RocksDB db = null;
        RocksIterator iterator = null;

        try {
            // Lấy RocksDB instance từ RocksDBManager.
            // RocksDBManager chịu trách nhiệm quản lý vòng đời của DB instance (mở/đóng).
            db = getDatabaseWithBloomFilter(appId, tableName);
            if (db == null) {
                // Nếu RocksDBManager không thể mở DB, throw một ngoại lệ rõ ràng hơn.
                throw new IllegalStateException("Không thể lấy RocksDB instance cho bảng: " + tableName + ". Vui lòng kiểm tra cấu hình hoặc quyền truy cập.");
            }

            // Fast path cho truy vấn không có filter hoặc id like/prefix rỗng: tránh tạo allKeys trong RAM.
            if (searchFilter == null || isDirectRocksDbBypassFilter(searchFilter)) {
                if (searchFilter != null) {
                    logger.info("Bypass Lucene for {}.{} with single id like/prefix empty filter; using direct RocksDB pagination path", appId, tableName);
                }
                return filterWithPaginationNoFilter(appId, tableName, take, lastKey, db);
            }

            // --- BẮT ĐẦU TÌM KIẾM CÁC KEY PHÙ HỢP ---
            // Hàm này (searchKeys) nên trả về các key đã được lọc và sắp xếp.
            List<String> allKeys = searchKeysConsistent(appId, tableName, searchFilter, db);

            if (allKeys == null || allKeys.isEmpty()) {
                logger.debug("Không tìm thấy key nào phù hợp cho appId: {}, tableName: {}, filter: {}", appId, tableName, searchFilter);
                Map<String, Object> emptyResult = new HashMap<>();
                emptyResult.put("rows", Collections.emptyList());
                emptyResult.put("totalCount", 0L);
                emptyResult.put("nextCursor", null);
                return emptyResult;
            }
            // --- KẾT THÚC TÌM KIẾM CÁC KEY PHÙ HỢP ---

            // 🔧 FIX #1: totalCount phải = số record đã filter, không phải global count
            // Điều này giải quyết vấn đề "số trang hiển thị lớn hơn thực tế"
            totalCount = allKeys.size(); // Đây là số lượng record thỏa filter
            logger.debug("✅ FIX: totalCount = {} records (filtered), not global DB count", totalCount);

            // --- BẮT ĐẦU XỬ LÝ PHÂN TRANG (Pagination) ---
            int startIndex = 0;
            logger.info("🔍 filterWithPagination DEBUG: appId={}, tableName={}, lastKey={}, take={}, totalKeys={}", appId, tableName, lastKey, take, allKeys.size());
            if (lastKey != null && !lastKey.isEmpty()) {
                // Tìm vị trí của lastKey trong danh sách các key đã lọc
                // 🔧 FIX: lastKey now contains the first key of the next page (not the last of current page)
                // So we use its index directly as startIndex (not +1)
                int lastKeyIndex = allKeys.indexOf(lastKey);
                logger.info("🔍 filterWithPagination: Looking for lastKey='{}' in keys list. Found at index: {}", lastKey, lastKeyIndex);
                if (lastKeyIndex >= 0) {
                    startIndex = lastKeyIndex; // Start from the key itself (not +1)
                    logger.info("✅ filterWithPagination: Starting from index {} (first key of next page)", startIndex);
                } else {
                    logger.warn("⚠️ FIX #2: lastKey '{}' không tìm thấy trong danh sách key đã lọc cho appId: {}, tableName: {}.", 
                        lastKey, appId, tableName);
                    // 🔧 FIX #2: Thay vì fallback tới index 0, xử lý gracefully
                    // Nếu lastKey không tìm thấy, có thể dữ liệu đã thay đổi
                    // Tìm vị trí tương tự hoặc gần nhất trong allKeys
                    // Nếu không thể, trả về error hoặc return empty (không lấy từ trang 1 lại)
                    
                    // Tìm thử lastKey có giá trị cao hơn key nào không (binary search để find position)
                    int insertPos = Collections.binarySearch(allKeys, lastKey, RECORD_KEY_COMPARATOR_DESC);
                    if (insertPos < 0) {
                        // insertPos = -(insertion point) - 1
                        // insertion point là vị trí nơi lastKey sẽ được insert để giữ list sorted
                        insertPos = -(insertPos + 1);
                        if (insertPos < allKeys.size()) {
                            logger.warn("⚠️ FIX #2: Found next key after missing cursor. Starting from index {}", insertPos);
                            startIndex = insertPos; // Start from key gần nhất
                        } else {
                            logger.warn("⚠️ FIX #2: No more data after missing cursor. Returning empty result.");
                            Map<String, Object> emptyResult = new HashMap<>();
                            emptyResult.put("rows", Collections.emptyList());
                            emptyResult.put("totalCount", totalCount);
                            emptyResult.put("nextCursor", null);
                            return emptyResult;
                        }
                    }
                }
            }

            // Nếu startIndex đã vượt quá số lượng key, không còn dữ liệu để phân trang
            if (startIndex >= allKeys.size()) {
                logger.warn("⚠️ filterWithPagination: startIndex {} >= allKeys.size() {}. No more data.", startIndex, allKeys.size());
                Map<String, Object> emptyResult = new HashMap<>();
                emptyResult.put("rows", Collections.emptyList());
                emptyResult.put("totalCount", totalCount);
                emptyResult.put("nextCursor", null);
                return emptyResult;
            }

            int requestedTake = (take != null && take > 0) ? take : DEFAULT_FILTER_TAKE;
            int numToTake = Math.min(requestedTake, MAX_FILTER_TAKE);
            int endIndex = Math.min(startIndex + numToTake, allKeys.size());
            List<String> pageKeys = allKeys.subList(startIndex, endIndex);
            logger.info("✅ filterWithPagination: Extracted {} keys from index {} to {} for this page", pageKeys.size(), startIndex, endIndex);
            // --- KẾT THÚC XỬ LÝ PHÂN TRANG ---


            // --- BẮT ĐẦU ĐỌC DỮ LIỆU TỪ ROCKSDB SỬ DỤNG ITERATOR ---
            // Tạo RocksIterator. Đảm bảo iterator luôn được đóng trong khối finally.
            iterator = db.newIterator();

            for (String key : pageKeys) {
                try {
                    iterator.seek(key.getBytes(StandardCharsets.UTF_8));
                    // Kiểm tra iterator có hợp lệ và key tìm được có khớp không
                    if (iterator.isValid() && new String(iterator.key(), StandardCharsets.UTF_8).equals(key)) {
                        byte[] valueBytes = iterator.value();
                        if (valueBytes != null) {
                            if (!rows.isEmpty() && payloadBytes + valueBytes.length > MAX_RESPONSE_PAYLOAD_BYTES) {
                                truncatedByPayload = true;
                                logger.warn("Paginated result truncated by payload budget for {}.{} ({} bytes)", appId, tableName, MAX_RESPONSE_PAYLOAD_BYTES);
                                break;
                            }
                            payloadBytes += valueBytes.length;

                            // Deserialize dữ liệu JSON thành Map
                            Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                            String dedupKey = buildRecordDedupKey(appId, tableName, record, key);
                            if (seenDedupKeys.add(dedupKey)) {
                                rows.add(record);
                            }
                            // nextCursor tạm thời là key hiện tại, sẽ được cập nhật lại sau vòng lặp
                        } else {
                            logger.warn("Giá trị rỗng cho key '{}' trong RocksDB.", key);
                        }
                    } else {
                        logger.warn("Key '{}' không hợp lệ hoặc không khớp khi seek trong RocksDB. Có thể dữ liệu đã thay đổi.", key);
                    }
                } catch (IOException ex) { // Bắt lỗi deserialization
                    logger.warn("Lỗi deserialize dữ liệu cho key '{}': {}", key, ex.getMessage());
                } catch (Exception ex) { // Bắt các ngoại lệ khác
                    logger.warn("Lỗi không xác định khi xử lý key '{}': {}", key, ex.getMessage());
                }
            }
            // --- KẾT THÚC ĐỌC DỮ LIỆU TỪ ROCKSDB ---


            // --- XÁC ĐỊNH nextCursor CHO TRANG TIẾP THEO ---
            if (endIndex < allKeys.size()) {
                // 🔧 FIX: nextCursor should be the KEY at endIndex (first key of next page)
                // When used as lastKey in next request, it will find this key and start from the NEXT item
                // This ensures we don't skip items and handle data changes gracefully
                nextCursor = allKeys.get(endIndex);
            } else {
                nextCursor = null; // Đã hết dữ liệu
            }
            // --- KẾT THÚC XÁC ĐỊNH nextCursor ---

        } catch (IllegalStateException e) {
            // Lỗi khi không thể lấy/mở RocksDB instance
            logger.error("Lỗi cấu hình hoặc trạng thái RocksDB: {}", e.getMessage(), e);
            // Trả về kết quả rỗng và lỗi để tầng gọi xử lý
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("rows", Collections.emptyList());
            errorResult.put("totalCount", 0L);
            errorResult.put("nextCursor", null);
            errorResult.put("error", "RocksDB configuration or state error: " + e.getMessage());
            return errorResult;
        } catch (Exception e) {
            // Bắt các ngoại lệ chung khác (ví dụ: lỗi từ searchKeys nếu nó không được xử lý tốt)
            logger.error("Lỗi tổng quát trong filterWithPagination cho appId: {}, tableName: {}: {}", appId, tableName, e.getMessage(), e);
            // Trả về kết quả rỗng và lỗi để tầng gọi xử lý
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("rows", Collections.emptyList());
            errorResult.put("totalCount", 0L);
            errorResult.put("nextCursor", null);
            errorResult.put("error", "General processing error: " + e.getMessage());
            return errorResult;
        } finally {
            // Đảm bảo RocksIterator được đóng để giải phóng tài nguyên native
            if (iterator != null) {
                try {
                    iterator.close();
                    logger.debug("RocksIterator closed.");
                } catch (Exception e) {
                    logger.warn("Lỗi khi đóng RocksIterator: {}", e.getMessage());
                }
            }
            // KHÔNG ĐÓNG RocksDB instance ở đây! Nó được quản lý bởi RocksDBManager.
        }

        // --- TRẢ VỀ KẾT QUẢ ---
        rows.sort(RECORD_ROW_COMPARATOR_DESC);
        rows.sort(RECORD_ROW_COMPARATOR_DESC);
        Map<String, Object> result = new HashMap<>();
        result.put("rows", rows);
        result.put("totalCount", totalCount);
        result.put("nextCursor", nextCursor);
        result.put("truncated", truncatedByPayload);
        
        logger.info("✅ filterWithPagination RESULT: Retrieved {} rows, totalCount = {}, hasMore = {}, nextCursor = {}", 
            rows.size(), totalCount, (nextCursor != null), nextCursor);
        return result;
    }

    private Map<String, Object> filterWithPaginationNoFilter(
        String appId,
        String tableName,
        Integer take,
        String lastKey,
        RocksDB db
    ) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> seenDedupKeys = new HashSet<>();
        long totalCount = 0L;
        String nextCursor = null;
        long payloadBytes = 0L;
        boolean truncatedByPayload = false;

        boolean unlimited = (take == null || take <= 0) && (lastKey == null || lastKey.isEmpty());
        int requestedTake = (take != null && take > 0) ? take : DEFAULT_FILTER_TAKE;
        int numToTake = unlimited ? Integer.MAX_VALUE : Math.min(requestedTake, MAX_FILTER_TAKE);

        boolean startCollecting = (lastKey == null || lastKey.isEmpty());
        boolean cursorFoundByMatch = false;
        int eligibleIndex = 0;
        int scanned = 0;

        RocksIterator iterator = null;
        try {
            iterator = db.newIterator();
            iterator.seekToLast();

            while (iterator.isValid()) {
                scanned++;
                applySmartBackpressure(scanned);

                String key = new String(iterator.key(), StandardCharsets.UTF_8);
                if (!key.startsWith("__meta_")) {
                    totalCount++;

                    if (!startCollecting) {
                        if (key.equals(lastKey)) {
                            startCollecting = true;
                            cursorFoundByMatch = true;
                        } else if (RECORD_KEY_COMPARATOR_DESC.compare(key, lastKey) >= 0) {
                            // Khi lastKey bị thiếu do dữ liệu thay đổi, bắt đầu từ vị trí chèn gần nhất.
                            startCollecting = true;
                        }
                    }

                    if (startCollecting) {
                        if (eligibleIndex < numToTake) {
                            try {
                                byte[] valueBytes = iterator.value();
                                if (valueBytes != null) {
                                    if (!rows.isEmpty() && payloadBytes + valueBytes.length > MAX_RESPONSE_PAYLOAD_BYTES) {
                                        truncatedByPayload = true;
                                        nextCursor = key;
                                        break;
                                    }
                                    payloadBytes += valueBytes.length;

                                    Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                                    String dedupKey = buildRecordDedupKey(appId, tableName, record, key);
                                    if (seenDedupKeys.add(dedupKey)) {
                                        rows.add(record);
                                    }
                                }
                            } catch (Exception ex) {
                                logger.warn("Lỗi deserialize dữ liệu cho key '{}': {}", key, ex.getMessage());
                            }
                        } else if (nextCursor == null) {
                            nextCursor = key;
                        }
                        eligibleIndex++;
                    }
                }

                iterator.prev();
            }

            if (lastKey != null && !lastKey.isEmpty() && !cursorFoundByMatch && rows.isEmpty()) {
                logger.warn("Cursor '{}' không còn tồn tại trong {}.{}; trả về trang rỗng.", lastKey, appId, tableName);
            }

        } finally {
            if (iterator != null) {
                try {
                    iterator.close();
                } catch (Exception e) {
                    logger.warn("Lỗi khi đóng RocksIterator: {}", e.getMessage());
                }
            }
        }

        rows.sort(RECORD_ROW_COMPARATOR_DESC);

        Map<String, Object> result = new HashMap<>();
        result.put("rows", rows);
        result.put("totalCount", totalCount);
        result.put("nextCursor", nextCursor);
        result.put("truncated", truncatedByPayload);
        return result;
    }

    /**
     * Lọc dữ liệu kèm phân trang theo offset/limit, tránh phải tải toàn bộ bản ghi đã lọc.
     *
     * @param appId Mã ứng dụng.
     * @param tableName Tên bảng dữ liệu.
     * @param searchFilter Tiêu chí lọc bản ghi.
     * @param offset Vị trí bắt đầu (0-based).
     * @param limit Số lượng bản ghi cần lấy.
     * @return Map chứa "rows", "totalCount" (đúng theo filter), "pageCursor" (key đầu trang) và "nextCursor" (key đầu trang kế tiếp hoặc null).
     */
    public Map<String, Object> filterWithOffset(
        String appId,
        String tableName,
        SearchFilter searchFilter,
        int offset,
        int limit
    ) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> seenDedupKeys = new HashSet<>();
        String nextCursor = null;
        String pageCursor = null;
        long totalCount = 0;
        RocksDB db = null;
        RocksIterator iterator = null;

        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
            if (db == null) {
                throw new IllegalStateException("Không thể lấy RocksDB instance cho bảng: " + tableName);
            }

            if (isDirectRocksDbBypassFilter(searchFilter)) {
                int startIndex = Math.max(0, offset);
                int safeLimit = Math.max(0, limit);
                int endIndex = startIndex + safeLimit;
                int eligibleIndex = 0;

                iterator = db.newIterator();
                iterator.seekToLast();
                while (iterator.isValid()) {
                    String key = new String(iterator.key(), StandardCharsets.UTF_8);
                    if (!key.startsWith("__meta_")) {
                        totalCount++;

                        if (eligibleIndex >= startIndex && eligibleIndex < endIndex) {
                            try {
                                byte[] valueBytes = iterator.value();
                                if (valueBytes != null) {
                                    Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                                    String dedupKey = buildRecordDedupKey(appId, tableName, record, key);
                                    if (seenDedupKeys.add(dedupKey)) {
                                        rows.add(record);
                                        if (pageCursor == null) {
                                            pageCursor = key;
                                        }
                                    }
                                }
                            } catch (Exception ex) {
                                logger.warn("Lỗi khi đọc dữ liệu cho key '{}' ở direct offset path: {}", key, ex.getMessage());
                            }
                        } else if (eligibleIndex == endIndex && nextCursor == null) {
                            nextCursor = key;
                        }

                        eligibleIndex++;
                    }
                    iterator.prev();
                }

                Map<String, Object> directResult = new HashMap<>();
                rows.sort(RECORD_ROW_COMPARATOR_DESC);
                directResult.put("rows", rows);
                directResult.put("totalCount", totalCount);
                directResult.put("nextCursor", nextCursor);
                directResult.put("pageCursor", pageCursor);
                return directResult;
            }

            // Lấy tất cả key đã lọc theo searchFilter
            List<String> allKeys = searchKeysConsistent(appId, tableName, searchFilter, db);
            if (allKeys == null || allKeys.isEmpty()) {
                Map<String, Object> emptyResult = new HashMap<>();
                emptyResult.put("rows", Collections.emptyList());
                emptyResult.put("totalCount", 0L);
                emptyResult.put("nextCursor", null);
                emptyResult.put("pageCursor", null);
                return emptyResult;
            }

            // totalCount phải phản ánh đúng số record theo filter hiện tại
            totalCount = allKeys.size();

            // Tính toán phạm vi phân trang theo offset/limit
            int startIndex = Math.max(0, offset);
            int endIndex = Math.min(startIndex + Math.max(0, limit), allKeys.size());
            if (startIndex >= endIndex) {
                Map<String, Object> emptyResult = new HashMap<>();
                emptyResult.put("rows", Collections.emptyList());
                emptyResult.put("totalCount", totalCount);
                emptyResult.put("nextCursor", null);
                emptyResult.put("pageCursor", null);
                return emptyResult;
            }
            List<String> pageKeys = allKeys.subList(startIndex, endIndex);
            pageCursor = pageKeys.get(0); // key đầu trang hiện tại (dùng seed cho cache)

            // Đọc dữ liệu tương ứng với pageKeys
            iterator = db.newIterator();
            for (String key : pageKeys) {
                try {
                    iterator.seek(key.getBytes(StandardCharsets.UTF_8));
                    if (iterator.isValid() && new String(iterator.key(), StandardCharsets.UTF_8).equals(key)) {
                        byte[] valueBytes = iterator.value();
                        if (valueBytes != null) {
                            Map<String, Object> record = objectMapper.readValue(valueBytes, Map.class);
                            String dedupKey = buildRecordDedupKey(appId, tableName, record, key);
                            if (seenDedupKeys.add(dedupKey)) {
                                rows.add(record);
                            }
                        }
                    }
                } catch (Exception ex) {
                    logger.warn("Lỗi khi đọc dữ liệu cho key '{}': {}", key, ex.getMessage());
                }
            }

            // Xác định nextCursor: key đầu của trang kế tiếp để phù hợp cursor-mode
            if (endIndex < allKeys.size()) {
                nextCursor = allKeys.get(endIndex);
            }

        } catch (Exception e) {
            logger.error("Lỗi trong filterWithOffset cho appId: {}, tableName: {}: {}", appId, tableName, e.getMessage(), e);
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("rows", Collections.emptyList());
            errorResult.put("totalCount", 0L);
            errorResult.put("nextCursor", null);
            errorResult.put("pageCursor", null);
            errorResult.put("error", "Processing error: " + e.getMessage());
            return errorResult;
        } finally {
            if (iterator != null) {
                try { iterator.close(); } catch (Exception ignored) {}
            }
        }

        Map<String, Object> result = new HashMap<>();
        rows.sort(RECORD_ROW_COMPARATOR_DESC);
        result.put("rows", rows);
        result.put("totalCount", totalCount);
        result.put("nextCursor", nextCursor);
        result.put("pageCursor", pageCursor);
        return result;
    }

    private String buildRecordDedupKey(String appId, String tableName, Map<String, Object> record, String fallbackKey) {
        if (record == null) {
            return fallbackKey != null ? fallbackKey : "";
        }

        try {
            List<String> primaryKeys = getTableSearchKeys(appId, tableName, "fieldsPK");
            if (primaryKeys != null && !primaryKeys.isEmpty()) {
                String canonical = generateKey(appId, tableName, record, primaryKeys);
                if (canonical != null && !canonical.isBlank()) {
                    return canonical;
                }
            }
        } catch (Exception ignored) {
            // Fallback below if PK cannot be resolved for this table.
        }

        Object idObj = record.get("id");
        if (idObj != null && !String.valueOf(idObj).isBlank()) {
            return "id:" + idObj;
        }
        return fallbackKey != null ? fallbackKey : String.valueOf(record.hashCode());
    }

    public static boolean recordMatchesFilterObject(Map<String, Object> record, SearchFilter filter) {
        if (filter == null) return true;
    
        String operator = filter.getOperator();
        List<SearchFilter> conditions = filter.getConditions();
    
        // Nếu có điều kiện con (AND / OR)
        if (conditions != null && !conditions.isEmpty()) {
            if ("OR".equalsIgnoreCase(operator)) {
                for (SearchFilter cond : conditions) {
                    if (recordMatchesFilterObject(record, cond)) return true;
                }
                return false;
            } else { // Default là AND
                for (SearchFilter cond : conditions) {
                    if (!recordMatchesFilterObject(record, cond)) return false;
                }
                return true;
            }
        }
    
        // Nếu là điều kiện đơn (field, type, value)
        String field = filter.getField();
        String type = filter.getType();
        Object value = filter.getValue();
    
        if (field == null || type == null) return true;
        Object actualValue = record.get(field);
    
        return evaluateSearchFilterCondition(actualValue, type, value);
    }
    
    private static boolean evaluateSearchFilterCondition(Object actual, String op, Object expected) {
        if (actual == null) return false;
    
        switch (op) {
            case "eq":
                return Objects.equals(actual, expected);
    
            case "eqIgnoreCase":
                if (actual instanceof String && expected instanceof String) {
                    return ((String) actual).trim().equalsIgnoreCase(((String) expected).trim());
                }
                return false;
    
            case "ne":
                return !Objects.equals(actual, expected);
    
            case "gt":
                return compare(actual, expected) > 0;
    
            case "gte":
                return compare(actual, expected) >= 0;
    
            case "lt":
                return compare(actual, expected) < 0;
    
            case "lte":
                return compare(actual, expected) <= 0;
    
            case "in":
                if (expected instanceof List<?>) {
                    return ((List<?>) expected).contains(actual);
                }
                return false;
    
            case "notIn":
                if (expected instanceof List<?>) {
                    return !((List<?>) expected).contains(actual);
                }
                return false;
    
            case "like":
                if (actual instanceof String && expected instanceof String) {
                    return ((String) actual).toLowerCase().contains(((String) expected).toLowerCase());
                }
                return false;
    
            case "prefix":
                if (actual instanceof String && expected instanceof String) {
                    return ((String) actual).toLowerCase().startsWith(((String) expected).toLowerCase());
                }
                return false;
    
            case "regex":
                if (actual instanceof String && expected instanceof String) {
                    return ((String) actual).matches((String) expected);
                }
                return false;
    
            case "range":
                if (expected instanceof List<?> list && list.size() == 2) {
                    Object from = list.get(0);
                    Object to = list.get(1);
                    return compare(actual, from) >= 0 && compare(actual, to) <= 0;
                }
                return false;
    
            default:
                return false;
        }
    }

    private static int compare(Object a, Object b) {
        try {
            if (a instanceof Number && b instanceof Number) {
                return Double.compare(((Number) a).doubleValue(), ((Number) b).doubleValue());
            } else if (a instanceof String && b instanceof String) {
                return ((String) a).compareTo((String) b);
            } else if (a instanceof Comparable && b instanceof Comparable) {
                return ((Comparable) a).compareTo(b);
            }
        } catch (Exception e) {
            return 0;
        }
        return 0;
    }    

    public Map<String, Object> fullScan(String appId, String tableName) {
        List<Map<String, Object>> records = new ArrayList<>();
        Map<String, Object> response = new HashMap<>();
        RocksDB db = null;
    
        try {
            db = getDatabaseWithBloomFilter(appId, tableName);
            if (db == null) {
                logger.error("DB null");
                response.put("success", false);
                response.put("message", "DB null");
                response.put("rows", List.of());
                return response;
            }
    
            try (RocksIterator iterator = db.newIterator()) {
                for (iterator.seekToFirst(); iterator.isValid(); iterator.next()) {
                    byte[] keyBytes = iterator.key(); // Lấy key
                    String key = new String(keyBytes, StandardCharsets.UTF_8); // Chuyển key sang String
    
                    // Bỏ qua các key đặc biệt (metadata)
                    if (key.startsWith("__meta_")) { // Hoặc cụ thể hơn là "__meta_totalCount"
                        continue;
                    }
    
                    byte[] valueBytes = iterator.value();
                    if (valueBytes == null) continue;
    
                    String json = new String(valueBytes, StandardCharsets.UTF_8);
    
                    if (json.trim().startsWith("{")) {
                        try {
                            Map<String, Object> record = objectMapper.readValue(json, Map.class);
                            records.add(record);
                        } catch (Exception e) {
                            logger.warn("Invalid JSON (parse error) for key {}: {}", key, json, e); // Thêm key vào log
                        }
                    } else {
                        logger.warn("Not JSON (does not start with '{{') for key {}: {}", key, json); // Thêm key vào log
                    }
                }
            }
    
            response.put("success", true);
            response.put("rows", records);
            response.put("count", records.size());
            response.put("message", "Done");
        } catch (Exception e) {
            logger.error("FullScan error: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("message", e.getMessage());
            response.put("rows", List.of());
        }
    
        return response;
    }

    private void deleteDirectory(File dir) {
        if (dir.isDirectory()) {
            for (File file : dir.listFiles()) {
                deleteDirectory(file);
            }
        }
        dir.delete();
    }

    public void deleteRocksDB(String appId, String tableName) {
        String dbPath = DIR_PATH + "/database/"+appId + "/" + tableName;
        File dbDir = new File(dbPath);

        if (dbDir.exists()) {
            deleteDirectory(dbDir);
            // OSSUtil.log("Deleted RocksDB database at: " + dbPath);
        } else {
            // OSSUtil.log("RocksDB database not found at: " + dbPath);
        }
    }

    @SuppressWarnings("unchecked")
    private Object extractValueForKey(Map<String, Object> filters, String key) {
        // Nếu là biểu thức logic như $and, $or → tìm key trong các nhánh con
        for (Map.Entry<String, Object> entry : filters.entrySet()) {
            String exprKey = entry.getKey();
            Object value = entry.getValue();
    
            if (exprKey.equals("$and") || exprKey.equals("$or")) {
                if (value instanceof List<?>) {
                    for (Object subFilter : (List<?>) value) {
                        if (subFilter instanceof Map<?, ?>) {
                            Object result = extractValueForKey((Map<String, Object>) subFilter, key);
                            if (result != null) return result;
                        }
                    }
                }
            } else if (exprKey.equals("$not")) {
                if (value instanceof Map<?, ?>) {
                    // không lấy từ nhánh phủ định
                    continue;
                }
            } else if (exprKey.equals(key)) {
                Object val = value;
                if (val instanceof Map) {
                    Map<String, Object> exprMap = (Map<String, Object>) val;
                    if (exprMap.containsKey("$eq")) return exprMap.get("$eq");
                    if (exprMap.containsKey("$eqIgnoreCase")) return exprMap.get("$eqIgnoreCase");
                    if (exprMap.containsKey("$in")) {
                        List<?> list = (List<?>) exprMap.get("$in");
                        if (list != null && !list.isEmpty()) return list.get(0);
                    }
                } else {
                    return val;
                }
            }
        }
    
        return null;
    }
    
    public Map<String, Object> createTable(Map<String, Object> params) {
        Map<String, Object> response = new HashMap<>();
        if (!params.containsKey("app_id")) {
            response.put("success", false);
            response.put("message", "Thiếu mã chương trình không thể tạo dữ liệu");
            return response;
        }
        if (!params.containsKey("id")) {
            response.put("success", false);
            response.put("message", "Thiếu tên bảng id:'tên bảng'");
            return response;
        }
        if (!params.containsKey("struct")) {
            response.put("success", false);
            response.put("message", "Thiếu cấu trúc bảng");
            return response;
        }
        // objTable.put("id", UUID.randomUUID().toString());
        String appId = params.get("app_id").toString();
        createRecord(appId, "index", params, List.of("id"));

        response.put("success", true);
        response.put("message", "Đã tạo xong cấu trúc");
        return response;
    }

    public Map<String, Object> dropTable(Map<String, Object> params) {
        Map<String, Object> response = new HashMap<>();
        String appId = params.get("app_id").toString();
        String tableName = params.get("obj_table").toString();

        try {

            // 1. Xóa RocksDB database
            deleteRocksDB(appId, tableName);

            // 2. Xóa cấu trúc bảng trong `index`
            deleteRecord(appId, "index", Map.of("id", tableName));

            // 3. Trả về kết quả thành công
            response.put("success", true);
            response.put("message", "Đã xóa hoàn toàn bảng " + tableName + " và toàn bộ dữ liệu liên quan.");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Lỗi khi xóa bảng " + tableName + ": " + e.getMessage());
        }

        return response;
    }
    /**
     * Tương đương với hàm `global.strtr` trong JavaScript khi `from` và `to` là chuỗi.
     * Hàm này thực hiện việc thay thế ký tự-theo-ký tự trong một chuỗi.
     *
     * @param str Chuỗi gốc để thực hiện thay thế.
     * @param from Chuỗi chứa các ký tự cần tìm và thay thế.
     * @param to Chuỗi chứa các ký tự thay thế tương ứng.
     * @return Chuỗi sau khi đã thay thế.
     */
    public String strtr(String str, String from, String to) {
        if (str == null || from == null || to == null || from.isEmpty()) {
            return str;
        }

        StringBuilder result = new StringBuilder(str.length());
        for (int i = 0; i < str.length(); i++) {
            char charToReplace = str.charAt(i);
            int indexOfChar = from.indexOf(charToReplace);
            if (indexOfChar != -1 && indexOfChar < to.length()) {
                result.append(to.charAt(indexOfChar));
            } else {
                result.append(charToReplace);
            }
        }
        return result.toString();
    }

    /**
     * Tương đương với hàm `la_encrypt` trong JavaScript.
     * Mã hóa một chuỗi bằng cách Base64 encode, sau đó thực hiện thay thế ký tự bằng strtr.
     *
     * @param d_code Chuỗi cần mã hóa.
     * @return Chuỗi đã được mã hóa.
     */
    public String csm_encrypt(String d_code) {
        String base64Encoded = Base64.getEncoder().encodeToString(d_code.getBytes(StandardCharsets.UTF_8));
        // Sử dụng các hằng số PHONE và WRITEBY trực tiếp
        return strtr(base64Encoded, PHONE + WRITEBY, WRITEBY + PHONE);
    }

    /**
     * Tương đương với hàm `la_decrypt` trong JavaScript.
     * Giải mã một chuỗi bằng cách thực hiện thay thế ký tự bằng strtr (với from và to đảo ngược),
     * sau đó Base64 decode.
     *
     * @param e_code Chuỗi cần giải mã.
     * @return Chuỗi đã được giải mã.
     */
    public String csm_decrypt(String e_code) {
        // Sử dụng các hằng số PHONE và WRITEBY trực tiếp
        String strtrResult = strtr(e_code, WRITEBY + PHONE, PHONE + WRITEBY);
        byte[] decodedBytes = Base64.getDecoder().decode(strtrResult);
        return new String(decodedBytes, StandardCharsets.UTF_8);
    }
}