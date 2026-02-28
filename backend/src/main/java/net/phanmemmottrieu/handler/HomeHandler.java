package net.phanmemmottrieu.handler;

import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.model.StandardResponse;
import net.phanmemmottrieu.service.GoogleBotVisitService;

@Component
public class HomeHandler {
    private final GoogleBotVisitService googleBotVisitService;

    @Autowired
    public HomeHandler(GoogleBotVisitService googleBotVisitService) {
        this.googleBotVisitService = googleBotVisitService;
    }

    public void handleNotifications(StandardResponse response) {
        List<Map<String, String>> data = Arrays.asList(
            Map.of("id", "000000001", "title", "Chào mừng bạn đến với hệ thống", "datetime", "2025-04-15", "type", "notification")
        );
        response.set("code", 200);
        response.set("result", data);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleHome(StandardResponse response) {
        response.set("code", 200);
        response.set("result", Map.of(
            "totalVisits", 10000,
            "totalUsers", 432,
            "totalOrders", 218,
            "totalIncome", 98000000
        ));
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleHomePie(StandardResponse response) {
        List<Map<String, Object>> data = Arrays.asList(
            Map.of("name", "Loại A", "value", 45),
            Map.of("name", "Loại B", "value", 30),
            Map.of("name", "Loại C", "value", 25)
        );
        response.set("code", 200);
        response.set("result", data);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleHomeLine(StandardResponse response, Map<String, Object> params) {
        List<Map<String, Object>> data = new ArrayList<>();
        for (int i = 1; i <= 12; i++) {
            data.add(Map.of("month", "Tháng " + i, "value", new Random().nextInt(1000)));
        }
        response.set("code", 200);
        response.set("result", data);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleGoogleBotStats(StandardResponse response, Map<String, Object> params) {
        int limit = 50;
        int offset = 0;
        
        Object limitObj = params != null ? params.get("limit") : null;
        if (limitObj != null) {
            try {
                limit = Integer.parseInt(limitObj.toString());
            } catch (NumberFormatException ignored) {
                limit = 50;
            }
        }
        
        Object offsetObj = params != null ? params.get("offset") : null;
        if (offsetObj != null) {
            try {
                offset = Integer.parseInt(offsetObj.toString());
            } catch (NumberFormatException ignored) {
                offset = 0;
            }
        }

        Map<String, Object> stats = googleBotVisitService.getStats(limit, offset);
        response.set("code", 200);
        response.set("result", stats);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleGoogleBotDelete(StandardResponse response, Map<String, Object> params) {
        boolean deleteAll = false;
        List<String> ids = new ArrayList<>();

        if (params != null) {
            Object allParam = params.get("all");
            if (allParam == null) {
                allParam = params.get("deleteAll");
            }
            if (allParam != null) {
                deleteAll = Boolean.parseBoolean(allParam.toString());
            }

            Object idsParam = params.get("ids");
            if (idsParam instanceof List<?>) {
                for (Object id : (List<?>) idsParam) {
                    if (id != null && !id.toString().isBlank()) {
                        ids.add(id.toString());
                    }
                }
            } else if (idsParam instanceof String) {
                String[] parts = ((String) idsParam).split(",");
                for (String part : parts) {
                    if (part != null && !part.isBlank()) {
                        ids.add(part.trim());
                    }
                }
            }
        }

        Map<String, Object> stats = googleBotVisitService.deleteVisits(ids, deleteAll);
        response.set("code", 200);
        response.set("result", stats);
        response.set("message", "ok");
        response.set("success", true);
    }
}