package net.phanmemmottrieu.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/**
 * Dịch vụ quản lý vòng đời và giới hạn sử dụng của các API key với khả năng lưu trạng thái.
 *
 * <p>Lớp này chịu trách nhiệm tải, quản lý và lưu trạng thái của các API key vào một tệp JSON. Nó
 * theo dõi số lần sử dụng của từng key theo phút và theo ngày, đồng thời cung cấp một phương thức
 * để lấy key khả dụng tiếp theo theo cơ chế xoay vòng (round-robin). Trạng thái sử dụng sẽ được duy
 * trì sau khi khởi động lại ứng dụng.
 *
 * @author Mr.Anh
 */
@Slf4j
@Service
public class ApiKeyService {

  /** Resource trỏ đến file văn bản chứa danh sách các API key ban đầu. */
  @Value("${api.keys.file-path}")
  private Resource apiKeyFile;

  /** Đường dẫn đến file JSON để lưu và phục hồi trạng thái sử dụng của các API key. */
  @Value("${api.keys.state-file-path}")
  private String stateFilePath;

  /** Giới hạn số lượng yêu cầu tối đa cho mỗi key trong một phút. */
  @Value("${api.keys.limit.per-minute}")
  private int maxRequestsPerMinute;

  /** Giới hạn số lượng yêu cầu tối đa cho mỗi key trong một ngày. */
  @Value("${api.keys.limit.per-day}")
  private int maxRequestsPerDay;

  /** Danh sách thread-safe chứa các đối tượng {@link ApiKey} và trạng thái của chúng. */
  private final List<ApiKey> apiKeys = new CopyOnWriteArrayList<>();

  /** Chỉ số của key được sử dụng gần nhất, phục vụ cho cơ chế xoay vòng (round-robin). */
  private int currentKeyIndex = 0;

  /** Đối tượng ObjectMapper để thực hiện việc chuyển đổi giữa đối tượng Java và JSON. */
  private final ObjectMapper objectMapper = new ObjectMapper();

  /** Flag để báo hiệu rằng trạng thái đã thay đổi và cần lưu vào file. */
  private volatile boolean isDirty = false;

  /** Thread pool để lưu state không đồng bộ, giảm độ trễ của API calls. */
  private static final ScheduledExecutorService saveExecutor = 
      Executors.newScheduledThreadPool(1, r -> {
        Thread t = new Thread(r, "ApiKeyStateSaver");
        t.setDaemon(true);
        return t;
      });

  /**
   * Khởi tạo dịch vụ sau khi các dependency đã được inject.
   *
   * <p>Phương thức này đăng ký {@link JavaTimeModule} để hỗ trợ kiểu dữ liệu {@code java.time} và
   * gọi {@link #loadApiKeysState()} để tải trạng thái các key. Đồng thời khởi động background task
   * để lưu state định kỳ.
   */
  @PostConstruct
  public void init() {
    objectMapper.registerModule(new JavaTimeModule());
    loadApiKeysState();
    
    // Khởi động task lưu state mỗi 30 giây thay vì lưu sau mỗi lần dùng API key
    saveExecutor.scheduleAtFixedRate(this::saveIfDirty, 30, 30, TimeUnit.SECONDS);
  }

  /**
   * Cleanup khi ứng dụng shutdown.
   */
  @PreDestroy
  public void cleanup() {
    // Lưu state cuối cùng trước khi tắt
    saveIfDirty();
    
    saveExecutor.shutdown();
    try {
      if (!saveExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
        saveExecutor.shutdownNow();
      }
    } catch (InterruptedException e) {
      log.error("Error shutting down save executor: " + e.getMessage());
      saveExecutor.shutdownNow();
    }
  }

  /**
   * Tải trạng thái của các API key từ file JSON.
   *
   * <p>Nếu file trạng thái tồn tại và có nội dung, phương thức sẽ giải mã (deserialize) JSON thành
   * danh sách các đối tượng {@link ApiKey}. Ngược lại, nếu file không tồn tại hoặc rỗng, nó sẽ gọi
   * {@link #loadKeysFromInitialFile()} để tải từ file nguồn.
   */
  private void loadApiKeysState() {
    File stateFile = new File(stateFilePath);
    if (stateFile.exists() && stateFile.length() > 0) {
      try {
        List<ApiKey> loadedKeys = objectMapper.readValue(stateFile, new TypeReference<>() {});
        this.apiKeys.addAll(loadedKeys);
        // Đã tải API keys thành công
      } catch (IOException e) {
        log.error("Loi nghiem trong: Khong the doc file trang thai JSON.", e);
        throw new RuntimeException("Khong the doc file trang thai JSON", e);
      }
    } else {
      log.info("Khong tim thay file trang thai. Dang tien hanh tai tu file ban dau...");
      loadKeysFromInitialFile();
    }
  }

