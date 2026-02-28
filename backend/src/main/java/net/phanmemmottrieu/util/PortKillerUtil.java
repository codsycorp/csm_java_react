package net.phanmemmottrieu.util; // Đặt trong một gói tiện ích

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PortKillerUtil {

    private static final Logger logger = LoggerFactory.getLogger(PortKillerUtil.class);

    /**
     * Xác định và chấm dứt tiến trình đang lắng nghe trên một cổng cụ thể.
     * Cực kỳ cẩn trọng khi sử dụng phương thức này.
     * KHÔNG NÊN DÙNG TRONG MÔI TRƯỜNG SẢN XUẤT.
     *
     * @param port Số cổng cần giải phóng.
     * @return true nếu một tiến trình được tìm thấy và chấm dứt, false nếu không tìm thấy hoặc có lỗi.
     */
    public static boolean killProcessOnPort(int port) {
        String os = System.getProperty("os.name").toLowerCase();
        int pid = -1;

        try {
            if (os.contains("win")) {
                // Windows: netstat -ano | findstr :<port>
                Process p = Runtime.getRuntime().exec("netstat -ano");
                BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.contains("LISTENING") && line.contains(":" + port)) {
                        Pattern pattern = Pattern.compile("LISTENING\\s+(\\d+)");
                        Matcher matcher = pattern.matcher(line);
                        if (matcher.find()) {
                            pid = Integer.parseInt(matcher.group(1));
                            logger.warn("Windows: Found PID {} using port {}", pid, port);
                            break;
                        }
                    }
                }
                p.waitFor(); // Chờ lệnh netstat hoàn thành

                if (pid != -1) {
                    logger.warn("Windows: Attempting to kill process PID {} on port {}", pid, port);
                    Runtime.getRuntime().exec("taskkill /F /PID " + pid).waitFor();
                    logger.warn("Windows: Process PID {} killed.", pid);
                    return true;
                }
            } else if (os.contains("nix") || os.contains("mac")) {
                // Linux/macOS: lsof -i :<port> | grep LISTEN
                Process p = Runtime.getRuntime().exec(new String[]{"sh", "-c", "lsof -i :" + port + " | grep LISTEN"});
                BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
                String line;
                if ((line = reader.readLine()) != null) {
                    // Cố gắng tìm PID từ dòng lsof
                    // Ví dụ: COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
                    //        java    12345 user   23u  IPv6 0x...       0t0  TCP *:9092 (LISTEN)
                    Pattern pattern = Pattern.compile("\\s+(\\d+)\\s+");
                    Matcher matcher = pattern.matcher(line);
                    if (matcher.find()) {
                        pid = Integer.parseInt(matcher.group(1));
                        logger.warn("Linux/macOS: Found PID {} using port {}", pid, port);
                    }
                }
                p.waitFor(); // Chờ lệnh lsof hoàn thành

                if (pid != -1) {
                    logger.warn("Linux/macOS: Attempting to kill process PID {} on port {}", pid, port);
                    Runtime.getRuntime().exec("kill -9 " + pid).waitFor();
                    logger.warn("Linux/macOS: Process PID {} killed.", pid);
                    return true;
                }
            } else {
                logger.warn("Unsupported operating system for automated port killing: {}", os);
            }
        } catch (Exception e) {
            logger.error("Error attempting to kill process on port {}: {}", port, e.getMessage(), e);
        }
        logger.info("No active process found or killed on port {}", port);
        return false;
    }
}
