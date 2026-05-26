package net.phanmemmottrieu.service;

import net.phanmemmottrieu.data.RecordManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Indexes tenant org/permission snapshots into business memory for domain-aware RAG.
 */
@Service
public class AiTenantKnowledgeIngestionService {

    private static final Logger log = LoggerFactory.getLogger(AiTenantKnowledgeIngestionService.class);

    private static final String SOURCE_ORG_SNAPSHOT = "tenant_knowledge_org_snapshot";
    private static final String SOURCE_DOMAIN_RULES = "tenant_knowledge_domain_rules";
    private static final List<String> DEFAULT_TABLES = List.of("csm_roles", "csm_depts", "csm_branches");

    @Autowired
    private RecordManager recordManager;

    @Autowired
    private AiBusinessMemoryVectorService businessMemoryVectorService;

    @Value("${ai.context.ingestion.tenant-snapshot.enabled:true}")
    private boolean enabled;

    @Value("${ai.context.ingestion.tenant-snapshot.tables:csm_roles,csm_depts,csm_branches}")
    private String tablesConfig;

    @Value("${ai.context.ingestion.tenant-snapshot.merge-csm-roles:true}")
    private boolean mergeCsmRoles;

    @Value("${ai.context.ingestion.tenant-snapshot.max-rows-per-table:120}")
    private int maxRowsPerTable;

    private final ConcurrentHashMap<String, Long> lastIngestMsByApp = new ConcurrentHashMap<>();
    private static final long MIN_REINGEST_INTERVAL_MS = 60_000L;

    public boolean isEnabled() {
        return enabled && businessMemoryVectorService.isEnabled();
    }

    public IngestSummary ingestTenantKnowledge(String appId) {
        String safeAppId = sanitizeAppId(appId);
        if (!isEnabled() || safeAppId.isBlank()) {
            return IngestSummary.skipped(safeAppId, "disabled");
        }

        long now = System.currentTimeMillis();
        Long last = lastIngestMsByApp.get(safeAppId);
        if (last != null && now - last < MIN_REINGEST_INTERVAL_MS) {
            return IngestSummary.skipped(safeAppId, "recently_indexed");
        }

        int scopeMask = AiMultimodalScannerService.SCOPE_BUSINESS | AiMultimodalScannerService.SCOPE_JSON_SCHEMA;
        List<String> baseTags = List.of(
            "acl:tenant",
            "knowledge:tenant",
            "knowledge:org"
        );

        String orgMarkdown = buildOrgSnapshotMarkdown(safeAppId);
        AiBusinessMemoryVectorService.IndexSummary orgSummary = businessMemoryVectorService.indexMarkdown(
            safeAppId,
            SOURCE_ORG_SNAPSHOT,
            orgMarkdown,
            baseTags,
            scopeMask
        );

        List<String> ruleTags = List.of(
            "acl:tenant",
            "knowledge:domain_rules",
            "knowledge:permissions"
        );
        AiBusinessMemoryVectorService.IndexSummary ruleSummary = businessMemoryVectorService.indexMarkdown(
            safeAppId,
            SOURCE_DOMAIN_RULES,
            buildDomainRulesMarkdown(),
            ruleTags,
            scopeMask
        );

        lastIngestMsByApp.put(safeAppId, now);
        log.info(
            "Tenant knowledge indexed appId={} orgChunks={} ruleChunks={}",
            safeAppId,
            orgSummary.chunksIndexed(),
            ruleSummary.chunksIndexed()
        );
        return new IngestSummary(
            safeAppId,
            "indexed",
            orgSummary.chunksIndexed() + ruleSummary.chunksIndexed(),
            orgSummary.charsIndexed() + ruleSummary.charsIndexed()
        );
    }

    private String buildOrgSnapshotMarkdown(String appId) {
        StringBuilder sb = new StringBuilder(4096);
        sb.append("# Tenant org knowledge snapshot\n");
        sb.append("app_id: ").append(appId).append('\n');
        sb.append("generated_for: ai_local_rag\n\n");

        for (String tableName : resolveTables()) {
            List<Map<String, Object>> rows = loadTableRows(appId, tableName);
            if ("csm_roles".equals(tableName) && mergeCsmRoles && !"csm".equalsIgnoreCase(appId)) {
                rows = mergeRoleRows(rows, loadTableRows("csm", tableName));
            }
            appendTableSection(sb, tableName, rows);
        }
        return sb.toString().trim();
    }

    private void appendTableSection(StringBuilder sb, String tableName, List<Map<String, Object>> rows) {
        sb.append("## ").append(tableName).append(" (").append(rows.size()).append(" rows)\n");
        if (rows.isEmpty()) {
            sb.append("- (empty)\n\n");
            return;
        }
        int limit = Math.max(1, maxRowsPerTable);
        int count = 0;
        for (Map<String, Object> row : rows) {
            if (count >= limit) {
                sb.append("- ... truncated after ").append(limit).append(" rows\n");
                break;
            }
            sb.append("- ").append(formatRowSummary(tableName, row)).append('\n');
            count++;
        }
        sb.append('\n');
    }

