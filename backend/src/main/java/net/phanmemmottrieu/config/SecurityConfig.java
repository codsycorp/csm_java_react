
package net.phanmemmottrieu.config;

import net.phanmemmottrieu.security.JwtAuthenticationFilter;
import net.phanmemmottrieu.security.RateLimitingFilter;
import net.phanmemmottrieu.security.CsrfProtectionFilter;
// import net.phanmemmottrieu.security.GuestTokenFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Autowired
    private RateLimitingFilter rateLimitingFilter;

    @Autowired
    private CsrfProtectionFilter csrfProtectionFilter;
    

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        RequestMatcher apiMatcher = request -> {
            String host = request.getHeader("Host");
            String uri = request.getRequestURI();
            return (host != null && host.startsWith("api.")) || uri.startsWith("/api/");
        };

        http.cors().configurationSource(corsConfigurationSource());
        http.csrf().disable();
        // Disable Spring Security default logout to avoid redirect to /login?logout
        http.logout(logout -> logout.disable());
        
        // Add JWT filter to Spring Security chain BEFORE authorization
        http.addFilterBefore(jwtAuthenticationFilter, 
            org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class);
        
        http.authorizeHttpRequests()
            // Allow CORS preflight for all endpoints
            .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
            // Public lead-capture endpoint for guest website users
            .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/crm/customer", "/crm/customer").permitAll()
            .requestMatchers(org.springframework.http.HttpMethod.PUT, "/api/crm/customer", "/crm/customer").permitAll()
            // Allow all non-API paths (handled by WebSpringController)
            .requestMatchers(request -> !apiMatcher.matches(request)).permitAll()
            // Public monitoring endpoints (no auth required)
            .requestMatchers(
                "/api/monitoring/**"
            ).permitAll()
            // Public API endpoints (with/without /api prefix) - only auth endpoints
            .requestMatchers(
                "/api/login", "/api/refresh-token", "/api/register", "/api/create-default-data",
                "/login", "/refresh-token", "/register", "/create-default-data"
            ).permitAll()
            // Chat endpoints are public for both guests and admin (history + mark read)
            .requestMatchers(
                "/api/chat-history", "/chat-history",
                "/api/chat-history-guest", "/chat-history-guest",
                "/api/chat-history-app", "/chat-history-app",
                "/api/chat-mark-read", "/chat-mark-read",
                "/api/chat-mark-all-read", "/chat-mark-all-read"
            ).permitAll()
            // All API endpoints else require auth (JWT or refreshToken cookie)
            .requestMatchers(apiMatcher).authenticated()
            .anyRequest().permitAll();
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.addAllowedOriginPattern("*"); // Cho phép tất cả domain
        // BẮT BUỘC: Liệt kê domain cụ thể khi dùng allowCredentials(true)
        config.setAllowedOrigins(java.util.List.of(
            "https://www.h-holding.vn",
            "https://www.h-holding.com.vn",
            "https://www.phanmemmottrieu.net",
            "https://www.csmbridge.net",
            "http://localhost:15300", // Cho môi trường dev
            "http://localhost:3333", // Cho môi trường dev
            "http://localhost:5173", // Vite dev server
            "http://127.0.0.1:15300",
            "http://127.0.0.1:3333",
            "http://127.0.0.1:5173",
            // Thêm origins cho node-webkit
            "chrome-extension://invalid",
            "app://.",
            "file://",
            "null"
        ));
        config.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of(
            "Content-Type",
            "Authorization",
            "X-CSRF-Token",
            "csm-token",
            "X-Refresh-Token",
            "csm-Lang",
            "X-Requested-With",
            "Accept"
        ));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
    
    @Bean
    public FilterRegistrationBean<RateLimitingFilter> rateLimitFilter() {
        FilterRegistrationBean<RateLimitingFilter> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(rateLimitingFilter);
        registrationBean.addUrlPatterns("/*");
        registrationBean.setOrder(2); // Chạy sau JWT filter
        return registrationBean;
    }

    @Bean
    public FilterRegistrationBean<CsrfProtectionFilter> csrfFilter() {
        FilterRegistrationBean<CsrfProtectionFilter> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(csrfProtectionFilter);
        registrationBean.addUrlPatterns("/*");
        registrationBean.setOrder(3); // Chạy cuối cùng
        return registrationBean;
    }
}
