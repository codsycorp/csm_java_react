package services

import "testing"

func TestResolvePrintImportTriggerBodyUsesSeedWhenAiIncomplete(t *testing.T) {
	seed := "const cfg = utils.settings || {};\nreturn `<!DOCTYPE html><html><head></head><body><div class=\"page\">${utils.buildCompanyHdr(cfg)}</div></body></html>`;"
	aiPartial := "return `<!DOCTYPE html><html><body><div class=\"page\">"
	got := ResolvePrintImportTriggerBody(seed, aiPartial)
	if got != seed {
		t.Fatalf("expected seed fallback, got len=%d", len(got))
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
