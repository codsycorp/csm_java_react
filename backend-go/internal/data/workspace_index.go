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

// EnsureWorkspaceSchema ensures chromem workspace collection exists.
func (rm *RecordManager) EnsureWorkspaceSchema() error {
	if rm.vectorStore == nil {
		return fmt.Errorf("vector store unavailable")
	}
	_, err := rm.vectorStore.collection(vectorCollWorkspace)
	return err
}

// UpsertWorkspaceChunk indexes one workspace file chunk in chromem.
func (rm *RecordManager) UpsertWorkspaceChunk(chunk WorkspaceChunk) error {
	if err := rm.EnsureWorkspaceSchema(); err != nil {
		return err
	}
	if chunk.ChunkID == "" || strings.TrimSpace(chunk.Content) == "" {
		return nil
	}
	meta := map[string]string{
		"path":   chunk.Path,
		"scope":  chunk.Scope,
		"summary": chunk.Summary,
	}
	text := chunk.Summary + "\n" + chunk.Content
	return rm.vectorStore.upsertDoc(vectorCollWorkspace, chunk.ChunkID, meta, text)
}

// ClearWorkspaceIndex removes all workspace chunks.
func (rm *RecordManager) ClearWorkspaceIndex() error {
	if rm.vectorStore == nil {
		return nil
	}
	return rm.vectorStore.clearCollection(vectorCollWorkspace)
}

// SearchWorkspaceFTS semantic search over dev workspace index (chromem).
func (rm *RecordManager) SearchWorkspaceFTS(match string, limit int) ([]WorkspaceChunk, error) {
	if rm.vectorStore == nil || strings.TrimSpace(match) == "" {
		return nil, nil
	}
	if err := rm.EnsureWorkspaceSchema(); err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 4
	}
	results, err := rm.vectorStore.query(vectorCollWorkspace, match, nil, limit)
	if err != nil {
		return nil, err
	}
	out := make([]WorkspaceChunk, 0, len(results))
	for _, r := range results {
		out = append(out, WorkspaceChunk{
			ChunkID: r.ID, Path: r.Metadata["path"], Scope: r.Metadata["scope"],
			Summary: r.Metadata["summary"], Content: r.Content,
		})
	}
	return out, nil
}

// RebuildWorkspaceIndex scans markdown/code roots into chromem workspace collection.
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
