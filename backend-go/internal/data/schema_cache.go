package data

import (
	"sync"
	"time"

	"csm_server/backend-go/internal/model"
)

const schemaCacheTTL = 5 * time.Minute

type schemaCacheEntry struct {
	value     any
	expiresAt time.Time
}

var tableIndexCache sync.Map // key: appID+"\x00"+tableName

func (rm *RecordManager) findIndexTableCached(appID, tableName string) map[string]any {
	key := appID + "\x00" + tableName
	if v, ok := tableIndexCache.Load(key); ok {
		if e, ok := v.(schemaCacheEntry); ok && time.Now().Before(e.expiresAt) {
			if rec, ok := e.value.(map[string]any); ok {
				return rec
			}
		}
	}
	rec := rm.Find(appID, "index", model.EqFilter("id", tableName))
	if len(rec) > 0 {
		tableIndexCache.Store(key, schemaCacheEntry{value: rec, expiresAt: time.Now().Add(schemaCacheTTL)})
	}
	return rec
}

func (rm *RecordManager) InvalidateTableSchemaCache(appID, tableName string) {
	tableIndexCache.Delete(appID + "\x00" + tableName)
}
