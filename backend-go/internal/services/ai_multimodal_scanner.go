package services

import (
	"encoding/json"
	"strings"
)

const (
	scopeMenuUI     = 0x01
	scopeCodeUI     = 0x02
	scopeUIUX       = 0x04
	scopeJSONSchema = 0x08
	scopeBusinessUI = 0x10
)

// AiAttachment is normalized attachment from frontend AiAssistantChat.
type AiAttachment struct {
	ID          string
	Name        string
	MimeType    string
	Size        int
	Kind        string
	TextContent string
	Summary     string
	ContextRole string
}

// MultimodalScanResult holds scanner output for orchestration + prompt.
type MultimodalScanResult struct {
	ScopeMask      int
	ScopeTags      []string
	ScopeSummary   string
	IngestMarkdown string
	CompactContext string
	ImageCount     int
	JSONCount      int
	MarkdownCount  int
	TextChars      int
	TotalCount     int
}

// ParseAttachmentsFromParams extracts attachments[] from SSE request body.
func ParseAttachmentsFromParams(params map[string]any) []AiAttachment {
	raw, ok := params["attachments"]
	if !ok {
		return nil
	}
	arr, ok := raw.([]any)
	if !ok {
		return nil
	}
	var out []AiAttachment
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		a := AiAttachment{
			ID:          paramString(m, "id", ""),
			Name:        paramString(m, "name", ""),
			MimeType:    firstNonEmpty(paramString(m, "mimeType", ""), paramString(m, "mime_type", "")),
			Kind:        paramString(m, "kind", ""),
			TextContent: firstNonEmpty(paramString(m, "textContent", ""), paramString(m, "text_content", "")),
			Summary:     paramString(m, "summary", ""),
			ContextRole: paramString(m, "contextRole", ""),
		}
		if v, ok := m["size"].(float64); ok {
			a.Size = int(v)
		}
		if a.Name != "" || a.TextContent != "" || a.Summary != "" {
			out = append(out, a)
		}
	}
	return out
}

// ScanAttachments analyzes attachments and builds scope mask + compact context.
func ScanAttachments(attachments []AiAttachment, contextType string) MultimodalScanResult {
	if len(attachments) == 0 {
		return MultimodalScanResult{}
	}
	var result MultimodalScanResult
	var digest strings.Builder
	digest.WriteString("## MULTIMODAL_ATTACHMENT_DIGEST\n")

	for _, a := range attachments {
		result.TotalCount++
		lowerMime := strings.ToLower(a.MimeType)
		lowerName := strings.ToLower(a.Name)
		lowerKind := strings.ToLower(a.Kind)

		switch {
		case strings.HasPrefix(lowerMime, "image/") || lowerKind == "image":
			result.ImageCount++
			result.ScopeMask |= scopeUIUX
			digest.WriteString("- [image] ")
			digest.WriteString(a.Name)
			if a.Summary != "" {
				digest.WriteString(": ")
				digest.WriteString(truncateStr(a.Summary, 200))
			}
			digest.WriteByte('\n')
		case strings.Contains(lowerMime, "json") || strings.HasSuffix(lowerName, ".json") || lowerKind == "json":
			result.JSONCount++
			result.ScopeMask |= scopeJSONSchema
			if contextType == "menu_json" {
				result.ScopeMask |= scopeMenuUI
			} else {
				result.ScopeMask |= scopeCodeUI
			}
			digest.WriteString("- [json] ")
			digest.WriteString(a.Name)
			digest.WriteByte('\n')
			if txt := strings.TrimSpace(a.TextContent); txt != "" {
				digest.WriteString(truncateStr(txt, 1200))
				digest.WriteString("\n")
				result.TextChars += len(txt)
			}
		case strings.Contains(lowerMime, "markdown") || strings.HasSuffix(lowerName, ".md") || lowerKind == "markdown":
			result.MarkdownCount++
			result.ScopeMask |= scopeBusinessUI
			digest.WriteString("- [md] ")
			digest.WriteString(a.Name)
			digest.WriteByte('\n')
			if txt := strings.TrimSpace(a.TextContent); txt != "" {
				digest.WriteString(truncateStr(txt, 1500))
				digest.WriteString("\n")
				result.TextChars += len(txt)
			}
		default:
			result.ScopeMask |= scopeBusinessUI
			digest.WriteString("- [file] ")
			digest.WriteString(a.Name)
			if a.Summary != "" {
				digest.WriteString(": ")
				digest.WriteString(truncateStr(a.Summary, 300))
			}
			digest.WriteByte('\n')
			if txt := strings.TrimSpace(a.TextContent); txt != "" {
				digest.WriteString(truncateStr(txt, 800))
				digest.WriteString("\n")
				result.TextChars += len(txt)
			}
		}
	}
	digest.WriteString("[/MULTIMODAL_ATTACHMENT_DIGEST]\n")
	result.ScopeTags = scopeTagsFromMask(result.ScopeMask)
	result.ScopeSummary = scopeSummaryFromScannerMask(result.ScopeMask)
	result.IngestMarkdown = digest.String()
	result.CompactContext = truncateStr(digest.String(), 6000)
	return result
}

func scopeTagsFromMask(mask int) []string {
	var tags []string
	if mask&scopeMenuUI != 0 {
		tags = append(tags, "scope_menu")
	}
	if mask&scopeCodeUI != 0 {
		tags = append(tags, "scope_code")
	}
	if mask&scopeUIUX != 0 {
		tags = append(tags, "scope_ui")
	}
	if mask&scopeJSONSchema != 0 {
		tags = append(tags, "scope_json_schema")
	}
	if mask&scopeBusinessUI != 0 {
		tags = append(tags, "scope_business")
	}
	return tags
}

func scopeSummaryFromScannerMask(mask int) string {
	parts := scopeTagsFromMask(mask)
	if len(parts) == 0 {
		return "no_attachments"
	}
	return strings.Join(parts, "+")
}

// AttachmentIntakeSSE builds attachment_intake event.
func AttachmentIntakeSSE(req *CodeStreamRequest, scan MultimodalScanResult) map[string]any {
	return map[string]any{
		"stage": "attachment_intake", "status": "completed", "requestId": req.RequestID,
		"total": scan.TotalCount, "images": scan.ImageCount, "json": scan.JSONCount,
		"markdown": scan.MarkdownCount, "textChars": scan.TextChars,
		"scopeMask": scan.ScopeMask, "scopeSummary": scan.ScopeSummary,
		"message": "Normalized inline attachments",
	}
}

// MultimodalRouteGuard checks if image attachments need vision (blocked without local vision).
func MultimodalRouteGuard(scan MultimodalScanResult, visionEnabled bool) (blocked bool, reasonCode string) {
	if scan.ImageCount == 0 {
		return false, ""
	}
	if !visionEnabled {
		return true, "blocked_missing_local_vision"
	}
	return false, ""
}

// BlockedMultimodalSSE emits blocked stage for missing vision.
func BlockedMultimodalSSE(req *CodeStreamRequest, reasonCode string) map[string]any {
	return map[string]any{
		"stage": "blocked", "status": "blocked", "requestId": req.RequestID,
		"reason_code": reasonCode,
		"message":     "Ảnh đính kèm cần local vision — chưa bật trên Go server.",
	}
}

// AttachmentsJSONForDebug serializes attachment meta for logging.
func AttachmentsJSONForDebug(attachments []AiAttachment) string {
	if len(attachments) == 0 {
		return "[]"
	}
	b, _ := json.Marshal(attachments)
	return string(b)
}
