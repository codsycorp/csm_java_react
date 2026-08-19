package aicontext

import (
	"strings"
	"testing"
)

type wordTokenizer struct{}

func (wordTokenizer) Name() string { return "words" }
func (wordTokenizer) CountTokens(text string) (int, error) {
	return len(strings.Fields(text)), nil
}

func TestPackNeverDropsRequiredSections(t *testing.T) {
	packed, err := Pack(wordTokenizer{}, Budget{ContextWindow: 40, OutputReserve: 5, SystemReserve: 5, SafetyMargin: 5}, []Section{
		{ID: "optional", Kind: "memory", Priority: 100, Content: strings.Repeat("memory ", 30)},
		{ID: "contract", Kind: "contract", Priority: 10, Required: true, Content: "goal acceptance criteria"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(packed.Text, "id=contract") || len(packed.OmittedIDs) != 1 {
		t.Fatalf("required section must remain and optional must be omitted: %+v", packed)
	}
}

func TestPackRejectsRequiredOverflow(t *testing.T) {
	_, err := Pack(wordTokenizer{}, Budget{ContextWindow: 12, OutputReserve: 3, SystemReserve: 3, SafetyMargin: 3}, []Section{
		{ID: "contract", Required: true, Content: "one two three four five six"},
	})
	if err == nil || !strings.Contains(err.Error(), "CONTEXT_BUDGET_EXCEEDED") {
		t.Fatalf("expected hard required overflow error, got %v", err)
	}
}

func TestPackIsDeterministic(t *testing.T) {
	sections := []Section{{ID: "b", Priority: 1, Content: "two"}, {ID: "a", Priority: 1, Content: "one"}}
	first, err := Pack(wordTokenizer{}, Budget{ContextWindow: 100, SafetyMargin: 10}, sections)
	if err != nil {
		t.Fatal(err)
	}
	second, err := Pack(wordTokenizer{}, Budget{ContextWindow: 100, SafetyMargin: 10}, sections)
	if err != nil {
		t.Fatal(err)
	}
	if first.Digest != second.Digest || first.Text != second.Text {
		t.Fatal("expected deterministic context packing")
	}
}
