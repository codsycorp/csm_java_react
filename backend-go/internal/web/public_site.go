package web

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"csm_server/backend-go/internal/state"
)

type publicSiteData struct {
	Title       string
	Description string
	Canonical   string
	Services    []publicServiceItem
	Metrics     []publicMetric
	Steps       []publicStep
	Contact     publicContact
}

type publicServiceItem struct {
	Title       string
	Description string
}

type publicMetric struct {
	Value string
	Label string
}

type publicStep struct {
	Number string
	Title  string
	Text   string
}

type publicContact struct {
	Email string
	Phone string
}

func publicSiteDataForPage(path string) publicSiteData {
	base := publicSiteData{
		Title:       "Nền tảng Website Doanh nghiệp | SEO & Tăng trưởng số",
		Description: "Giải pháp website doanh nghiệp, tối ưu SEO kỹ thuật và trải nghiệm để tăng trưởng lưu lượng truy cập bền vững.",
		Canonical:   "/",
		Services: []publicServiceItem{
			{Title: "Thiết kế website doanh nghiệp", Description: "Landing page, website bán hàng, website dịch vụ, UI/UX tối ưu chuyển đổi và trải nghiệm người dùng."},
			{Title: "SEO & tối ưu công cụ tìm kiếm", Description: "Tối ưu từ khóa, cấu trúc nội dung, tốc độ trang, schema và đánh giá kỹ thuật để cải thiện thứ hạng trên Google."},
			{Title: "Tích hợp dữ liệu & CRM", Description: "Kết nối hệ thống, API, dashboard và dữ liệu khách hàng để quản lý hiệu quả và tăng doanh số."},
		},
		Metrics: []publicMetric{
			{Value: "128K", Label: "Traffic"},
			{Value: "2.6K", Label: "Leads"},
			{Value: "8.7%", Label: "Conversion"},
			{Value: "2.5s", Label: "Core target"},
		},
		Steps: []publicStep{
			{Number: "01", Title: "Phân tích nhu cầu", Text: "Xác định mục tiêu thương hiệu, người dùng và competitor."},
			{Number: "02", Title: "Thiết kế & triển khai", Text: "Xây dựng layout, UI thân thiện và nội dung SEO phù hợp với từ khóa."},
			{Number: "03", Title: "Tối ưu vận hành", Text: "Chạy A/B test, tối ưu tốc độ, dữ liệu và trải nghiệm để tăng hiệu quả lâu dài."},
		},
		Contact: publicContact{Email: "contact@your-domain.tld", Phone: "+84 000 000 000"},
	}
	base.Canonical = path
	if path == "/dich-vu" {
		base.Title = "Dịch vụ SEO & Website Doanh nghiệp"
		base.Description = "Dịch vụ thiết kế website doanh nghiệp, SEO, tối ưu tốc độ, tích hợp dữ liệu và CRM cho doanh nghiệp Việt Nam."
		base.Canonical = "/dich-vu"
		base.Services = []publicServiceItem{
			{Title: "Website doanh nghiệp", Description: "Tối ưu UX, tốc độ, CTA và content để tăng tỷ lệ chuyển đổi."},
			{Title: "SEO on-page", Description: "Meta, heading, schema, hình ảnh, text và cấu trúc nội dung cho thứ hạng tốt hơn."},
			{Title: "Marketing funnel", Description: "Hệ thống lead, CRM, tracking và báo cáo để đo hiệu quả chiến dịch."},
		}
	}
	return base
}

func publicSiteJSON(path string) map[string]any {
	data := publicSiteDataForPage(path)
	return map[string]any{
		"title":       data.Title,
		"description": data.Description,
		"canonical":   data.Canonical,
		"services": []map[string]string{
			{"title": data.Services[0].Title, "description": data.Services[0].Description},
			{"title": data.Services[1].Title, "description": data.Services[1].Description},
			{"title": data.Services[2].Title, "description": data.Services[2].Description},
		},
		"metrics": []map[string]string{
			{"value": data.Metrics[0].Value, "label": data.Metrics[0].Label},
			{"value": data.Metrics[1].Value, "label": data.Metrics[1].Label},
			{"value": data.Metrics[2].Value, "label": data.Metrics[2].Label},
			{"value": data.Metrics[3].Value, "label": data.Metrics[3].Label},
		},
		"contact": map[string]string{"email": data.Contact.Email, "phone": data.Contact.Phone},
	}
}

