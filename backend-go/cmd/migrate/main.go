// Migrate RocksDB (Java/Rust CSM) → Pebble KV.
//
// Uses Homebrew rocksdb_ldb CLI — no CGO, no grocksdb compile issues.
//
//	brew install rocksdb
//	go run ./cmd/migrate \
//	  -source ../backend/csm_datas/database \
//	  -dest ../backend/csm_datas/native
package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/cockroachdb/pebble"
)

const ldbScanSep = " ==> "

var (
	sourceDir  = flag.String("source", defaultSource(), "RocksDB root (app_id/table_name/...)")
	destDir    = flag.String("dest", defaultDest(), "Output: pebble/{app_id}/{table_name}/")
	dryRun     = flag.Bool("dry-run", false, "Scan only, do not write")
	batchSize  = flag.Int("batch", 500, "Pebble batch size")
	ldbBin     = flag.String("ldb", "", "rocksdb_ldb binary (default: PATH or brew)")
	skipApps   = flag.String("skip-apps", "fidovnemail", "Comma-separated app_id dirs to skip (case-insensitive)")
	onlyTables = flag.String("only-tables", "", "Comma-separated app/table to migrate only (e.g. csm/csm_accounts,csm/csm_group_members)")
)

var defaultSkipApps = []string{"fidovnemail"}

func main() {
	flag.Parse()
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	if err := run(); err != nil {
		log.Fatalf("migrate failed: %v", err)
	}
}

func defaultSource() string {
	if v := os.Getenv("ROCKSDB_ROOT_DIR"); v != "" {
		return v
	}
	for _, p := range []string{
		"../backend/csm_datas/database",
		"./backend/csm_datas/database",
		"../csm_datas/database",
	} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
	}
	return "../backend/csm_datas/database"
}

func defaultDest() string {
	if v := os.Getenv("CSM_NATIVE_DATA_DIR"); v != "" {
		return v
	}
	src := defaultSource()
	if strings.Contains(src, "backend/csm_datas") {
		return filepath.Join(filepath.Dir(src), "native")
	}
	return "../backend/csm_datas/native"
}

