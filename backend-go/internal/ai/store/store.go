package store

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/ai/domain"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/model"
)

const (
	platformApp = "_csm"
	runsTable   = "ai_runs"
	stepsTable  = "ai_run_steps"
	usageTable  = "ai_usage_ledger"
	agentsTable = "ai_agent_definitions"
	plansTable  = "ai_run_plans"
)

type Store struct {
	records *data.RecordManager
	mu      sync.Mutex
}

func New(records *data.RecordManager) *Store {
	return &Store{records: records}
}

func (s *Store) Available() bool {
	return s != nil && s.records != nil
}

func NewRun(requestID, tenantID, agentID, goal string, totalSteps int) domain.AgentRun {
	now := time.Now().UTC()
	if strings.TrimSpace(tenantID) == "" {
		tenantID = "csm"
	}
	return domain.AgentRun{
		RunID: uuid.NewString(), RequestID: strings.TrimSpace(requestID),
		TenantID: strings.TrimSpace(tenantID), AgentID: strings.TrimSpace(agentID),
		AgentVersion: 1, Goal: strings.TrimSpace(goal), Status: domain.RunPending,
		TotalSteps: totalSteps, CreatedAt: now, UpdatedAt: now,
	}
}

func (s *Store) SaveRun(run domain.AgentRun) error {
	if !s.Available() {
		return nil
	}
	if strings.TrimSpace(run.RunID) == "" || strings.TrimSpace(run.TenantID) == "" {
		return fmt.Errorf("invalid AI run identity")
	}
	_, err := s.records.CreateRecord(platformApp, runsTable, map[string]any{
		"id": run.RunID, "run_id": run.RunID, "request_id": run.RequestID,
		"tenant_id": run.TenantID, "agent_id": run.AgentID, "agent_version": run.AgentVersion,
		"plan_version": run.PlanVersion, "plan_digest": run.PlanDigest,
		"goal": run.Goal, "status": string(run.Status), "current_step": run.CurrentStep,
		"completed_steps": run.CompletedSteps, "total_steps": run.TotalSteps,
		"context_revision": run.ContextRevision,
		"created_at_ms":    run.CreatedAt.UnixMilli(), "updated_at_ms": run.UpdatedAt.UnixMilli(),
	}, []string{"id"})
	return err
}

func (s *Store) SavePlan(tenantID, runID string, plan domain.ExecutionPlan, digest string) error {
	if !s.Available() {
		return nil
	}
	if strings.TrimSpace(tenantID) == "" || strings.TrimSpace(runID) == "" || plan.Version < 1 {
		return fmt.Errorf("invalid AI plan identity")
	}
	payload, err := json.Marshal(plan)
	if err != nil {
		return err
	}
	_, err = s.records.CreateRecord(platformApp, plansTable, map[string]any{
		"id": fmt.Sprintf("%s:v%d", runID, plan.Version), "tenant_id": tenantID,
		"run_id": runID, "version": plan.Version, "digest": digest,
		"plan_json": string(payload), "created_at_ms": time.Now().UTC().UnixMilli(),
	}, []string{"id"})
	return err
}

func (s *Store) SaveStep(step domain.RunStep) error {
	if !s.Available() {
		return nil
	}
	if strings.TrimSpace(step.RunID) == "" || strings.TrimSpace(step.StepID) == "" {
		return fmt.Errorf("invalid AI step identity")
	}
	rowID := step.RunID + ":" + step.StepID
	_, err := s.records.CreateRecord(platformApp, stepsTable, map[string]any{
		"id": rowID, "run_id": step.RunID, "tenant_id": step.TenantID,
		"step_id": step.StepID, "sequence": step.Sequence,
		"kind": step.Kind, "provider": step.Provider, "model": step.Model,
		"status": string(step.Status), "attempt": step.Attempt, "idempotency_key": step.IdempotencyKey,
		"lease_owner": step.LeaseOwner, "lease_expires_at_ms": millis(step.LeaseExpiresAt),
		"next_retry_at_ms": millis(step.NextRetryAt),
		"depends_on":       step.DependsOn, "covers": step.Covers,
		"input_schema": step.InputSchema, "output_schema": step.OutputSchema,
		"context_digest": step.ContextDigest, "output_digest": step.OutputDigest,
		"evidence_refs": step.EvidenceRefs, "verifier": step.Verifier,
		"input_chars": step.InputChars, "output_chars": step.OutputChars,
		"error_code": step.ErrorCode, "error_text": truncate(step.ErrorText, 1200),
		"started_at_ms": millis(step.StartedAt), "completed_at_ms": millis(step.CompletedAt),
	}, []string{"id"})
	return err
}