func ServePublicSiteData(st *state.AppState, w http.ResponseWriter, r *http.Request) {
	normalizedPath := resolvePublicSitePath(r)
	if st == nil || st.RecordManager == nil {
		writeJSON(w, http.StatusOK, publicSiteJSON(normalizedPath))
		return
	}

	queryStr := r.URL.RawQuery
	host := resolveSSRHostForDev(r.Host, queryStr)
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}

	lang := resolveLang(parseQS(queryStr))
	route := finalizeSSRRoute(resolveRoute(st.RecordManager, host, normalizedPath), st.RecordManager, host)
	domain := route.Domain
	if domain == "" {
		domain = DomainFromHost(host)
	}

	baseHost := host
	if baseHost == "" {
		baseHost = domain
	}
	baseURL := "https://" + baseHost
	canonical := buildLocalizedURL(baseURL, normalizedPath, lang)

	fallback := publicSiteJSON(normalizedPath)
	title := firstNonEmpty(strings.TrimSpace(route.FTitle), recordStr(fallback, "title"), "Nền tảng Website Doanh nghiệp | SEO & Tăng trưởng số")
	description := firstNonEmpty(strings.TrimSpace(route.FKeyword), recordStr(fallback, "description"), "Nội dung đang được cập nhật.")
	keywords := strings.TrimSpace(route.FKeyword)
	ogImage := absoluteAssetURL(route.FLogo, "https", baseHost)

	_, _, mainServiceCode, defaultServiceCode := loadCategoriesFull(st.RecordManager, route, domain, lang)
	listing := map[string]any{}
	if route.AppID != "" && route.TblServiceDetail != "" {
		listing = resolveServiceListing(st.RecordManager, route, domain, normalizedPath, parseQS(queryStr), mainServiceCode, defaultServiceCode)
		if seo := resolveSEOForServiceRoute(st.RecordManager, route, domain, normalizedPath, mainServiceCode, defaultServiceCode, lang); seo != nil {
			title = firstNonEmpty(normalizeMetaText(seo.Title, 120), title)
			description = firstNonEmpty(normalizeMetaText(seo.Description, 220), description)
			if strings.TrimSpace(seo.Keywords) != "" {
				keywords = normalizeMetaText(seo.Keywords, 255)
			}
			if strings.TrimSpace(seo.Image) != "" {
				ogImage = absoluteAssetURL(seo.Image, "https", baseHost)
			}
		}

		if shouldApplyServiceCategorySeoOverrides(listing) {
			if cat, ok := listing["serviceCategory"].(map[string]any); ok {
				title, description, keywords, canonical, ogImage = applyServiceCategorySeoOverrides(
					cat,
					lang,
					title,
					description,
					keywords,
					canonical,
					ogImage,
				)
			}
		}
	}

	services := publicServicesFromListing(listing, lang)
	servicePayload := any(services)
	if len(services) == 0 {
		servicePayload = fallback["services"]
	}

	homeDetails, _ := listing["serviceDetailList"].([]any)
	serviceDetails := homeDetails
	if detail, ok := listing["serviceDetail"].(map[string]any); ok && len(detail) > 0 {
		serviceDetails = []any{detail}
	}

	payload := map[string]any{
		"success":           true,
		"title":             title,
		"description":       description,
		"keywords":          keywords,
		"canonical":         canonical,
		"ogImage":           ogImage,
		"services":          servicePayload,
		"serviceDetailList": serviceDetails,
		"homeDetailList":    homeDetails,
		"serviceCategory":   listing["serviceCategory"],
		"serviceDetail":     listing["serviceDetail"],
		"metrics":           fallback["metrics"],
		"contact":           fallback["contact"],
		"path":              normalizedPath,
		"lang":              lang,
	}

	writeJSON(w, http.StatusOK, payload)
}

func resolvePublicSitePath(r *http.Request) string {
	if r == nil || r.URL == nil {
		return "/"
	}
	q := r.URL.Query()
	path := strings.TrimSpace(q.Get("path"))
	if path == "" {
		path = strings.TrimSpace(q.Get("pathname"))
	}
	if path == "" {
		referer := strings.TrimSpace(r.Referer())
		if referer != "" {
			if u, err := url.Parse(referer); err == nil {
				path = strings.TrimSpace(u.Path)
			}
		}
	}
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return NormalizeIncomingWebPath(path)
}

