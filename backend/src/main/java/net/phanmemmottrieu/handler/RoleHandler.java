package net.phanmemmottrieu.handler;

import java.util.*;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;
import net.phanmemmottrieu.model.StandardResponse;

@Component
public class RoleHandler {
    private final RecordManager recordManager; // Khai báo một trường để giữ instance của RecordManager

    // Sử dụng Dependency Injection thông qua Constructor
    @Autowired // Đánh dấu constructor này để Spring tự động tiêm RecordManager vào
    public RoleHandler(RecordManager recordManager) {
        this.recordManager = recordManager;
    }
    public void handleRoleList(StandardResponse response, Map<String, Object> params) {
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("roleList");

        Map<String, Object> record = recordManager.find("csm", "index", filter);
        List<Map<String, Object>> list = (List<Map<String, Object>>) record.get("data");
        String name = String.valueOf(params.getOrDefault("name", ""));
        String status = String.valueOf(params.getOrDefault("status", ""));

        List<Map<String, Object>> filtered = list.stream().filter(item ->
            item.get("name").toString().contains(name)
                && item.get("status").toString().contains(status)
        ).collect(Collectors.toList());

        response.set("code", 200);
        response.set("result", Map.of("list", filtered, "total", filtered.size(), "pageSize", 10, "current", 1));
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleRoleItem(StandardResponse response, String method, Map<String, Object> params) throws Exception {
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("roleList");

        Map<String, Object> record = recordManager.find("csm", "index", filter);
        List<Map<String, Object>> list = (List<Map<String, Object>>) record.get("data");

        switch (method.toUpperCase()) {
            case "POST":
                params.put("id", UUID.randomUUID().toString());
                list.add(params);
                break;
            case "PUT":
                list.stream()
                    .filter(r -> r.get("id").equals(params.get("id")))
                    .findFirst()
                    .ifPresent(r -> r.putAll(params));
                break;
            case "DELETE":
                list.removeIf(r -> r.get("id").equals(params.get("id")));
                break;
            default:
                // Optionally handle the default case if required
                break;
        }        

        recordManager.createRecord("csm", "index", Map.of("id", "roleList", "data", list), List.of("id"));
        response.set("code", 200);
        response.set("result", params);
        response.set("message", "ok");
        response.set("success", true);
    }

    public void handleRoleMenu(StandardResponse response) {
        SearchFilter filter = new SearchFilter();
        filter.setField("id");
        filter.setType("eq");
        filter.setValue("menuR");

        Map<String, Object> record = recordManager.find("csm", "index", filter);
        List<Map<String, Object>> data = (List<Map<String, Object>>) record.get("data");
        response.set("code", 200);
        response.set("result", data);
        response.set("message", "ok");
        response.set("success", true);
    }
}