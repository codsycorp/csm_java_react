package net.phanmemmottrieu.model;

import java.util.Objects;

/**
 * Model đại diện cho một URL trong queue chờ gửi lên Google Index API
 */
public class UrlSubmissionQueue {
    
    private String url;
    private String action; // "publish" hoặc "remove"
    private int priority; // 1 = cao nhất, 10 = thấp nhất
    private long queuedAt; // Timestamp khi thêm vào queue
    private int retryCount; // Số lần đã retry
    private String lastError; // Error cuối cùng (nếu có)
    private String status; // PENDING, PROCESSING, COMPLETED, FAILED
    private long lastAttemptAt; // Timestamp lần gửi cuối
    
    public UrlSubmissionQueue() {
        this.priority = 5; // Default priority
        this.queuedAt = System.currentTimeMillis();
        this.retryCount = 0;
        this.status = "PENDING";
    }
    
    public UrlSubmissionQueue(String url, String action) {
        this();
        this.url = url;
        this.action = action;
    }
    
    public UrlSubmissionQueue(String url, String action, int priority) {
        this(url, action);
        this.priority = priority;
    }
    
    // Getters and Setters
    
    public String getUrl() {
        return url;
    }
    
    public void setUrl(String url) {
        this.url = url;
    }
    
    public String getAction() {
        return action;
    }
    
    public void setAction(String action) {
        this.action = action;
    }
    
    public int getPriority() {
        return priority;
    }
    
    public void setPriority(int priority) {
        this.priority = Math.max(1, Math.min(10, priority)); // Clamp between 1-10
    }
    
    public long getQueuedAt() {
        return queuedAt;
    }
    
    public void setQueuedAt(long queuedAt) {
        this.queuedAt = queuedAt;
    }
    
    public int getRetryCount() {
        return retryCount;
    }
    
    public void setRetryCount(int retryCount) {
        this.retryCount = retryCount;
    }
    
    public void incrementRetryCount() {
        this.retryCount++;
    }
    
    public String getLastError() {
        return lastError;
    }
    
    public void setLastError(String lastError) {
        this.lastError = lastError;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public long getLastAttemptAt() {
        return lastAttemptAt;
    }
    
    public void setLastAttemptAt(long lastAttemptAt) {
        this.lastAttemptAt = lastAttemptAt;
    }
    
    /**
     * Tính điểm ưu tiên để sắp xếp queue
     * Điểm cao hơn = gửi trước
     */
    public double getEffectivePriority() {
        long ageInHours = (System.currentTimeMillis() - queuedAt) / (1000 * 60 * 60);
        // Priority càng thấp càng cao (1 = cao nhất)
        // Age càng lâu càng tăng priority
        return (11 - priority) * 100 + ageInHours;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UrlSubmissionQueue that = (UrlSubmissionQueue) o;
        return Objects.equals(url, that.url);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(url);
    }
    
    @Override
    public String toString() {
        return "UrlSubmissionQueue{" +
                "url='" + url + '\'' +
                ", action='" + action + '\'' +
                ", priority=" + priority +
                ", status='" + status + '\'' +
                ", retryCount=" + retryCount +
                '}';
    }
}
