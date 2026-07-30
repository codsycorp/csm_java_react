package services

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	aiConversationTableGo = "ai_conversation_history_go"
	aiScopeUser           = "user"
	aiScopeAppShared      = "app_shared"
	aiScopeCodeTarget     = "code_target_shared"

	aiConversationMaxRowsPerScope = 80
	aiConversationReqCapChars     = 2000
	aiConversationRespCapChars    = 6000
)

type conversationTurnRow struct {
	ID            string
	TurnID        string
	UserID        string
	AppID         string
	ContextType   string
	Scope         string
	CodeTargetKey string
	PName         string
	PType         string
	UserRequest   string
	AIResponse    string
	CreatedAtMs   int64
	Metadata      map[string]any
}

func InjectScopedConversationContextIntoRequest(rm *data.RecordManager, req *CodeStreamRequest, maxChars int) string {
	if req == nil {
		return ""
	}
	if req.EditorMetadata == nil {
		req.EditorMetadata = map[string]any{}
	}
	block := BuildScopedConversationContext(
		rm,
		req.AppID,
		req.UserID,
		req.ContextType,
		req.TargetPName,
		req.TargetPType,
		maxChars,
	)
	if block == "" {
		req.EditorMetadata["__sessionMemorySource"] = "none"
		req.EditorMetadata["__sessionMemoryUsedChars"] = 0
		return ""
	}
	req.EditorMetadata["__conversationContext"] = block
	req.EditorMetadata["__sessionMemorySource"] = "scoped_injected"
	req.EditorMetadata["__sessionMemoryUsedChars"] = len(block)
	return block
}

// ConversationMemoryTelemetryFromMetadata extracts current session-memory telemetry.
func ConversationMemoryTelemetryFromMetadata(meta map[string]any) (source string, capChars int, usedChars int) {
	if meta == nil {
		return "none", 0, 0
	}
	source = strings.TrimSpace(fmt.Sprint(meta["__sessionMemorySource"]))
	capChars = conversationIntFromAny(meta["__sessionMemoryCap"])
	usedChars = conversationIntFromAny(meta["__sessionMemoryUsedChars"])
	if source == "" {
		source = "none"
	}
	if usedChars <= 0 {
		if block := strings.TrimSpace(fmt.Sprint(meta["__conversationContext"])); block != "" {
			usedChars = len(block)
			if source == "none" {
				source = "scoped_injected"
			}
		}
	}
	return source, capChars, usedChars
}

func conversationIntFromAny(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int32:
		return int(t)
	case int64:
		return int(t)
	case float32:
		return int(t)
	case float64:
		return int(t)
	default:
		s := strings.TrimSpace(fmt.Sprint(v))
		if s == "" || s == "<nil>" {
			return 0
		}
		var out int
		_, _ = fmt.Sscanf(s, "%d", &out)
		return out
	}
}

func RecordScopedConversationTurnFromRequest(rm *data.RecordManager, req *CodeStreamRequest, assistantResponse string, metadata map[string]any) {
	if req == nil {
		return
	}
	RecordScopedConversationTurn(
		rm,
		req.AppID,
		req.UserID,
		req.ContextType,
		req.TargetPName,
		req.TargetPType,
		req.Message,
		assistantResponse,
		metadata,
	)
}

