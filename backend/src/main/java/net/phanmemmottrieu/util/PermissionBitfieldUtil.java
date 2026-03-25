package net.phanmemmottrieu.util;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class PermissionBitfieldUtil {
        private static final Map<String, Integer> KNOWN_MENU_BITS = createKnownMenuBits();

    private PermissionBitfieldUtil() {
    }

    // Menu bits: 0..30
    public static final int MENU_BIT_MIN = 0;
    public static final int MENU_BIT_MAX = 30;

    // Action bits: 31..40
    public static final int ACTION_VIEW = 31;
    public static final int ACTION_EDIT = 32;
    public static final int ACTION_CREATE = 33;
    public static final int ACTION_DELETE = 34;
    public static final int ACTION_EXPORT = 35;

    // Data scope bits: 41..48
    public static final int DATA_SCOPE_OWNER = 41;
    public static final int DATA_SCOPE_DEPARTMENT = 42;
    public static final int DATA_SCOPE_BRANCH = 43;
    public static final int DATA_SCOPE_ALL = 44;

    public static long buildBitfield(List<String> permissions, List<String> menusPermissions, Boolean devFlag) {
        List<String> safePermissions = permissions == null ? Collections.emptyList() : permissions;
        List<String> safeMenus = menusPermissions == null ? Collections.emptyList() : menusPermissions;

        long bits = 0L;

        if (Boolean.TRUE.equals(devFlag)) {
            bits |= bit(ACTION_VIEW) | bit(ACTION_CREATE) | bit(ACTION_EDIT) | bit(ACTION_DELETE) | bit(ACTION_EXPORT) | bit(DATA_SCOPE_ALL);
        }

        for (String raw : safePermissions) {
            String token = normalize(raw);
            if (token.isEmpty()) {
                continue;
            }

            if ("dev".equals(token) || "admin".equals(token)) {
                bits |= bit(ACTION_VIEW) | bit(ACTION_CREATE) | bit(ACTION_EDIT) | bit(ACTION_DELETE) | bit(ACTION_EXPORT) | bit(DATA_SCOPE_ALL);
                continue;
            }

            if ("user".equals(token)) {
                bits |= bit(ACTION_VIEW) | bit(DATA_SCOPE_OWNER);
                continue;
            }

            if ("view".equals(token) || "read".equals(token)) {
                bits |= bit(ACTION_VIEW);
                continue;
            }
            if ("create".equals(token) || "add".equals(token) || "insert".equals(token)) {
                bits |= bit(ACTION_CREATE);
                continue;
            }
            if ("edit".equals(token) || "update".equals(token) || "write".equals(token)) {
                bits |= bit(ACTION_EDIT);
                continue;
            }
            if ("delete".equals(token) || "remove".equals(token)) {
                bits |= bit(ACTION_DELETE);
                continue;
            }
            if ("export".equals(token)) {
                bits |= bit(ACTION_EXPORT);
                continue;
            }

            if ("scope:owner".equals(token) || "owner".equals(token)) {
                bits |= bit(DATA_SCOPE_OWNER);
                continue;
            }
            if ("scope:department".equals(token) || "department".equals(token) || "team".equals(token)) {
                bits |= bit(DATA_SCOPE_DEPARTMENT);
                continue;
            }
            if ("scope:branch".equals(token) || "branch".equals(token)) {
                bits |= bit(DATA_SCOPE_BRANCH);
                continue;
            }
            if ("scope:all".equals(token) || "all".equals(token)) {
                bits |= bit(DATA_SCOPE_ALL);
                continue;
            }

            Long parsed = tryParseLong(raw);
            if (parsed != null) {
                bits |= parsed;
            }
        }

        for (String raw : safeMenus) {
            String token = normalize(raw);
            if (token.isEmpty()) {
                continue;
            }

            Integer menuIndex = parseMenuIndex(token);
            if (menuIndex != null) {
                bits |= bit(menuIndex);
            }

            if ("scope:owner".equals(token)) {
                bits |= bit(DATA_SCOPE_OWNER);
            } else if ("scope:department".equals(token) || "scope:team".equals(token)) {
                bits |= bit(DATA_SCOPE_DEPARTMENT);
            } else if ("scope:branch".equals(token)) {
                bits |= bit(DATA_SCOPE_BRANCH);
            } else if ("scope:all".equals(token)) {
                bits |= bit(DATA_SCOPE_ALL);
            }
        }

        return bits;
    }

    public static String resolveDataScope(long bitfield) {
        if (hasBit(bitfield, DATA_SCOPE_ALL)) {
            return "ALL";
        }
        if (hasBit(bitfield, DATA_SCOPE_BRANCH)) {
            return "BRANCH";
        }
        if (hasBit(bitfield, DATA_SCOPE_DEPARTMENT)) {
            return "DEPARTMENT";
        }
        if (hasBit(bitfield, DATA_SCOPE_OWNER)) {
            return "OWNER";
        }
        return "NONE";
    }

    public static boolean hasBit(long bitfield, int bitIndex) {
        if (bitIndex < 0 || bitIndex > 62) {
            return false;
        }
        long mask = 1L << bitIndex;
        return (bitfield & mask) != 0L;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static long bit(int idx) {
        if (idx < 0 || idx > 62) {
            return 0L;
        }
        return 1L << idx;
    }

    private static Integer parseMenuIndex(String token) {
        Integer direct = tryParseInt(token);
        if (direct != null && direct >= MENU_BIT_MIN && direct <= MENU_BIT_MAX) {
            return direct;
        }
        Integer known = KNOWN_MENU_BITS.get(token);
        if (known != null) {
            return known;
        }
        if (token.startsWith("menu:")) {
            Integer fromPrefix = tryParseInt(token.substring("menu:".length()));
            if (fromPrefix != null && fromPrefix >= MENU_BIT_MIN && fromPrefix <= MENU_BIT_MAX) {
                return fromPrefix;
            }
        }
        return null;
    }

    private static Integer tryParseInt(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private static Long tryParseLong(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private static Map<String, Integer> createKnownMenuBits() {
        Map<String, Integer> map = new HashMap<>();
        map.put("dashboard", 0);
        map.put("/dashboard", 0);
        map.put("home", 0);
        map.put("/home", 0);

        map.put("user", 1);
        map.put("/system/user", 1);
        map.put("role", 2);
        map.put("/system/role", 2);
        map.put("menu", 3);
        map.put("/system/menu", 3);
        map.put("dept", 4);
        map.put("/system/dept", 4);
        map.put("developer", 5);
        map.put("/system/developer", 5);
        map.put("broadcast", 6);
        map.put("/system/broadcast", 6);
        map.put("report", 7);
        map.put("/system/report", 7);

        map.put("crm", 8);
        map.put("/crm", 8);
        return map;
    }
}
