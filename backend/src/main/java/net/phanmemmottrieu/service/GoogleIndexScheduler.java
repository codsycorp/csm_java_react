package net.phanmemmottrieu.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Scheduled job tự động xử lý Google Index Queue
 * 
 * Chức năng:
 * - Tự động gửi URLs từ queue theo quota hàng ngày
 * - Phân bố đều quota trong ngày (round-robin)
 * - Cleanup history cũ
 * 
 * Cấu hình:
 * - google.index.scheduler.enabled: Bật/tắt scheduler
 * - google.index.scheduler.batch-size: Số URLs gửi mỗi lần (default: 10)
 * - google.index.scheduler.cleanup-days: Xóa history cũ hơn N ngày (default: 90)
 */
@Service
public class GoogleIndexScheduler {
    
    private static final Logger logger = LoggerFactory.getLogger(GoogleIndexScheduler.class);
    
    @Autowired
    private GoogleIndexService indexService;
    
    @Autowired
    private GoogleIndexQueueService queueService;
    
    @Value("${google.index.scheduler.enabled:true}")
    private boolean schedulerEnabled;
    
    @Value("${google.index.scheduler.batch-size:10}")
    private int batchSize;
    
    @Value("${google.index.scheduler.cleanup-days:90}")
    private int cleanupDays;
    
    /**
     * Xử lý queue mỗi 5 phút
     * Phân bố đều quota trong ngày: 200 quota / (24h * 12 lần/h) = ~17 URLs/lần
     * Với batch-size=10, sẽ xử lý 288 lần/ngày = có thể gửi 2,880 URLs nếu queue đủ lớn
     * Nhưng bị giới hạn bởi daily quota (200), nên thực tế ~200 URLs/ngày
     */
    @Scheduled(fixedRate = 300000) // 5 phút = 300,000 ms
    public void processQueue() {
        if (!schedulerEnabled) {
            return;
        }
        
        try {
            int remainingQuota = indexService.getRemainingDailyQuota();
            
            if (remainingQuota <= 0) {
                logger.debug("⏸️ Quota exhausted for today - skipping queue processing");
                return;
            }
            
            // Xử lý batch
            Map<String, Object> result = indexService.processBatchFromQueue(batchSize);
            
            int processed = (Integer) result.getOrDefault("processed", 0);
            if (processed > 0) {
                int successCount = (Integer) result.getOrDefault("success_count", 0);
                int failCount = (Integer) result.getOrDefault("fail_count", 0);
                
                logger.info("📊 Queue batch processed - Success: {}, Failed: {}, Remaining quota: {}",
                    successCount, failCount, indexService.getRemainingDailyQuota());
            }
            
        } catch (Exception e) {
            logger.error("❌ Error processing queue batch: {}", e.getMessage(), e);
        }
    }
    
    /**
     * Cleanup history cũ mỗi ngày lúc 3:00 AM
     */
    @Scheduled(cron = "0 0 3 * * *")
    public void cleanupOldHistory() {
        if (!schedulerEnabled) {
            return;
        }
        
        try {
            logger.info("🧹 Starting cleanup of history older than {} days", cleanupDays);
            int removed = queueService.cleanupOldHistory(cleanupDays);
            
            if (removed > 0) {
                logger.info("✅ Cleaned up {} old history entries", removed);
            }
        } catch (Exception e) {
            logger.error("❌ Error cleaning up history: {}", e.getMessage(), e);
        }
    }
    
    /**
     * Log queue status mỗi giờ
     */
    @Scheduled(cron = "0 0 * * * *")
    public void logQueueStatus() {
        if (!schedulerEnabled) {
            return;
        }
        
        try {
            Map<String, Object> queueInfo = queueService.getQueueInfo();
            Map<String, Object> quotaInfo = indexService.getQuotaInfo();
            
            logger.info("📊 Queue Status - Total: {}, Pending: {}, Processing: {}, Failed: {} | Quota: {}/{} ({}%)",
                queueInfo.get("total"),
                queueInfo.get("pending"),
                queueInfo.get("processing"),
                queueInfo.get("failed"),
                quotaInfo.get("used_today"),
                quotaInfo.get("daily_limit"),
                quotaInfo.get("usage_percentage")
            );
        } catch (Exception e) {
            logger.error("❌ Error logging queue status: {}", e.getMessage());
        }
    }
}
