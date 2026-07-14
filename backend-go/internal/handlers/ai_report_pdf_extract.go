package handlers

import (
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type pdfExtractLineBox struct {
	Text string  `json:"text"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Page int     `json:"page"`
}

type pdfExtractImageHint struct {
	FileName string `json:"fileName"`
	Path     string `json:"path"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
}

func (h *AiHandler) handleAiLocalPdfLayoutExtract(params map[string]any) map[string]any {
	appID := sanitizeAppID(paramStr(params, "appId"))
	if appID == "" {
		appID = "csm"
	}

	pdfBytes, src, err := h.resolvePdfInput(params)
	if err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_INPUT_INVALID", "message": err.Error()}
	}
	if len(pdfBytes) == 0 {
		return map[string]any{"success": false, "errorCode": "PDF_INPUT_EMPTY", "message": "pdf input is empty"}
	}

	tmpRoot := filepath.Join(h.cfg.NativeDataDir, "tmp", "report_pdf_extract")
	if mkErr := os.MkdirAll(tmpRoot, 0o755); mkErr != nil {
		return map[string]any{"success": false, "errorCode": "TMP_DIR_CREATE_FAILED", "message": mkErr.Error()}
	}

	jobID := fmt.Sprintf("pdfextract-%d", time.Now().UnixMilli())
	workDir, err := os.MkdirTemp(tmpRoot, jobID+"-")
	if err != nil {
		return map[string]any{"success": false, "errorCode": "TMP_WORKDIR_FAILED", "message": err.Error()}
	}
	defer os.RemoveAll(workDir)

	inputPDF := filepath.Join(workDir, "input.pdf")
	if err := os.WriteFile(inputPDF, pdfBytes, 0o644); err != nil {
		return map[string]any{"success": false, "errorCode": "PDF_WRITE_FAILED", "message": err.Error()}
	}

	dims, dimErr := api.PageDimsFile(inputPDF)
	if dimErr != nil {
		return map[string]any{"success": false, "errorCode": "PDF_DIMS_FAILED", "message": dimErr.Error()}
	}

	pageCount := len(dims)
	if pageCount == 0 {
		return map[string]any{"success": false, "errorCode": "PDF_EMPTY", "message": "no pages found in PDF"}
	}

	maxPages := paramInt(params, "maxPages", 3)
	if maxPages <= 0 {
		maxPages = 3
	}
	if maxPages > pageCount {
		maxPages = pageCount
	}

	selectedPages := make([]string, 0, maxPages)
	for i := 1; i <= maxPages; i++ {
		selectedPages = append(selectedPages, strconv.Itoa(i))
	}

	extractDir := filepath.Join(workDir, "content")
	_ = os.MkdirAll(extractDir, 0o755)
	_ = api.ExtractContentFile(inputPDF, extractDir, selectedPages, nil)

	lineBoxes := make([]pdfExtractLineBox, 0, 256)
	orderedLines := make([]string, 0, 256)
	for page := 1; page <= maxPages; page++ {
		contentFile := filepath.Join(extractDir, fmt.Sprintf("input_Content_page_%d.txt", page))
		b, readErr := os.ReadFile(contentFile)
		if readErr != nil || len(b) == 0 {
			continue
		}
		pageBoxes := parsePDFContentLineBoxes(string(b), page)
		lineBoxes = append(lineBoxes, pageBoxes...)
		for _, item := range pageBoxes {
			if len(orderedLines) >= 200 {
				break
			}
			t := strings.TrimSpace(item.Text)
			if t != "" {
				orderedLines = append(orderedLines, t)
			}
		}
	}

	imageHints, _ := h.extractPDFImageHints(appID, inputPDF, workDir, selectedPages, jobID)
	layoutHints := buildPDFLayoutHints(orderedLines, dims, maxPages)

	pages := make([]map[string]any, 0, maxPages)
	for i := 0; i < maxPages; i++ {
		pages = append(pages, map[string]any{
			"page":   i + 1,
			"width":  dims[i].Width,
			"height": dims[i].Height,
		})
	}

	result := map[string]any{
		"success":      true,
		"message":      "pdf_layout_extract_done",
		"source":       src,
		"jobId":        jobID,
		"pageCount":    pageCount,
		"pages":        pages,
		"lineBoxes":    lineBoxes,
		"orderedLines": orderedLines,
		"layoutHints":  layoutHints,
		"imageHints":   imageHints,
	}
	if maxPages > 0 {
		result["pageWidth"] = dims[0].Width
		result["pageHeight"] = dims[0].Height
	}

	return result
}

