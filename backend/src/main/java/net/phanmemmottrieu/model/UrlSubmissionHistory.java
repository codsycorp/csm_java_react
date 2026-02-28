package net.phanmemmottrieu.model;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Objects;

/**
 * Model lưu lịch sử các URL đã gửi lên Google Index API
 */
public class UrlSubmissionHistory {
    
    private String url;
    private String action; // "publish" hoặc "remove"
    private long submittedAt; // Timestamp khi gửi thành công
    private String submittedDate; // Ngày gửi (yyyy-MM-dd) để tracking theo ngày
    private boolean success;
    private String response; // Response từ Google API
    private int quotaUsed; // Quota đã sử dụng khi gửi
    private String submissionId; // Unique ID cho submission này
    
    public UrlSubmissionHistory() {
        this.submittedAt = System.currentTimeMillis();
        this.submittedDate = getDateString(submittedAt);
        this.submissionId = generateSubmissionId();
    }
    
    public UrlSubmissionHistory(String url, String action, boolean success) {
        this();
        this.url = url;
        this.action = action;
        this.success = success;
    }
    
    /**
     * Tạo unique ID cho submission
     */
    private String generateSubmissionId() {
        return System.currentTimeMillis() + "-" + System.nanoTime();
    }
    
    /**
     * Chuyển timestamp thành date string
     */
    private String getDateString(long timestamp) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
        return sdf.format(new Date(timestamp));
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
    
    public long getSubmittedAt() {
        return submittedAt;
    }
    
    public void setSubmittedAt(long submittedAt) {
        this.submittedAt = submittedAt;
        this.submittedDate = getDateString(submittedAt);
    }
    
    public String getSubmittedDate() {
        return submittedDate;
    }
    
    public void setSubmittedDate(String submittedDate) {
        this.submittedDate = submittedDate;
    }
    
    public boolean isSuccess() {
        return success;
    }
    
    public void setSuccess(boolean success) {
        this.success = success;
    }
    
    public String getResponse() {
        return response;
    }
    
    public void setResponse(String response) {
        this.response = response;
    }
    
    public int getQuotaUsed() {
        return quotaUsed;
    }
    
    public void setQuotaUsed(int quotaUsed) {
        this.quotaUsed = quotaUsed;
    }
    
    public String getSubmissionId() {
        return submissionId;
    }
    
    public void setSubmissionId(String submissionId) {
        this.submissionId = submissionId;
    }
    
    /**
     * Kiểm tra xem URL này đã được gửi trong vòng N ngày chưa
     */
    public boolean isWithinDays(int days) {
        long nowMillis = System.currentTimeMillis();
        long daysInMillis = days * 24L * 60 * 60 * 1000;
        return (nowMillis - submittedAt) < daysInMillis;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UrlSubmissionHistory that = (UrlSubmissionHistory) o;
        return Objects.equals(submissionId, that.submissionId);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(submissionId);
    }
    
    @Override
    public String toString() {
        return "UrlSubmissionHistory{" +
                "url='" + url + '\'' +
                ", action='" + action + '\'' +
                ", submittedDate='" + submittedDate + '\'' +
                ", success=" + success +
                ", submissionId='" + submissionId + '\'' +
                '}';
    }
}
