package services

import (
	"strings"
	"testing"

	"csm_server/backend-go/internal/config"
)

func TestShouldUseMapReduceAnalyzeLargeCode(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{}
	req := &CodeStreamRequest{
		Message:     "Phân tích code hiện tại đang xử lý những logic gì",
		ContextType: "code",
	}
	phase1 := RunPhase1PipelineContext{ResponseMode: "analyze", Intent: LocalIntentClassification{
		Type: "QUESTION", NextStep: "load_code_context", ContextKind: "code", ResponseMode: "analyze",
	}}
	if !ShouldUseMapReduceAnalyze(cfg, req, phase1, 25_000) {
		t.Fatal("expected map-reduce for large analyze code on 8gb")
	}
}

func TestShouldUseMapReduceAnalyzeSmallCode(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{}
	req := &CodeStreamRequest{Message: "phân tích", ContextType: "code"}
	phase1 := RunPhase1PipelineContext{ResponseMode: "analyze"}
	if ShouldUseMapReduceAnalyze(cfg, req, phase1, 5000) {
		t.Fatal("expected no map-reduce below min threshold")
	}
}

func TestSplitMapReduceChunksOverlap(t *testing.T) {
	var sb strings.Builder
	for i := 0; i < 800; i++ {
		sb.WriteString("line content here with more padding for chunk split\n")
	}
	text := sb.String()
	chunks := SplitMapReduceChunks(text, 4000, 5, 400)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}
}

func TestIsBroadAnalysisRequestUserPhrase(t *testing.T) {
	intent := LocalIntentClassification{NextStep: "load_code_context", ContextKind: "code"}
	msg := "Phân tích code hiện tại của tôi đang xử lý những logic gì"
	if !IsBroadAnalysisRequest(msg, intent) {
		t.Fatal("expected broad analysis for user phrase")
	}
}

func TestMapReduceMinCodeChars8Gb(t *testing.T) {
	t.Setenv("AI_LOCAL_RUNTIME_TIER", "balanced-8gb")
	cfg := config.AppConfig{}
	if got := MapReduceMinCodeChars(cfg); got != 12_000 {
		t.Fatalf("got %d want 12000", got)
	}
}
