package model

import "testing"

func TestUserFromRecord_ParsesDataAppIDs(t *testing.T) {
	user := UserFromRecord(map[string]any{
		"id":           "u1",
		"app_id":       "lmkt",
		"data_app_ids": []any{"kqxs", "tonghop", "lmkt"},
	})
	if len(user.DataAppIDs) != 3 {
		t.Fatalf("DataAppIDs = %#v, want 3 entries", user.DataAppIDs)
	}
	if user.DataAppIDs[0] != "kqxs" {
		t.Fatalf("first app = %q", user.DataAppIDs[0])
	}
}

func TestUserFromRecord_ParsesDataAppIdsJSONString(t *testing.T) {
	user := UserFromRecord(map[string]any{
		"id":           "u1",
		"data_app_ids": `["app_a","app_b"]`,
	})
	if len(user.DataAppIDs) != 2 {
		t.Fatalf("DataAppIDs = %#v", user.DataAppIDs)
	}
}
