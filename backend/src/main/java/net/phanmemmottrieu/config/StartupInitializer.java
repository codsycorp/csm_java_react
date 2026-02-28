package net.phanmemmottrieu.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.boot.context.event.ApplicationReadyEvent;

import net.phanmemmottrieu.data.RecordManager;

@Component
public class StartupInitializer {
    private static final Logger logger = LoggerFactory.getLogger(StartupInitializer.class);

    @Autowired
    private RecordManager recordManager;

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            // Ensure Lucene index directory for csm_accounts exists and is initialized
            logger.info("Initializing Lucene index for csm/csm_accounts on startup if missing...");
            recordManager.getSearcherManager("csm", "csm_accounts");
            logger.info("Lucene index for csm_accounts is ready.");
        } catch (Exception e) {
            logger.warn("Failed to initialize Lucene index for csm_accounts at startup: {}", e.getMessage(), e);
        }
    }
}
