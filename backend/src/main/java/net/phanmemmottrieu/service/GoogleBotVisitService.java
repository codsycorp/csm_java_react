package net.phanmemmottrieu.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import net.phanmemmottrieu.data.RecordManager;
import net.phanmemmottrieu.data.SearchFilter;

@Service
public class GoogleBotVisitService {

    private static final Logger logger = LoggerFactory.getLogger(GoogleBotVisitService.class);
    private static final String APP_ID = "csm";
    private static final String TABLE = "googlebot_visits";
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneId.of("UTC"));

    private final RecordManager recordManager;
    private final AtomicBoolean tableReady = new AtomicBoolean(false);

    @Autowired
    public GoogleBotVisitService(RecordManager recordManager) {
        this.recordManager = recordManager;
    }

    public boolean isGoogleBot(String userAgent) {
        if (userAgent == null) {
            return false;
        }
        String ua = userAgent.toLowerCase();
        return ua.contains("googlebot") || ua.contains("google-site-verification") || ua.contains("google-inspectiontool");
    }

    public void recordVisit(String host, String path, String userAgent, String ip) {
        if (!isGoogleBot(userAgent)) {
            return;
        }
        ensureTable();
        long now = System.currentTimeMillis();
        Instant instant = Instant.ofEpochMilli(now);

        Map<String, Object> record = new HashMap<>();
        record.put("id", buildId(now));
        record.put("host", safe(host));
        record.put("path", safe(path));
        record.put("ip", safe(ip));
        record.put("userAgent", safe(userAgent));
        record.put("ts", now);
        record.put("visitedAt", instant.toString());
        record.put("dateKey", DATE_FORMAT.format(instant));

        try {
            recordManager.createRecord(APP_ID, TABLE, record, List.of("id"));
        } catch (Exception e) {
            logger.debug("Skip logging Googlebot visit: {}", e.getMessage());
        }
    }

    public Map<String, Object> getStats(int limit, int offset) {
        ensureTable();
        int cappedLimit = Math.max(1, Math.min(limit, 200));
        int cappedOffset = Math.max(0, offset);
        
        Map<String, Object> scanResult = recordManager.fullScan(APP_ID, TABLE);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) scanResult.getOrDefault("rows", Collections.emptyList());

        List<Map<String, Object>> normalized = rows.stream()
            .map(this::normalizeRow)
            .filter(map -> map.get("id") != null)
            .sorted(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.getOrDefault("ts", 0L)).reversed())
            .collect(Collectors.toList());

        // Apply offset and limit to the latest visits
        List<Map<String, Object>> latest = normalized.stream()
            .skip(cappedOffset)
            .limit(cappedLimit)
            .collect(Collectors.toList());

        Map<String, Map<String, Object>> daily = new LinkedHashMap<>();
        for (Map<String, Object> row : normalized) {
            String dateKey = (String) row.getOrDefault("dateKey", "");
            if (dateKey.isEmpty()) {
                continue;
            }
            Map<String, Object> summary = daily.computeIfAbsent(dateKey, key -> {
                Map<String, Object> item = new HashMap<>();
                item.put("date", key);
                item.put("count", 0L);
                item.put("lastVisitAt", row.get("visitedAt"));
                return item;
            });
            long count = ((Number) summary.getOrDefault("count", 0L)).longValue();
            summary.put("count", count + 1);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("totalVisits", normalized.size());
        result.put("latest", latest);
        result.put("byDate", new ArrayList<>(daily.values()));
        return result;
    }

    public Map<String, Object> deleteVisits(List<String> ids, boolean deleteAll) {
        ensureTable();
        int deleted = 0;
        try {
            if (deleteAll) {
                Map<String, Object> scanResult = recordManager.fullScan(APP_ID, TABLE);
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> rows = (List<Map<String, Object>>) scanResult.getOrDefault("rows", Collections.emptyList());
                for (Map<String, Object> row : rows) {
                    Object idObj = row.get("id");
                    if (idObj != null) {
                        recordManager.deleteRecord(APP_ID, TABLE, Map.of("id", idObj.toString()));
                        deleted++;
                    }
                }
            } else if (ids != null) {
                for (String id : ids) {
                    if (id == null || id.isBlank()) {
                        continue;
                    }
                    recordManager.deleteRecord(APP_ID, TABLE, Map.of("id", id));
                    deleted++;
                }
            }
        } catch (Exception e) {
            logger.warn("Error deleting Googlebot visits: {}", e.getMessage());
        }

        Map<String, Object> stats = getStats(50, 0);
        stats.put("deleted", deleted);
        return stats;
    }

    private void ensureTable() {
        if (tableReady.get()) {
            return;
        }
        synchronized (tableReady) {
            if (tableReady.get()) {
                return;
            }
            try {
                SearchFilter filter = RecordManager.createCondition("id", "eq", TABLE);
                Map<String, Object> existing = recordManager.find(APP_ID, "index", filter);
                if (existing == null || existing.isEmpty()) {
                    Map<String, Object> struct = new HashMap<>();
                    struct.put("fieldsPK", List.of("id"));
                    struct.put("fieldsSearch", List.of("host", "path", "dateKey", "ip", "userAgent"));

                    Map<String, Object> record = new HashMap<>();
                    record.put("id", TABLE);
                    record.put("struct", struct);
                    recordManager.createRecord(APP_ID, "index", record);
                }
                tableReady.set(true);
            } catch (Exception e) {
                logger.warn("Cannot ensure googlebot table: {}", e.getMessage());
            }
        }
    }

    private Map<String, Object> normalizeRow(Map<String, Object> input) {
        Map<String, Object> row = new HashMap<>();
        if (input == null) {
            return row;
        }
        row.put("id", String.valueOf(input.getOrDefault("id", "")));
        row.put("host", String.valueOf(input.getOrDefault("host", "")));
        row.put("path", String.valueOf(input.getOrDefault("path", "")));
        row.put("ip", String.valueOf(input.getOrDefault("ip", "")));
        row.put("userAgent", String.valueOf(input.getOrDefault("userAgent", "")));
        row.put("dateKey", String.valueOf(input.getOrDefault("dateKey", "")));

        long ts = 0L;
        Object tsObj = input.get("ts");
        if (tsObj instanceof Number) {
            ts = ((Number) tsObj).longValue();
        } else {
            Object visitedAt = input.get("visitedAt");
            ts = parseInstant(visitedAt != null ? visitedAt.toString() : null);
        }
        row.put("ts", ts);
        String visitedAt = input.get("visitedAt") != null ? input.get("visitedAt").toString() : null;
        if (visitedAt == null && ts > 0) {
            visitedAt = Instant.ofEpochMilli(ts).toString();
        }
        row.put("visitedAt", visitedAt);
        return row;
    }

    private long parseInstant(String value) {
        try {
            if (value == null || value.isBlank()) {
                return 0L;
            }
            return Instant.parse(value).toEpochMilli();
        } catch (Exception e) {
            return 0L;
        }
    }

    private String buildId(long timestamp) {
        String timePart = String.format("%013d", timestamp);
        String randomPart = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        return timePart + "_" + randomPart;
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }
}
