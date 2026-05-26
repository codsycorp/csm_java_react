package net.phanmemmottrieu.service;

import net.phanmemmottrieu.model.User;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * ACL context for AI vector retrieval (tenant/org scoped RAG).
 */
public final class AiRetrievalAuthContext {

    public static final AiRetrievalAuthContext ANONYMOUS = new AiRetrievalAuthContext(
        false,
        "",
        "",
        false,
        false,
        List.of(),
        "NONE",
        Set.of(),
        Set.of(),
        false
    );

    private final boolean authenticated;
    private final String principalId;
    private final String appId;
    private final boolean dev;
    private final boolean csmAdmin;
    private final List<String> roles;
    private final String dataScope;
    private final Set<String> branchIds;
    private final Set<String> deptIds;
    private final boolean filterEnabled;

    public AiRetrievalAuthContext(
        boolean authenticated,
        String principalId,
        String appId,
        boolean dev,
        boolean csmAdmin,
        List<String> roles,
        String dataScope,
        Set<String> branchIds,
        Set<String> deptIds,
        boolean filterEnabled
    ) {
        this.authenticated = authenticated;
        this.principalId = String.valueOf(principalId == null ? "" : principalId).trim();
        this.appId = String.valueOf(appId == null ? "" : appId).trim();
        this.dev = dev;
        this.csmAdmin = csmAdmin;
        this.roles = roles == null ? List.of() : List.copyOf(roles);
        this.dataScope = normalizeScope(dataScope);
        this.branchIds = branchIds == null ? Set.of() : Set.copyOf(branchIds);
        this.deptIds = deptIds == null ? Set.of() : Set.copyOf(deptIds);
        this.filterEnabled = filterEnabled;
    }

    public static AiRetrievalAuthContext fromPrincipal(Object principal, boolean filterEnabled) {
        if (principal == null) {
            return ANONYMOUS;
        }
        if (principal instanceof User user) {
            return fromUser(user, filterEnabled);
        }
        if (principal instanceof Map<?, ?> map) {
            return fromPrincipalMap(map, filterEnabled);
        }
        return ANONYMOUS;
    }

    public static AiRetrievalAuthContext fromUser(User user, boolean filterEnabled) {
        if (user == null) {
            return ANONYMOUS;
        }
        List<String> roles = user.getPermissions() == null ? List.of() : user.getPermissions();
        boolean dev = user.getDev() != null && user.getDev();
        String appId = safe(user.getAppId());
        boolean adminRole = roles.stream().anyMatch(role -> "admin".equalsIgnoreCase(String.valueOf(role)));
        boolean csmAdmin = "csm".equalsIgnoreCase(appId) && (dev || adminRole);
        Set<String> branchIds = new LinkedHashSet<>();
        Set<String> deptIds = new LinkedHashSet<>();
        addCandidate(branchIds, user.getBranchId());
        addCandidate(deptIds, user.getDeptId());
        return new AiRetrievalAuthContext(
            true,
            safe(user.getId()),
            appId,
            dev,
            csmAdmin,
            roles,
            safe(user.getDataScope()),
            branchIds,
            deptIds,
            filterEnabled
        );
    }

    private static AiRetrievalAuthContext fromPrincipalMap(Map<?, ?> map, boolean filterEnabled) {
        List<String> roles = toStringList(map.get("roles"));
        if (roles.isEmpty()) {
            roles = toStringList(map.get("permissions"));
        }
        boolean dev = map.get("dev") instanceof Boolean b && b;
        String appId = safe(map.get("app_id"));
        boolean adminRole = roles.stream().anyMatch(role -> "admin".equalsIgnoreCase(role));
        boolean csmAdmin = "csm".equalsIgnoreCase(appId) && (dev || adminRole);
        Set<String> branchIds = new LinkedHashSet<>();
        Set<String> deptIds = new LinkedHashSet<>();
        addCandidate(branchIds, map.get("branch_id"));
        addCandidate(branchIds, map.get("branchId"));
        addCandidate(deptIds, map.get("dept_id"));
        addCandidate(deptIds, map.get("deptId"));
        return new AiRetrievalAuthContext(
            true,
            safe(map.get("id")),
            appId,
            dev,
            csmAdmin,
            roles,
            safe(map.get("dataScope")),
            branchIds,
            deptIds,
            filterEnabled
        );
    }

    public boolean isAuthenticated() {
        return authenticated;
    }

    public String getPrincipalId() {
        return principalId;
    }

    public String getAppId() {
        return appId;
    }

    public boolean isDev() {
        return dev;
    }

    public boolean isCsmAdmin() {
        return csmAdmin;
    }

    public boolean isCsmAdminOrDev() {
        return csmAdmin || dev;
    }

    public List<String> getRoles() {
        return roles;
    }

    public String getDataScope() {
        return dataScope;
    }

    public Set<String> getBranchIds() {
        return branchIds;
    }

    public Set<String> getDeptIds() {
        return deptIds;
    }

    public boolean isFilterEnabled() {
        return filterEnabled;
    }

    public boolean hasBranchRestriction() {
        return "BRANCH".equalsIgnoreCase(dataScope) || "DEPARTMENT".equalsIgnoreCase(dataScope);
    }

    public boolean hasDepartmentRestriction() {
        return "DEPARTMENT".equalsIgnoreCase(dataScope);
    }

    private static void addCandidate(Set<String> target, Object raw) {
        String value = safe(raw);
        if (!value.isBlank()) {
            target.add(value);
        }
    }

    private static List<String> toStringList(Object raw) {
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        return list.stream()
            .map(item -> safe(item))
            .filter(item -> !item.isBlank())
            .toList();
    }

    private static String safe(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    private static String normalizeScope(String raw) {
        String value = safe(raw).toUpperCase(Locale.ROOT);
        if (value.isBlank()) {
            return "NONE";
        }
        return value;
    }
}