func publicServicesFromListing(listing map[string]any, lang string) []map[string]string {
	raw, _ := listing["serviceDetailList"].([]any)
	if len(raw) == 0 {
		return nil
	}
	out := make([]map[string]string, 0, len(raw))
	for _, item := range raw {
		row, ok := item.(map[string]any)
		if !ok || len(row) == 0 {
			continue
		}
		title := recordLangStr(row, "title", lang)
		if title == "" {
			title = recordStr(row, "category")
		}
		description := recordLangStr(row, "excerpt", lang)
		if description == "" {
			description = stripHTMLToText(recordLangStr(row, "content", lang), 180)
		}
		entry := map[string]string{
			"title":       firstNonEmpty(title, "Dịch vụ"),
			"description": firstNonEmpty(description, "Nội dung đang được cập nhật."),
		}
		slug := strings.TrimSpace(recordStr(row, "slug"))
		if slug != "" {
			entry["slug"] = slug
		}
		serviceType := strings.TrimSpace(recordStr(row, "service_type"))
		if serviceType != "" {
			entry["service_type"] = serviceType
		}
		image := strings.TrimSpace(firstNonEmpty(recordStr(row, "thumbnail"), recordStr(row, "image")))
		if image != "" {
			entry["image"] = image
		}
		out = append(out, entry)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func PublicHomePage(w http.ResponseWriter, r *http.Request) {
	data := publicSiteDataForPage("/")
	servePublicHTML(w, r, data.Title, data.Description, data.Canonical, buildPublicHomeBody(data))
}

func PublicServicePage(w http.ResponseWriter, r *http.Request) {
	data := publicSiteDataForPage("/dich-vu")
	servePublicHTML(w, r, data.Title, data.Description, data.Canonical, buildPublicServiceBody(data))
}

func buildPublicHomeBody(data publicSiteData) string {
	var b strings.Builder
	b.WriteString(`<main class="page-shell">`)
	b.WriteString(`<section class="hero"><div class="hero-copy"><p class="eyebrow">CSM DIGITAL</p><h1>Giải pháp website & SEO giúp doanh nghiệp tăng trưởng bền vững</h1><p>Chúng tôi giúp doanh nghiệp xây dựng website nhanh, tối ưu trải nghiệm người dùng, tăng thứ hạng tìm kiếm và chuyển đổi khách hàng hiệu quả hơn.</p><div class="cta-row"><a class="primary" href="#dich-vu">Xem dịch vụ</a><a class="secondary" href="#lien-he">Liên hệ ngay</a></div></div></section>`)
	b.WriteString(`<section id="dich-vu" class="section"><div class="section-head"><p class="eyebrow">DỊCH VỤ</p><h2>Dịch vụ chính</h2></div><div class="card-grid three">`)
	for _, item := range data.Services {
		b.WriteString(fmt.Sprintf(`<article class="card"><h3>%s</h3><p>%s</p></article>`, htmlEsc(item.Title), htmlEsc(item.Description)))
	}
	b.WriteString(`</div></section>`)
	b.WriteString(`<section class="section metrics"><div class="section-head"><p class="eyebrow">HIỆU QUẢ</p><h2>Được tối ưu cho tốc độ và chuyển đổi</h2></div><div class="card-grid four">`)
	for _, item := range data.Metrics {
		b.WriteString(fmt.Sprintf(`<div class="metric"><strong>%s</strong><span>%s</span></div>`, htmlEsc(item.Value), htmlEsc(item.Label)))
	}
	b.WriteString(`</div></section>`)
	b.WriteString(`<section class="section process"><div class="section-head"><p class="eyebrow">QUY TRÌNH</p><h2>Phương pháp làm việc</h2></div><ol class="steps">`)
	for _, item := range data.Steps {
		b.WriteString(fmt.Sprintf(`<li><span>%s</span><div><h3>%s</h3><p>%s</p></div></li>`, htmlEsc(item.Number), htmlEsc(item.Title), htmlEsc(item.Text)))
	}
	b.WriteString(`</ol></section>`)
	b.WriteString(fmt.Sprintf(`<section id="lien-he" class="section contact-box"><div><p class="eyebrow">LIÊN HỆ</p><h2>Đặt lịch tư vấn miễn phí</h2></div><a class="primary" href="mailto:%s">%s</a></section>`, htmlEsc(data.Contact.Email), htmlEsc(data.Contact.Email)))
	b.WriteString(`</main>`)
	return b.String()
}

func buildPublicServiceBody(data publicSiteData) string {
	var b strings.Builder
	b.WriteString(`<main class="page-shell narrow"><section class="section"><p class="eyebrow">DỊCH VỤ</p><h1>Dịch vụ website & SEO chuyên nghiệp</h1><p>Chúng tôi hỗ trợ doanh nghiệp từ xây dựng website, tối ưu SEO kỹ thuật, quản lý dữ liệu đến hệ thống lead và CRM.</p></section><section class="card-grid three">`)
	for _, item := range data.Services {
		b.WriteString(fmt.Sprintf(`<article class="card"><h3>%s</h3><p>%s</p></article>`, htmlEsc(item.Title), htmlEsc(item.Description)))
	}
	b.WriteString(`</section></main>`)
	return b.String()
}

func servePublicHTML(w http.ResponseWriter, r *http.Request, title, description, canonicalPath, body string) {
	canonical := "https://example.com" + canonicalPath
	html := fmt.Sprintf(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="%s">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="%s">
  <meta property="og:description" content="%s">
  <meta property="og:image" content="https://example.com/og-image.jpg">
  <meta property="og:locale" content="vi_VN">
  <link rel="canonical" href="%s">
  <title>%s</title>
  <style>%s</style>
</head>
<body>
  <header class="topbar">
    <div class="brand-wrap">
      <a class="brand" href="/">CSM</a>
    </div>
    <nav class="nav" aria-label="Main navigation">
      <a href="/">Trang chủ</a>
      <a href="/dich-vu">Dịch vụ</a>
      <a href="/#dich-vu">Giải pháp</a>
      <a href="/#lien-he">Liên hệ</a>
    </nav>
  </header>
  %s
  <footer class="footer">
    <p>© 2026 CSM Digital. Giải pháp website & SEO cho doanh nghiệp.</p>
  </footer>
</body>
</html>`, description, title, description, canonical, title, publicCSS(), body)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300, s-maxage=600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(strings.TrimSpace(html)))
}

func publicCSS() string {
	return `
		:root {
			--bg: #f5f7fb;
			--panel: #ffffff;
			--text: #0f172a;
			--muted: #475569;
			--primary: #1677ff;
			--primary-strong: #0b5ed7;
			--border: rgba(15, 23, 42, 0.08);
			--shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
		}
		* { box-sizing: border-box; }
		html { scroll-behavior: smooth; }
		body {
			margin: 0;
			font-family: Arial, Helvetica, sans-serif;
			background: var(--bg);
			color: var(--text);
			line-height: 1.6;
		}
		a { color: inherit; text-decoration: none; }
		img { max-width: 100%; height: auto; }
		.topbar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			max-width: 1180px;
			margin: 0 auto;
			padding: 22px 20px;
		}
		.brand {
			font-size: 26px;
			font-weight: 800;
			letter-spacing: 0.06em;
		}
		.nav {
			display: flex;
			gap: 22px;
			flex-wrap: wrap;
			font-weight: 600;
			color: var(--muted);
		}
		.page-shell {
			max-width: 1180px;
			margin: 0 auto;
			padding: 40px 20px 80px;
		}
		.page-shell.narrow { max-width: 980px; }
		.hero {
			padding: 48px 0 24px;
		}
		.hero-copy {
			max-width: 780px;
		}
		.eyebrow {
			margin: 0 0 12px;
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.12em;
			color: var(--primary);
		}
		h1, h2, h3 {
			margin-top: 0;
			line-height: 1.2;
			color: var(--text);
		}
		h1 {
			font-size: clamp(2.2rem, 4vw, 4rem);
			margin-bottom: 18px;
		}
		h2 { font-size: clamp(1.7rem, 3vw, 2.6rem); margin-bottom: 16px; }
		h3 { font-size: 1.25rem; margin-bottom: 8px; }
		p { margin-top: 0; color: var(--muted); }
		.cta-row {
			display: flex;
			gap: 14px;
			flex-wrap: wrap;
			margin-top: 24px;
		}
		.primary, .secondary {
			display: inline-block;
			padding: 14px 22px;
			border-radius: 12px;
			font-weight: 700;
			transition: all 0.2s ease;
		}
		.primary {
			background: var(--primary);
			color: white;
		}
		.primary:hover { background: var(--primary-strong); }
		.secondary {
			background: #edf4ff;
			color: var(--primary);
		}
		.section {
			padding: 40px 0;
		}
		.section-head {
			margin-bottom: 24px;
		}
		.card-grid {
			display: grid;
			gap: 18px;
		}
		.card-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.card-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
		.card {
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 18px;
			padding: 24px;
			box-shadow: var(--shadow);
		}
		.metric {
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 18px;
			padding: 24px 18px;
			text-align: center;
			box-shadow: var(--shadow);
		}
		.metric strong {
			display: block;
			font-size: 2rem;
			color: var(--text);
		}
		.metric span {
			color: var(--muted);
			font-weight: 600;
		}
		.steps {
			list-style: none;
			padding: 0;
			margin: 0;
			display: grid;
			gap: 18px;
		}
		.steps li {
			display: flex;
			gap: 18px;
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 16px;
			padding: 20px 18px;
			box-shadow: var(--shadow);
		}
		.steps li span {
			display: inline-flex;
			width: 48px;
			height: 48px;
			align-items: center;
			justify-content: center;
			background: #edf4ff;
			color: var(--primary);
			border-radius: 12px;
			font-weight: 800;
		}
		.contact-box {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 20px;
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 18px;
			padding: 30px 26px;
			box-shadow: var(--shadow);
		}
		.footer {
			max-width: 1180px;
			margin: 0 auto;
			padding: 0 20px 60px;
			color: var(--muted);
		}
		@media (max-width: 900px) {
			.card-grid.three, .card-grid.four { grid-template-columns: 1fr; }
			.contact-box { flex-direction: column; align-items: flex-start; }
			.topbar { flex-direction: column; align-items: flex-start; }
			.nav { gap: 12px; }
		}
	`
}
