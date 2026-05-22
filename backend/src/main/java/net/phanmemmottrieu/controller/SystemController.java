package net.phanmemmottrieu.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
public class SystemController {

    @GetMapping("/api/system/check-requirements")
    public Map<String, Object> checkSystemRequirements() {
        Map<String, Object> result = new HashMap<>();
        
        // Kiểm tra bộ nhớ
        long maxMemory = Runtime.getRuntime().maxMemory();
        double memoryGB = maxMemory / (1024.0 * 1024.0 * 1024.0);
        
        result.put("memoryGB", memoryGB);
        result.put("isWeakMachine", memoryGB < 4);
        result.put("localAIEnabled", true);
        
        return result;
    }
}