package net.phanmemmottrieu.service;

/**
 * Interface chung cho tất cả các AI service providers.
 * Cho phép thay đổi provider mà không cần đổi controller.
 * 
 * @author Mr.Anh
 */
public interface AIProvider {
  
  /**
   * Gửi prompt đến AI provider và nhận kết quả.
   * 
   * @param prompt Chuỗi input cho AI
   * @return JSON response chứa kết quả hoặc error (format: {"error": boolean, "message": string, ...})
   */
  String generateContent(String prompt);
  
  /**
   * Kiểm tra xem provider có sẵn sàng không (quota, kết nối, etc).
   * 
   * @return true nếu provider có thể xử lý request hiện tại
   */
  boolean isAvailable();
  
  /**
   * Lấy tên của provider để logging và debugging.
   * 
  * @return Tên provider (ví dụ: "Gemini")
   */
  String getName();
  
  /**
   * Lấy thông tin quota hiện tại của provider.
   * 
   * @return Chuỗi mô tả quota (ví dụ: "1500/5000 requests in current minute")
   */
  String getQuotaInfo();
}
