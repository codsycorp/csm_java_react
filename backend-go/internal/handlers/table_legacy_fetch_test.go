package handlers

import "testing"

func TestWantsLegacyFullTableFetch(t *testing.T) {
	if !wantsLegacyFullTableFetch(map[string]any{"app_id": "kqxs", "e_where": map[string]any{}}) {
		t.Fatal("kqxs script without pagination should use legacy full fetch")
	}
	if wantsLegacyFullTableFetch(map[string]any{"limit": float64(50)}) {
		t.Fatal("limit should opt into server pagination")
	}
	if wantsLegacyFullTableFetch(map[string]any{"offset": float64(0)}) {
		t.Fatal("offset should opt into server pagination")
	}
	if wantsLegacyFullTableFetch(map[string]any{"take": float64(500)}) {
		t.Fatal("take should opt into server pagination")
	}
	if wantsLegacyFullTableFetch(map[string]any{"sort": []any{map[string]any{"field": "id"}}}) {
		t.Fatal("sort should opt into server pagination")
	}
}
