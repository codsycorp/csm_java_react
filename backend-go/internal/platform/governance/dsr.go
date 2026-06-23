package governance

import (
	"fmt"
	"strings"
	"time"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	csmAppID         = "csm"
	accountsTable    = "csm_accounts"
	subAccountsTable = "csm_group_members"
)

// DSRRequest is a GDPR data subject request.
type DSRRequest struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	RequestID string `json:"request_id"`
}

// DSRPackage is exported personal data for portability (Art. 20).
type DSRPackage struct {
	RequestID string           `json:"request_id"`
	Subject   map[string]any   `json:"subject"`
	Accounts  []map[string]any `json:"accounts"`
	SubUsers  []map[string]any `json:"sub_users"`
	Exported  string           `json:"exported_at"`
}

// DSRErasureResult reports anonymization outcome (Art. 17).
type DSRErasureResult struct {
	RequestID      string `json:"request_id"`
	RecordsUpdated int    `json:"records_updated"`
	AnonymizedAt   string `json:"anonymized_at"`
}

// DSRService handles GDPR export and erasure workflows.
type DSRService struct {
	rm *data.RecordManager
}

func NewDSRService(rm *data.RecordManager) *DSRService {
	return &DSRService{rm: rm}
}

func (s *DSRService) Export(req DSRRequest) (*DSRPackage, error) {
	if s.rm == nil {
		return nil, fmt.Errorf("record manager unavailable")
	}
	pkg := &DSRPackage{
		RequestID: req.RequestID,
		Exported:  time.Now().UTC().Format(time.RFC3339Nano),
		Subject:   map[string]any{"user_id": req.UserID, "email": req.Email},
	}
	userID := strings.TrimSpace(req.UserID)
	email := strings.TrimSpace(req.Email)

	if email != "" {
		rec := s.rm.Find(csmAppID, accountsTable, model.EqFilter("email", email))
		if len(rec) > 0 {
			pkg.Accounts = append(pkg.Accounts, redactSecrets(rec))
			if userID == "" {
				userID = fmt.Sprint(rec["id"])
			}
		}
		sub := s.rm.Find(csmAppID, subAccountsTable, model.EqFilter("email", email))
		if len(sub) > 0 {
			pkg.SubUsers = append(pkg.SubUsers, redactSecrets(sub))
		}
	}
	if userID != "" {
		rec := s.rm.Find(csmAppID, accountsTable, model.EqFilter("id", userID))
		if len(rec) > 0 {
			pkg.Accounts = appendUniqueMaps(pkg.Accounts, redactSecrets(rec))
		}
		subFilter := model.SearchFilter{Operator: "OR", Conditions: []model.SearchFilter{
			{FilterType: "eq", Field: "parent_account_id", Value: userID},
			{FilterType: "eq", Field: "id", Value: userID},
		}}
		for _, row := range rowsFromFilter(s.rm.Filter(csmAppID, subAccountsTable, subFilter)) {
			pkg.SubUsers = appendUniqueMaps(pkg.SubUsers, redactSecrets(row))
		}
	}
	if len(pkg.Accounts) == 0 && len(pkg.SubUsers) == 0 {
		return nil, fmt.Errorf("no records found for subject")
	}
	return pkg, nil
}

func (s *DSRService) Erase(req DSRRequest) (*DSRErasureResult, error) {
	pkg, err := s.Export(req)
	if err != nil {
		return nil, err
	}
	token := "erased-" + req.RequestID
	updated := 0
	anon := func(row map[string]any) map[string]any {
		out := copyMap(row)
		out["email"] = token + "@anonymized.local"
		out["username"] = token
		out["phone"] = ""
		out["pass"] = "[ERASED]"
		out["password"] = "[ERASED]"
		out["refresh_token"] = ""
		out["gdpr_erased_at"] = time.Now().UTC().Format(time.RFC3339Nano)
		return out
	}
	for _, row := range pkg.Accounts {
		id := fmt.Sprint(row["id"])
		if id == "" || id == "<nil>" {
			continue
		}
		if _, err := s.rm.CreateRecord(csmAppID, accountsTable, anon(row), nil); err == nil {
			updated++
		}
	}
	for _, row := range pkg.SubUsers {
		id := fmt.Sprint(row["id"])
		if id == "" || id == "<nil>" {
			continue
		}
		if _, err := s.rm.CreateRecord(csmAppID, subAccountsTable, anon(row), nil); err == nil {
			updated++
		}
	}
	return &DSRErasureResult{
		RequestID:      req.RequestID,
		RecordsUpdated: updated,
		AnonymizedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

func redactSecrets(row map[string]any) map[string]any {
	return RedactMap(copyMap(row))
}

func copyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func appendUniqueMaps(slice []map[string]any, row map[string]any) []map[string]any {
	id := fmt.Sprint(row["id"])
	for _, existing := range slice {
		if fmt.Sprint(existing["id"]) == id {
			return slice
		}
	}
	return append(slice, row)
}

func rowsFromFilter(result map[string]any) []map[string]any {
	raw, _ := result["rows"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}