func (s *Store) RecordUsage(runID, tenantID, agentID, stepID string, usage domain.Usage) error {
	if !s.Available() {
		return nil
	}
	now := time.Now().UTC()
	usageID := uuid.NewString()
	_, err := s.records.CreateRecord(platformApp, usageTable, map[string]any{
		"id": usageID, "run_id": runID, "tenant_id": tenantID, "agent_id": agentID,
		"step_id": stepID, "provider": usage.Provider, "model": usage.Model,
		"input_chars": usage.InputChars, "output_chars": usage.OutputChars,
		"input_tokens": usage.InputTokens, "output_tokens": usage.OutputTokens,
		"estimated_tokens": usage.EstimatedTokens, "finish_reason": usage.FinishReason,
		"context_window": usage.ContextWindow, "duration_ms": usage.Duration.Milliseconds(),
		"provider_request_id": usage.ProviderRequestID, "created_at_ms": now.UnixMilli(),
	}, []string{"id"})
	return err
}

func (s *Store) GetRun(runID string) (map[string]any, bool) {
	if !s.Available() || strings.TrimSpace(runID) == "" {
		return nil, false
	}
	row := s.records.Find(platformApp, runsTable, model.EqFilter("id", runID))
	return row, len(row) > 0
}

func (s *Store) GetRunForTenant(tenantID, runID string) (map[string]any, bool) {
	if !s.Available() || strings.TrimSpace(tenantID) == "" || strings.TrimSpace(runID) == "" {
		return nil, false
	}
	row, ok := s.GetRun(runID)
	if !ok || strings.TrimSpace(fmt.Sprint(row["tenant_id"])) != strings.TrimSpace(tenantID) {
		return nil, false
	}
	return row, true
}

func (s *Store) ListStepsForRun(tenantID, runID string) []map[string]any {
	if !s.Available() || strings.TrimSpace(tenantID) == "" || strings.TrimSpace(runID) == "" {
		return []map[string]any{}
	}
	result := s.records.Filter(platformApp, stepsTable, model.EqFilter("run_id", runID))
	candidates := filterRows(result)
	rows := make([]map[string]any, 0, len(candidates))
	for _, row := range candidates {
		if strings.TrimSpace(fmt.Sprint(row["tenant_id"])) == strings.TrimSpace(tenantID) {
			rows = append(rows, row)
		}
	}
	return rows
}

func (s *Store) AcquireStepLease(tenantID, runID, stepID, owner string, now time.Time, ttl time.Duration) (domain.RunStep, error) {
	if !s.Available() || strings.TrimSpace(owner) == "" || ttl <= 0 {
		return domain.RunStep{}, fmt.Errorf("invalid step lease request")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	step, ok := s.getStepForTenant(tenantID, runID, stepID)
	if !ok {
		return domain.RunStep{}, fmt.Errorf("step not found")
	}
	if step.Status == domain.StepSucceeded || step.Status == domain.StepFailed {
		return domain.RunStep{}, fmt.Errorf("step is terminal: %s", step.Status)
	}
	if step.Status == domain.StepRunning && step.LeaseOwner != owner && step.LeaseExpiresAt.After(now) {
		return domain.RunStep{}, fmt.Errorf("step lease is held by another worker")
	}
	if !step.NextRetryAt.IsZero() && step.NextRetryAt.After(now) {
		return domain.RunStep{}, fmt.Errorf("step retry is not due")
	}
	step.Status = domain.StepRunning
	step.LeaseOwner = owner
	step.LeaseExpiresAt = now.Add(ttl)
	step.Attempt++
	if err := s.SaveStep(step); err != nil {
		return domain.RunStep{}, err
	}
	return step, nil
}

func (s *Store) RecoverExpiredStepLeases(tenantID, runID string, now time.Time) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows := s.ListStepsForRun(tenantID, runID)
	recovered := 0
	for _, row := range rows {
		step := rowToRunStep(row)
		if step.Status != domain.StepRunning || step.LeaseExpiresAt.IsZero() || step.LeaseExpiresAt.After(now) {
			continue
		}
		step.Status = domain.StepRetryScheduled
		step.LeaseOwner = ""
		step.LeaseExpiresAt = time.Time{}
		step.NextRetryAt = now
		if err := s.SaveStep(step); err != nil {
			return recovered, err
		}
		recovered++
	}
	return recovered, nil
}

