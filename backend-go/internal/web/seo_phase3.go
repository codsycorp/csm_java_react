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

func injectMetaName(html *string, name, content string) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(content) == "" {
		return
	}
	block := `<meta name="` + htmlEsc(name) + `" content="` + htmlEsc(content) + `" />` + "\n"
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

	graph := []map[string]any{buildWebSiteJSONLD(ctx), primary, breadcrumb}
	if itemList := buildItemListJSONLD(ctx); itemList != nil {
		graph = append(graph, itemList)
	}
	if faq := buildFAQPageJSONLD(ctx); faq != nil {
		graph = append(graph, faq)
	}
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

func buildWebSiteJSONLD(ctx *preprocessCtx) map[string]any {
	lang := resolveLang(map[string]string{"hl": ctx.Lang})
	if lang == "" {
		lang = "vi"
	}
	base := strings.TrimRight(strings.TrimSpace(ctx.BaseURL), "/")
	searchTarget := base + `/?q={search_term_string}`

	return map[string]any{
		"@type":       "WebSite",
		"url":         base + "/",
		"name":        ctx.Title,
		"inLanguage":  lang,
		"description": ctx.Description,
		"publisher": map[string]any{
			"@type": "Organization",
			"name":  ctx.SiteName,
			"url":   base + "/",
		},
		"potentialAction": map[string]any{
			"@type":       "SearchAction",
			"target":      searchTarget,
			"query-input": "required name=search_term_string",
		},
	}
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
		}
		if ctx.ModifiedAt != "" {
			node["dateModified"] = ctx.ModifiedAt
		} else if ctx.PublishedAt != "" {
			node["dateModified"] = ctx.PublishedAt
		}
		return node
	}

	pageSchemaType := "WebPage"
	if hasServiceList(ctx.InitialData) {
		pageSchemaType = "CollectionPage"
	}

	return map[string]any{
		"@type":       pageSchemaType,
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

func hasServiceList(initialData map[string]any) bool {
	if initialData == nil {
		return false
	}
	rows, ok := initialData["serviceDetailList"].([]any)
	return ok && len(rows) > 0
}

func buildItemListJSONLD(ctx *preprocessCtx) map[string]any {
	if ctx == nil || ctx.InitialData == nil {
		return nil
	}
	rows, ok := ctx.InitialData["serviceDetailList"].([]any)
	if !ok || len(rows) == 0 {
		return nil
	}

	base := strings.TrimRight(strings.TrimSpace(ctx.BaseURL), "/")
	items := make([]map[string]any, 0, 20)
	seen := map[string]struct{}{}

	for _, row := range rows {
		m, ok := row.(map[string]any)
		if !ok || m == nil {
			continue
		}
		slug := strings.TrimSpace(recordStr(m, "slug"))
		if slug == "" {
			continue
		}
		svcType := strings.TrimSpace(recordStr(m, "service_type"))
		path := "/" + url.PathEscape(slug)
		if svcType != "" {
			path = "/" + url.PathEscape(svcType) + "/" + url.PathEscape(slug)
		}
		itemURL := base + canonicalSEOPath(path)
		if _, exists := seen[itemURL]; exists {
			continue
		}
		seen[itemURL] = struct{}{}

		title := strings.TrimSpace(recordStr(m, "title"))
		if title == "" {
			title = strings.TrimSpace(recordStr(m, "name"))
		}
		if title == "" {
			title = slug
		}

		items = append(items, map[string]any{
			"@type":    "ListItem",
			"position": len(items) + 1,
			"url":      itemURL,
			"name":     title,
		})
		if len(items) >= 20 {
			break
		}
	}

	if len(items) == 0 {
		return nil
	}

	return map[string]any{
		"@type":           "ItemList",
		"name":            ctx.Title,
		"itemListOrder":   "https://schema.org/ItemListOrderAscending",
		"numberOfItems":   len(items),
		"itemListElement": items,
	}
}

func buildFAQPageJSONLD(ctx *preprocessCtx) map[string]any {
	if ctx == nil {
		return nil
	}
	path := canonicalSEOPath(ctx.PagePath)
	lang := resolveLang(map[string]string{"hl": ctx.Lang})
	if lang == "" {
		lang = "vi"
	}

	var qas [][2]string
	switch path {
	case "/thong-ke-ket-qua-xo-so":
		qas = faqLottery(lang)
	case "/hop-tac-kinh-doanh":
		qas = faqBridge(lang)
	case "/phan-mem":
		qas = faqSoftware(lang)
	default:
		return nil
	}
	if len(qas) == 0 {
		return nil
	}

	entities := make([]map[string]any, 0, len(qas))
	for _, qa := range qas {
		q := strings.TrimSpace(qa[0])
		a := strings.TrimSpace(qa[1])
		if q == "" || a == "" {
			continue
		}
		entities = append(entities, map[string]any{
			"@type": "Question",
			"name":  q,
			"acceptedAnswer": map[string]any{
				"@type": "Answer",
				"text":  a,
			},
		})
	}
	if len(entities) == 0 {
		return nil
	}

	return map[string]any{
		"@type":            "FAQPage",
		"inLanguage":       lang,
		"mainEntity":       entities,
		"mainEntityOfPage": ctx.Canonical,
	}
}

func faqLottery(lang string) [][2]string {
	switch lang {
	case "en":
		return [][2]string{
			{"What does this lottery page provide?", "It provides transparent statistics including special-prize grouping, loto frequency, and historical comparisons by date, station, and region."},
			{"Is this page for betting predictions?", "No. The page is for data reference only and does not provide gambling predictions or recommendations."},
			{"Can I filter by date and region?", "Yes. You can filter by date, weekday, region, and station to view specific data slices."},
		}
	case "zh":
		return [][2]string{
			{"这个页面提供什么内容？", "该页面提供透明统计，包括特别奖分组、号码频率，以及按日期、站点和地区的历史对比。"},
			{"这个页面用于博彩预测吗？", "不是。该页面仅用于数据参考，不提供博彩预测或投注建议。"},
			{"可以按日期和地区筛选吗？", "可以。支持按日期、星期、地区和站点筛选数据。"},
		}
	default:
		return [][2]string{
			{"Trang này cung cấp gì?", "Trang cung cấp thống kê minh bạch gồm giải đặc biệt theo nhóm, tần suất lô tô và so sánh lịch sử theo ngày, đài, miền."},
			{"Trang có dùng để dự đoán cá cược không?", "Không. Nội dung chỉ phục vụ tham khảo dữ liệu và không đưa khuyến nghị cá cược."},
			{"Có lọc được theo ngày và miền không?", "Có. Bạn có thể lọc theo ngày, thứ, miền và đài để xem đúng lát cắt dữ liệu cần tra cứu."},
		}
	}
}

func faqBridge(lang string) [][2]string {
	switch lang {
	case "en":
		return [][2]string{
			{"What is the Business Partnership section?", "It is a hub that groups online business verticals such as software, real estate, beauty, transport, and booking services."},
			{"Why am I redirected to Software by default?", "Software is the default sub-section in this hub to help users land on the most active category first."},
			{"Are all categories shown here?", "Only operational business categories are shown in this context; system-level categories are intentionally hidden."},
		}
	case "zh":
		return [][2]string{
			{"什么是商业合作板块？", "这是一个聚合线上业务领域的入口，包括软件、房产、美妆、用车与预约服务。"},
			{"为什么默认跳转到软件？", "软件是该板块的默认子类，方便用户优先进入活跃内容最多的分类。"},
			{"这里会显示所有分类吗？", "不会。该场景仅显示业务分类，系统级分类会被有意隐藏。"},
		}
	default:
		return [][2]string{
			{"Hợp Tác Kinh Doanh là gì?", "Đây là khu vực gom các lĩnh vực kinh doanh online như phần mềm, bất động sản, mỹ phẩm, xe dịch vụ và đặt lịch."},
			{"Vì sao bấm vào Hợp Tác Kinh Doanh lại mặc định vào Phần Mềm?", "Phần Mềm được cấu hình làm danh mục mặc định để người dùng vào nhanh nhóm nội dung hoạt động mạnh nhất."},
			{"Trong ngữ cảnh Hợp Tác Kinh Doanh có hiện đầy đủ menu không?", "Không. Một số mục hệ thống như chính Hợp Tác Kinh Doanh và Thống Kê Kết Quả Xổ Số được ẩn để tránh vòng lặp điều hướng."},
		}
	}
}

func faqSoftware(lang string) [][2]string {
	switch lang {
	case "en":
		return [][2]string{
			{"What software services are listed here?", "This section includes custom software, automation tools, and business-focused implementation services."},
			{"How can I find a specific software post?", "Use the search filters by keyword, service type, platform, and budget range to narrow results."},
			{"Are software posts available in multiple languages?", "Yes. The website supports Vietnamese, English, and Chinese content where translations are available."},
		}
	case "zh":
		return [][2]string{
			{"这里有哪些软件服务？", "本分类包含定制软件、自动化工具与面向业务场景的软件实施服务。"},
			{"如何快速找到目标内容？", "可使用关键词、服务类型、平台和预算范围筛选功能。"},
			{"是否支持多语言内容？", "支持。站点可按越南语、英语、中文显示可用翻译内容。"},
		}
	default:
		return [][2]string{
			{"Danh mục Phần Mềm gồm những gì?", "Danh mục này tập trung vào phần mềm theo yêu cầu, công cụ tự động hóa và các giải pháp triển khai theo nhu cầu doanh nghiệp."},
			{"Làm sao tìm nhanh đúng bài phần mềm cần xem?", "Bạn có thể lọc theo từ khóa, loại dịch vụ, nền tảng và khoảng chi phí để thu hẹp kết quả."},
			{"Nội dung có hỗ trợ đa ngôn ngữ không?", "Có. Website hỗ trợ hiển thị theo tiếng Việt, tiếng Anh và tiếng Trung khi dữ liệu bản dịch sẵn có."},
		}
	}
}
