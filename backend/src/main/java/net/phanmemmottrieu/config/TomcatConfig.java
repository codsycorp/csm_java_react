package net.phanmemmottrieu.config;

import org.apache.coyote.AbstractProtocol;
import org.apache.coyote.http11.Http11NioProtocol;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;

@Configuration
public class TomcatConfig {

    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
        return (factory) -> {
            factory.addConnectorCustomizers(connector -> {
                if (connector.getProtocolHandler() instanceof AbstractProtocol) {
                    AbstractProtocol<?> protocol = (AbstractProtocol<?>) connector.getProtocolHandler();
                    
                    // 🚀 MAXIMUM CONCURRENCY SETTINGS
                    protocol.setMaxThreads(800);         // Up from 600 - handle more concurrent requests
                    protocol.setMinSpareThreads(50);     // Up from 25 - keep more warm threads
                    protocol.setAcceptCount(3000);       // Up from 2000 - larger queue
                    protocol.setMaxConnections(20000);   // Up from 10000 - more persistent connections
                    protocol.setConnectionTimeout(15000); // Down to 15s - faster timeout
                    protocol.setKeepAliveTimeout(60000);  // 60s keepalive
                    
                    // Enable HTTP/2 for better performance
                    if (protocol instanceof Http11NioProtocol) {
                        Http11NioProtocol http11 = (Http11NioProtocol) protocol;
                        http11.setCompression("on");
                        http11.setCompressionMinSize(1024);
                        http11.setCompressibleMimeType(
                            "text/html,text/xml,text/plain,text/css," +
                            "text/javascript,application/javascript," +
                            "application/json,application/xml"
                        );
                        http11.setMaxKeepAliveRequests(200); // Allow more requests per connection
                    }
                }
            });
            
            // Optimize thread pool
            factory.addConnectorCustomizers(connector -> {
                connector.setProperty("processorCache", "400");
                connector.setProperty("socket.appReadBufSize", "8192");
                connector.setProperty("socket.appWriteBufSize", "8192");
                connector.setProperty("socket.bufferPool", "500");
            });
        };
    }
}
