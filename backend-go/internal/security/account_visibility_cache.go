package security

import (
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const accountVisibilityCacheTTL = 60 * time.Second

type accountVisibilityEntry struct {
	visible   map[string]bool
	expiresAt time.Time
}

var accountVisibilityCache sync.Map

func accountVisibilityCacheKey(appID string, access *UserAccessContext) string {
	if access == nil {
		return appID
	}
	return appID + "\x00" + strings.Join(access.OwnerCandidates, ",")
}

func resolveManagedAccountVisibleIDSetCached(appID string, access *UserAccessContext, rm *data.RecordManager) map[string]bool {
	if access == nil || access.IsDev || len(access.OwnerCandidates) == 0 {
		return nil
	}
	key := accountVisibilityCacheKey(appID, access)
	if v, ok := accountVisibilityCache.Load(key); ok {
		if e, ok := v.(accountVisibilityEntry); ok && time.Now().Before(e.expiresAt) {
			return e.visible
		}
	}
	rows := loadAccountRowsForVisibility(appID, access, rm)
	visible := buildManagedAccountVisibleIDSet(rows, access)
	accountVisibilityCache.Store(key, accountVisibilityEntry{
		visible:   visible,
		expiresAt: time.Now().Add(accountVisibilityCacheTTL),
	})
	return visible
}

// loadAccountRowsForVisibility loads only rows reachable from owner candidates via indexed lookups,
// avoiding a full-table Filter on csm_accounts (major API latency source under admin load).
func loadAccountRowsForVisibility(appID string, access *UserAccessContext, rm *data.RecordManager) []map[string]any {
	if access == nil || rm == nil || len(access.OwnerCandidates) == 0 {
		return nil
	}

	seen := make(map[string]struct{})
	var rows []map[string]any
	addRow := func(row map[string]any) {
		if len(row) == 0 {
			return
		}
		id := fieldValueAsIdentity(row["id"])
		if id == "" {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		rows = append(rows, row)
	}

	identityFields := []string{"id", "email", "username", "phoneNumber", "app_token"}
	for _, candidate := range access.OwnerCandidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		for _, field := range identityFields {
			if rec := rm.Find(appID, "csm_accounts", model.EqFilter(field, candidate)); len(rec) > 0 {
				addRow(rec)
			}
		}
	}

	reachableParents := make(map[string]bool, len(access.OwnerCandidates))
	for _, c := range access.OwnerCandidates {
		c = strings.TrimSpace(c)
		if c != "" {
			reachableParents[c] = true
		}
	}

	for round := 0; round < 32 && len(reachableParents) > 0; round++ {
		added := false
		for parent := range reachableParents {
			children := rm.Filter(appID, "csm_accounts", model.EqFilter("parent_account_id", parent))
			for _, row := range rowsAsMaps(children["rows"]) {
				childID := fieldValueAsIdentity(row["id"])
				if childID == "" {
					continue
				}
				if _, ok := seen[childID]; ok {
					continue
				}
				addRow(row)
				added = true
				for _, key := range []string{"id", "username", "email", "phoneNumber"} {
					collectCandidate(reachableParents, row[key])
				}
			}
		}
		if !added {
			break
		}
	}

	return rows
}
