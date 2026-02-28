package net.phanmemmottrieu.service;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.Authenticator;
import okhttp3.Credentials;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Component;

@Component
public class WebScraperService {

    private final OkHttpClient httpClient;

    public WebScraperService() {
        // Khởi tạo OkHttpClient với timeout mặc định
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    public void close() {
        // OkHttpClient tự động quản lý connection, có thể gọi shutdown nếu cần
        httpClient.dispatcher().executorService().shutdown();
    }

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
    private Map<String, String> createDefaultChromeHeaders(String userAgent, String acceptLanguage, String referer) {
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
        // Cần trích xuất tên nền tảng từ User-Agent hoặc truyền vào để chính xác hơn
        String platform = "Windows"; // Mặc định là Windows nếu không tìm thấy trong User-Agent
        if (userAgent.contains("Linux")) {
            platform = "Linux";
        } else if (userAgent.contains("Macintosh")) {
            platform = "macOS";
        }

        // Các giá trị này nên khớp với User-Agent đã đặt
        headers.put("Sec-Ch-Ua", "\"Google Chrome\";v=\"108\", \"Chromium\";v=\"108\", \"Not?A_Brand\";v=\"99\""); // Ví dụ với Chrome 108
        headers.put("Sec-Ch-Ua-Mobile", "?0"); // ?0 cho desktop, ?1 cho mobile
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

    /**
     * Lấy nội dung HTML của một trang web.
     *
     * @param link URL của trang web cần lấy dữ liệu.
     * @return Nội dung HTML của trang web dưới dạng chuỗi, hoặc chuỗi rỗng nếu có lỗi.
     */
    public String getHtmlContent(String link) {
        return getHtmlContent(link, null);
    }

    /**
     * Lấy nội dung HTML của một trang web với tùy chọn proxy được cung cấp.
     *
     * @param link URL của trang web cần lấy dữ liệu.
     * @param proxyConfig Cấu hình proxy dưới dạng Map (ví dụ: "server", "username", "password").
     * Nếu null, sẽ không sử dụng proxy.
     * @return Nội dung HTML của trang web dưới dạng chuỗi, hoặc chuỗi rỗng nếu có lỗi.
     */
    public String getHtmlContent(String link, Map<String, String> proxyConfig) {
        try {
            String userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36";
            String acceptLanguage = "en-US,en;q=0.9";
            
            OkHttpClient client = createHttpClient(proxyConfig);
            
            Request.Builder requestBuilder = new Request.Builder()
                    .url(link)
                    .get();
            
            // Thêm header mô phỏng trình duyệt
            Map<String, String> headers = createDefaultChromeHeaders(userAgent, acceptLanguage, null);
            headers.forEach((key, value) -> requestBuilder.header(key, value));
            
            Request request = requestBuilder.build();
            
            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    System.err.println("HTTP Error " + response.code() + " khi truy cập " + link);
                    return "";
                }
                
                String responseBody = response.body() != null ? response.body().string() : "";
                return responseBody;
            }
        } catch (IOException e) {
            System.err.println("Lỗi khi lấy nội dung HTML từ " + link + ": " + e.getMessage());
            return "";
        }
    }

