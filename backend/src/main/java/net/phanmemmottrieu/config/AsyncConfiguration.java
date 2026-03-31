package net.phanmemmottrieu.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfiguration {

    private int cpu() {
        return Math.max(2, Runtime.getRuntime().availableProcessors());
    }

    /**
     * Main async executor for general background tasks
     * OPTIMIZED for high concurrency
     */
    @Bean(name = "asyncExecutor")
    public Executor asyncExecutor() {
        int cpu = cpu();
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.min(8, cpu * 2));
        executor.setMaxPoolSize(Math.min(24, cpu * 4));
        executor.setQueueCapacity(300);
        executor.setThreadNamePrefix("async-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.setAllowCoreThreadTimeOut(true);
        executor.setKeepAliveSeconds(120);
        executor.initialize();
        return executor;
    }

    /**
     * Dedicated executor for Google indexing (rate-limited tasks)
     */
    @Bean(name = "indexExecutor")
    public Executor indexExecutor() {
        int cpu = cpu();
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.min(2, cpu));
        executor.setMaxPoolSize(Math.min(4, Math.max(2, cpu)));
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("index-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.DiscardPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(60);
        executor.initialize();
        return executor;
    }

    /**
     * Fast executor for quick tasks that need immediate execution
     * Used for cache warming, simple calculations, etc.
     */
    @Bean(name = "fastExecutor")
    public Executor fastExecutor() {
        int cpu = cpu();
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.min(4, cpu));
        executor.setMaxPoolSize(Math.min(8, cpu * 2));
        executor.setQueueCapacity(80);
        executor.setThreadNamePrefix("fast-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setKeepAliveSeconds(30);
        executor.setAllowCoreThreadTimeOut(true);
        executor.initialize();
        return executor;
    }
}