func RecordScopedConversationTurn(
	rm *data.RecordManager,
	appID string,
	userID string,
	contextType string,
	pName string,
	pType string,
	userRequest string,
	assistantResponse string,
	metadata map[string]any,
) {
	if rm == nil {
		return
	}
	safeAppID := strings.TrimSpace(appID)
	if safeAppID == "" {
		safeAppID = "csm"
	}
	safeUserID := strings.TrimSpace(userID)
	if safeUserID == "" {
		safeUserID = "anonymous"
	}
	safeContextType := strings.TrimSpace(contextType)
	if safeContextType == "" {
		safeContextType = "code"
	}
	requestText := truncateConversationText(userRequest, aiConversationReqCapChars)
	responseText := truncateConversationText(assistantResponse, aiConversationRespCapChars)
	if !isMeaningfulConversationTurn(requestText, responseText) {
		return
	}

	codeTargetKey := buildConversationCodeTargetKey(pName, pType)
	createdAtMs := time.Now().UnixMilli()
	baseMeta := copyConversationMetadata(metadata)
	baseMeta["pName"] = strings.TrimSpace(pName)
	baseMeta["pType"] = strings.TrimSpace(pType)

	scopes := []struct {
		scope       string
		scopeUserID string
		scopeTarget string
		scopePName  string
		scopePType  string
	}{
		{scope: aiScopeUser, scopeUserID: safeUserID, scopeTarget: "", scopePName: strings.TrimSpace(pName), scopePType: strings.TrimSpace(pType)},
		{scope: aiScopeAppShared, scopeUserID: "shared", scopeTarget: "", scopePName: "", scopePType: ""},
	}
	if codeTargetKey != "" {
		scopes = append(scopes, struct {
			scope       string
			scopeUserID string
			scopeTarget string
			scopePName  string
			scopePType  string
		}{
			scope: aiScopeCodeTarget, scopeUserID: "shared", scopeTarget: codeTargetKey,
			scopePName: strings.TrimSpace(pName), scopePType: strings.TrimSpace(pType),
		})
	}

	for _, scope := range scopes {
		turnID := uuid.NewString()
		row := map[string]any{
			"id":              buildConversationRowID(turnID, scope.scope, scope.scopeTarget),
			"turn_id":         turnID,
			"user_id":         scope.scopeUserID,
			"app_id":          safeAppID,
			"context_type":    safeContextType,
			"scope":           scope.scope,
			"code_target_key": scope.scopeTarget,
			"p_name":          scope.scopePName,
			"p_type":          scope.scopePType,
			"user_request":    requestText,
			"ai_response":     responseText,
			"created_at_ms":   createdAtMs,
			"timestamp":       createdAtMs,
			"metadata":        baseMeta,
		}
		_, _ = rm.CreateRecord(safeAppID, aiConversationTableGo, row, []string{"id"})
		pruneConversationScopeRows(rm, safeAppID, safeContextType, scope.scopeUserID, scope.scope, scope.scopeTarget, aiConversationMaxRowsPerScope)
	}
}

func BuildScopedConversationContext(
	rm *data.RecordManager,
	appID string,
	userID string,
	contextType string,
	pName string,
	pType string,
	maxChars int,
) string {
	if rm == nil {
		return ""
	}
	safeAppID := strings.TrimSpace(appID)
	if safeAppID == "" {
		safeAppID = "csm"
	}
	safeUserID := strings.TrimSpace(userID)
	if safeUserID == "" {
		safeUserID = "anonymous"
	}
	safeContextType := strings.TrimSpace(contextType)
	if safeContextType == "" {
		safeContextType = "code"
	}
	if maxChars <= 0 {
		maxChars = 6000
	}

	rows := loadConversationRows(rm, safeAppID)
	if len(rows) == 0 {
		return ""
	}

	codeTargetKey := buildConversationCodeTargetKey(pName, pType)

	userTurns := filterConversationRows(rows, safeContextType, safeUserID, aiScopeUser, "")
	appSharedTurns := filterConversationRows(rows, safeContextType, "shared", aiScopeAppShared, "")
	codeTargetTurns := filterConversationRows(rows, safeContextType, "shared", aiScopeCodeTarget, codeTargetKey)

	return buildConversationContextBlock(userTurns, appSharedTurns, codeTargetTurns, maxChars)
}

func loadConversationRows(rm *data.RecordManager, appID string) []conversationTurnRow {
	result := rm.Filter(appID, aiConversationTableGo, model.SearchFilter{})
	rawRows := extractRowsFromFilterResult(result)
	out := make([]conversationTurnRow, 0, len(rawRows))
	for _, row := range rawRows {
		turn := mapConversationTurnRow(row)
		if turn.CreatedAtMs <= 0 {
			continue
		}
		if !isMeaningfulConversationTurn(turn.UserRequest, turn.AIResponse) {
			continue
		}
		out = append(out, turn)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAtMs < out[j].CreatedAtMs })
	return out
}