    private String formatRowSummary(String tableName, Map<String, Object> row) {
        if (row == null || row.isEmpty()) {
            return "(blank row)";
        }
        return switch (tableName) {
            case "csm_roles" -> String.format(
                Locale.ROOT,
                "id=%s | role_code=%s | role_name=%s | role_level=%s | dataScope=%s | branch_id=%s | dept_id=%s | status=%s",
                safe(row.get("id")),
                safe(row.get("role_code")),
                safe(row.get("role_name")),
                safe(row.get("role_level")),
                safe(row.get("dataScope")),
                safe(row.get("branch_id")),
                safe(row.get("dept_id")),
                safe(row.get("status"))
            );
            case "csm_depts" -> String.format(
                Locale.ROOT,
                "id=%s | dept_code=%s | dept_name=%s | branch_id=%s | parent_dept_id=%s | status=%s",
                safe(row.get("id")),
                safe(row.get("dept_code")),
                safe(row.get("dept_name")),
                safe(row.get("branch_id")),
                safe(row.get("parent_dept_id")),
                safe(row.get("status"))
            );
            case "csm_branches" -> String.format(
                Locale.ROOT,
                "id=%s | branch_code=%s | branch_name=%s | parent_branch_id=%s | status=%s",
                safe(row.get("id")),
                safe(row.get("branch_code")),
                safe(row.get("branch_name")),
                safe(row.get("parent_branch_id")),
                safe(row.get("status"))
            );
            default -> row.toString();
        };
    }

    private List<Map<String, Object>> mergeRoleRows(List<Map<String, Object>> primary, List<Map<String, Object>> fallback) {
        LinkedHashMap<String, Map<String, Object>> merged = new LinkedHashMap<>();
        Set<String> seenCodes = new LinkedHashSet<>();
        registerRoleRows(merged, seenCodes, primary);
        registerRoleRows(merged, seenCodes, fallback);
        return new ArrayList<>(merged.values());
    }

    private void registerRoleRows(
        LinkedHashMap<String, Map<String, Object>> merged,
        Set<String> seenCodes,
        List<Map<String, Object>> rows
    ) {
        if (rows == null) {
            return;
        }
        for (Map<String, Object> row : rows) {
            if (row == null) {
                continue;
            }
            String id = safe(row.get("id"));
            String roleCode = safe(row.get("role_code")).toUpperCase(Locale.ROOT);
            if (id.isBlank()) {
                continue;
            }
            if (merged.containsKey(id)) {
                continue;
            }
            if (!roleCode.isBlank() && seenCodes.contains(roleCode)) {
                continue;
            }
            merged.put(id, row);
            if (!roleCode.isBlank()) {
                seenCodes.add(roleCode);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> loadTableRows(String appId, String tableName) {
        try {
            Map<String, Object> result = recordManager.filter(appId, tableName, null);
            Object rowsObj = result == null ? null : result.get("rows");
            if (rowsObj instanceof List<?> list) {
                List<Map<String, Object>> rows = new ArrayList<>();
                for (Object item : list) {
                    if (item instanceof Map<?, ?> map) {
                        rows.add((Map<String, Object>) map);
                    }
                }
                return rows;
            }
        } catch (Exception ex) {
            log.warn("Failed loading tenant table appId={} table={}: {}", appId, tableName, ex.getMessage());
        }
        return List.of();
    }

    private List<String> resolveTables() {
        if (tablesConfig == null || tablesConfig.isBlank()) {
            return DEFAULT_TABLES;
        }
        List<String> out = new ArrayList<>();
        for (String part : tablesConfig.split(",")) {
            String name = safe(part).toLowerCase(Locale.ROOT);
            if (!name.isBlank()) {
                out.add(name);
            }
        }
        return out.isEmpty() ? DEFAULT_TABLES : out;
    }

    private String buildDomainRulesMarkdown() {
        return """
            # CSM domain rules for system admin and permissions

            ## Org hierarchy
            - Branch (csm_branches) is the parent container.
            - Department (csm_depts) must declare branch_id.
            - Permission group (csm_roles) may declare branch_id and dept_id for scoped access.

            ## Combo cascade
            - dept_id combo must filter by selected branch_id (cascadeFrom=branch_id, cascadeField=branch_id).
            - When branch changes, clear stale dept_id before saving.

            ## Permission group (csm_roles)
            - role_code is required on create; may be derived from role_name when empty.
            - role_code is readonly on edit (primary key with id).
            - role_level maps to dataScope: admin/director=ALL, manager=BRANCH, dept_head/team_lead=DEPARTMENT, staff=OWNER.
            - group_id on sub-user must expose one option per role id; dedupe by role_code across tenant/csm merge.

            ## Hidden UI fields (dept/branch grids)
            - Hide audit fields: created_by, updated_by, create_time, update_time.
            - Hide permission internals on dept/branch tables; keep them on csm_roles editor only.

            ## Sub-user (csm_group_members)
            - group_id references csm_roles.id (label from role_name).
            - Resolve permissions from selected role; respect parent account data scope.
            """.trim();
    }

    private static String sanitizeAppId(String appId) {
        return String.valueOf(appId == null ? "" : appId).trim();
    }

    private static String safe(Object raw) {
        return String.valueOf(raw == null ? "" : raw).trim();
    }

    public record IngestSummary(
        String appId,
        String status,
        int chunksIndexed,
        int charsIndexed
    ) {
        public static IngestSummary skipped(String appId, String reason) {
            return new IngestSummary(appId, "skipped:" + reason, 0, 0);
        }
    }
}
