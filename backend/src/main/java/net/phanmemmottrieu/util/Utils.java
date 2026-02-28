package net.phanmemmottrieu.util;

import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Properties;

public class Utils {
    public static Properties loadProperties() {
        Properties properties = new Properties();
        try {
            String configPath = System.getenv("CONFIG_PATH");
            if (configPath != null) {
                try (InputStream input = new FileInputStream(configPath)) {
                    properties.load(input);
                }
            } else {
                try (InputStream input = Utils.class.getClassLoader().getResourceAsStream("application.properties")) {
                    if (input != null) {
                        properties.load(input);
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error loading properties: " + e.getMessage());
        }
        return properties;
    }
}