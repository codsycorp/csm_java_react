package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

var workspaceIndexLastRebuild sync.Map // key -> unix ms

const workspaceRebuildDebounceMs = 300_000 // 5 min

// WorkspaceContextResult is L1 dev workspace retrieval output.
type WorkspaceContextResult struct {
	Block      string
	HitCount   int
	IndexFresh bool
}

// EnsureWorkspaceIndexFresh rebuilds workspace index if stale (Java ensureIndexFresh subset).
func EnsureWorkspaceIndexFresh(cfg config.AppConfig, rm *data.RecordManager) int {
	if rm == nil {
		return 0
	}
	key := cfg.SearchDBPath
	now := time.Now().UnixMilli()
	if last, ok := workspaceIndexLastRebuild.Load(key); ok {
		if lastMs, ok := last.(int64); ok && now-lastMs < workspaceRebuildDebounceMs {
			return 0
		}
	}
	roots := resolveWorkspaceRoots(cfg)
	count, err := rm.RebuildWorkspaceIndex(roots, 80)
	if err != nil {
		return 0
	}
	workspaceIndexLastRebuild.Store(key, now)
	return count
}

func resolveWorkspaceRoots(cfg config.AppConfig) []string {
	var roots []string
	candidates := []string{
		filepath.Join(cfg.DataDir, "..", "frontend-admin", "src"),
		filepath.Join(cfg.DataDir, "..", "backend-go", "internal"),
		cfg.AI.ContextDir,
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			roots = append(roots, c)
		}
	}
	return roots
}

// BuildWorkspaceRetrievalBlock searches L1 workspace index for query context.
func BuildWorkspaceRetrievalBlock(cfg config.AppConfig, rm *data.RecordManager, query string, maxChars int) WorkspaceContextResult {
	if rm == nil || strings.TrimSpace(query) == "" {
		return WorkspaceContextResult{}
	}
	EnsureWorkspaceIndexFresh(cfg, rm)
	match := buildFTSMatchFromQuery(query)
	if match == "" {
		return WorkspaceContextResult{}
	}
	chunks, err := rm.SearchWorkspaceFTS(match, 4)
	if err != nil || len(chunks) == 0 {
		return WorkspaceContextResult{IndexFresh: true}
	}
	var sb strings.Builder
	sb.WriteString("[LOCAL_SEMANTIC_SEARCH_CONTEXT]\n")
	used := sb.Len()
	for i, ch := range chunks {
		block := "--- " + ch.Path + " ---\n" + truncateStr(ch.Content, 1500) + "\n\n"
		if used+len(block) > maxChars {
			break
		}
		sb.WriteString("hit ")
		sb.WriteString(itoa(i + 1))
		sb.WriteString(": ")
		sb.WriteString(block)
		used += len(block)
	}
	sb.WriteString("[/LOCAL_SEMANTIC_SEARCH_CONTEXT]\n\n")
	return WorkspaceContextResult{
		Block: truncateStr(sb.String(), maxChars), HitCount: len(chunks), IndexFresh: true,
	}
}

// LoadWorkspaceSourceFile reads an indexed workspace file (path must be under allowed roots).
func LoadWorkspaceSourceFile(cfg config.AppConfig, rm *data.RecordManager, path, contextType string) map[string]any {
	_ = contextType
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil
	}
	allowed := false
	for _, root := range resolveWorkspaceRoots(cfg) {
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			continue
		}
		if strings.HasPrefix(abs, rootAbs+string(os.PathSeparator)) || abs == rootAbs {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		if rm != nil {
			match := `"` + strings.ReplaceAll(filepath.Base(abs), `"`, `""`) + `"`
			chunks, _ := rm.SearchWorkspaceFTS(match, 1)
			for _, ch := range chunks {
				if ch.Path == abs || strings.HasSuffix(ch.Path, filepath.Base(abs)) {
					return map[string]any{
						"path": ch.Path, "scope": ch.Scope, "summary": ch.Summary,
						"content": ch.Content, "indexed": true,
					}
				}
			}
		}
		return nil
	}
	content := string(data)
	if len(content) > 120_000 {
		content = content[:120_000]
	}
	return map[string]any{
		"path": abs, "scope": "dev_workspace", "summary": filepath.Base(abs),
		"content": content, "indexed": false, "size": len(data),
	}
}

// RebuildWorkspaceIndexAPI forces workspace rebuild (ops endpoint).
func RebuildWorkspaceIndexAPI(cfg config.AppConfig, rm *data.RecordManager, fullCode bool) map[string]any {
	_ = fullCode
	roots := resolveWorkspaceRoots(cfg)
	count, err := rm.RebuildWorkspaceIndex(roots, 200)
	status := "ok"
	if err != nil {
		status = "error"
	}
	workspaceIndexLastRebuild.Store(cfg.SearchDBPath, time.Now().UnixMilli())
	return map[string]any{
		"success": err == nil, "status": status, "indexedFiles": count,
		"roots": roots, "engine": "workspace_fts",
	}
}
