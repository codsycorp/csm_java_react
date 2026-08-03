package web

import (
	"bytes"
	"html/template"
	"strings"
)

type publicShellData struct {
	Lang            string
	BaseURL         string
	Title           string
	Description     string
	Keywords        string
	Canonical       string
	Image           string
	SiteName        string
	Logo            string
	GSV             string
	GTag            string
	AppID           string
	PageType        string
	Preload         template.HTML
	StructuredData  template.HTML
	InjectedScripts template.HTML
}

func renderPublicShellTemplate(raw string, data publicShellData) (string, error) {
	tpl, err := template.New("public-shell").Parse(raw)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return strings.ReplaceAll(buf.String(), "\u003c", "<"), nil
}
