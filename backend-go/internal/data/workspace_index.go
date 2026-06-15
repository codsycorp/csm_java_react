package data

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// WorkspaceChunk is one indexed dev workspace file slice.
type WorkspaceChunk struct {
	ChunkID   string
	Path      string
	Scope     string
	Summary   string
	Content   string
	CreatedAt int64
}

func workspaceSchemaStatements() []string {
	return []string{
		`CREATE VIRTUAL TABLE IF NOT EXISTS workspace_fts USING fts5(
			chunk_id UNINDEXED,
			path UNINDEXED,
			scope UNINDEXED,
			summary,
			content,
			tokenize='unicode61'
		)`,
	}
}

// EnsureWorkspaceSchema creates workspace_fts in vectors.db.
func (rm *RecordManager) EnsureWorkspaceSchema() error {
	if rm.searchDB == nil {
		if err := rm.EnsureTenantRAGSchema(); err != nil {
			return err
		}
	}
	if rm.searchDB == nil {
		return fmt.Errorf("search db unavailable")
	}
	for _, q := range workspaceSchemaStatements() {
		if _, err := rm.searchDB.Exec(q); err != nil {
			return fmt.Errorf("workspace schema: %w", err)
		}
	}
	return nil
}

// UpsertWorkspaceChunk indexes one workspace file chunk.
func (rm *RecordManager) UpsertWorkspaceChunk(chunk WorkspaceChunk) error {
	if err := rm.EnsureWorkspaceSchema(); err != nil {
		return err
	}
	if chunk.ChunkID == "" || strings.TrimSpace(chunk.Content) == "" {
		return nil
	}
	_, _ = rm.searchDB.Exec(`DELETE FROM workspace_fts WHERE chunk_id = ?`, chunk.ChunkID)
	_, err := rm.searchDB.Exec(
		`INSERT INTO workspace_fts(chunk_id, path, scope, summary, content) VALUES (?, ?, ?, ?, ?)`,
		chunk.ChunkID, chunk.Path, chunk.Scope, chunk.Summary, chunk.Content,
	)
	return err
}

// ClearWorkspaceIndex removes all workspace chunks (rebuild).
func (rm *RecordManager) ClearWorkspaceIndex() error {
	if rm.searchDB == nil {
		return nil
	}
	if err := rm.EnsureWorkspaceSchema(); err != nil {
		return err
	}
	_, err := rm.searchDB.Exec(`DELETE FROM workspace_fts`)
	return err
}

// SearchWorkspaceFTS searches dev workspace index.
func (rm *RecordManager) SearchWorkspaceFTS(match string, limit int) ([]WorkspaceChunk, error) {
	if rm.searchDB == nil || strings.TrimSpace(match) == "" {
		return nil, nil
	}
	if err := rm.EnsureWorkspaceSchema(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 4
	}
	rows, err := rm.searchDB.Query(
		`SELECT chunk_id, path, scope, summary, content
		 FROM workspace_fts WHERE workspace_fts MATCH ? ORDER BY bm25(workspace_fts) LIMIT ?`,
		match, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkspaceChunk
	for rows.Next() {
		var c WorkspaceChunk
		if err := rows.Scan(&c.ChunkID, &c.Path, &c.Scope, &c.Summary, &c.Content); err != nil {
			return out, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// RebuildWorkspaceIndex scans markdown/code roots into workspace_fts.
func (rm *RecordManager) RebuildWorkspaceIndex(roots []string, maxFiles int) (int, error) {
	if err := rm.ClearWorkspaceIndex(); err != nil {
		return 0, err
	}
	if maxFiles <= 0 {
		maxFiles = 120
	}
	indexed := 0
	seen := map[string]struct{}{}
	for _, root := range roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info == nil || info.IsDir() {
				return nil
			}
			if indexed >= maxFiles {
				return filepath.SkipDir
			}
			lower := strings.ToLower(path)
			if strings.Contains(path, "node_modules") || strings.Contains(path, ".git") {
				return nil
			}
			if !(strings.HasSuffix(lower, ".md") || strings.HasSuffix(lower, ".go") || strings.HasSuffix(lower, ".tsx") || strings.HasSuffix(lower, ".ts")) {
				return nil
			}
			if info.Size() > 200_000 {
				return nil
			}
			data, err := os.ReadFile(path)
			if err != nil || len(data) < 32 {
				return nil
			}
			if _, ok := seen[path]; ok {
				return nil
			}
			seen[path] = struct{}{}
			content := string(data)
			chunks := ChunkText(path, content, 1800)
			for i, ch := range chunks {
				chunkID := fmt.Sprintf("ws_%d_%s", i, strings.ReplaceAll(path, "/", "_"))
				scope := "dev_workspace"
				if strings.Contains(lower, "ai_local") {
					scope = "ai_knowledge"
				}
				_ = rm.UpsertWorkspaceChunk(WorkspaceChunk{
					ChunkID: chunkID, Path: path, Scope: scope,
					Summary: filepath.Base(path), Content: ch, CreatedAt: time.Now().UnixMilli(),
				})
			}
			indexed++
			return nil
		})
	}
	return indexed, nil
}
