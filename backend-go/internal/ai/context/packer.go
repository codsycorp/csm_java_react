package aicontext

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

type Tokenizer interface {
	CountTokens(text string) (int, error)
	Name() string
}

type ConservativeTokenizer struct{}

func (ConservativeTokenizer) Name() string { return "conservative-bytes-v1" }

func (ConservativeTokenizer) CountTokens(text string) (int, error) {
	if text == "" {
		return 0, nil
	}
	return (len([]byte(text)) + 2) / 3, nil
}

type Budget struct {
	ContextWindow int
	OutputReserve int
	SystemReserve int
	SafetyMargin  int
}

func (b Budget) InputLimit() (int, error) {
	if b.ContextWindow <= 0 {
		return 0, fmt.Errorf("context window must be positive")
	}
	limit := b.ContextWindow - b.OutputReserve - b.SystemReserve - b.SafetyMargin
	if limit <= 0 {
		return 0, fmt.Errorf("CONTEXT_BUDGET_EXCEEDED: reserves consume context window")
	}
	return limit, nil
}

type Section struct {
	ID        string
	Kind      string
	Priority  int
	Required  bool
	SourceRef string
	Content   string
}

type PackedContext struct {
	Text           string
	Digest         string
	Tokenizer      string
	InputLimit     int
	UsedTokens     int
	SelectedIDs    []string
	OmittedIDs     []string
	RequiredTokens int
}

func Pack(tokenizer Tokenizer, budget Budget, sections []Section) (PackedContext, error) {
	if tokenizer == nil {
		return PackedContext{}, fmt.Errorf("tokenizer is required")
	}
	inputLimit, err := budget.InputLimit()
	if err != nil {
		return PackedContext{}, err
	}
	required := make([]Section, 0, len(sections))
	optional := make([]Section, 0, len(sections))
	seen := map[string]struct{}{}
	for _, section := range sections {
		section.ID = strings.TrimSpace(section.ID)
		if section.ID == "" {
			return PackedContext{}, fmt.Errorf("context section id is required")
		}
		if _, exists := seen[section.ID]; exists {
			return PackedContext{}, fmt.Errorf("duplicate context section id: %s", section.ID)
		}
		seen[section.ID] = struct{}{}
		if section.Required {
			required = append(required, section)
		} else {
			optional = append(optional, section)
		}
	}
	sortSections(required)
	sortSections(optional)

	packed := PackedContext{Tokenizer: tokenizer.Name(), InputLimit: inputLimit}
	var builder strings.Builder
	appendSection := func(section Section) (bool, error) {
		rendered := renderSection(section)
		tokens, countErr := tokenizer.CountTokens(rendered)
		if countErr != nil {
			return false, countErr
		}
		if packed.UsedTokens+tokens > inputLimit {
			return false, nil
		}
		builder.WriteString(rendered)
		packed.UsedTokens += tokens
		packed.SelectedIDs = append(packed.SelectedIDs, section.ID)
		if section.Required {
			packed.RequiredTokens += tokens
		}
		return true, nil
	}
	for _, section := range required {
		selected, appendErr := appendSection(section)
		if appendErr != nil {
			return PackedContext{}, appendErr
		}
		if !selected {
			return PackedContext{}, fmt.Errorf("CONTEXT_BUDGET_EXCEEDED: required section %s does not fit", section.ID)
		}
	}
	for _, section := range optional {
		selected, appendErr := appendSection(section)
		if appendErr != nil {
			return PackedContext{}, appendErr
		}
		if !selected {
			packed.OmittedIDs = append(packed.OmittedIDs, section.ID)
		}
	}
	packed.Text = builder.String()
	digest := sha256.Sum256([]byte(packed.Text))
	packed.Digest = "sha256:" + hex.EncodeToString(digest[:])
	return packed, nil
}

func sortSections(sections []Section) {
	sort.SliceStable(sections, func(left, right int) bool {
		if sections[left].Priority == sections[right].Priority {
			return sections[left].ID < sections[right].ID
		}
		return sections[left].Priority > sections[right].Priority
	})
}

func renderSection(section Section) string {
	return "[CONTEXT_SECTION id=" + section.ID + " kind=" + section.Kind + "]\n" +
		strings.TrimSpace(section.Content) + "\n[/CONTEXT_SECTION]\n"
}
