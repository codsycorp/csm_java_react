package net.phanmemmottrieu.service;

import java.util.HashMap;
import java.util.Map;

public class BrowserHeaders {

    /**
     * Tạo và trả về một Map chứa các HTTP header phổ biến của trình duyệt Chrome.
     * Các header này giúp mô phỏng hành vi của trình duyệt thực,
     * giảm khả năng bị phát hiện bởi các hệ thống chống bot.
     *
     * @param userAgent Chuỗi User-Agent của trình duyệt bạn muốn mô phỏng.
     * Ví dụ: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
     * @param acceptLanguage Ngôn ngữ chấp nhận. Ví dụ: "en-US,en;q=0.9"
     * @param referer (Tùy chọn) URL Referer. Đặt null nếu không cần.
     * @return Map<String, String> chứa các HTTP header đã khai báo.
     */
    public static Map<String, String> createChromeHeaders(String userAgent, String acceptLanguage, String referer) {
        Map<String, String> headers = new HashMap<>();

        // 1. User-Agent
        // Rất quan trọng, hãy đảm bảo nó khớp với hệ điều hành và phiên bản Chrome bạn đang mô phỏng.
        headers.put("User-Agent", userAgent);

        // 2. Accept Header
        // Cho biết các loại nội dung mà trình duyệt có thể xử lý.
        headers.put("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");

        // 3. Accept-Language
        // Ngôn ngữ ưu tiên cho nội dung và giao diện người dùng.
        headers.put("Accept-Language", acceptLanguage);

        // 4. Client Hints Headers (Quan trọng đối với Chrome)
        // Cung cấp thông tin chi tiết về trình duyệt, nền tảng.
        // Các giá trị này nên tương ứng với User-Agent bạn đã đặt.
        // Ví dụ dưới đây giả định một User-Agent Chrome trên Windows.
        headers.put("Sec-Ch-Ua", "\"Google Chrome\";v=\"108\", \"Chromium\";v=\"108\", \"Not?A_Brand\";v=\"99\"");
        headers.put("Sec-Ch-Ua-Mobile", "?0"); // ?0 cho desktop, ?1 cho mobile

        // Cần trích xuất tên nền tảng từ User-Agent hoặc truyền vào
        String platform = "Windows"; // Mặc định là Windows
        if (userAgent.contains("Linux")) {
            platform = "Linux";
        } else if (userAgent.contains("Macintosh")) {
            platform = "macOS";
        }
        headers.put("Sec-Ch-Ua-Platform", "\"" + platform + "\"");

        // 5. Sec-Fetch Headers
        // Cung cấp thông tin về cách yêu cầu được tạo và ngữ cảnh của nó.
        headers.put("Sec-Fetch-Dest", "document"); // Cho yêu cầu tài liệu chính
        headers.put("Sec-Fetch-Mode", "navigate"); // Cho yêu cầu điều hướng
        headers.put("Sec-Fetch-Site", "none");     // Yêu cầu đầu tiên đến một trang web thường là 'none'
        headers.put("Upgrade-Insecure-Requests", "1"); // Yêu cầu nâng cấp từ HTTP sang HTTPS

        // 6. Referer (Tùy chọn)
        // Nếu bạn muốn mô phỏng việc truy cập trang từ một trang khác.
        if (referer != null && !referer.isEmpty()) {
            headers.put("Referer", referer);
        }

        return headers;
    }
}