func run() error {
	src := filepath.Clean(*sourceDir)
	dst := filepath.Clean(*destDir)
	pebbleRoot := filepath.Join(dst, "pebble")

	ldb, err := resolveLDB(*ldbBin)
	if err != nil {
		return err
	}
	log.Printf("rocksdb_ldb: %s", ldb)
	log.Printf("source RocksDB: %s", src)
	log.Printf("dest Pebble:    %s/{app_id}/{table_name}/", pebbleRoot)
	skipped := parseSkipApps(*skipApps)
	only := parseOnlyTables(*onlyTables)
	if len(only) > 0 {
		log.Printf("only tables: %s", strings.Join(only, ", "))
	}
	if len(skipped) > 0 {
		log.Printf("skip apps:      %s", strings.Join(skipped, ", "))
	}
	if *dryRun {
		log.Printf("DRY RUN — no writes")
	}

	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("source not found: %w", err)
	}

	if !*dryRun {
		if err := os.MkdirAll(pebbleRoot, 0o755); err != nil {
			return err
		}
	}

	apps, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	var totalKeys, tables int64
	start := time.Now()

	for _, appEntry := range apps {
		if !appEntry.IsDir() || strings.HasPrefix(appEntry.Name(), ".") {
			continue
		}
		appID := appEntry.Name()
		if shouldSkipApp(appID, skipped) {
			log.Printf("skip app %s (excluded)", appID)
			continue
		}
		tablesEntries, err := os.ReadDir(filepath.Join(src, appID))
		if err != nil {
			log.Printf("skip app %s: %v", appID, err)
			continue
		}
		for _, tableEntry := range tablesEntries {
			if !tableEntry.IsDir() {
				continue
			}
			tableName := tableEntry.Name()
			if len(only) > 0 && !onlyTableAllowed(only, appID, tableName) {
				continue
			}
			dbPath := filepath.Join(src, appID, tableName)
			n, err := migrateTable(ldb, appID, tableName, dbPath, pebbleRoot)
			if err != nil {
				log.Printf("ERROR %s/%s: %v", appID, tableName, err)
				continue
			}
			atomic.AddInt64(&totalKeys, n)
			atomic.AddInt64(&tables, 1)
			log.Printf("  %s/%s: %d records", appID, tableName, n)
		}
	}

	log.Printf("done: %d tables, %d records in %s", tables, totalKeys, time.Since(start))
	log.Printf("note: restart Go server to rebuild in-memory eq-index (or POST /update-table-data-index)")

	if !*dryRun {
		meta := map[string]any{
			"migratedAt":  time.Now().UTC().Format(time.RFC3339),
			"source":      src,
			"recordCount": totalKeys,
			"tool":        "rocksdb_ldb",
			"layout":      "pebble/{app_id}/{table_name}",
		}
		raw, _ := json.MarshalIndent(meta, "", "  ")
		metaPath := filepath.Join(pebbleRoot, "_migration.json")
		if err := os.WriteFile(metaPath, raw, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func resolveLDB(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if p, err := exec.LookPath("rocksdb_ldb"); err == nil {
		return p, nil
	}
	for _, candidate := range []string{
		"/opt/homebrew/bin/rocksdb_ldb",
		"/usr/local/bin/rocksdb_ldb",
	} {
		if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("rocksdb_ldb not found — run: brew install rocksdb")
}

func migrateTable(ldb, appID, tableName, dbPath, pebbleRoot string) (records int64, err error) {
	var pb *pebble.DB
	var batch *pebble.Batch
	if !*dryRun {
		destPath := filepath.Join(pebbleRoot, strings.ToLower(strings.TrimSpace(appID)), strings.ToLower(strings.TrimSpace(tableName)))
		if err := os.MkdirAll(destPath, 0o755); err != nil {
			return 0, err
		}
		pb, err = pebble.Open(destPath, &pebble.Options{})
		if err != nil {
			return 0, fmt.Errorf("open pebble %s: %w", destPath, err)
		}
		defer pb.Close()
		batch = pb.NewBatch()
		defer batch.Close()
	}

	pending := 0
	tableCount := int64(0)

	scanErr := scanRocksDB(ldb, dbPath, func(key string, value []byte) error {
		if strings.HasPrefix(key, "__meta_") {
			return nil
		}
		records++
		tableCount++

		if batch != nil {
			if err := batch.Set([]byte(key), value, nil); err != nil {
				return err
			}
			pending++
			if pending >= *batchSize {
				if err := batch.Commit(pebble.Sync); err != nil {
					return err
				}
				batch.Reset()
				pending = 0
			}
		}
		return nil
	})
	if scanErr != nil {
		return records, scanErr
	}

	if batch != nil && pending > 0 {
		if err := batch.Commit(pebble.Sync); err != nil {
			return records, err
		}
	}
	if pb != nil {
		buf := make([]byte, 8)
		binary.LittleEndian.PutUint64(buf, uint64(tableCount))
		_ = pb.Set([]byte("__meta_count"), buf, pebble.Sync)
	}
	return records, nil
}

func scanRocksDB(ldb, dbPath string, fn func(key string, value []byte) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), 24*time.Hour)
	defer cancel()

	cmd := exec.CommandContext(ctx, ldb, "--try_load_options", "scan", "--db="+dbPath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("ldb scan start %s: %w", dbPath, err)
	}

	errCh := make(chan error, 1)
	go func() {
		sc := bufio.NewScanner(stderr)
		for sc.Scan() {
			line := strings.TrimSpace(sc.Text())
			if line != "" && !strings.Contains(line, "Keys in range") {
				log.Printf("[ldb stderr] %s", line)
			}
		}
	}()

	reader := bufio.NewReader(stdout)
	for {
		line, readErr := reader.ReadString('\n')
		if len(line) > 0 {
			line = strings.TrimRight(line, "\r\n")
			if line == "" || strings.HasPrefix(line, "Keys in range") {
				continue
			}
			key, value, ok := parseLDBScanLine(line)
			if !ok {
				continue
			}
			if err := fn(key, []byte(value)); err != nil {
				_ = cmd.Process.Kill()
				errCh <- err
				break
			}
		}
		if readErr != nil {
			if readErr != io.EOF {
				errCh <- readErr
			}
			break
		}
	}

	waitErr := cmd.Wait()
	select {
	case err := <-errCh:
		return err
	default:
		if waitErr != nil {
			return fmt.Errorf("ldb scan %s: %w", dbPath, waitErr)
		}
	}
	return nil
}

func parseLDBScanLine(line string) (key, value string, ok bool) {
	i := strings.Index(line, ldbScanSep)
	if i <= 0 {
		return "", "", false
	}
	return line[:i], line[i+len(ldbScanSep):], true
}

func parseSkipApps(flagValue string) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(app string) {
		app = strings.ToLower(strings.TrimSpace(app))
		if app == "" {
			return
		}
		if _, ok := seen[app]; ok {
			return
		}
		seen[app] = struct{}{}
		out = append(out, app)
	}
	for _, app := range defaultSkipApps {
		add(app)
	}
	for _, part := range strings.Split(flagValue, ",") {
		add(part)
	}
	return out
}

func shouldSkipApp(appID string, skipped []string) bool {
	normalized := strings.ToLower(strings.TrimSpace(appID))
	for _, s := range skipped {
		if normalized == s {
			return true
		}
	}
	return false
}

func parseOnlyTables(flagValue string) []string {
	var out []string
	for _, part := range strings.Split(flagValue, ",") {
		part = strings.ToLower(strings.TrimSpace(part))
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func onlyTableAllowed(only []string, appID, tableName string) bool {
	key := strings.ToLower(strings.TrimSpace(appID)) + "/" + strings.ToLower(strings.TrimSpace(tableName))
	for _, item := range only {
		if item == key {
			return true
		}
	}
	return false
}
