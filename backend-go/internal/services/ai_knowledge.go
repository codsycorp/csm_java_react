package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
)

var menuKnowledgeAllowlist = []string{
	"ai_menu_structure_runtime.md",
	"ai_menu_runtime_compact.md",
	"ai_menu_dev_workflow_compact.md",
	"ai_menu_greenfield_worker_contract.md",
	"ai_greenfield_pipeline_contract.md",
}

var codeKnowledgeAllowlist = []string{
	"ai_code_runtime_compact.md",
	"ai_code_greenfield_worker_contract.md",
}

const menuJSONContractFallback = `You are CSM Menu JSON Editor.

Return ONLY valid JSON.
No markdown.
No explanation.
No random text.

Patch mode schema (include at least one patch when user requests fixes):
{
  "status": "success",
  "patches": [
    {
      "action": "edit",
      "nodeId": "<existing-menu-node-id>",
      "parentId": "<parent-id-or-empty>",
      "path": "Module / Feature",
      "before": null,
      "after": {
        "trigger": {"filter": "..."},
        "label": "Nhãn tiếng Việt",
        "label_en": "English label",
        "label_zh": "中文标签"
      },
      "reason": "Fix trigger keys and 3-language labels"
    }
  ],
  "i18n": {"vi": {}, "en": {}, "zh": {}},
  "warnings": []
}

Rules:
- Never return "success" with patches: [] when the user asked to check/fix/add menu fields.
- Use status "need_more_context" with warnings when nodeId or safe context is missing.
- Allowed patch action: add, edit, delete.
`

const greenfieldMenuContractFallback = `[GREENFIELD_EMPTY_MENU]
Current menu is EMPTY. Return ONLY one JSON object: { "menu": [ ...complete tree... ], "notes": [], "warnings": [] }
Each node needs id, type_form, labels (vi/en/zh where applicable), table_name for grids, children for groups.
[/GREENFIELD_EMPTY_MENU]
`

// ResolveMenuJsonContractForLocal loads master + runtime menu contracts.
func ResolveMenuJsonContractForLocal(cfg config.AppConfig) string {
	cap := localSlotContractChars(cfg)
	master := readKnowledgeFile(cfg.AI.MenuMasterPromptPath, cap)
	if master != "" {
		runtime := loadKnowledgeFileByName(cfg, "ai_menu_runtime_compact.md", minIntCap(2400, cap/3))
		if runtime != "" {
			return truncateStr(master+"\n\n"+runtime, cap)
		}
		return truncateStr(master, cap)
	}
	return menuJSONContractFallback
}

// ResolveMenuJsonContractForGreenfield loads structure-first contracts for empty menu.
func ResolveMenuJsonContractForGreenfield(cfg config.AppConfig) string {
	cap := localSlotContractChars(cfg)
	parts := []string{
		loadKnowledgeFileByName(cfg, "ai_menu_structure_runtime.md", minIntCap(3600, cap/2)),
		loadKnowledgeFileByName(cfg, "ai_menu_dev_workflow_compact.md", minIntCap(2800, cap/3)),
		loadKnowledgeFileByName(cfg, "ai_menu_runtime_compact.md", minIntCap(2000, cap/4)),
		loadKnowledgeFileByName(cfg, "ai_menu_greenfield_worker_contract.md", 1200),
		loadKnowledgeFileByName(cfg, "ai_greenfield_pipeline_contract.md", 1400),
	}
	var sb strings.Builder
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if sb.Len() > 0 {
			sb.WriteString("\n\n")
		}
		sb.WriteString(p)
	}
	combined := strings.TrimSpace(sb.String())
	if combined != "" {
		return truncateStr(combined, cap)
	}
	return greenfieldMenuContractFallback
}

// ResolveCodeJsonContractForLocal loads code editor contracts.
func ResolveCodeJsonContractForLocal(cfg config.AppConfig) string {
	cap := localSlotContractChars(cfg)
	master := readKnowledgeFile(cfg.AI.CodeMasterPromptPath, cap)
	if master != "" {
		runtime := loadKnowledgeFileByName(cfg, "ai_code_runtime_compact.md", minIntCap(2400, cap/3))
		if runtime != "" {
			return truncateStr(master+"\n\n"+runtime, cap)
		}
		return truncateStr(master, cap)
	}
	return frontendCodeContract
}