func filterConversationRows(rows []conversationTurnRow, contextType, userID, scope, codeTargetKey string) []conversationTurnRow {
	if len(rows) == 0 {
		return nil
	}
	out := make([]conversationTurnRow, 0, len(rows))
	for _, row := range rows {
		if row.ContextType != contextType || row.Scope != scope || row.UserID != userID {
			continue
		}
		if scope == aiScopeCodeTarget && codeTargetKey != "" {
			if row.CodeTargetKey != codeTargetKey {
				continue
			}
		}
		if scope == aiScopeCodeTarget && codeTargetKey == "" {
			continue
		}
		out = append(out, row)
	}
	return out
}

func buildConversationContextBlock(userTurns, appSharedTurns, codeTargetTurns []conversationTurnRow, maxChars int) string {
	sections := []struct {
		title string
		rows  []conversationTurnRow
	}{
		{title: "USER_MEMORY", rows: userTurns},
		{title: "CODE_TARGET_SHARED_MEMORY", rows: codeTargetTurns},
		{title: "APP_SHARED_MEMORY", rows: appSharedTurns},
	}

	var sb strings.Builder
	remaining := maxChars
	seen := map[string]struct{}{}
	for _, section := range sections {
		if len(section.rows) == 0 || remaining <= 120 {
			continue
		}
		block := renderConversationSection(section.title, section.rows, remaining, seen)
		if strings.TrimSpace(block) == "" {
			continue
		}
		if sb.Len() > 0 {
			sb.WriteString("\n\n")
		}
		sb.WriteString(block)
		remaining = maxChars - sb.Len()
	}
	return truncateConversationText(sb.String(), maxChars)
}

func renderConversationSection(title string, rows []conversationTurnRow, maxChars int, seen map[string]struct{}) string {
	if len(rows) == 0 || maxChars <= 80 {
		return ""
	}
	recentFull := 3
	olderSummary := 4
	switch title {
	case "CODE_TARGET_SHARED_MEMORY":
		recentFull = 4
		olderSummary = 3
	case "APP_SHARED_MEMORY":
		recentFull = 2
		olderSummary = 2
	}
	var sb strings.Builder
	sb.WriteString("## ")
	sb.WriteString(title)
	sb.WriteByte('\n')

	start := len(rows) - recentFull
	if start < 0 {
		start = 0
	}
	for i := start; i < len(rows); i++ {
		fp := conversationFingerprint(rows[i])
		if fp != "" {
			if _, ok := seen[fp]; ok {
				continue
			}
			seen[fp] = struct{}{}
		}
		line := fmt.Sprintf("- Q: %s\n  A: %s\n", truncateConversationText(rows[i].UserRequest, 180), truncateConversationText(rows[i].AIResponse, 320))
		if sb.Len()+len(line) > maxChars {
			break
		}
		sb.WriteString(line)
	}

	if start > 0 {
		summaryStart := start - olderSummary
		if summaryStart < 0 {
			summaryStart = 0
		}
		for i := summaryStart; i < start; i++ {
			fp := conversationFingerprint(rows[i])
			if fp != "" {
				if _, ok := seen[fp]; ok {
					continue
				}
				seen[fp] = struct{}{}
			}
			line := fmt.Sprintf("- [%s] %d chars -> %d chars\n", time.UnixMilli(rows[i].CreatedAtMs).Format("01-02 15:04"), len(rows[i].UserRequest), len(rows[i].AIResponse))
			if sb.Len()+len(line) > maxChars {
				break
			}
			sb.WriteString(line)
		}
	}

	return strings.TrimSpace(sb.String())
}

func pruneConversationScopeRows(rm *data.RecordManager, appID, contextType, userID, scope, codeTargetKey string, maxKeep int) {
	if rm == nil || maxKeep <= 0 {
		return
	}
	rows := loadConversationRows(rm, appID)
	if len(rows) <= maxKeep {
		return
	}
	matches := make([]conversationTurnRow, 0, len(rows))
	for _, row := range rows {
		if row.ContextType != contextType || row.UserID != userID || row.Scope != scope {
			continue
		}
		if scope == aiScopeCodeTarget && codeTargetKey != "" && row.CodeTargetKey != codeTargetKey {
			continue
		}
		matches = append(matches, row)
	}
	if len(matches) <= maxKeep {
		return
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].CreatedAtMs < matches[j].CreatedAtMs })
	toDelete := matches[:len(matches)-maxKeep]
	for _, row := range toDelete {
		record := map[string]any{"id": row.ID}
		_ = rm.DeleteRecord(appID, aiConversationTableGo, record)
	}
}

