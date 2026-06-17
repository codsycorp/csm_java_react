// Compare RocksDB (Java/Rust database/) vs Pebble (Go native/pebble/).
//
//	go run ./cmd/data-compare \
//	  -rocksdb ../backend/csm_datas/database \
//	  -pebble ../backend/csm_datas/native/pebble
package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/cockroachdb/pebble"
)

const ldbScanSep = " ==> "

var (
	rocksdbRoot = flag.String("rocksdb", defaultRocksDB(), "RocksDB root (app/table/...)")
	pebbleRoot  = flag.String("pebble", defaultPebble(), "Pebble per-table root")
	legacyPath  = flag.String("legacy", "", "Optional monolithic Pebble legacy (csm.kv dir)")
	ldbBin      = flag.String("ldb", "", "rocksdb_ldb binary")
	onlyApp     = flag.String("app", "", "Limit to one app_id (e.g. csm)")
	limit       = flag.Int("limit", 0, "Max tables to scan (0 = all)")
)

type tableRef struct {
	app, table string
}

type tableStats struct {
	ref          tableRef
	rocksdbKeys  int
	pebbleKeys   int
	legacyKeys   int
	pebbleTotal  int
	pebbleMeta   int64
	hasRocksDB   bool
	hasPebbleDir bool
	hasLegacy    bool
}

func main() {
	flag.Parse()
	log.SetFlags(0)

	ldb, err := resolveLDB(*ldbBin)
	if err != nil {
		log.Fatal(err)
	}

	refs := discoverTables(*rocksdbRoot, *pebbleRoot, *legacyPath, *onlyApp)
	if *limit > 0 && len(refs) > *limit {
		refs = refs[:*limit]
	}

	fmt.Printf("RocksDB : %s\n", *rocksdbRoot)
	fmt.Printf("Pebble  : %s\n", *pebbleRoot)
	if *legacyPath != "" {
		fmt.Printf("Legacy  : %s\n", *legacyPath)
	}
	fmt.Printf("Tables  : %d\n\n", len(refs))

	start := time.Now()
	stats := make([]tableStats, 0, len(refs))
	for i, ref := range refs {
		st := compareTable(ldb, ref)
		stats = append(stats, st)
		if (i+1)%10 == 0 {
			log.Printf("progress %d/%d…", i+1, len(refs))
		}
	}

	printReport(stats, time.Since(start))
}

func defaultRocksDB() string {
	for _, p := range []string{
		"../backend/csm_datas/database",
		"./backend/csm_datas/database",
	} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
	}
	return "../backend/csm_datas/database"
}

func defaultPebble() string {
	for _, p := range []string{
		"../backend/csm_datas/native/pebble",
		"./backend/csm_datas/native/pebble",
	} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
	}
	return "../backend/csm_datas/native/pebble"
}

func discoverTables(rocks, pebble, legacy, onlyApp string) []tableRef {
	seen := map[tableRef]struct{}{}
	add := func(app, table string) {
		app = strings.ToLower(strings.TrimSpace(app))
		table = strings.ToLower(strings.TrimSpace(table))
		if app == "" || table == "" || strings.HasPrefix(table, ".") {
			return
		}
		if onlyApp != "" && app != strings.ToLower(onlyApp) {
			return
		}
		seen[tableRef{app, table}] = struct{}{}
	}

	if st, err := os.Stat(rocks); err == nil && st.IsDir() {
		apps, _ := os.ReadDir(rocks)
		for _, appEntry := range apps {
			if !appEntry.IsDir() {
				continue
			}
			tables, _ := os.ReadDir(filepath.Join(rocks, appEntry.Name()))
			for _, t := range tables {
				if t.IsDir() {
					add(appEntry.Name(), t.Name())
				}
			}
		}
	}

	if st, err := os.Stat(pebble); err == nil && st.IsDir() {
		apps, _ := os.ReadDir(pebble)
		for _, appEntry := range apps {
			name := appEntry.Name()
			if !appEntry.IsDir() || strings.HasPrefix(name, "_") || strings.HasSuffix(name, ".json") {
				continue
			}
			tables, _ := os.ReadDir(filepath.Join(pebble, name))
			for _, t := range tables {
				if t.IsDir() && !strings.HasPrefix(t.Name(), "__") {
					add(name, t.Name())
				}
			}
		}
	}

	if legacy != "" {
		if st, err := os.Stat(legacy); err == nil && st.IsDir() {
			// Monolithic layout: legacy/{app}/ with table keys inside one DB — count as app-level only.
			// Per-table legacy keys use prefix app_table_ inside monolithic store; handled in legacyCountForTable.
			_ = st
		}
	}

	out := make([]tableRef, 0, len(seen))
	for ref := range seen {
		out = append(out, ref)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].app != out[j].app {
			return out[i].app < out[j].app
		}
		return out[i].table < out[j].table
	})
	return out
}

