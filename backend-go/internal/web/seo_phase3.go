package web

import (
	"encoding/json"
	"net/url"
	"strings"
)

var supportedSSRLangs = []string{"vi", "en", "zh"}

type hreflangLink struct {
	Lang string
	Href string
}

func localeTag(lang string) string {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case "en":
		return "en_US"
	case "zh":
		return "zh_CN"
	default:
		return "vi_VN"
	}
}

func breadcrumbMenuLabels(lang string) (home, services string) {
	switch resolveLang(map[string]string{"hl": lang}) {
	case "en":
		return "Home", "Services"
	case "zh":
		return "首页", "服务"
	default:
		return "Trang chủ", "Dịch vụ"
	}
}

func buildLocalizedURL(baseURL, pagePath, lang string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	path := pagePath
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u := base + path
	lang = resolveLang(map[string]string{"hl": lang})
	if lang == "" || lang == "vi" {
		return u
	}
	sep := "?"
	if strings.Contains(u, "?") {
		sep = "&"
	}
	return u + sep + "hl=" + url.QueryEscape(lang)
}

func buildHreflangLinks(baseURL, pagePath string) []hreflangLink {
	out := make([]hreflangLink, 0, len(supportedSSRLangs)+1)
	for _, lang := range supportedSSRLangs {
		out = append(out, hreflangLink{
			Lang: lang,
			Href: buildLocalizedURL(baseURL, pagePath, lang),
		})
	}
	out = append(out, hreflangLink{
		Lang: "x-default",
		Href: buildLocalizedURL(baseURL, pagePath, "vi"),
	})
	return out
}

func renderHreflangLinks(links []hreflangLink) string {
	var b strings.Builder
	for _, link := range links {
		if strings.TrimSpace(link.Href) == "" {
			continue
		}
		b.WriteString(`<link rel="alternate" hreflang="`)
		b.WriteString(htmlEsc(link.Lang))
		b.WriteString(`" href="`)
		b.WriteString(htmlEsc(link.Href))
		b.WriteString(`" />`)
		b.WriteByte('\n')
	}
	return b.String()
}

func injectHreflangLinks(html *string, links []hreflangLink) {
	block := strings.TrimSpace(renderHreflangLinks(links))
	if block == "" {
		return
	}
	lower := strings.ToLower(*html)
	if pos := strings.Index(lower, "</head>"); pos >= 0 {
		*html = (*html)[:pos] + block + "\n" + (*html)[pos:]
	}
}

func replaceHTMLLang(html *string, lang string) {
	lang = resolveLang(map[string]string{"hl": lang})
	if lang == "" {
		lang = "vi"
	}
	lower := strings.ToLower(*html)
	start := strings.Index(lower, "<html")
	if start < 0 {
		return
	}
	relEnd := strings.Index((*html)[start:], ">")
	if relEnd < 0 {
		return
	}
	end := start + relEnd
	tag := (*html)[start:end]
	if strings.Contains(strings.ToLower(tag), `lang="`) {
		tag = replaceAttrValue(tag, `lang="`, lang+`"`)
	} else {
		tag = strings.TrimRight(tag, ">") + ` lang="` + htmlEsc(lang) + `"`
	}
	*html = (*html)[:start] + tag + (*html)[end:]
}

func replaceAttrValue(tag, attrPrefix, newSuffix string) string {
	lower := strings.ToLower(tag)
	idx := strings.Index(lower, strings.ToLower(attrPrefix))
	if idx < 0 {
		return tag
	}
	start := idx + len(attrPrefix)
	rest := tag[start:]
	if q := strings.Index(rest, `"`); q >= 0 {
		return tag[:start] + newSuffix + rest[q+1:]
	}
	return tag
}

func injectMetaProperty(html *string, property, content string) {
	if strings.TrimSpace(content) == "" {
		return
	}
	block := `<meta property="` + htmlEsc(property) + `" content="` + htmlEsc(content) + `" />` + "\n"
	lower := strings.ToLower(*html)
	if pos := strings.Index(lower, "</head>"); pos >= 0 {
		*html = (*html)[:pos] + block + (*html)[pos:]
	}
}

func injectOGLocaleAlternates(html *string, currentLang string) {
	current := localeTag(currentLang)
	for _, lang := range supportedSSRLangs {
		tag := localeTag(lang)
		if tag == current {
			continue
		}
		injectMetaProperty(html, "og:locale:alternate", tag)
	}
}

func categoryDisplayName(cat map[string]any, lang string) string {
	if cat == nil {
		return ""
	}
	if lang != "vi" {
		if v := recordStr(cat, "title_"+lang); v != "" {
			return v
		}
		if v := recordStr(cat, "category_"+lang); v != "" {
			return v
		}
	}
	for _, key := range []string{"title", "name", "category"} {
		if v := recordStr(cat, key); v != "" {
			return v
		}
	}
	return ""
}

func findCategoryTitle(categories []any, serviceCode, lang string) string {
	code := strings.TrimSpace(strings.ToLower(serviceCode))
	if code == "" {
		return ""
	}
	for _, item := range categories {
		cat, ok := item.(map[string]any)
		if !ok {
			continue
		}
		sc := strings.TrimSpace(strings.ToLower(recordStr(cat, "service_code")))
		if sc == "" {
			sc = strings.TrimSpace(strings.ToLower(recordStr(cat, "slug")))
		}
		if sc != code {
			continue
		}
		name := recordStr(cat, "category")
		if lang != "vi" {
			if v := recordStr(cat, "category_"+lang); v != "" {
				name = v
			}
		}
		if name == "" {
			name = recordStr(cat, "description")
		}
		return name
	}
	return ""
}

