package web

import (
	"fmt"
	"strings"
)

// Thymeleaf placeholders in shipped index.html must be resolved before React boots.
// Java uses templateEngine.process(); Go mirrors Rust string preprocessing.

func finalizeThymeleafHTML(html *string, ctx *preprocessCtx) {
	fixGtagAsyncScript(html, ctx.GTag)
	removeThymeleafBootstrapScripts(html)
	stripThymeleafExpressions(html)
}

func removeThymeleafBootstrapScripts(html *string) {
	markers := []string{
		"/*[[${meta}]]*/",
		"/*[[${__INITIAL_DATA__}]]*/",
		"/*[[${menus}]]*/",
	}
	for _, marker := range markers {
		for strings.Contains(*html, marker) {
			idx := strings.Index(*html, marker)
			if idx < 0 {
				break
			}
			scriptStart := strings.LastIndex((*html)[:idx], "<script")
			if scriptStart < 0 {
				break
			}
			endRel := strings.Index((*html)[idx:], "</script>")
			if endRel < 0 {
				break
			}
			end := idx + endRel + len("</script>")
			*html = (*html)[:scriptStart] + (*html)[end:]
		}
	}
}

func stripThymeleafExpressions(html *string) {
	for _, attr := range []string{
		"th:name", "th:attr", "th:inline", "th:src", "th:content", "th:href", "th:text",
	} {
		stripThAttrs(html, attr)
	}
	// Remove unresolved Thymeleaf inline fragments that break JSON-LD / scripts.
	for {
		start := strings.Index(*html, "[[${")
		if start < 0 {
			break
		}
		end := strings.Index((*html)[start:], "}]]")
		if end < 0 {
			break
		}
		*html = (*html)[:start] + `""` + (*html)[start+end+3:]
	}
	for strings.Contains(*html, "${meta.") {
		start := strings.Index(*html, "${meta.")
		end := strings.Index((*html)[start:], "}")
		if end < 0 {
			break
		}
		*html = (*html)[:start] + `""` + (*html)[start+end+1:]
	}
}

func stripThAttrs(html *string, attr string) {
	for {
		pos := strings.Index(*html, attr)
		if pos < 0 {
			return
		}
		q1 := strings.Index((*html)[pos:], `"`)
		if q1 < 0 {
			return
		}
		q1 += pos + 1
		q2Rel := strings.Index((*html)[q1:], `"`)
		if q2Rel < 0 {
			return
		}
		end := q1 + q2Rel + 1
		*html = (*html)[:pos] + (*html)[end:]
	}
}

func fixGtagAsyncScript(html *string, gtag string) {
	pos := strings.Index(*html, "googletagmanager.com/gtag/js")
	if pos < 0 {
		return
	}
	scriptStart := strings.LastIndex((*html)[:pos], "<script")
	if scriptStart < 0 {
		return
	}
	endRel := strings.Index((*html)[scriptStart:], "</script>")
	if endRel < 0 {
		return
	}
	end := scriptStart + endRel + len("</script>")
	if strings.TrimSpace(gtag) == "" {
		*html = (*html)[:scriptStart] + (*html)[end:]
		return
	}
	src := "https://www.googletagmanager.com/gtag/js?id=" + htmlEsc(gtag)
	*html = (*html)[:scriptStart] + `<script async src="` + src + `"></script>` + (*html)[end:]
}

func normalizeVoidOpenTag(tag string) string {
	tag = strings.TrimSpace(tag)
	tag = strings.TrimSuffix(tag, ">")
	tag = strings.TrimSpace(tag)
	tag = strings.TrimSuffix(tag, "/")
	return strings.TrimSpace(tag)
}

func replaceMetaContent(html *string, nameAttr, val string) {
	replaceTagByAttr(html, "meta", `name="`+nameAttr+`"`, func(tag string) string {
		return strings.TrimSpace(removeAttrSetContent(normalizeVoidOpenTag(tag), val)) + " />"
	})
}

func replaceOGContent(html *string, property, val string) {
	replaceTagByAttr(html, "meta", `property="`+property+`"`, func(tag string) string {
		return strings.TrimSpace(removeAttrSetContent(normalizeVoidOpenTag(tag), val)) + " />"
	})
}

func replaceLinkHref(html *string, rel, href string) {
	replaceTagByAttr(html, "link", `rel="`+rel+`"`, func(tag string) string {
		return strings.TrimSpace(removeAttrSetHref(normalizeVoidOpenTag(tag), href)) + " />"
	})
}

func replaceTagByAttr(html *string, tagName, attrNeedle string, build func(tag string) string) {
	lowerTag := strings.ToLower(tagName)
	needleLower := strings.ToLower(attrNeedle)
	searchFrom := 0
	for {
		pos := strings.Index(strings.ToLower((*html)[searchFrom:]), needleLower)
		if pos < 0 {
			return
		}
		pos += searchFrom
		// og:image must not match og:image:alt
		if strings.HasPrefix(needleLower, `property="og:image"`) {
			after := pos + len(attrNeedle)
			if after < len(*html) && (*html)[after] == ':' {
				searchFrom = pos + 1
				continue
			}
		}
		tagStart := strings.LastIndex(strings.ToLower((*html)[:pos]), "<"+lowerTag)
		if tagStart < 0 {
			searchFrom = pos + 1
			continue
		}
		endRel := strings.Index((*html)[pos:], ">")
		if endRel < 0 {
			return
		}
		end := pos + endRel + 1 // consume closing >
		tag := (*html)[tagStart:end]
		newTag := build(tag)
		*html = (*html)[:tagStart] + newTag + (*html)[end:]
		return
	}
}

func buildItemListElements(list []any, protocol, host, serviceType string) []map[string]any {
	maxItems := len(list)
	if maxItems > 10 {
		maxItems = 10
	}
	out := make([]map[string]any, 0, maxItems)
	for i := 0; i < maxItems; i++ {
		row, ok := list[i].(map[string]any)
		if !ok {
			continue
		}
		title := recordStr(row, "title")
		if title == "" {
			title = recordStr(row, "title_vi")
		}
		slug := strings.TrimSuffix(strings.TrimSpace(recordStr(row, "slug")), ".shtml")
		svcType := recordStr(row, "service_type")
		if svcType == "" {
			svcType = serviceType
		}
		itemURL := ""
		if slug != "" && svcType != "" {
			itemURL = fmt.Sprintf("%s://%s/%s/%s", protocol, host, svcType, slug)
		}
		out = append(out, map[string]any{
			"@type":    "ListItem",
			"position": i + 1,
			"name":     title,
			"item": map[string]any{
				"@type": "Article",
				"name":  title,
				"url":   itemURL,
			},
		})
	}
	return out
}

func enrichInitialData(initialData map[string]any, listing map[string]any, protocol, host string) {
	for k, v := range listing {
		initialData[k] = v
	}
	if raw, ok := listing["serviceDetailList"].([]any); ok && len(raw) > 0 {
		svcType, _ := listing["service_type"].(string)
		initialData["itemListElements"] = buildItemListElements(raw, protocol, host, svcType)
	}
}