func compareTable(ldb string, ref tableRef) tableStats {
	st := tableStats{ref: ref}
	rocksPath := filepath.Join(*rocksdbRoot, ref.app, ref.table)
	if st2, err := os.Stat(rocksPath); err == nil && st2.IsDir() {
		st.hasRocksDB = true
		if n, err := countRocksDB(ldb, rocksPath); err == nil {
			st.rocksdbKeys = n
		}
	}

	pebblePath := filepath.Join(*pebbleRoot, ref.app, ref.table)
	if st2, err := os.Stat(pebblePath); err == nil && st2.IsDir() {
		st.hasPebbleDir = true
		if n, meta, err := countPebbleDir(pebblePath); err == nil {
			st.pebbleKeys = n
			st.pebbleMeta = meta
		}
	}

	if *legacyPath != "" {
		if n, err := countLegacyTableKeys(*legacyPath, ref.app, ref.table); err == nil && n > 0 {
			st.hasLegacy = true
			st.legacyKeys = n
		}
	}

	st.pebbleTotal = st.pebbleKeys
	if st.pebbleKeys == 0 && st.legacyKeys > 0 {
		st.pebbleTotal = st.legacyKeys
	} else if st.pebbleKeys > 0 && st.legacyKeys > 0 {
		// Go runtime dedupes: per-table wins; legacy only adds missing keys.
		st.pebbleTotal = st.pebbleKeys + st.legacyKeys
	}
	return st
}

func countRocksDB(ldb, dbPath string) (int, error) {
	n := 0
	err := scanRocksDB(ldb, dbPath, func(key string, _ []byte) error {
		if strings.HasPrefix(key, "__meta_") {
			return nil
		}
		n++
		return nil
	})
	return n, err
}

func scanRocksDB(ldb, dbPath string, fn func(key string, value []byte) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
	defer cancel()

	cmd := exec.CommandContext(ctx, ldb, "--try_load_options", "scan", "--db="+dbPath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1024*1024), 64*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		sep := strings.Index(line, ldbScanSep)
		if sep < 0 {
			continue
		}
		key := line[:sep]
		val := []byte(line[sep+len(ldbScanSep):])
		if err := fn(key, val); err != nil {
			_ = cmd.Process.Kill()
			return err
		}
	}
	if err := sc.Err(); err != nil {
		_ = cmd.Process.Kill()
		return err
	}
	return cmd.Wait()
}

func countPebbleDir(dir string) (keys int, metaCount int64, err error) {
	db, err := pebble.Open(dir, &pebble.Options{ReadOnly: true})
	if err != nil {
		return 0, 0, err
	}
	defer db.Close()

	iter, err := db.NewIter(&pebble.IterOptions{})
	if err != nil {
		return 0, 0, err
	}
	defer iter.Close()

	for iter.First(); iter.Valid(); iter.Next() {
		k := string(iter.Key())
		if k == "__meta_count" {
			if v, closer, err := db.Get([]byte(k)); err == nil {
				b := append([]byte(nil), v...)
				closer.Close()
				if len(b) >= 8 {
					metaCount = int64(binary.LittleEndian.Uint64(b))
				}
			}
			continue
		}
		if strings.HasPrefix(k, "__meta_") || k == "__migration_meta__" {
			continue
		}
		keys++
	}
	return keys, metaCount, nil
}

func countLegacyTableKeys(legacyDir, appID, tableName string) (int, error) {
	// Try opening legacy as Pebble DB (directory).
	db, err := pebble.Open(legacyDir, &pebble.Options{ReadOnly: true})
	if err != nil {
		return 0, err
	}
	defer db.Close()

	prefix := appID + "_" + tableName + "_"
	lower := strings.ToLower(prefix)
	n := 0
	iter, err := db.NewIter(&pebble.IterOptions{LowerBound: []byte(lower)})
	if err != nil {
		return 0, err
	}
	defer iter.Close()
	for iter.First(); iter.Valid(); iter.Next() {
		k := string(iter.Key())
		if !strings.HasPrefix(strings.ToLower(k), lower) {
			break
		}
		if strings.HasPrefix(k, "__meta_") {
			continue
		}
		n++
	}
	return n, nil
}