func buildBreadcrumbList(baseURL, pagePath, lang, defaultCategory string, initialData map[string]any, categories []any) map[string]any {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if defaultCategory == "" {
		defaultCategory = strings.TrimSpace(recordStr(initialData, "serviceCode"))
	}
	if defaultCategory == "" {
		defaultCategory = "dich-vu"
	}

	homeLabel, servicesLabel := breadcrumbMenuLabels(lang)
	if name := findCategoryTitle(categories, defaultCategory, lang); name != "" {
		servicesLabel = name
	}
	items := []map[string]any{
		breadcrumbListItem(1, homeLabel, baseURL+"/"),
		breadcrumbListItem(2, servicesLabel, baseURL+"/"+url.PathEscape(defaultCategory)),
	}

	nextPos := 3
	pageURL := baseURL + pagePath
	if !strings.HasPrefix(pagePath, "/") {
		pageURL = baseURL + "/" + strings.TrimPrefix(pagePath, "/")
	}

	if detail, ok := initialData["serviceDetail"].(map[string]any); ok && detail != nil {
		serviceType := strings.TrimSpace(recordStr(detail, "service_type"))
		if serviceType == "" {
			serviceType = strings.TrimSpace(recordStr(initialData, "serviceCode"))
		}
		if serviceType != "" && !strings.EqualFold(serviceType, defaultCategory) {
			catName := findCategoryTitle(categories, serviceType, lang)
			if catName == "" {
				catName = serviceType
			}
			items = append(items, breadcrumbListItem(nextPos, catName, baseURL+"/"+url.PathEscape(serviceType)))
			nextPos++
		}
		title := recordStr(detail, "title")
		if title == "" {
			title = recordStr(detail, "name")
		}
		if title != "" {
			items = append(items, breadcrumbListItem(nextPos, title, pageURL))
		}
	} else if cat, ok := initialData["serviceCategory"].(map[string]any); ok && cat != nil {
		code := recordStr(cat, "service_code")
		if code == "" {
			code = strings.TrimSpace(recordStr(initialData, "serviceCode"))
		}
		name := categoryDisplayName(cat, lang)
		if name != "" && code != "" {
			items = append(items, breadcrumbListItem(nextPos, name, baseURL+"/"+url.PathEscape(code)))
		}
	}

	return map[string]any{
		"@type":           "BreadcrumbList",
		"itemListElement": items,
	}
}

func breadcrumbListItem(position int, name, itemURL string) map[string]any {
	return map[string]any{
		"@type":    "ListItem",
		"position": position,
		"name":     name,
		"item":     itemURL,
	}
}

func buildStructuredDataGraph(ctx *preprocessCtx) string {
	primary := buildPrimaryJSONLD(ctx)
	breadcrumb := buildBreadcrumbList(
		ctx.BaseURL,
		ctx.PagePath,
		ctx.Lang,
		ctx.DefaultCategory,
		ctx.InitialData,
		ctx.Categories,
	)

	graph := []map[string]any{primary, breadcrumb}
	payload := map[string]any{
		"@context": "https://schema.org",
		"@graph":   graph,
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return buildJSONLD(ctx)
	}
	return string(raw)
}

func buildPrimaryJSONLD(ctx *preprocessCtx) map[string]any {
	pageType := strings.TrimSpace(ctx.PageType)
	if pageType == "" {
		pageType = "WebPage"
	}
	lang := resolveLang(map[string]string{"hl": ctx.Lang})
	if lang == "" {
		lang = "vi"
	}
	if strings.EqualFold(pageType, "article") {
		node := map[string]any{
			"@type":            "Article",
			"headline":         ctx.Title,
			"url":              ctx.Canonical,
			"description":      ctx.Description,
			"inLanguage":       lang,
			"mainEntityOfPage": ctx.Canonical,
			"image":            ctx.Image,
			"publisher": map[string]any{
				"@type": "Organization",
				"name":  ctx.SiteName,
				"url":   ctx.SiteName,
				"logo": map[string]any{
					"@type": "ImageObject",
					"url":   ctx.Logo,
				},
			},
		}
		if ctx.Author != "" {
			node["author"] = map[string]any{"@type": "Person", "name": ctx.Author}
		}
		if ctx.PublishedAt != "" {
			node["datePublished"] = ctx.PublishedAt
			node["dateModified"] = ctx.PublishedAt
		}
		return node
	}

	return map[string]any{
		"@type":       "WebPage",
		"headline":    ctx.Title,
		"url":         ctx.Canonical,
		"description": ctx.Description,
		"inLanguage":  lang,
		"image": map[string]any{
			"@type":  "ImageObject",
			"url":    ctx.Image,
			"height": "1000",
			"width":  "1920",
		},
		"publisher": map[string]any{
			"@type": "Organization",
			"name":  ctx.SiteName,
			"url":   ctx.SiteName,
			"logo": map[string]any{
				"@type":  "ImageObject",
				"url":    ctx.Logo,
				"width":  "506",
				"height": "132",
			},
		},
	}
}
