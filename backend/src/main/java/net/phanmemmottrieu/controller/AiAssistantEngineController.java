package net.phanmemmottrieu.controller;

import net.phanmemmottrieu.service.LocalAiAssistantContextService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping
public class AiAssistantEngineController {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantEngineController.class);

    private final LocalAiAssistantContextService localAiAssistantContextService;

    @Autowired
    public AiAssistantEngineController(LocalAiAssistantContextService localAiAssistantContextService) {
        this.localAiAssistantContextService = localAiAssistantContextService;
    }

    @GetMapping({"/ai-assistant/workspace-source", "/api/ai-assistant/workspace-source"})
    public ResponseEntity<Map<String, Object>> workspaceSource(
        @RequestParam("path") String path,
        @RequestParam(value = "contextType", required = false) String contextType
    ) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            LocalAiAssistantContextService.SourceFileView view = localAiAssistantContextService
                .loadIndexedSourceFile(path, str(contextType));
            if (view == null) {
                out.put("success", false);
                out.put("message", "workspace source not found");
                return ResponseEntity.ok(out);
            }

            out.put("success", true);
            out.put("message", "ok");
            out.put("result", view);
            return ResponseEntity.ok(out);
        } catch (Exception ex) {
            log.debug("workspace-source failed path={}: {}", path, ex.getMessage());
            out.put("success", false);
            out.put("message", ex.getMessage());
            return ResponseEntity.ok(out);
        }
    }

    private String str(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }
}
