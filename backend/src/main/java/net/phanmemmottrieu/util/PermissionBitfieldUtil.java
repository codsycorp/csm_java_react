package net.phanmemmottrieu.util;

import java.util.Collections;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class PermissionBitfieldUtil {
        private static final Map<String, Integer> KNOWN_MENU_BITS = createKnownMenuBits();

    public static final String SCHEMA_V3 = "v3";

    // V3 token layout (64-bit): [menu:16][action:8][scope:8][reserved:32]
    public static final long V3_RESERVED_SIGNATURE = 0x43534D33L; // "CSM3"
    private static final int V3_MENU_SHIFT = 48;
    private static final int V3_ACTION_SHIFT = 40;
    private static final int V3_SCOPE_SHIFT = 32;
    private static final long V3_MENU_MASK = 0xFFFFL;
    private static final long V3_ACTION_MASK = 0xFFL;
    private static final long V3_SCOPE_MASK = 0xFFL;

    private static final int V3_ACTION_VIEW = 0;
    private static final int V3_ACTION_CREATE = 1;
    private static final int V3_ACTION_EDIT = 2;
    private static final int V3_ACTION_DELETE = 3;
    private static final int V3_ACTION_EXPORT = 4;

    private static final int V3_SCOPE_OWNER = 0;
    private static final int V3_SCOPE_DEPARTMENT = 1;
    private static final int V3_SCOPE_BRANCH = 2;
    private static final int V3_SCOPE_ALL = 3;

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
        return buildSecurityTokenV3(permissions, menusPermissions, devFlag);
    }

    public static long buildSecurityTokenV3(List<String> permissions, List<String> menusPermissions, Boolean devFlag) {
        List<String> safePermissions = permissions == null ? Collections.emptyList() : permissions;
        List<String> safeMenus = menusPermissions == null ? Collections.emptyList() : menusPermissions;

        long menuMask = 0L;
        long actionMask = 0L;
        long scopeMask = 0L;

        if (Boolean.TRUE.equals(devFlag)) {
            actionMask = setMaskBit(actionMask, V3_ACTION_VIEW);
            actionMask = setMaskBit(actionMask, V3_ACTION_CREATE);
            actionMask = setMaskBit(actionMask, V3_ACTION_EDIT);
            actionMask = setMaskBit(actionMask, V3_ACTION_DELETE);
            actionMask = setMaskBit(actionMask, V3_ACTION_EXPORT);
            scopeMask = setMaskBit(scopeMask, V3_SCOPE_ALL);
        }

        for (String raw : safePermissions) {
            String token = normalize(raw);
            if (token.isEmpty()) {
                continue;
            }

            if ("dev".equals(token) || "admin".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_VIEW);
                actionMask = setMaskBit(actionMask, V3_ACTION_CREATE);
                actionMask = setMaskBit(actionMask, V3_ACTION_EDIT);
                actionMask = setMaskBit(actionMask, V3_ACTION_DELETE);
                actionMask = setMaskBit(actionMask, V3_ACTION_EXPORT);
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_ALL);
                continue;
            }

            if ("user".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_VIEW);
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_OWNER);
                continue;
            }

            if ("view".equals(token) || "read".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_VIEW);
                continue;
            }
            if ("create".equals(token) || "add".equals(token) || "insert".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_CREATE);
                continue;
            }
            if ("edit".equals(token) || "update".equals(token) || "write".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_EDIT);
                continue;
            }
            if ("delete".equals(token) || "remove".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_DELETE);
                continue;
            }
            if ("export".equals(token)) {
                actionMask = setMaskBit(actionMask, V3_ACTION_EXPORT);
                continue;
            }

            if ("scope:owner".equals(token) || "owner".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_OWNER);
                continue;
            }
            if ("scope:department".equals(token) || "department".equals(token) || "team".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_DEPARTMENT);
                continue;
            }
            if ("scope:branch".equals(token) || "branch".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_BRANCH);
                continue;
            }
            if ("scope:all".equals(token) || "all".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_ALL);
            }
        }

        for (String raw : safeMenus) {
            String token = normalize(raw);
            if (token.isEmpty()) {
                continue;
            }

            Integer menuIndex = parseMenuIndex(token);
            if (menuIndex != null && menuIndex >= 0 && menuIndex <= 15) {
                menuMask = setMaskBit(menuMask, menuIndex);
            }

            if ("scope:owner".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_OWNER);
            } else if ("scope:department".equals(token) || "scope:team".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_DEPARTMENT);
            } else if ("scope:branch".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_BRANCH);
            } else if ("scope:all".equals(token)) {
                scopeMask = setMaskBit(scopeMask, V3_SCOPE_ALL);
            }
        }

        return ((menuMask & V3_MENU_MASK) << V3_MENU_SHIFT)
            | ((actionMask & V3_ACTION_MASK) << V3_ACTION_SHIFT)
            | ((scopeMask & V3_SCOPE_MASK) << V3_SCOPE_SHIFT)
            | (V3_RESERVED_SIGNATURE & 0xFFFFFFFFL);
    }

    public static boolean isSecurityTokenV3(long token) {
        long reserved = token & 0xFFFFFFFFL;
        return reserved == (V3_RESERVED_SIGNATURE & 0xFFFFFFFFL);
    }

    public static String resolveDataScopeV3(long token) {
        long scopeMask = extractV3ScopeMask(token);
        if (hasMaskBit(scopeMask, V3_SCOPE_ALL)) {
            return "ALL";
        }
        if (hasMaskBit(scopeMask, V3_SCOPE_BRANCH)) {
            return "BRANCH";
        }
        if (hasMaskBit(scopeMask, V3_SCOPE_DEPARTMENT)) {
            return "DEPARTMENT";
        }
        if (hasMaskBit(scopeMask, V3_SCOPE_OWNER)) {
            return "OWNER";
        }
        return "NONE";
    }

    public static String toSecurityTokenHex(long token) {
        return String.format("0x%016X", token);
    }

    public static String toCompactToken(long token) {
        return Long.toUnsignedString(token, 36).toUpperCase(Locale.ROOT);
    }

    public static Long parseSecurityToken(String raw) {
        if (raw == null) {
            return null;
        }
        String text = raw.trim().replace("_", "");
        if (text.isEmpty()) {
            return null;
        }
        try {
            if (text.startsWith("b36:") || text.startsWith("B36:")) {
                return Long.parseUnsignedLong(text.substring(4), 36);
            }
            if (text.startsWith("b64:") || text.startsWith("B64:")) {
                String payload = text.substring(4);
                byte[] rawBytes;
                try {
                    rawBytes = Base64.getUrlDecoder().decode(payload);
                } catch (Exception ex) {
                    rawBytes = Base64.getDecoder().decode(payload);
                }
                if (rawBytes.length != Long.BYTES) {
                    return null;
                }
                long value = 0L;
                for (byte b : rawBytes) {
                    value = (value << 8) | (b & 0xFFL);
                }
                return value;
            }
            if (text.startsWith("0x") || text.startsWith("0X")) {
                return normalizeToSingleToken(Long.parseUnsignedLong(text.substring(2), 16));
            }
            if (text.matches("^[0-9]+$")) {
                try {
                    return normalizeToSingleToken(Long.parseLong(text));
                } catch (Exception ex) {
                    return normalizeToSingleToken(Long.parseUnsignedLong(text, 10));
                }
            }
            if (text.matches("^[0-9A-Za-z]+$")) {
                return normalizeToSingleToken(Long.parseUnsignedLong(text, 36));
            }
            return normalizeToSingleToken(Long.parseLong(text));
        } catch (Exception ex) {
            return null;
        }
    }

    public static String resolveDataScope(long bitfield) {
        return resolveDataScopeV3(normalizeToSingleToken(bitfield));
    }

    public static boolean hasBit(long bitfield, int bitIndex) {
        return hasBitV3(normalizeToSingleToken(bitfield), bitIndex);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static long normalizeToSingleToken(long token) {
        if (isSecurityTokenV3(token)) {
            return token;
        }

        long menuMask = 0L;
        for (int i = 0; i <= 15; i += 1) {
            if ((token & (1L << i)) != 0L) {
                menuMask = setMaskBit(menuMask, i);
            }
        }

        long actionMask = 0L;
        if ((token & (1L << ACTION_VIEW)) != 0L) actionMask = setMaskBit(actionMask, V3_ACTION_VIEW);
        if ((token & (1L << ACTION_CREATE)) != 0L) actionMask = setMaskBit(actionMask, V3_ACTION_CREATE);
        if ((token & (1L << ACTION_EDIT)) != 0L) actionMask = setMaskBit(actionMask, V3_ACTION_EDIT);
        if ((token & (1L << ACTION_DELETE)) != 0L) actionMask = setMaskBit(actionMask, V3_ACTION_DELETE);
        if ((token & (1L << ACTION_EXPORT)) != 0L) actionMask = setMaskBit(actionMask, V3_ACTION_EXPORT);

        long scopeMask = 0L;
        if ((token & (1L << DATA_SCOPE_OWNER)) != 0L) scopeMask = setMaskBit(scopeMask, V3_SCOPE_OWNER);
        if ((token & (1L << DATA_SCOPE_DEPARTMENT)) != 0L) scopeMask = setMaskBit(scopeMask, V3_SCOPE_DEPARTMENT);
        if ((token & (1L << DATA_SCOPE_BRANCH)) != 0L) scopeMask = setMaskBit(scopeMask, V3_SCOPE_BRANCH);
        if ((token & (1L << DATA_SCOPE_ALL)) != 0L) scopeMask = setMaskBit(scopeMask, V3_SCOPE_ALL);

        return ((menuMask & V3_MENU_MASK) << V3_MENU_SHIFT)
            | ((actionMask & V3_ACTION_MASK) << V3_ACTION_SHIFT)
            | ((scopeMask & V3_SCOPE_MASK) << V3_SCOPE_SHIFT)
            | (V3_RESERVED_SIGNATURE & 0xFFFFFFFFL);
    }

    private static boolean hasBitV3(long token, int bitIndex) {
        if (bitIndex < 0) {
            return false;
        }

        if (bitIndex >= MENU_BIT_MIN && bitIndex <= 15) {
            return hasMaskBit(extractV3MenuMask(token), bitIndex);
        }
        if (bitIndex >= 16 && bitIndex <= MENU_BIT_MAX) {
            return false;
        }

        if (bitIndex == ACTION_VIEW) {
            return hasMaskBit(extractV3ActionMask(token), V3_ACTION_VIEW);
        }
        if (bitIndex == ACTION_CREATE) {
            return hasMaskBit(extractV3ActionMask(token), V3_ACTION_CREATE);
        }
        if (bitIndex == ACTION_EDIT) {
            return hasMaskBit(extractV3ActionMask(token), V3_ACTION_EDIT);
        }
        if (bitIndex == ACTION_DELETE) {
            return hasMaskBit(extractV3ActionMask(token), V3_ACTION_DELETE);
        }
        if (bitIndex == ACTION_EXPORT) {
            return hasMaskBit(extractV3ActionMask(token), V3_ACTION_EXPORT);
        }

        if (bitIndex == DATA_SCOPE_OWNER) {
            return hasMaskBit(extractV3ScopeMask(token), V3_SCOPE_OWNER);
        }
        if (bitIndex == DATA_SCOPE_DEPARTMENT) {
            return hasMaskBit(extractV3ScopeMask(token), V3_SCOPE_DEPARTMENT);
        }
        if (bitIndex == DATA_SCOPE_BRANCH) {
            return hasMaskBit(extractV3ScopeMask(token), V3_SCOPE_BRANCH);
        }
        if (bitIndex == DATA_SCOPE_ALL) {
            return hasMaskBit(extractV3ScopeMask(token), V3_SCOPE_ALL);
        }

        return false;
    }

    private static long extractV3MenuMask(long token) {
        return (token >>> V3_MENU_SHIFT) & V3_MENU_MASK;
    }

    private static long extractV3ActionMask(long token) {
        return (token >>> V3_ACTION_SHIFT) & V3_ACTION_MASK;
    }

    private static long extractV3ScopeMask(long token) {
        return (token >>> V3_SCOPE_SHIFT) & V3_SCOPE_MASK;
    }

    private static long setMaskBit(long mask, int bitPosition) {
        if (bitPosition < 0 || bitPosition > 62) {
            return mask;
        }
        return mask | (1L << bitPosition);
    }

    private static boolean hasMaskBit(long mask, int bitPosition) {
        if (bitPosition < 0 || bitPosition > 62) {
            return false;
        }
        return (mask & (1L << bitPosition)) != 0L;
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
