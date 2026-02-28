package net.phanmemmottrieu.config;

import net.phanmemmottrieu.interceptor.ApiCacheInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

/**
 * Web MVC configuration for performance optimization
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired(required = false)
    private ApiCacheInterceptor apiCacheInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (apiCacheInterceptor != null) {
            // Apply caching to API endpoints
            registry.addInterceptor(apiCacheInterceptor)
                .addPathPatterns(
                    "/api/**",
                    "/home/**",
                    "/menu-list",
                    "/role-list",
                    "/notifications"
                )
                .excludePathPatterns(
                    "/api/auth/**",
                    "/api/login",
                    "/api/logout"
                );
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Static resources with aggressive caching for Google PageSpeed
        registry.addResourceHandler("/static/**")
            .addResourceLocations("classpath:/static/")
            .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS)
                .cachePublic()
                .immutable());
        
        registry.addResourceHandler("/assets/**")
            .addResourceLocations("file:csm_datas/public/assets/")
            .setCacheControl(CacheControl.maxAge(30, TimeUnit.DAYS)
                .cachePublic());
        
        // JS and CSS files with moderate caching
        registry.addResourceHandler("*.js")
            .addResourceLocations("classpath:/static/", "file:csm_datas/public/")
            .setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS)
                .cachePublic());
                
        registry.addResourceHandler("*.css")
            .addResourceLocations("classpath:/static/", "file:csm_datas/public/")
            .setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS)
                .cachePublic());
    }
}
