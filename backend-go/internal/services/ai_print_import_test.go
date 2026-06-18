package services

import (
	"strings"
	"testing"
)

func TestResolvePrintImportTriggerBodyUsesSeedWhenAiIncomplete(t *testing.T) {
	seed := "const cfg = utils.settings || {};\nreturn `<!DOCTYPE html><html><head></head><body><div class=\"page\">${utils.buildCompanyHdr(cfg)}</div></body></html>`;"
	aiPartial := "return `<!DOCTYPE html><html><body><div class=\"page\">"
	got := ResolvePrintImportTriggerBody(seed, aiPartial)
	if got != seed {
		t.Fatalf("expected seed fallback, got len=%d", len(got))
	}
}

func TestBuildPrintImportLayoutBlock(t *testing.T) {
	meta := map[string]any{
		"pdfLayout":  `{"docTitle":"BÁO GIÁ"}`,
		"docKind":    "bao_gia",
		"triggerKey": "print_bao_gia",
	}
	got := BuildPrintImportLayoutBlock(meta)
	if got == "" || !strings.Contains(got, "[PDF_LAYOUT_SPEC]") || !strings.Contains(got, "BÁO GIÁ") {
		t.Fatalf("layout block missing: %q", got)
	}
}

func TestResolvePrintImportTriggerBodyAcceptsCompleteAi(t *testing.T) {
	seed := "return `<!DOCTYPE html><html><body>old</body></html>`;"
	ai := "return `<!DOCTYPE html><html><body><div class=\"page\">${utils.buildCompanyHdr({})}</div></body></html>`;"
	got := ResolvePrintImportTriggerBody(seed, ai)
	if !IsPrintTriggerBodyComplete(got) {
	 t.Fatalf("expected complete ai body")
	}
}
