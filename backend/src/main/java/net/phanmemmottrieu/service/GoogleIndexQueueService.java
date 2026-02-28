package net.phanmemmottrieu.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import net.phanmemmottrieu.model.UrlSubmissionHistory;
import net.phanmemmottrieu.model.UrlSubmissionQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Service quản lý Queue và History cho Google Index API submissions
 * 
 * Chức năng:
 * - Quản lý queue URL chờ gửi với priority và round-robin
 * - Tracking lịch sử URL đã gửi để tránh trùng lặp
 * - Persistence queue và history vào file JSON
 * - Smart deduplication: không gửi lại URL đã gửi trong X ngày
 */
@Service
public class GoogleIndexQueueService {
    
    private static final Logger logger = LoggerFactory.getLogger(GoogleIndexQueueService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    // File paths
    private static final String QUEUE_FILE = "./google-index-queue.json";
    private static final String HISTORY_FILE = "./google-index-history.json";
    
    // In-memory storage
    private final Map<String, UrlSubmissionQueue> queueMap = new ConcurrentHashMap<>();
    private final Map<String, List<UrlSubmissionHistory>> historyMap = new ConcurrentHashMap<>();
    
    // Configuration
    private static final int MAX_RETRY_COUNT = 3;
    private static final int DEDUP_DAYS = 30; // Không gửi lại URL đã gửi trong 30 ngày
    private static final int MAX_HISTORY_ENTRIES_PER_URL = 10; // Giữ tối đa 10 lịch sử per URL
    
    @PostConstruct
    public void init() {
        objectMapper.registerModule(new JavaTimeModule());
        loadQueueFromFile();
        loadHistoryFromFile();
        logger.info("✅ GoogleIndexQueueService initialized - Queue: {}, History URLs: {}", 
            queueMap.size(), historyMap.size());
    }
    
    // ========== QUEUE MANAGEMENT ==========
    
    /**
     * Thêm URL vào queue với kiểm tra trùng lặp thông minh
     * 
     * @param url URL cần gửi
     * @param action "publish" hoặc "remove"
     * @param priority 1 (cao nhất) - 10 (thấp nhất)
     * @return true nếu thêm thành công, false nếu đã tồn tại hoặc đã gửi gần đây
     */
    public synchronized boolean addToQueue(String url, String action, int priority) {
        // Kiểm tra xem URL đã trong queue chưa
        if (queueMap.containsKey(url)) {
            UrlSubmissionQueue existing = queueMap.get(url);
            logger.info("⚠️ URL đã trong queue - URL: {}, Status: {}", url, existing.getStatus());
            return false;
        }
        
        // Kiểm tra lịch sử: đã gửi trong vòng DEDUP_DAYS chưa
        if (isRecentlySubmitted(url, DEDUP_DAYS)) {
            logger.info("⏭️ URL đã gửi trong {} ngày qua - skip: {}", DEDUP_DAYS, url);
            return false;
        }
        
        // Thêm vào queue
        UrlSubmissionQueue item = new UrlSubmissionQueue(url, action, priority);
        queueMap.put(url, item);
        saveQueueToFile();
        
        logger.info("✅ Thêm vào queue - URL: {}, Priority: {}, Queue size: {}", url, priority, queueMap.size());
        return true;
    }
    
    /**
     * Thêm nhiều URL vào queue cùng lúc
     */
    public synchronized Map<String, Boolean> addBatchToQueue(List<String> urls, String action, int priority) {
        Map<String, Boolean> results = new HashMap<>();
        for (String url : urls) {
            boolean added = addToQueue(url, action, priority);
            results.put(url, added);
        }
        logger.info("📦 Batch add completed - Total: {}, Added: {}, Skipped: {}", 
            urls.size(), 
            results.values().stream().filter(v -> v).count(),
            results.values().stream().filter(v -> !v).count()
        );
        return results;
    }
    
    /**
     * Lấy N URLs từ queue để gửi (theo priority và tuổi)
     * Sắp xếp theo: Priority cao -> Tuổi lớn
     */
    public synchronized List<UrlSubmissionQueue> getNextBatch(int batchSize) {
        return queueMap.values().stream()
            .filter(item -> "PENDING".equals(item.getStatus()) || "FAILED".equals(item.getStatus()))
            .filter(item -> item.getRetryCount() < MAX_RETRY_COUNT)
            .sorted((a, b) -> Double.compare(b.getEffectivePriority(), a.getEffectivePriority()))
            .limit(batchSize)
            .collect(Collectors.toList());
    }
    
    /**
     * Đánh dấu item đang được xử lý
     */
    public synchronized void markAsProcessing(String url) {
        UrlSubmissionQueue item = queueMap.get(url);
        if (item != null) {
            item.setStatus("PROCESSING");
            item.setLastAttemptAt(System.currentTimeMillis());
            saveQueueToFile();
        }
    }
    
    /**
     * Đánh dấu item hoàn thành và di chuyển sang history
     */
    public synchronized void markAsCompleted(String url, boolean success, String response) {
        UrlSubmissionQueue item = queueMap.get(url);
        if (item == null) return;
        
        item.setStatus(success ? "COMPLETED" : "FAILED");
        
        if (success) {
            // Thêm vào history
            addToHistory(url, item.getAction(), success, response);
            
            // Xóa khỏi queue
            queueMap.remove(url);
            logger.info("✅ Completed and removed from queue: {}", url);
        } else {
            // Tăng retry count
            item.incrementRetryCount();
            item.setLastError(response);
            
            // Nếu đã vượt quá retry limit, đánh dấu FAILED vĩnh viễn
            if (item.getRetryCount() >= MAX_RETRY_COUNT) {
                item.setStatus("FAILED");
                addToHistory(url, item.getAction(), false, response);
                queueMap.remove(url);
                logger.warn("❌ Failed after {} retries, removed from queue: {}", MAX_RETRY_COUNT, url);
            } else {
                item.setStatus("PENDING"); // Retry lại
                logger.warn("⚠️ Failed (retry {}/{}): {}", item.getRetryCount(), MAX_RETRY_COUNT, url);
            }
        }
        
        saveQueueToFile();
    }
    
    /**
     * Xóa item khỏi queue
     */
    public synchronized boolean removeFromQueue(String url) {
        boolean removed = queueMap.remove(url) != null;
        if (removed) {
            saveQueueToFile();
            logger.info("🗑️ Removed from queue: {}", url);
        }
        return removed;
    }
    
    /**
     * Lấy thông tin queue hiện tại
     */
    public Map<String, Object> getQueueInfo() {
        Map<String, Object> info = new HashMap<>();
        
        long pending = queueMap.values().stream().filter(i -> "PENDING".equals(i.getStatus())).count();
        long processing = queueMap.values().stream().filter(i -> "PROCESSING".equals(i.getStatus())).count();
        long failed = queueMap.values().stream().filter(i -> "FAILED".equals(i.getStatus())).count();
        
        info.put("total", queueMap.size());
        info.put("pending", pending);
        info.put("processing", processing);
        info.put("failed", failed);
        info.put("history_urls", historyMap.size());
        
        return info;
    }
    
    /**
     * Lấy danh sách queue items (có phân trang)
     */
    public List<UrlSubmissionQueue> getQueueItems(int page, int pageSize) {
        return queueMap.values().stream()
            .sorted((a, b) -> Double.compare(b.getEffectivePriority(), a.getEffectivePriority()))
            .skip((long) page * pageSize)
            .limit(pageSize)
            .collect(Collectors.toList());
    }
    
    // ========== HISTORY MANAGEMENT ==========
    
    /**
     * Thêm vào lịch sử
     */
    private synchronized void addToHistory(String url, String action, boolean success, String response) {
        UrlSubmissionHistory history = new UrlSubmissionHistory(url, action, success);
        history.setResponse(response);
        
        // Lấy hoặc tạo mới list cho URL này
        List<UrlSubmissionHistory> urlHistories = historyMap.computeIfAbsent(url, k -> new ArrayList<>());
        urlHistories.add(history);
        
        // Giới hạn số lượng history per URL
        if (urlHistories.size() > MAX_HISTORY_ENTRIES_PER_URL) {
            // Giữ lại những cái mới nhất
            urlHistories.sort(Comparator.comparingLong(UrlSubmissionHistory::getSubmittedAt).reversed());
            historyMap.put(url, new ArrayList<>(urlHistories.subList(0, MAX_HISTORY_ENTRIES_PER_URL)));
        }
        
        saveHistoryToFile();
        logger.info("📝 Added to history - URL: {}, Success: {}", url, success);
    }
    
    /**
     * Kiểm tra URL đã được gửi gần đây chưa
     */
    public boolean isRecentlySubmitted(String url, int withinDays) {
        List<UrlSubmissionHistory> histories = historyMap.get(url);
        if (histories == null || histories.isEmpty()) {
            return false;
        }
        
        // Kiểm tra xem có submission nào trong vòng withinDays không
        return histories.stream()
            .filter(UrlSubmissionHistory::isSuccess)
            .anyMatch(h -> h.isWithinDays(withinDays));
    }
    
    /**
     * Lấy lịch sử của một URL
     */
    public List<UrlSubmissionHistory> getHistory(String url) {
        return historyMap.getOrDefault(url, Collections.emptyList());
    }
    
    /**
     * Lấy lịch sử gần đây (tất cả URLs)
     */
    public List<UrlSubmissionHistory> getRecentHistory(int limit) {
        return historyMap.values().stream()
            .flatMap(List::stream)
            .sorted(Comparator.comparingLong(UrlSubmissionHistory::getSubmittedAt).reversed())
            .limit(limit)
            .collect(Collectors.toList());
    }
    
    /**
     * Xóa lịch sử cũ (cleanup)
     */
    public synchronized int cleanupOldHistory(int olderThanDays) {
        int removed = 0;
        long cutoffTime = System.currentTimeMillis() - (olderThanDays * 24L * 60 * 60 * 1000);
        
        for (Map.Entry<String, List<UrlSubmissionHistory>> entry : historyMap.entrySet()) {
            List<UrlSubmissionHistory> histories = entry.getValue();
            int sizeBefore = histories.size();
            
            histories.removeIf(h -> h.getSubmittedAt() < cutoffTime);
            removed += (sizeBefore - histories.size());
            
            // Nếu không còn history nào, xóa URL khỏi map
            if (histories.isEmpty()) {
                historyMap.remove(entry.getKey());
            }
        }
        
        if (removed > 0) {
            saveHistoryToFile();
            logger.info("🧹 Cleaned up {} old history entries (older than {} days)", removed, olderThanDays);
        }
        
        return removed;
    }
    
    // ========== PERSISTENCE ==========
    
    /**
     * Lưu queue vào file
     */
    private synchronized void saveQueueToFile() {
        try {
            File file = new File(QUEUE_FILE);
            ensureParentDirExists(file);
            
            List<UrlSubmissionQueue> queueList = new ArrayList<>(queueMap.values());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, queueList);
        } catch (IOException e) {
            logger.error("❌ Error saving queue to file: {}", e.getMessage());
        }
    }
    