  /**
   * Tải danh sách API key từ file văn bản ban đầu.
   *
   * <p>Phương thức này đọc từng dòng trong file được cung cấp bởi {@code apiKeyFile}, tạo đối tượng
   * {@link ApiKey} mới cho mỗi key, và sau đó lưu trạng thái ban đầu này ra file JSON.
   */
  private void loadKeysFromInitialFile() {
    try (BufferedReader reader =
        new BufferedReader(
            new InputStreamReader(apiKeyFile.getInputStream(), StandardCharsets.UTF_8))) {
      List<String> keysFromFile =
          reader
              .lines()
              .map(String::trim)
              .filter(line -> !line.isEmpty())
              .collect(Collectors.toList());
      for (String key : keysFromFile) {
        this.apiKeys.add(new ApiKey(key));
      }
      // Đã tải API keys từ file
      saveApiKeysState();
    } catch (IOException e) {
      log.error("Loi nghiem trong: Khong the tai file API key ban dau.", e);
      throw new RuntimeException("Khong the tai file API key ban dau", e);
    }
  }

  /**
   * Lưu trạng thái hiện tại của danh sách API key vào file JSON.
   *
   * <p>Phương thức này được gọi không đồng bộ (async) mỗi 30 giây thay vì sau mỗi lần lưu,
   * giảm thiểu I/O và cải thiện hiệu suất.
   */
  private synchronized void saveApiKeysState() {
    try {
      File stateFile = new File(stateFilePath);

      File parentDir = stateFile.getParentFile();

      if (parentDir != null && !parentDir.exists()) {
        // Tạo thư mục nếu cần
        if (parentDir.mkdirs()) {
          // Đã tạo thư mục
        } else {
          log.error("Khong the tao duoc thu muc: {}", parentDir.getAbsolutePath());
        }
      }

      objectMapper.writerWithDefaultPrettyPrinter().writeValue(stateFile, apiKeys);
      isDirty = false; // Reset dirty flag sau khi lưu
    } catch (IOException e) {
      log.error("Loi: Khong the luu trang thai API key vao file JSON.", e);
    }
  }

  /**
   * Kiểm tra xem state có cần lưu hay không, nếu có sẽ lưu.
   * Phương thức này giảm số lần ghi file từ rất nhiều xuống chỉ mỗi 30 giây.
   */
  private void saveIfDirty() {
    if (isDirty) {
      synchronized (this) {
        if (isDirty) {
          saveApiKeysState();
        }
      }
    }
  }

  /**
   * Lấy một API key hợp lệ và khả dụng từ danh sách theo cơ chế xoay vòng (round-robin).
   *
   * <p>Phương thức này sẽ duyệt qua danh sách các key bắt đầu từ key tiếp theo của key được sử dụng
   * lần trước. Đối với mỗi key, nó sẽ kiểm tra và cập nhật trạng thái (reset bộ đếm theo phút/ngày
   * nếu cần). Nếu một key được tìm thấy còn trong giới hạn sử dụng, bộ đếm của nó sẽ được tăng lên,
   * trạng thái được báo hiệu cần lưu (nhưng không lưu ngay) và key đó được trả về.
   *
   * @return Một đối tượng {@link ApiKey} khả dụng, hoặc {@code null} nếu tất cả các key đều đã đạt
   *     giới hạn sử dụng.
   */
  public synchronized ApiKey getAvailableApiKey() {
    if (apiKeys.isEmpty()) {
      log.warn("Khong co API key nao trong he thong.");
      return null;
    }

    int keyCount = apiKeys.size();
    for (int i = 0; i < keyCount; i++) {
      int indexToCheck = (currentKeyIndex + i) % keyCount;
      ApiKey key = apiKeys.get(indexToCheck);

      boolean stateChanged = updateKeyState(key);

      if (key.getDayRequestCount() < maxRequestsPerDay
          && key.getMinuteRequestCount() < maxRequestsPerMinute) {
        key.incrementCount();
        this.currentKeyIndex = indexToCheck;
        // Đã chọn key khả dụng

        // Đánh dấu dirty để lưu trong background thay vì lưu ngay
        isDirty = true;
        return key;
      } else if (stateChanged) {
        isDirty = true;
      }
    }

    log.warn("Tat ca API keys deu da het luot su dung trong phut nay.");
    return null;
  }

  /**
   * Vô hiệu hóa một API key cho đến ngày hôm sau và trả về key khả dụng tiếp theo.
   *
   * <p>Phương thức này đặt bộ đếm sử dụng trong ngày của một key cụ thể thành giá trị tối đa,
   * khiến nó không khả dụng cho đến khi bộ đếm được reset vào ngày tiếp theo. Sau đó, nó sẽ tìm và
   * trả về một API key khác có thể sử dụng.
   *
   * @param keyString Chuỗi API key cần được vô hiệu hóa.
   * @return Một đối tượng {@link ApiKey} khả dụng, hoặc {@code null} nếu không có key nào khác khả
   *     dụng.
   */
  public synchronized ApiKey disableApiKeyUntilNextDay(String keyString) {
    boolean keyFound = false;
    for (ApiKey key : apiKeys) {
      if (key.getKeyString().equals(keyString)) {
        log.warn(
            "Vo hieu hoa API key {}... cho den ngay hom sau.",
            key.getKeyString().substring(0, Math.min(key.getKeyString().length(), 8)));
        key.setDayRequestCount(maxRequestsPerDay);
        key.setLastRequestDay(LocalDate.now());
        keyFound = true;
        break;
      }
    }
    if (keyFound) {
      isDirty = true; // Đánh dấu dirty thay vì lưu ngay
    } else {
      log.warn("Co gang vo hieu hoa mot API key khong ton tai: {}", keyString);
    }
    return getAvailableApiKey();
  }

