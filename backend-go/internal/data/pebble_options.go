package data

import (
	"runtime"

	"github.com/cockroachdb/pebble"
)

// newTablePebbleOptions mirrors Java/Rust RocksDB tuning (32MB memtable, block cache, parallelism).
func newTablePebbleOptions() *pebble.Options {
	opts := &pebble.Options{
		MemTableSize:                32 << 20,
		MemTableStopWritesThreshold: 2,
		L0CompactionThreshold:       4,
		L0StopWritesThreshold:       12,
		MaxConcurrentCompactions:    func() int { return runtime.NumCPU() },
	}
	// Per-table DB — keep cache modest so many open tables do not exhaust RAM.
	opts.Cache = pebble.NewCache(16 << 20)
	return opts
}
