package net.phanmemmottrieu.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // CORS được quản lý tập trung tại SecurityConfig#corsConfigurationSource()
        // Giữ class này rỗng để tránh phát sinh duplicate Access-Control-Allow-Origin.
    }
}