func (h *AiHandler) extractPDFImageHints(appID, inputPDF, workDir string, selectedPages []string, jobID string) ([]pdfExtractImageHint, error) {
	imagesTmpDir := filepath.Join(workDir, "images")
	if err := os.MkdirAll(imagesTmpDir, 0o755); err != nil {
		return nil, err
	}

	if err := api.ExtractImagesFile(inputPDF, imagesTmpDir, selectedPages, nil); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(imagesTmpDir)
	if err != nil {
		return nil, err
	}

	type stagedImage struct {
		name string
		size int64
	}

	staged := make([]stagedImage, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		info, statErr := entry.Info()
		if statErr != nil {
			continue
		}
		if info.Size() <= 0 {
			continue
		}
		staged = append(staged, stagedImage{name: name, size: info.Size()})
	}

	sort.Slice(staged, func(i, j int) bool {
		return staged[i].size > staged[j].size
	})
	if len(staged) > 8 {
		staged = staged[:8]
	}

	publicDir := filepath.Join(h.cfg.DataDir, "public", "app_images", appID, "pdf_extract", jobID)
	if err := os.MkdirAll(publicDir, 0o755); err != nil {
		return nil, err
	}

	hints := make([]pdfExtractImageHint, 0, len(staged))
	for idx, item := range staged {
		src := filepath.Join(imagesTmpDir, item.name)
		ext := strings.ToLower(filepath.Ext(item.name))
		if ext == "" {
			ext = ".png"
		}
		name := fmt.Sprintf("img_%02d%s", idx+1, ext)
		dst := filepath.Join(publicDir, name)

		b, readErr := os.ReadFile(src)
		if readErr != nil {
			continue
		}
		if writeErr := os.WriteFile(dst, b, 0o644); writeErr != nil {
			continue
		}

		rel := fmt.Sprintf("app_images/%s/pdf_extract/%s/%s", appID, jobID, name)
		hints = append(hints, pdfExtractImageHint{
			FileName: name,
			Path:     rel,
			URL:      "/" + rel,
			Size:     item.size,
		})
	}

	return hints, nil
}

var (
	reTM        = regexp.MustCompile(`(?m)([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+Tm\b`)
	reTD        = regexp.MustCompile(`(?m)([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+T[Dd]\b`)
	reTj        = regexp.MustCompile(`(?m)(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>)\s*Tj\b`)
	reTJ        = regexp.MustCompile(`(?ms)\[(.*?)\]\s*TJ\b`)
	reArrayText = regexp.MustCompile(`\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]+>`)
)

func parsePDFContentLineBoxes(content string, page int) []pdfExtractLineBox {
	lines := strings.Split(content, "\n")
	out := make([]pdfExtractLineBox, 0, len(lines))
	x := 0.0
	y := 0.0
	lastY := 0.0

	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}

		for _, m := range reTM.FindAllStringSubmatch(line, -1) {
			x = toFloat(m[5])
			y = toFloat(m[6])
			lastY = y
		}
		for _, m := range reTD.FindAllStringSubmatch(line, -1) {
			x += toFloat(m[1])
			y += toFloat(m[2])
			lastY = y
		}

		for _, m := range reTj.FindAllStringSubmatch(line, -1) {
			t := decodePDFStringToken(m[1])
			if t == "" {
				continue
			}
			out = append(out, pdfExtractLineBox{Text: t, X: x, Y: y, Page: page})
			y = lastY - 12
		}

		for _, m := range reTJ.FindAllStringSubmatch(line, -1) {
			parts := reArrayText.FindAllString(m[1], -1)
			if len(parts) == 0 {
				continue
			}
			joined := make([]string, 0, len(parts))
			for _, p := range parts {
				t := decodePDFStringToken(p)
				if t != "" {
					joined = append(joined, t)
				}
			}
			text := strings.TrimSpace(strings.Join(joined, ""))
			if text == "" {
				continue
			}
			out = append(out, pdfExtractLineBox{Text: text, X: x, Y: y, Page: page})
			y = lastY - 12
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Page != out[j].Page {
			return out[i].Page < out[j].Page
		}
		if out[i].Y == out[j].Y {
			return out[i].X < out[j].X
		}
		return out[i].Y > out[j].Y
	})

	// Keep first 400 lines max to avoid oversized payloads.
	if len(out) > 400 {
		out = out[:400]
	}
	return out
}

func decodePDFStringToken(token string) string {
	t := strings.TrimSpace(token)
	if t == "" {
		return ""
	}

	if strings.HasPrefix(t, "(") && strings.HasSuffix(t, ")") {
		inner := t[1 : len(t)-1]
		return sanitizePDFText(unescapePDFLiteral(inner))
	}

	if strings.HasPrefix(t, "<") && strings.HasSuffix(t, ">") {
		hexRaw := strings.ReplaceAll(t[1:len(t)-1], " ", "")
		if len(hexRaw)%2 == 1 {
			hexRaw += "0"
		}
		b, err := hex.DecodeString(hexRaw)
		if err != nil {
			return ""
		}
		if len(b) >= 2 && b[0] == 0xFE && b[1] == 0xFF {
			u16 := make([]uint16, 0, (len(b)-2)/2)
			for i := 2; i+1 < len(b); i += 2 {
				u16 = append(u16, uint16(b[i])<<8|uint16(b[i+1]))
			}
			return sanitizePDFText(string(utf16.Decode(u16)))
		}
		if utf8.Valid(b) {
			return sanitizePDFText(string(b))
		}
		return sanitizePDFText(string(b))
	}

	return ""
}

