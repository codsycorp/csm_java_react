package web

import "testing"

func TestHasStaticExtension_DocxAndPdf(t *testing.T) {
	tests := []struct {
		uri  string
		want bool
	}{
		{uri: "/reports/bao_gia_template.docx", want: true},
		{uri: "/reports/bao_gia_template.doc", want: true},
		{uri: "/reports/bao_gia_template.pdf", want: true},
		{uri: "/reports/export.xlsx", want: true},
		{uri: "/system/grid/menu123", want: false},
	}

	for _, tc := range tests {
		got := HasStaticExtension(tc.uri)
		if got != tc.want {
			t.Fatalf("HasStaticExtension(%q)=%v want %v", tc.uri, got, tc.want)
		}
	}
}

func TestMimeFromPath_DocxAndPdf(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{path: "reports/bao_gia_template.docx", want: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
		{path: "reports/bao_gia_template.doc", want: "application/msword"},
		{path: "reports/bao_gia_template.pdf", want: "application/pdf"},
		{path: "reports/export.xlsx", want: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
	}

	for _, tc := range tests {
		got := mimeFromPath(tc.path)
		if got != tc.want {
			t.Fatalf("mimeFromPath(%q)=%q want %q", tc.path, got, tc.want)
		}
	}
}
