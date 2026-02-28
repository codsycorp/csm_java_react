package net.phanmemmottrieu.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.Map;

@RestController
public class MainRouterController {

    @Autowired
    private ApiSpringController apiSpringController;

    @Autowired
    private WebSpringController webSpringController;

    private static final Logger logger = LoggerFactory.getLogger(MainRouterController.class);

    @RequestMapping(
        value = "/**",
        method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS},
        consumes = MediaType.ALL_VALUE
    )
    public ResponseEntity<?> route(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestHeader Map<String, String> headers,
            @RequestParam Map<String, String> queryParams,
            @RequestBody(required = false) String requestBody
    ) {
        String host = request.getHeader("Host");
        String uri = request.getRequestURI();

        logger.info("📥 Request từ host {} đến URI {}", host, uri);

        // API routing
        if ((host != null && host.startsWith("api.")) || uri.startsWith("/api/")) {
            if (uri.startsWith("/api/")) {
                String newUri = uri.replaceFirst("/api", "");
                request.setAttribute("cleanedUri", newUri);
            }
            return apiSpringController.handleApiRequest(request, response, headers, queryParams, requestBody);
        } else {
            return webSpringController.handleWebRequest(request, headers, queryParams, requestBody);
        }
    }
}