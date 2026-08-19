package artifact

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	platformApp   = "_csm"
	artifactTable = "ai_step_artifacts"
)

type Artifact struct {
	ID            string
	TenantID      string
	RunID         string
	StepID        string
	ContentType   string
	Content       string
	Digest        string
	VerifiedFacts map[string]any
	EvidenceRefs  []string
	CreatedAt     time.Time
}

type Store struct {
	records *data.RecordManager
}

func New(records *data.RecordManager) *Store { return &Store{records: records} }

func (s *Store) Save(item Artifact) (Artifact, error) {
	if s == nil || s.records == nil {
		return Artifact{}, fmt.Errorf("artifact store unavailable")
	}
	if strings.TrimSpace(item.TenantID) == "" || strings.TrimSpace(item.RunID) == "" || strings.TrimSpace(item.StepID) == "" {
		return Artifact{}, fmt.Errorf("invalid artifact identity")
	}
	if item.ID == "" {
		item.ID = uuid.NewString()
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now().UTC()
	}
	item.Digest = digest(item.Content)
	_, err := s.records.CreateRecord(platformApp, artifactTable, map[string]any{
		"id": item.ID, "tenant_id": item.TenantID, "run_id": item.RunID, "step_id": item.StepID,
		"content_type": item.ContentType, "content": item.Content, "digest": item.Digest,
		"verified_facts": item.VerifiedFacts, "evidence_refs": item.EvidenceRefs,
		"created_at_ms": item.CreatedAt.UnixMilli(),
	}, []string{"id"})
	return item, err
}

func (s *Store) GetForTenant(tenantID, artifactID string) (Artifact, bool) {
	if s == nil || s.records == nil || strings.TrimSpace(tenantID) == "" || strings.TrimSpace(artifactID) == "" {
		return Artifact{}, false
	}
	row := s.records.Find(platformApp, artifactTable, model.EqFilter("id", artifactID))
	if len(row) == 0 || strings.TrimSpace(fmt.Sprint(row["tenant_id"])) != strings.TrimSpace(tenantID) {
		return Artifact{}, false
	}
	item := Artifact{
		ID: artifactID, TenantID: tenantID,
		RunID: fmt.Sprint(row["run_id"]), StepID: fmt.Sprint(row["step_id"]),
		ContentType: fmt.Sprint(row["content_type"]), Content: fmt.Sprint(row["content"]),
		Digest: fmt.Sprint(row["digest"]),
	}
	return item, item.Digest == digest(item.Content)
}

func digest(content string) string {
	hash := sha256.Sum256([]byte(content))
	return "sha256:" + hex.EncodeToString(hash[:])
}