  /**
   * Cập nhật trạng thái của một API key dựa trên thời gian hiện tại.
   *
   * <p>Phương thức này kiểm tra xem đã sang ngày mới hoặc phút mới hay chưa để reset các bộ đếm
   * tương ứng.
   *
   * @param key Đối tượng {@link ApiKey} cần được cập nhật.
   * @return {@code true} nếu trạng thái của key đã thay đổi (bộ đếm được reset), ngược lại trả về
   *     {@code false}.
   */
  private boolean updateKeyState(ApiKey key) {
    LocalDate today = LocalDate.now();
    long now = System.currentTimeMillis();
    boolean changed = false;

    if (key.getLastRequestDay().isBefore(today)) {
      // Reset bộ đếm ngày
      key.resetDayCount();
      changed = true;
    }

    if (now - key.getMinuteTimestamp() >= 60_000) {
      // Reset bộ đếm phút
      key.resetMinuteCount();
      changed = true;
    }
    return changed;
  }

  /**
   * Lớp dữ liệu đại diện cho một API key và trạng thái sử dụng của nó.
   *
   * <p>Bao gồm chuỗi key, các bộ đếm số lần sử dụng theo phút và ngày, cùng với các mốc thời gian
   * để theo dõi và reset giới hạn.
   */
  @Data
  @AllArgsConstructor
  @NoArgsConstructor
  public static class ApiKey {

    /** Chuỗi giá trị của API key. */
    private String keyString;

    /** Số lần yêu cầu trong phút hiện tại. */
    private int minuteRequestCount;

    /** Số lần yêu cầu trong ngày hiện tại. */
    private int dayRequestCount;

    /** Mốc thời gian (timestamp) bắt đầu của phút hiện tại. */
    private long minuteTimestamp;

    /** Ngày của lần yêu cầu cuối cùng. */
    private LocalDate lastRequestDay;

    /** Epoch timestamp (millisecond) khi key sẽ được kích hoạt lại, 0 nếu không bị vô hiệu hóa. */
    private long disabledUntilEpochMs = 0;

    /**
     * Khởi tạo một đối tượng ApiKey mới với trạng thái ban đầu.
     *
     * @param keyString Chuỗi API key.
     */
    public ApiKey(String keyString) {
      this.keyString = keyString;
      this.minuteRequestCount = 0;
      this.dayRequestCount = 0;
      this.minuteTimestamp = System.currentTimeMillis();
      this.lastRequestDay = LocalDate.now();
      this.disabledUntilEpochMs = 0;
    }

    /** Tăng bộ đếm sử dụng cho cả phút và ngày. */
    public void incrementCount() {
      this.minuteRequestCount++;
      this.dayRequestCount++;
    }

    /** Reset bộ đếm theo phút và cập nhật mốc thời gian của phút. */
    public void resetMinuteCount() {
      this.minuteRequestCount = 0;
      this.minuteTimestamp = System.currentTimeMillis();
    }

    /** Reset bộ đếm theo ngày, đồng thời cũng reset cả bộ đếm theo phút và các mốc thời gian. */
    public void resetDayCount() {
      this.dayRequestCount = 0;
      this.minuteRequestCount = 0;
      this.lastRequestDay = LocalDate.now();
      this.minuteTimestamp = System.currentTimeMillis();
    }

    // Explicit getters since Lombok @Data may not process correctly
    public String getKeyString() {
      return keyString;
    }

    public int getMinuteRequestCount() {
      return minuteRequestCount;
    }

    public int getDayRequestCount() {
      return dayRequestCount;
    }

    public long getMinuteTimestamp() {
      return minuteTimestamp;
    }

    public LocalDate getLastRequestDay() {
      return lastRequestDay;
    }

    // Setters
    public void setKeyString(String keyString) {
      this.keyString = keyString;
    }

    public void setMinuteRequestCount(int minuteRequestCount) {
      this.minuteRequestCount = minuteRequestCount;
    }

    public void setDayRequestCount(int dayRequestCount) {
      this.dayRequestCount = dayRequestCount;
    }

    public void setMinuteTimestamp(long minuteTimestamp) {
      this.minuteTimestamp = minuteTimestamp;
    }

    public void setLastRequestDay(LocalDate lastRequestDay) {
      this.lastRequestDay = lastRequestDay;
    }
  }
}