func extractRowsFromFilterResult(result map[string]any) []map[string]any {
	if len(result) == 0 {
		return nil
	}
	var raw []any
	if v, ok := result["rows"]; ok {
		raw, _ = v.([]any)
	}
	if len(raw) == 0 {
		if v, ok := result["data"]; ok {
			raw, _ = v.([]any)
		}
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, row)
	}
	return out
}

func mapConversationTurnRow(row map[string]any) conversationTurnRow {
	out := conversationTurnRow{
		ID:            strings.TrimSpace(conversationStringFromAny(row["id"])),
		TurnID:        strings.TrimSpace(conversationStringFromAny(row["turn_id"])),
		UserID:        strings.TrimSpace(conversationStringFromAny(row["user_id"])),
		AppID:         strings.TrimSpace(conversationStringFromAny(row["app_id"])),
		ContextType:   strings.TrimSpace(conversationStringFromAny(row["context_type"])),
		Scope:         strings.TrimSpace(conversationStringFromAny(row["scope"])),
		CodeTargetKey: strings.TrimSpace(conversationStringFromAny(row["code_target_key"])),
		PName:         strings.TrimSpace(conversationStringFromAny(row["p_name"])),
		PType:         strings.TrimSpace(conversationStringFromAny(row["p_type"])),
		UserRequest:   strings.TrimSpace(conversationStringFromAny(row["user_request"])),
		AIResponse:    strings.TrimSpace(conversationStringFromAny(row["ai_response"])),
		CreatedAtMs:   int64FromConversationAny(row["created_at_ms"]),
		Metadata:      map[string]any{},
	}
	if out.TurnID == "" {
		out.TurnID = out.ID
	}
	if out.CreatedAtMs <= 0 {
		out.CreatedAtMs = int64FromConversationAny(row["timestamp"])
	}
	if meta, ok := row["metadata"].(map[string]any); ok {
		out.Metadata = meta
	}
	return out
}

func int64FromConversationAny(v any) int64 {
	switch t := v.(type) {
	case int64:
		return t
	case int:
		return int64(t)
	case float64:
		return int64(t)
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0
		}
		var out int64
		for _, ch := range s {
			if ch < '0' || ch > '9' {
				return 0
			}
			out = out*10 + int64(ch-'0')
		}
		return out
	default:
		return 0
	}
}

func conversationStringFromAny(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

func copyConversationMetadata(metadata map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range metadata {
		out[k] = v
	}
	return out
}

func truncateConversationText(text string, maxChars int) string {
	v := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"))
	if v == "" {
		return ""
	}
	if maxChars <= 0 {
		maxChars = 256
	}
	runes := []rune(v)
	if len(runes) <= maxChars {
		return v
	}
	return string(runes[:maxChars]) + "..."
}

func isMeaningfulConversationTurn(userRequest, assistantResponse string) bool {
	return len(strings.TrimSpace(userRequest)) >= 8 || len(strings.TrimSpace(assistantResponse)) >= 8
}

func buildConversationCodeTargetKey(pName, pType string) string {
	n := strings.TrimSpace(strings.ToLower(pName))
	t := strings.TrimSpace(strings.ToLower(pType))
	if n == "" && t == "" {
		return ""
	}
	key := n + "::" + t
	key = strings.ReplaceAll(key, " ", "_")
	return key
}

func buildConversationRowID(turnID, scope, codeTargetKey string) string {
	if codeTargetKey == "" {
		return turnID + "::" + scope
	}
	return turnID + "::" + scope + "::" + codeTargetKey
}

func conversationFingerprint(row conversationTurnRow) string {
	req := strings.ToLower(strings.TrimSpace(truncateConversationText(row.UserRequest, 180)))
	res := strings.ToLower(strings.TrimSpace(truncateConversationText(row.AIResponse, 260)))
	if req == "" && res == "" {
		return ""
	}
	return req + "||" + res
}