    /**
     * Load queue từ file
     */
    private synchronized void loadQueueFromFile() {
        try {
            File file = new File(QUEUE_FILE);
            if (!file.exists() || file.length() == 0) {
                logger.info("Queue file not found or empty, starting fresh");
                return;
            }
            
            List<UrlSubmissionQueue> queueList = objectMapper.readValue(
                file, 
                new TypeReference<List<UrlSubmissionQueue>>() {}
            );
            
            queueMap.clear();
            for (UrlSubmissionQueue item : queueList) {
                queueMap.put(item.getUrl(), item);
            }
            
            logger.info("✅ Loaded {} items from queue file", queueMap.size());
        } catch (IOException e) {
            logger.error("❌ Error loading queue from file: {}", e.getMessage());
        }
    }
    
    /**
     * Lưu history vào file
     */
    private synchronized void saveHistoryToFile() {
        try {
            File file = new File(HISTORY_FILE);
            ensureParentDirExists(file);
            
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, historyMap);
        } catch (IOException e) {
            logger.error("❌ Error saving history to file: {}", e.getMessage());
        }
    }
    
    /**
     * Load history từ file
     */
    private synchronized void loadHistoryFromFile() {
        try {
            File file = new File(HISTORY_FILE);
            if (!file.exists() || file.length() == 0) {
                logger.info("History file not found or empty, starting fresh");
                return;
            }
            
            Map<String, List<UrlSubmissionHistory>> loadedHistory = objectMapper.readValue(
                file,
                new TypeReference<Map<String, List<UrlSubmissionHistory>>>() {}
            );
            
            historyMap.clear();
            historyMap.putAll(loadedHistory);
            
            int totalEntries = historyMap.values().stream().mapToInt(List::size).sum();
            logger.info("✅ Loaded history for {} URLs ({} total entries)", historyMap.size(), totalEntries);
        } catch (IOException e) {
            logger.error("❌ Error loading history from file: {}", e.getMessage());
        }
    }
    
    /**
     * Ensure parent directory exists
     */
    private void ensureParentDirExists(File file) {
        File parentDir = file.getParentFile();
        if (parentDir != null && !parentDir.exists()) {
            if (parentDir.mkdirs()) {
                logger.info("✅ Created directory: {}", parentDir.getAbsolutePath());
            }
        }
    }
}
