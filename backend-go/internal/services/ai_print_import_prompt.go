package services

import "strings"

const printImportContract = `You are CSM Print Trigger Editor for Line Items (type_form=7).
Return ONLY the complete JavaScript function BODY for a print template trigger.
Do NOT wrap in function(...){ } — only the inner statements.
The body MUST end with return HTML containing </html>.
MUST use utils.buildCompanyHdr(cfg), utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || {...}), utils.buildTotalsHtml(calc, utils).
Do NOT hand-write product table HTML.
Match [PDF_LAYOUT_SPEC]: doc-title, header labels, signature labels, showPrice/hideColumns.
Seed in [ACTIVE_EDITOR] is pre-patched — only fix remaining mismatches.
No markdown fences. No JSON textEdits envelope. No explanation.
End immediately after the last line of JavaScript.
`

// BuildPrintImportLayoutBlock injects structured PDF layout from editorMetadata.pdfLayout.
func BuildPrintImportLayoutBlock(meta map[string]any) string {
	if meta == nil {
		return ""
	}
	layout := strings.TrimSpace(paramString(meta, "pdfLayout", ""))
	if layout == "" {
		return ""
	}
	docKind := strings.TrimSpace(paramString(meta, "docKind", ""))
	triggerKey := strings.TrimSpace(paramString(meta, "triggerKey", ""))
	var sb strings.Builder
	sb.WriteString("[PDF_LAYOUT_SPEC]\n")
	if docKind != "" {
		sb.WriteString("docKind: ")
		sb.WriteString(docKind)
		sb.WriteByte('\n')
	}
	if triggerKey != "" {
		sb.WriteString("triggerKey: ")
		sb.WriteString(triggerKey)
		sb.WriteByte('\n')
	}
	sb.WriteString(layout)
	sb.WriteString("\n[/PDF_LAYOUT_SPEC]\n\n")
	return sb.String()
}