// BuildMenuKnowledgeBlock loads allowlisted menu knowledge markdown files.
func BuildMenuKnowledgeBlock(cfg config.AppConfig, maxTotal int) string {
	return buildKnowledgeBlock(cfg, menuKnowledgeAllowlist, maxTotal, "MENU KNOWLEDGE")
}

// BuildCodeKnowledgeBlock loads allowlisted code knowledge markdown files.
func BuildCodeKnowledgeBlock(cfg config.AppConfig, maxTotal int) string {
	return buildKnowledgeBlock(cfg, codeKnowledgeAllowlist, maxTotal, "DYNAMICCODE KNOWLEDGE")
}

func buildKnowledgeBlock(cfg config.AppConfig, allowlist []string, maxTotal int, title string) string {
	var sections []string
	remaining := maxTotal
	for _, name := range allowlist {
		if remaining <= 0 {
			break
		}
		text := loadKnowledgeFileByName(cfg, name, minIntCap(60000, remaining))
		if text == "" {
			continue
		}
		section := "### " + name + "\n" + text
		sections = append(sections, section)
		remaining -= len(section)
	}
	if len(sections) == 0 {
		return ""
	}
	return "## AUTO-LOADED " + title + "\n" + strings.Join(sections, "\n\n")
}

func loadKnowledgeFileByName(cfg config.AppConfig, name string, maxChars int) string {
	path := filepath.Join(cfg.AI.ContextDir, name)
	return readKnowledgeFile(path, maxChars)
}

func readKnowledgeFile(path string, maxChars int) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	text := strings.TrimSpace(string(data))
	if text == "" {
		return ""
	}
	return truncateStr(text, maxChars)
}

func localSlotContractChars(cfg config.AppConfig) int {
	cap := cfg.EffectiveCodeStreamPromptCap() / 2
	if cap < 6000 {
		cap = 6000
	}
	return cap
}

func minIntCap(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// --- menu editor apply cache (GET /ai-code-stream/menu-editor-apply) ---

type menuEditorApplyEntry struct {
	menuJSON   string
	mergeStats map[string]any
	createdAt  int64
}

var (
	menuApplyMu    sync.Mutex
	menuApplyCache = map[string]menuEditorApplyEntry{}
)

const menuApplyCacheTTL = 15 * time.Minute
const menuApplyDeferChars = 120_000

func CacheMenuEditorApplyPayload(requestID, mergedMenu string, mergeStats map[string]any) {
	requestID = strings.TrimSpace(requestID)
	mergedMenu = strings.TrimSpace(mergedMenu)
	if requestID == "" || mergedMenu == "" {
		return
	}
	menuApplyMu.Lock()
	defer menuApplyMu.Unlock()
	pruneMenuApplyCacheLocked()
	statsCopy := map[string]any{}
	for k, v := range mergeStats {
		statsCopy[k] = v
	}
	menuApplyCache[requestID] = menuEditorApplyEntry{
		menuJSON: mergedMenu, mergeStats: statsCopy, createdAt: time.Now().UnixMilli(),
	}
}

func TakeMenuEditorApplyPayload(requestID string) (menuJSON string, mergeStats map[string]any, ok bool) {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return "", nil, false
	}
	menuApplyMu.Lock()
	defer menuApplyMu.Unlock()
	pruneMenuApplyCacheLocked()
	entry, exists := menuApplyCache[requestID]
	if !exists || strings.TrimSpace(entry.menuJSON) == "" {
		return "", nil, false
	}
	delete(menuApplyCache, requestID)
	statsCopy := map[string]any{}
	for k, v := range entry.mergeStats {
		statsCopy[k] = v
	}
	return entry.menuJSON, statsCopy, true
}

func pruneMenuApplyCacheLocked() {
	now := time.Now().UnixMilli()
	for id, entry := range menuApplyCache {
		if now-entry.createdAt > menuApplyCacheTTL.Milliseconds() {
			delete(menuApplyCache, id)
		}
	}
}
