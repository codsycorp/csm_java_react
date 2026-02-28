package net.phanmemmottrieu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                    // Chỉ rõ origin để cho phép gửi cookie (credentials)
                    .allowedOrigins(
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                        "http://localhost:15300",
                        "http://127.0.0.1:15300",
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://localhost:3333",
                        "http://127.0.0.1:3333",
                        "https://www.h-holding.vn",
                        "https://www.h-holding.com.vn",
                        "https://www.phanmemmottrieu.net",
                        "https://phanmemmottrieu.net",
                        "https://www.csmbridge.net",
                        "https://csmbridge.net",
                        // Thêm origins cho node-webkit
                        "chrome-extension://invalid",
                        "app://.",
                        "file://",
                        "null"
                    )
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .allowedHeaders("Content-Type", "Authorization", "csm-token", "X-Refresh-Token", "X-Guest-Token", "X-CSRF-Token", "csm-Lang", "X-Requested-With", "Accept")
                    .allowCredentials(true)
                    .maxAge(3600);
            }
        };
    }
}