func unescapePDFLiteral(s string) string {
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch != '\\' || i == len(s)-1 {
			b.WriteByte(ch)
			continue
		}
		i++
		n := s[i]
		switch n {
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 't':
			b.WriteByte('\t')
		case 'b':
			b.WriteByte('\b')
		case 'f':
			b.WriteByte('\f')
		case '(', ')', '\\':
			b.WriteByte(n)
		case '\n', '\r':
			// Line continuation in PDF literal strings.
		default:
			if n >= '0' && n <= '7' {
				oct := []byte{n}
				for j := 0; j < 2 && i+1 < len(s); j++ {
					if s[i+1] < '0' || s[i+1] > '7' {
						break
					}
					i++
					oct = append(oct, s[i])
				}
				v, err := strconv.ParseInt(string(oct), 8, 16)
				if err == nil {
					b.WriteByte(byte(v))
				}
			} else {
				b.WriteByte(n)
			}
		}
	}
	return b.String()
}

func sanitizePDFText(s string) string {
	s = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "\u00a0", " "), "\t", " "))
	if s == "" {
		return ""
	}

	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\r' {
			continue
		}
		b.WriteRune(r)
	}
	cleaned := strings.Join(strings.Fields(b.String()), " ")
	if len(cleaned) > 220 {
		cleaned = cleaned[:220]
	}
	return strings.TrimSpace(cleaned)
}

func buildPDFLayoutHints(orderedLines []string, dims []pdfTypes.Dim, maxPages int) map[string]any {
	lineList := orderedLines
	if len(lineList) > 140 {
		lineList = lineList[:140]
	}

	docTitle := ""
	for _, line := range lineList {
		t := strings.TrimSpace(line)
		if len(t) < 6 || len(t) > 120 {
			continue
		}
		if t == strings.ToUpper(t) || strings.Count(t, " ") >= 2 {
			docTitle = t
			break
		}
	}

	headerLines := make([]string, 0, 10)
	tableHeaders := make([]string, 0, 10)
	signatures := make([]string, 0, 8)
	showPrice := false

	tableHints := []string{"tt", "stt", "tên", "quy cách", "đơn vị", "đơn giá", "thành tiền", "số lượng"}
	sigHints := []string{"đại diện", "người", "thủ kho", "giám đốc", "ký", "kế toán"}
	priceHints := []string{"đơn giá", "thành tiền", "vnđ", "tong cong", "tổng cộng"}

	for _, line := range lineList {
		lower := strings.ToLower(line)
		if strings.Contains(line, ":") && len(headerLines) < 10 {
			headerLines = append(headerLines, line)
		}

		hits := 0
		for _, h := range tableHints {
			if strings.Contains(lower, h) {
				hits++
			}
		}
		if hits >= 3 && len(tableHeaders) == 0 {
			tableHeaders = splitTableHeaderLine(line)
		}

		for _, h := range sigHints {
			if strings.Contains(lower, h) {
				if !containsString(signatures, line) && len(signatures) < 8 {
					signatures = append(signatures, line)
				}
				break
			}
		}

		for _, h := range priceHints {
			if strings.Contains(lower, h) {
				showPrice = true
				break
			}
		}
	}

	pageWidth := 0.0
	pageHeight := 0.0
	if len(dims) > 0 {
		pageWidth = dims[0].Width
		pageHeight = dims[0].Height
	}

	return map[string]any{
		"pages":              maxPages,
		"docTitle":           docTitle,
		"headerLines":        headerLines,
		"tableColumnHeaders": tableHeaders,
		"tableGridLikely":    len(tableHeaders) >= 3,
		"showPrice":          showPrice,
		"showGroupSubtotal":  showPrice,
		"signatureLabels":    signatures,
		"orderedLines":       lineList,
		"pageWidth":          pageWidth,
		"pageHeight":         pageHeight,
	}
}

func splitTableHeaderLine(line string) []string {
	parts := strings.FieldsFunc(line, func(r rune) bool {
		return r == '\t' || r == '|' || r == ';'
	})
	if len(parts) < 3 {
		parts = strings.Fields(line)
	}
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		t := strings.TrimSpace(p)
		if t != "" {
			out = append(out, t)
		}
	}
	if len(out) > 12 {
		out = out[:12]
	}
	return out
}

func containsString(list []string, target string) bool {
	for _, item := range list {
		if item == target {
			return true
		}
	}
	return false
}
