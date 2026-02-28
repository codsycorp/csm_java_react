package net.phanmemmottrieu.service;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Tracks quota usage for a single AI model (minute and day limits).
 * Used by GeminiService to ensure each model stays within free tier limits.
 * 
 * @author Mr.Anh
 */
public class ModelQuota {
  
  /** Name of the model */
  private final String modelName;
  
  /** Max requests per minute */
  private final int maxPerMinute;
  
  /** Max requests per day */
  private final int maxPerDay;
  
  /** Current requests in this minute */
  private int minuteCount;
  
  /** Current requests today */
  private int dayCount;
  
  /** Timestamp when minute counter started */
  private long minuteStartTime;
  
  /** Last date for day counter */
  private LocalDate lastDay;
  
  /**
   * Create quota tracker for a model.
   * 
   * @param modelName Name of the model (e.g., "gemini-2.0-flash-exp")
   * @param maxPerMinute Max requests per minute (e.g., 60)
   * @param maxPerDay Max requests per day (e.g., 1500)
   */
  public ModelQuota(String modelName, int maxPerMinute, int maxPerDay) {
    this.modelName = modelName;
    this.maxPerMinute = maxPerMinute;
    this.maxPerDay = maxPerDay;
    this.minuteCount = 0;
    this.dayCount = 0;
    this.minuteStartTime = System.currentTimeMillis();
    this.lastDay = LocalDate.now();
  }
  
  /**
   * Check if model is available (hasn't hit quota limits).
   * Resets counters if time boundary crossed.
   */
  public synchronized boolean isAvailable() {
    updateCounters();
    return minuteCount < maxPerMinute && dayCount < maxPerDay;
  }
  
  /**
   * Increment usage counters.
   * Call this after successful API request.
   */
  public synchronized void incrementUsage() {
    updateCounters();
    minuteCount++;
    dayCount++;
  }
  
  /**
   * Get remaining quota for this minute.
   */
  public synchronized int getRemainingPerMinute() {
    updateCounters();
    return Math.max(0, maxPerMinute - minuteCount);
  }
  
  /**
   * Get remaining quota for this day.
   */
  public synchronized int getRemainingPerDay() {
    updateCounters();
    return Math.max(0, maxPerDay - dayCount);
  }
  
  /**
   * Get quota info for logging.
   */
  public synchronized String getQuotaInfo() {
    updateCounters();
    return String.format("%s: %d/%d min, %d/%d day", 
        modelName, minuteCount, maxPerMinute, dayCount, maxPerDay);
  }
  
  /**
   * Get model name.
   */
  public String getModelName() {
    return modelName;
  }
  
  /**
   * Update counters based on time boundaries.
   * Resets minute counter every 60 seconds.
   * Resets day counter at midnight.
   */
  private void updateCounters() {
    long now = System.currentTimeMillis();
    
    // Reset minute counter every 60 seconds
    if (now - minuteStartTime >= 60_000) {
      minuteCount = 0;
      minuteStartTime = now;
    }
    
    // Reset day counter at midnight
    LocalDate today = LocalDate.now();
    if (!today.equals(lastDay)) {
      dayCount = 0;
      lastDay = today;
    }
  }
  
  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    ModelQuota that = (ModelQuota) o;
    return Objects.equals(modelName, that.modelName);
  }
  
  @Override
  public int hashCode() {
    return Objects.hash(modelName);
  }
  
  @Override
  public String toString() {
    return getQuotaInfo();
  }
}
