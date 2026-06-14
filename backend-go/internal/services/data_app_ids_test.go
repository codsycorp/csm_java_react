package services

import "testing"

func TestResolveEffectiveDataAppIds_ExcludesMenuApp(t *testing.T) {
	got := ResolveEffectiveDataAppIds(map[string]any{
		"data_app_ids": []any{"lmkt", "kqxs", "tonghop"},
	}, "lmkt")
	if len(got) != 2 {
		t.Fatalf("got %#v, want 2 supplemental apps", got)
	}
	for _, app := range got {
		if app == "lmkt" {
			t.Fatal("menu app should be excluded from data_app_ids")
		}
	}
}
