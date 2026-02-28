package net.phanmemmottrieu.socket;

import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.SocketConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SocketIOServerFactory {

    @Value("${socket.server.port}")
    private int socketPort;

    @Value("${socket.server.host:0.0.0.0}")
    private String socketHost;

    @Bean
    public SocketIOServer socketIOServer() {
        com.corundumstudio.socketio.Configuration config = new com.corundumstudio.socketio.Configuration();
        config.setHostname(socketHost);
        config.setPort(socketPort);
        config.setOrigin("*");
        
        // Enable SO_REUSEADDR to allow binding to port even if it's in TIME_WAIT state
        SocketConfig socketConfig = new SocketConfig();
        socketConfig.setReuseAddress(true);
        socketConfig.setTcpNoDelay(true);
        socketConfig.setTcpKeepAlive(true);
        config.setSocketConfig(socketConfig);

        return new SocketIOServer(config);
    }
}
