// Migrate RocksDB (Java/Rust CSM) → Pebble KV + sqlite-vec.
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
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/cockroachdb/pebble"

	"csm_server/backend-go/internal/data"

	_ "modernc.org/sqlite"
	_ "modernc.org/sqlite/vec"
)

const (
	metaCountPrefix = "__meta_count|"
	defaultEmbedDim = 384
	ldbScanSep      = " ==> "
)

var (
	sourceDir  = flag.String("source", defaultSource(), "RocksDB root (app_id/table_name/...)")
	destDir    = flag.String("dest", defaultDest(), "Output: pebble/ + search/")
	dryRun     = flag.Bool("dry-run", false, "Scan only, do not write")
	batchSize  = flag.Int("batch", 500, "Pebble batch size")
	embedDim   = flag.Int("embed-dim", defaultEmbedDim, "Hash embedding dimension for sqlite-vec")
	skipFTS    = flag.Bool("skip-fts", false, "Skip FTS5 index")
	skipVec    = flag.Bool("skip-vec", false, "Skip vector index")
	minTextLen = flag.Int("min-text", 8, "Minimum extracted text length to index")
	ldbBin     = flag.String("ldb", "", "rocksdb_ldb binary (default: PATH or brew)")
	skipApps   = flag.String("skip-apps", "fidovnemail", "Comma-separated app_id dirs to skip (case-insensitive)")
)