func (s *Store) getStepForTenant(tenantID, runID, stepID string) (domain.RunStep, bool) {
	rowID := runID + ":" + stepID
	row := s.records.Find(platformApp, stepsTable, model.EqFilter("id", rowID))
	if len(row) == 0 || strings.TrimSpace(fmt.Sprint(row["tenant_id"])) != strings.TrimSpace(tenantID) {
		return domain.RunStep{}, false
	}
	return rowToRunStep(row), true
}

func rowToRunStep(row map[string]any) domain.RunStep {
	return domain.RunStep{
		RunID: fmt.Sprint(row["run_id"]), TenantID: fmt.Sprint(row["tenant_id"]),
		StepID: fmt.Sprint(row["step_id"]), Sequence: intFromAny(row["sequence"]),
		Kind: fmt.Sprint(row["kind"]), Provider: fmt.Sprint(row["provider"]), Model: fmt.Sprint(row["model"]),
		Status: domain.StepStatus(fmt.Sprint(row["status"])), Attempt: intFromAny(row["attempt"]),
		IdempotencyKey: fmt.Sprint(row["idempotency_key"]), LeaseOwner: fmt.Sprint(row["lease_owner"]),
		LeaseExpiresAt: timeFromMillis(row["lease_expires_at_ms"]), NextRetryAt: timeFromMillis(row["next_retry_at_ms"]),
		InputChars: intFromAny(row["input_chars"]), OutputChars: intFromAny(row["output_chars"]),
		ErrorCode: fmt.Sprint(row["error_code"]), ErrorText: fmt.Sprint(row["error_text"]),
	}
}

func intFromAny(value any) int {
	switch number := value.(type) {
	case int:
		return number
	case int64:
		return int(number)
	case float64:
		return int(number)
	default:
		return 0
	}
}

func timeFromMillis(value any) time.Time {
	millisValue := int64(intFromAny(value))
	if millisValue <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(millisValue).UTC()
}

func filterRows(result map[string]any) []map[string]any {
	rawRows, _ := result["rows"].([]any)
	rows := make([]map[string]any, 0, len(rawRows))
	for _, raw := range rawRows {
		if row, ok := raw.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func (s *Store) SaveAgent(agent domain.AgentDefinition) error {
	if !s.Available() {
		return nil
	}
	if strings.TrimSpace(agent.AgentID) == "" || strings.TrimSpace(agent.TenantID) == "" || agent.Version < 1 {
		return fmt.Errorf("invalid agent definition identity")
	}
	now := time.Now().UTC()
	if agent.CreatedAt.IsZero() {
		agent.CreatedAt = now
	}
	agent.UpdatedAt = now
	rowID := fmt.Sprintf("%s:%s:v%d", agent.TenantID, agent.AgentID, agent.Version)
	_, err := s.records.CreateRecord(platformApp, agentsTable, map[string]any{
		"id": rowID, "agent_id": agent.AgentID, "tenant_id": agent.TenantID,
		"name": agent.Name, "version": agent.Version, "status": agent.Status,
		"instructions": agent.Instructions, "skills": agent.Skills, "allowed_tools": agent.AllowedTools,
		"preferred_mode": agent.PreferredMode, "cloud_allowed": agent.CloudAllowed,
		"max_steps": agent.MaxSteps, "created_at_ms": agent.CreatedAt.UnixMilli(),
		"updated_at_ms": agent.UpdatedAt.UnixMilli(),
	}, []string{"id"})
	return err
}

func (s *Store) ListAgents(tenantID string) []map[string]any {
	if !s.Available() || strings.TrimSpace(tenantID) == "" {
		return []map[string]any{}
	}
	result := s.records.Filter(platformApp, agentsTable, model.EqFilter("tenant_id", tenantID))
	rawRows, _ := result["rows"].([]any)
	rows := make([]map[string]any, 0, len(rawRows))
	for _, raw := range rawRows {
		if row, ok := raw.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func millis(value time.Time) int64 {
	if value.IsZero() {
		return 0
	}
	return value.UnixMilli()
}

func truncate(value string, maxChars int) string {
	if len(value) <= maxChars {
		return value
	}
	return value[:maxChars]
}