    /**
     * Thực thi một đoạn JavaScript trên trang - KHÔNG ĐƯỢC HỖ TRỢ với Jsoup.
     * Jsoup chỉ parse HTML tĩnh, không thực thi JavaScript.
     *
     * @param link URL của trang web.
     * @param script Đoạn mã JavaScript.
     * @return null - JavaScript execution không được hỗ trợ
     */
    public String executeJavaScript(String link, String script) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript. Vui lòng sử dụng HtmlUnit hoặc Playwright nếu cần chức năng này.");
        return null;
    }

    /**
     * Thực thi một đoạn JavaScript trên trang - KHÔNG ĐƯỢC HỖ TRỢ với Jsoup.
     *
     * @param link URL của trang web.
     * @param proxyConfig Cấu hình proxy.
     * @param script Đoạn mã JavaScript.
     * @return null - JavaScript execution không được hỗ trợ
     */
    public String executeJavaScript(String link, Map<String, String> proxyConfig, String script) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript. Vui lòng sử dụng HtmlUnit hoặc Playwright nếu cần chức năng này.");
        return null;
    }

    /**
     * Lấy nội dung HTML - JavaScript không được thực thi với Jsoup.
     * Chỉ trả về HTML tĩnh của trang.
     *
     * @param link URL của trang web cần lấy dữ liệu.
     * @param scriptToExecute Không được sử dụng.
     * @param listenToConsole Không được sử dụng.
     * @return Nội dung HTML của trang web dưới dạng chuỗi, hoặc chuỗi rỗng nếu có lỗi.
     */
    public String getHtmlContentWithJavaScriptExecution(String link, String scriptToExecute, boolean listenToConsole) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript. Chỉ trả về HTML tĩnh.");
        return getHtmlContent(link);
    }

    /**
     * Lấy nội dung HTML - JavaScript không được thực thi với Jsoup.
     *
     * @param link URL của trang web cần lấy dữ liệu.
     * @param proxyConfig Cấu hình proxy.
     * @param scriptToExecute Không được sử dụng.
     * @param listenToConsole Không được sử dụng.
     * @return Nội dung HTML của trang web dưới dạng chuỗi.
     */
    public String getHtmlContentWithJavaScriptExecution(String link, Map<String, String> proxyConfig, String scriptToExecute, boolean listenToConsole) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript. Chỉ trả về HTML tĩnh.");
        return getHtmlContent(link, proxyConfig);
    }

    /**
     * Tạo OkHttpClient với cấu hình proxy nếu được cung cấp.
     */
    private OkHttpClient createHttpClient(Map<String, String> proxyConfig) {
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS);

        if (proxyConfig != null && !proxyConfig.isEmpty()) {
            String proxyServer = proxyConfig.get("server");
            if (proxyServer != null && !proxyServer.isEmpty()) {
                try {
                    String[] parts = proxyServer.split(":");
                    String host = parts[0];
                    int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 8080;

                    Proxy proxy = new Proxy(
                            Proxy.Type.HTTP,
                            new InetSocketAddress(host, port)
                    );
                    builder.proxy(proxy);

                    // Cấu hình authentication nếu có
                    if (proxyConfig.containsKey("username") && proxyConfig.containsKey("password")) {
                        String username = proxyConfig.get("username");
                        String password = proxyConfig.get("password");
                        builder.proxyAuthenticator((route, response) -> {
                            if (response.request().header("Proxy-Authorization") != null) {
                                return null;
                            }
                            String credential = Credentials.basic(username, password);
                            return response.request().newBuilder()
                                    .header("Proxy-Authorization", credential)
                                    .build();
                        });
                    }
                } catch (Exception e) {
                    System.err.println("Lỗi cấu hình proxy: " + e.getMessage());
                }
            }
        }

        return builder.build();
    }

    /**
     * Phương thức nội bộ để lấy nội dung HTML (giữ nguyên tên để tương thích với Controller).
     * Jsoup không hỗ trợ thực thi JavaScript, chỉ trả về HTML tĩnh.
     *
     * @param link URL của trang web.
     * @param proxyConfig Cấu hình proxy.
     * @param scriptToExecute Không được sử dụng với Jsoup.
     * @param listenToConsole Không được sử dụng.
     * @param useIncognito Không được sử dụng.
     * @param onPageLoadedScript Không được sử dụng.
     * @return Nội dung HTML của trang web.
     */
    public String getHtmlContentInternal(String link, Map<String, String> proxyConfig, String scriptToExecute, boolean listenToConsole, boolean useIncognito, String onPageLoadedScript) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript. Chỉ trả về HTML tĩnh.");
        if (scriptToExecute != null && !scriptToExecute.isEmpty()) {
            System.err.println("  - Script sẽ bị bỏ qua: " + scriptToExecute.substring(0, Math.min(50, scriptToExecute.length())) + "...");
        }
        return getHtmlContent(link, proxyConfig);
    }

    /**
     * Phương thức nội bộ để thực thi JavaScript (giữ nguyên tên để tương thích với Controller).
     * Jsoup không hỗ trợ thực thi JavaScript.
     *
     * @param link URL của trang web.
     * @param proxyConfig Cấu hình proxy.
     * @param script Đoạn JavaScript sẽ bị bỏ qua.
     * @param useIncognito Không được sử dụng.
     * @param onPageLoadedScript Không được sử dụng.
     * @return null - JavaScript execution không được hỗ trợ.
     */
    public String executeJavaScriptInternal(String link, Map<String, String> proxyConfig, String script, boolean useIncognito, String onPageLoadedScript) {
        System.err.println("CẢNH BÁO: Jsoup không hỗ trợ thực thi JavaScript!");
        System.err.println("  - URL: " + link);
        System.err.println("  - Script sẽ bị bỏ qua: " + script.substring(0, Math.min(50, script.length())) + "...");
        System.err.println("  - Vui lòng xem xét sử dụng HtmlUnit hoặc Playwright nếu cần chức năng này.");
        return null;
    }

    public static class ProxyInfo {
        public String protocol;
        public String server;
        public String username;
        public String password;

        public ProxyInfo(String protocol, String server, String username, String password) {
            this.protocol = protocol;
            this.server = server;
            this.username = username;
            this.password = password;
        }
    }

    public static ProxyInfo getRandomHttpsProxy() {
        ProxyInfo[] availableProxies = {
            new ProxyInfo("https", "http://user:pass@your-proxy-server-1:port", "user", "pass"),
            new ProxyInfo("https", "http://user:pass@your-proxy-server-2:port", "user", "pass"),
            new ProxyInfo("https", "http://user:pass@your-proxy-server-3:port", "user", "pass"),
            // Thêm các proxy thực tế của bạn vào đây
        };

        var httpsProxies = java.util.Arrays.stream(availableProxies)
                                .filter(p -> "https".equalsIgnoreCase(p.protocol))
                                .collect(java.util.stream.Collectors.toList());

        if (httpsProxies.isEmpty()) {
            return null;
        }

        Random random = new Random();
        return httpsProxies.get(random.nextInt(httpsProxies.size()));
    }
}