// defaultSkipApps are always excluded unless -skip-apps is explicitly cleared.
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
	pebblePath := filepath.Join(dst, "pebble", "csm.kv")
	searchPath := filepath.Join(dst, "search", "vectors.db")

	ldb, err := resolveLDB(*ldbBin)
	if err != nil {
		return err
	}
	log.Printf("rocksdb_ldb: %s", ldb)
	log.Printf("source RocksDB: %s", src)
	log.Printf("dest Pebble:    %s", pebblePath)
	log.Printf("dest search:    %s", searchPath)
	skipped := parseSkipApps(*skipApps)
	if len(skipped) > 0 {
		log.Printf("skip apps:      %s", strings.Join(skipped, ", "))
	}
	if *dryRun {
		log.Printf("DRY RUN — no writes")
	}

	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("source not found: %w", err)
	}

	var pb *pebble.DB
	var searchDB *sql.DB

	if !*dryRun {
		if err := os.MkdirAll(filepath.Dir(pebblePath), 0o755); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(searchPath), 0o755); err != nil {
			return err
		}
		pb, err = pebble.Open(pebblePath, &pebble.Options{})
		if err != nil {
			return fmt.Errorf("open pebble: %w", err)
		}
		defer pb.Close()

		searchDB, err = openSearchDB(searchPath)
		if err != nil {
			return fmt.Errorf("open search db: %w", err)
		}
		defer searchDB.Close()
	}

	apps, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	var totalKeys, indexed, tables int64
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
			dbPath := filepath.Join(src, appID, tableName)
			n, idx, err := migrateTable(ldb, appID, tableName, dbPath, pb, searchDB)
			if err != nil {
				log.Printf("ERROR %s/%s: %v", appID, tableName, err)
				continue
			}
			atomic.AddInt64(&totalKeys, n)
			atomic.AddInt64(&indexed, idx)
			atomic.AddInt64(&tables, 1)
			log.Printf("  %s/%s: %d records, %d indexed", appID, tableName, n, idx)
		}
	}

	log.Printf("done: %d tables, %d records, %d search-indexed in %s", tables, totalKeys, indexed, time.Since(start))

	if !*dryRun && pb != nil {
		meta := map[string]any{
			"migratedAt":   time.Now().UTC().Format(time.RFC3339),
			"source":       src,
			"recordCount":  totalKeys,
			"indexedCount": indexed,
			"embedDim":     *embedDim,
			"tool":         "rocksdb_ldb",
		}
		raw, _ := json.Marshal(meta)
		if err := pb.Set([]byte("__migration_meta__"), raw, pebble.Sync); err != nil {
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

func migrateTable(ldb, appID, tableName, dbPath string, pb *pebble.DB, searchDB *sql.DB) (records int64, indexed int64, err error) {
	var batch *pebble.Batch
	if pb != nil {
		batch = pb.NewBatch()
		defer batch.Close()
	}

	var ftsStmt *sql.Stmt
	var vecStmt *sql.Stmt
	if searchDB != nil && !*skipFTS {
		ftsStmt, err = searchDB.Prepare(`INSERT INTO records_fts(pebble_key, app_id, table_name, record_id, title, content)
			VALUES (?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return 0, 0, err
		}
		defer ftsStmt.Close()
	}
	if searchDB != nil && !*skipVec {
		vecStmt, err = searchDB.Prepare(
			`INSERT INTO ai_chunks(chunk_id, embedding, path, scope, summary, content, app_id, table_name)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return 0, 0, err
		}
		defer vecStmt.Close()
	}

	pending := 0
	tableCount := int64(0)

	scanErr := scanRocksDB(ldb, dbPath, func(key string, value []byte) error {
		if strings.HasPrefix(key, "__meta_") {
			return nil
		}
		records++
		tableCount++
		pk := data.PebbleKey(appID, tableName, key)

		if batch != nil {
			if err := batch.Set([]byte(pk), value, nil); err != nil {
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

		if searchDB != nil && (!*skipFTS || !*skipVec) {
			var record map[string]any
			if json.Unmarshal(value, &record) == nil {
				title, content := extractSearchText(record)
				if len(content) >= *minTextLen {
					recordID := recordIDFrom(record, key)
					if ftsStmt != nil {
						_, _ = ftsStmt.Exec(pk, appID, tableName, recordID, title, content)
					}
					if vecStmt != nil {
						vecJSON := hashEmbedJSON(content, *embedDim)
						_, _ = vecStmt.Exec(pk, vecJSON, pk, appID+"/"+tableName, trimRunes(title, 200), trimRunes(content, 4000), appID, tableName)
					}
					indexed++
				}
			}
		}
		return nil
	})
	if scanErr != nil {
		return records, indexed, scanErr
	}

	if batch != nil && pending > 0 {
		if err := batch.Commit(pebble.Sync); err != nil {
			return records, indexed, err
		}
	}
	if pb != nil {
		metaKey := metaCountPrefix + appID + "|" + tableName
		buf := make([]byte, 8)
		binary.LittleEndian.PutUint64(buf, uint64(tableCount))
		_ = pb.Set([]byte(metaKey), buf, pebble.Sync)
	}
	return records, indexed, nil
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

func openSearchDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	schema := []string{
		`CREATE TABLE IF NOT EXISTS migration_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TEXT NOT NULL,
			message TEXT NOT NULL
		)`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
			pebble_key UNINDEXED,
			app_id UNINDEXED,
			table_name UNINDEXED,
			record_id UNINDEXED,
			title,
			content,
			tokenize='unicode61'
		)`,
		fmt.Sprintf(`CREATE VIRTUAL TABLE IF NOT EXISTS ai_chunks USING vec0(
			chunk_id TEXT PRIMARY KEY,
			embedding float[%d],
			+path TEXT,
			+scope TEXT,
			+summary TEXT,
			+content TEXT,
			+app_id TEXT,
			+table_name TEXT
		)`, *embedDim),
	}
	for _, q := range schema {
		if _, err := db.Exec(q); err != nil {
			return nil, fmt.Errorf("schema: %w\nSQL: %s", err, q)
		}
	}
	_, _ = db.Exec(`INSERT INTO migration_log(created_at, message) VALUES (?, ?)`,
		time.Now().UTC().Format(time.RFC3339), "schema ready")
	return db, nil
}

func recordIDFrom(record map[string]any, fallbackKey string) string {
	for _, k := range []string{"id", "chunkId", "chunk_id"} {
		if v, ok := record[k]; ok {
			return fmt.Sprint(v)
		}
	}
	return fallbackKey
}

var textFields = []string{
	"name", "title", "summary", "content", "description", "body", "text",
	"email", "username", "full_name", "fullName", "phoneNumber", "note", "notes",
	"login_identifier", "tag", "tags", "path", "scope", "message", "comment",
}

func extractSearchText(record map[string]any) (title, content string) {
	var parts []string
	for _, f := range textFields {
		if v, ok := record[f]; ok {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" && s != "<nil>" {
				if title == "" && (f == "name" || f == "title" || f == "username" || f == "email") {
					title = s
				}
				parts = append(parts, s)
			}
		}
	}
	content = strings.Join(parts, " ")
	if title == "" && len(parts) > 0 {
		title = trimRunes(parts[0], 120)
	}
	return title, content
}

func hashEmbedJSON(text string, dim int) string {
	vec := hashEmbed(text, dim)
	vals := make([]string, dim)
	for i, v := range vec {
		vals[i] = fmt.Sprintf("%g", v)
	}
	return "[" + strings.Join(vals, ",") + "]"
}

func hashEmbed(text string, dim int) []float32 {
	out := make([]float32, dim)
	for i := 0; i < dim; i++ {
		h := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", text, i)))
		out[i] = (float32(int(h[0])<<8|int(h[1]))/65535)*2 - 1
	}
	var norm float64
	for _, v := range out {
		norm += float64(v) * float64(v)
	}
	norm = math.Sqrt(norm)
	if norm > 0 {
		for i := range out {
			out[i] = float32(float64(out[i]) / norm)
		}
	}
	return out
}

func trimRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
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
