package net.phanmemmottrieu.util;

public final class AppTokenHelper {
    private AppTokenHelper() {
    }

    public static String buildRawToken(String appId, String principal, String role, int accessRight) {
        String safeAppId = safePart(appId, "ohno");
        String safePrincipal = safePart(principal, "anonymous");
        String safeRole = safePart(role, "user");
        return String.join("_____", safeAppId, safePrincipal, safeRole, String.valueOf(accessRight));
    }

    public static int resolveAccessRight(String role) {
        return "dev".equalsIgnoreCase(safePart(role, "user")) ? 1 : 0;
    }

    private static String safePart(String value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? fallback : normalized;
    }
}