func resolveLDB(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if p, err := exec.LookPath("rocksdb_ldb"); err == nil {
		return p, nil
	}
	for _, p := range []string{"/opt/homebrew/bin/rocksdb_ldb", "/usr/local/bin/rocksdb_ldb"} {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("rocksdb_ldb not found")
}

func printReport(stats []tableStats, elapsed time.Duration) {
	var rocksTotal, pebbleOnly, mismatch, missingPebble, missingRocks int
	var rocksKeys, pebbleKeys, legacyKeys int

	type row struct {
		label string
		st    tableStats
	}
	var diffs, highlights []row

	for _, st := range stats {
		if st.hasRocksDB {
			rocksTotal++
			rocksKeys += st.rocksdbKeys
		}
		if st.hasPebbleDir {
			pebbleOnly++
			pebbleKeys += st.pebbleKeys
		}
		if st.hasLegacy {
			legacyKeys += st.legacyKeys
		}
		if st.hasRocksDB && !st.hasPebbleDir && st.legacyKeys == 0 {
			missingPebble++
		}
		if st.hasPebbleDir && !st.hasRocksDB {
			missingRocks++
		}
		effective := st.pebbleKeys
		if effective == 0 {
			effective = st.legacyKeys
		}
		if st.hasRocksDB && (effective != st.rocksdbKeys || st.legacyKeys > 0 && st.pebbleKeys > 0) {
			mismatch++
			diffs = append(diffs, row{st.ref.app + "/" + st.ref.table, st})
		}
		if st.ref.app == "csm" && (st.ref.table == "sys_autos" || st.ref.table == "csm_accounts" || st.ref.table == "csm_group_members") {
			highlights = append(highlights, row{st.ref.app + "/" + st.ref.table, st})
		}
	}

	fmt.Println("=== SUMMARY ===")
	fmt.Printf("Elapsed           : %s\n", elapsed.Round(time.Millisecond))
	fmt.Printf("Tables scanned    : %d\n", len(stats))
	fmt.Printf("In RocksDB        : %d tables, %d keys\n", rocksTotal, rocksKeys)
	fmt.Printf("In Pebble dir     : %d tables, %d keys\n", pebbleOnly, pebbleKeys)
	if legacyKeys > 0 {
		fmt.Printf("In legacy only    : %d keys (extra prefix scan)\n", legacyKeys)
	}
	fmt.Printf("RocksDB only      : %d tables (no pebble dir, no legacy keys)\n", missingPebble)
	fmt.Printf("Pebble only       : %d tables (not in RocksDB)\n", missingRocks)
	fmt.Printf("Count mismatch    : %d tables\n", mismatch)
	fmt.Println()

	fmt.Println("=== KEY TABLES (csm) ===")
	fmt.Printf("%-28s %8s %8s %8s %8s\n", "table", "rocksdb", "pebble", "legacy", "go-sees")
	for _, h := range highlights {
		st := h.st
		goSees := st.pebbleKeys
		if goSees == 0 {
			goSees = st.legacyKeys
		} else if st.legacyKeys > 0 {
			goSees = st.pebbleKeys + st.legacyKeys
		}
		fmt.Printf("%-28s %8d %8d %8d %8d\n", h.label, st.rocksdbKeys, st.pebbleKeys, st.legacyKeys, goSees)
	}
	fmt.Println()

	if len(diffs) == 0 {
		fmt.Println("=== MISMATCHES ===")
		fmt.Println("(none — counts align for all scanned tables)")
		return
	}

	fmt.Println("=== MISMATCHES (rocksdb != pebble effective) ===")
	fmt.Printf("%-32s %8s %8s %8s  note\n", "table", "rocksdb", "pebble", "legacy")
	limitShow := 40
	for i, d := range diffs {
		if i >= limitShow {
			fmt.Printf("... and %d more\n", len(diffs)-limitShow)
			break
		}
		st := d.st
		note := ""
		switch {
		case !st.hasPebbleDir && st.legacyKeys == 0:
			note = "NOT MIGRATED"
		case st.pebbleKeys == 0 && st.legacyKeys > 0:
			note = "legacy only"
		case st.pebbleKeys > 0 && st.legacyKeys > 0:
			note = "split dual-store"
		case st.rocksdbKeys > st.pebbleKeys:
			note = "pebble thiếu"
		case st.rocksdbKeys < st.pebbleKeys:
			note = "pebble thừa"
		}
		fmt.Printf("%-32s %8d %8d %8d  %s\n", d.label, st.rocksdbKeys, st.pebbleKeys, st.legacyKeys, note)
	}
}
