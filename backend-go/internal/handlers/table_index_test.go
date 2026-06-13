package handlers

import "testing"

func TestExtractIndexReadRowsUnwrapsData(t *testing.T) {
	tables := []map[string]any{
		{
			"id": "menu",
			"data": []any{
				map[string]any{"id": "system", "path": "/system"},
				map[string]any{"id": "user", "path": "/system/user"},
			},
		},
	}
	rows := extractIndexReadRows(tables)
	if len(rows) != 2 {
		t.Fatalf("expected 2 menu rows, got %d", len(rows))
	}
	if rows[0].(map[string]any)["id"] != "system" {
		t.Fatalf("unexpected first row: %#v", rows[0])
	}
}

func TestExtractIndexReadRowsWithoutDataReturnsRecord(t *testing.T) {
	record := map[string]any{"id": "schema", "struct": map[string]any{}}
	rows := extractIndexReadRows([]map[string]any{record})
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].(map[string]any)["id"] != "schema" {
		t.Fatalf("unexpected row: %#v", rows[0])
	}
}

func TestExtractIndexReadRowsMultipleRecords(t *testing.T) {
	tables := []map[string]any{
		{"id": "menu"},
		{"id": "menuR"},
	}
	rows := extractIndexReadRows(tables)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
}
