// Repartition monolithic Pebble csm.kv → pebble/{app_id}/{table_name}/ layout.
//
//	go run ./cmd/pebble-repartition \
//	  -legacy ../backend/csm_datas/native/pebble/csm.kv \
//	  -dest ../backend/csm_datas/native/pebble
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/cockroachdb/pebble"

	"csm_server/backend-go/internal/data"
)

var (
	legacyPath    = flag.String("legacy", defaultLegacy(), "Monolithic Pebble store (csm.kv)")
	destRoot      = flag.String("dest", defaultDest(), "Output Pebble root (app/table subdirs)")
	dryRun        = flag.Bool("dry-run", false, "Scan only")
	preferDest    = flag.Bool("prefer-dest", true, "Keep existing per-table keys; only copy legacy rows missing in dest")
	batchSize     = flag.Int("batch", 2000, "Batch commit size per table")
	progressEvery = flag.Int("progress-every", 10_000, "Log progress every N records (0=off)")
)

func main() {
	flag.Parse()
	log.SetFlags(log.LstdFlags)
	if err := run(); err != nil {
		log.Fatalf("repartition failed: %v", err)
	}
}

func defaultLegacy() string {
	for _, p := range []string{
		"../backend/csm_datas/native/pebble/csm.kv",
		"./backend/csm_datas/native/pebble/csm.kv",
	} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return "../backend/csm_datas/native/pebble/csm.kv"
}

func defaultDest() string {
	if v := os.Getenv("CSM_PEBBLE_ROOT"); v != "" {
		return v
	}
	return "../backend/csm_datas/native/pebble"
}

type tableKey struct {
	app, table string
}

type tableWriter struct {
	db      *pebble.DB
	batch   *pebble.Batch
	pending int
	count   int64
}

func (tw *tableWriter) close(sync bool) error {
	if tw == nil {
		return nil
	}
	if tw.batch != nil && tw.pending > 0 {
		opts := pebble.NoSync
		if sync {
			opts = pebble.Sync
		}
		if err := tw.batch.Commit(opts); err != nil {
			return err
		}
		tw.pending = 0
	}
	if tw.batch != nil {
		tw.batch.Close()
		tw.batch = nil
	}
	if tw.db != nil {
		err := tw.db.Close()
		tw.db = nil
		return err
	}
	return nil
}

func run() error {
	src := filepath.Clean(*legacyPath)
	dst := filepath.Clean(*destRoot)
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("legacy store not found %s: %w", src, err)
	}
	log.Printf("legacy: %s", src)
	log.Printf("dest:   %s/{app_id}/{table_name}/", dst)
	log.Printf("opening legacy store (WAL replay may take a minute on large DBs)...")
	if *dryRun {
		log.Printf("DRY RUN")
	}

	start := time.Now()
	legacy, err := pebble.Open(src, &pebble.Options{ReadOnly: true})
	if err != nil {
		return fmt.Errorf("open legacy: %w", err)
	}
	defer legacy.Close()
	log.Printf("legacy store open (%s) — scanning keys...", time.Since(start).Round(time.Millisecond))

	iter, err := legacy.NewIter(&pebble.IterOptions{LowerBound: []byte(data.PebbleKeyPrefix)})
	if err != nil {
		return err
	}
	defer iter.Close()

	var total, tables, skipped int64
	var current *tableWriter
	var currentKey tableKey
	lastProgress := time.Now()

	flushCurrent := func(final bool) error {
		if current == nil {
			return nil
		}
		if err := current.close(final); err != nil {
			return err
		}
		if current.count > 0 {
			log.Printf("  wrote %s/%s: %d records", currentKey.app, currentKey.table, current.count)
		}
		current = nil
		return nil
	}

	openTable := func(tk tableKey) error {
		if current != nil && currentKey == tk {
			return nil
		}
		if err := flushCurrent(true); err != nil {
			return err
		}
		if *dryRun {
			currentKey = tk
			current = &tableWriter{}
			tables++
			log.Printf("  [dry-run] table %s/%s", tk.app, tk.table)
			return nil
		}
		path := filepath.Join(dst, tk.app, tk.table)
		if err := os.MkdirAll(path, 0o755); err != nil {
			return err
		}
		db, err := pebble.Open(path, &pebble.Options{})
		if err != nil {
			return fmt.Errorf("open %s: %w", path, err)
		}
		currentKey = tk
		current = &tableWriter{db: db, batch: db.NewBatch()}
		tables++
		log.Printf("  copying → %s/%s", tk.app, tk.table)
		return nil
	}

	for iter.First(); iter.Valid(); iter.Next() {
		key := string(iter.Key())
		if key == "__migration_meta__" || strings.HasPrefix(key, "__meta_count") {
			continue
		}
		if !strings.HasPrefix(key, data.PebbleKeyPrefix) {
			continue
		}
		app, table, storageKey, err := data.ParsePebbleKey(key)
		if err != nil {
			log.Printf("skip key %q: %v", key, err)
			continue
		}
		tk := tableKey{app: app, table: table}
		if err := openTable(tk); err != nil {
			return err
		}
		if !*dryRun {
			if *preferDest {
				if _, closer, err := current.db.Get([]byte(storageKey)); err == nil {
					closer.Close()
					skipped++
					continue
				}
			}
			if err := current.batch.Set([]byte(storageKey), append([]byte(nil), iter.Value()...), nil); err != nil {
				return err
			}
			current.pending++
			if current.pending >= *batchSize {
				if err := current.batch.Commit(pebble.NoSync); err != nil {
					return err
				}
				current.batch.Reset()
				current.pending = 0
			}
		}
		current.count++
		total++

		if *progressEvery > 0 && total%int64(*progressEvery) == 0 {
			elapsed := time.Since(start).Round(time.Second)
			rate := float64(total) / time.Since(start).Seconds()
			log.Printf("progress: %d records, %d tables, %s (%.0f rec/s)", total, tables, elapsed, rate)
			lastProgress = time.Now()
		} else if time.Since(lastProgress) > 30*time.Second {
			log.Printf("still working… %d records, %d tables so far", total, tables)
			lastProgress = time.Now()
		}
	}

	if err := flushCurrent(true); err != nil {
		return err
	}

	log.Printf("done: %d tables, %d records copied, %d skipped (dest kept) in %s", tables, total, skipped, time.Since(start).Round(time.Second))
	if !*dryRun {
		meta := map[string]any{
			"repartitionedAt": time.Now().UTC().Format(time.RFC3339),
			"legacy":          src,
			"recordCount":     total,
			"tableCount":      tables,
			"layout":          "pebble/{app_id}/{table_name}",
			"duration":        time.Since(start).String(),
		}
		raw, _ := json.MarshalIndent(meta, "", "  ")
		if err := os.MkdirAll(dst, 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dst, "_repartition.json"), raw, 0o644); err != nil {
			return err
		}
		log.Printf("wrote %s", filepath.Join(dst, "_repartition.json"))
	}
	return nil
}
