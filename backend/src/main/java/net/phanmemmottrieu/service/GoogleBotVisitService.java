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
import java.util.PriorityQueue;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.HashSet;

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
    private static final int PAGE_SIZE = 500;

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

        final int topWindowSize = Math.max(1, cappedOffset + cappedLimit);
        PriorityQueue<Map<String, Object>> topWindow = new PriorityQueue<>(
            Comparator.comparingLong((Map<String, Object> m) -> (Long) m.getOrDefault("ts", 0L))
        );

        Map<String, Map<String, Object>> daily = new LinkedHashMap<>();
        int totalVisits = 0;

        String cursor = null;
        Set<String> seenCursors = new HashSet<>();
        while (true) {
            Map<String, Object> page = recordManager.filterWithPagination(APP_ID, TABLE, null, PAGE_SIZE, cursor);
            List<Map<String, Object>> rows = safeRows(page);
            if (rows.isEmpty()) {
                break;
            }

            for (Map<String, Object> rawRow : rows) {
                Map<String, Object> row = normalizeRow(rawRow);
                if (row.get("id") == null || String.valueOf(row.get("id")).isBlank()) {
                    continue;
                }

                totalVisits++;
                long ts = (Long) row.getOrDefault("ts", 0L);

                String dateKey = (String) row.getOrDefault("dateKey", "");
                if (!dateKey.isEmpty()) {
                    Map<String, Object> summary = daily.computeIfAbsent(dateKey, key -> {
                        Map<String, Object> item = new HashMap<>();
                        item.put("date", key);
                        item.put("count", 0L);
                        item.put("lastVisitAt", row.get("visitedAt"));
                        item.put("lastTs", ts);
                        return item;
                    });
                    long count = ((Number) summary.getOrDefault("count", 0L)).longValue();
                    summary.put("count", count + 1);

                    long currentLastTs = ((Number) summary.getOrDefault("lastTs", 0L)).longValue();
                    if (ts > currentLastTs) {
                        summary.put("lastTs", ts);
                        summary.put("lastVisitAt", row.get("visitedAt"));
                    }
                }

                if (topWindow.size() < topWindowSize) {
                    topWindow.offer(row);
                } else {
                    long minTs = (Long) topWindow.peek().getOrDefault("ts", 0L);
                    if (ts > minTs) {
                        topWindow.poll();
                        topWindow.offer(row);
                    }
                }
            }

            cursor = nextCursor(page, seenCursors);
            if (cursor == null) {
                break;
            }
        }

        List<Map<String, Object>> latestPool = new ArrayList<>(topWindow);
        latestPool.sort(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.getOrDefault("ts", 0L)).reversed());

        List<Map<String, Object>> latest = new ArrayList<>();
        for (int i = cappedOffset; i < latestPool.size() && latest.size() < cappedLimit; i++) {
            latest.add(latestPool.get(i));
        }

        List<Map<String, Object>> byDate = new ArrayList<>();
        for (Map<String, Object> summary : daily.values()) {
            summary.remove("lastTs");
            byDate.add(summary);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("totalVisits", totalVisits);
        result.put("latest", latest);
        result.put("byDate", byDate);
        return result;
    }

    public Map<String, Object> deleteVisits(List<String> ids, boolean deleteAll) {
        ensureTable();
        int deleted = 0;
        try {
            if (deleteAll) {
                while (true) {
                    Map<String, Object> page = recordManager.filterWithPagination(APP_ID, TABLE, null, PAGE_SIZE, null);
                    List<Map<String, Object>> rows = safeRows(page);
                    if (rows.isEmpty()) {
                        break;
                    }

                    int deletedInBatch = 0;
                    for (Map<String, Object> row : rows) {
                        Object idObj = row.get("id");
                        if (idObj == null) {
                            continue;
                        }
                        recordManager.deleteRecord(APP_ID, TABLE, Map.of("id", idObj.toString()));
                        deleted++;
                        deletedInBatch++;
                    }

                    if (deletedInBatch == 0) {
                        logger.warn("Stop deleteAll because batch contains no deletable ids");
                        break;
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

    private List<Map<String, Object>> safeRows(Map<String, Object> pageResult) {
        if (pageResult == null) {
            return Collections.emptyList();
        }
        Object rowsObj = pageResult.get("rows");
        if (!(rowsObj instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> casted = new HashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() != null) {
                        casted.put(entry.getKey().toString(), entry.getValue());
                    }
                }
                rows.add(casted);
            }
        }
        return rows;
    }

    private String nextCursor(Map<String, Object> pageResult, Set<String> seenCursors) {
        if (pageResult == null) {
            return null;
        }
        Object nextCursorObj = pageResult.get("nextCursor");
        if (nextCursorObj == null) {
            return null;
        }
        String cursor = String.valueOf(nextCursorObj);
        if (cursor.isBlank()) {
            return null;
        }
        if (!seenCursors.add(cursor)) {
            logger.warn("Detected repeated nextCursor while scanning googlebot visits. Stop pagination to avoid loop.");
            return null;
        }
        return cursor;
    }
}
