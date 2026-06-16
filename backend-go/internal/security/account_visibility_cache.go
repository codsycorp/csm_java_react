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
	allRowsResult := rm.Filter(appID, "csm_accounts", model.SearchFilter{})
	rows := rowsAsMaps(allRowsResult["rows"])
	visible := buildManagedAccountVisibleIDSet(rows, access)
	accountVisibilityCache.Store(key, accountVisibilityEntry{
		visible:   visible,
		expiresAt: time.Now().Add(accountVisibilityCacheTTL),
	})
	return visible
}
