package cacheepoch

import (
	"strings"
	"sync/atomic"
)

var ssrContentEpoch atomic.Uint64

var seoSensitiveTables = map[string]struct{}{
	"web_service_detail": {},
	"web_services":       {},
}

func CurrentSSRContentEpoch() uint64 {
	return ssrContentEpoch.Load()
}

func BumpSSRContentEpoch() uint64 {
	return ssrContentEpoch.Add(1)
}

func BumpSSRContentEpochForTable(table string) uint64 {
	tbl := strings.ToLower(strings.TrimSpace(table))
	if _, ok := seoSensitiveTables[tbl]; !ok {
		return ssrContentEpoch.Load()
	}
	return ssrContentEpoch.Add(1)
}
