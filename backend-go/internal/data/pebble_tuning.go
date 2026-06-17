package data

import (
	"runtime"
	"sync"

	"github.com/cockroachdb/pebble"

	"csm_server/backend-go/internal/config"
)

var (
	pebbleTuningOnce  sync.Once
	pebbleTableCache  *pebble.Cache
	pebbleTableOpts   pebbleTableSettings
	pebbleIndexOpts   pebbleTableSettings
)

type pebbleTableSettings struct {
	memTableBytes int64
}

// InitPebbleTuning configures shared block cache and memtable sizes from env (call once at startup).
func InitPebbleTuning(cfg config.AppConfig) {
	pebbleTuningOnce.Do(func() {
		cacheMB := cfg.PebbleCacheMB
		if cacheMB <= 0 {
			cacheMB = 32
		}
		memMB := cfg.PebbleMemTableMB
		if memMB <= 0 {
			memMB = 8
		}
		idxMemMB := cfg.PebbleIndexMemTableMB
		if idxMemMB <= 0 {
			idxMemMB = 4
		}
		pebbleTableCache = pebble.NewCache(int64(cacheMB) << 20)
		pebbleTableOpts = pebbleTableSettings{memTableBytes: int64(memMB) << 20}
		pebbleIndexOpts = pebbleTableSettings{memTableBytes: int64(idxMemMB) << 20}
	})
}

func newTablePebbleOptions() *pebble.Options {
	return newPebbleOptions(pebbleTableOpts)
}

func newIndexPebbleOptions() *pebble.Options {
	return newPebbleOptions(pebbleIndexOpts)
}

func newPebbleOptions(settings pebbleTableSettings) *pebble.Options {
	memTable := settings.memTableBytes
	if memTable <= 0 {
		memTable = 8 << 20
	}
	opts := &pebble.Options{
		MemTableSize:                uint64(memTable),
		MemTableStopWritesThreshold: 2,
		L0CompactionThreshold:       4,
		L0StopWritesThreshold:       12,
		MaxConcurrentCompactions:    func() int { n := runtime.NumCPU(); if n > 4 { return 4 }; return n },
	}
	if pebbleTableCache != nil {
		opts.Cache = pebbleTableCache
	}
	return opts
}

func closePebbleTuning() {
	if pebbleTableCache != nil {
		pebbleTableCache.Unref()
		pebbleTableCache = nil
	}
}
