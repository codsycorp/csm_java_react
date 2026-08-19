package domain

import "time"

type RunStatus string

const (
	RunPending   RunStatus = "PENDING"
	RunRunning   RunStatus = "RUNNING"
	RunSucceeded RunStatus = "SUCCEEDED"
	RunFailed    RunStatus = "FAILED"
	RunCancelled RunStatus = "CANCELLED"
)

type StepStatus string

const (
	StepPending        StepStatus = "PENDING"
	StepRunning        StepStatus = "RUNNING"
	StepCandidate      StepStatus = "CANDIDATE"
	StepSucceeded      StepStatus = "SUCCEEDED"
	StepFailed         StepStatus = "FAILED"
	StepRetryScheduled StepStatus = "RETRY_SCHEDULED"
)

type AgentRun struct {
	RunID           string
	RequestID       string
	TenantID        string
	AgentID         string
	AgentVersion    int
	PlanVersion     int
	Goal            string
	PlanDigest      string
	Status          RunStatus
	CurrentStep     int
	CompletedSteps  int
	TotalSteps      int
	ContextRevision int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Requirement struct {
	ID                 string   `json:"id"`
	Description        string   `json:"description"`
	Required           bool     `json:"required"`
	RequireEvidence    bool     `json:"requireEvidence,omitempty"`
	AcceptanceCriteria []string `json:"acceptanceCriteria"`
}

type ExecutionPlan struct {
	Version      int           `json:"version"`
	Goal         string        `json:"goal"`
	Requirements []Requirement `json:"requirements"`
	Steps        []PlanStep    `json:"steps"`
}

type PlanStep struct {
	ID              string   `json:"id"`
	Sequence        int      `json:"sequence"`
	Type            string   `json:"type"`
	Name            string   `json:"name"`
	Tool            string   `json:"tool,omitempty"`
	Skill           string   `json:"skill,omitempty"`
	DependsOn       []string `json:"dependsOn"`
	Covers          []string `json:"covers"`
	InputSchema     string   `json:"inputSchema"`
	OutputSchema    string   `json:"outputSchema"`
	Required        bool     `json:"required"`
	MaxInputTokens  int      `json:"maxInputTokens"`
	MaxOutputTokens int      `json:"maxOutputTokens"`
}

type RequirementResult struct {
	RequirementID string
	Passed        bool
	EvidenceRefs  []string
	Reason        string
}

type VerificationResult struct {
	Passed       bool
	Score        float64
	Requirements []RequirementResult
	Missing      []string
}

type RunStep struct {
	RunID          string
	TenantID       string
	StepID         string
	Sequence       int
	Kind           string
	Provider       string
	Model          string
	Status         StepStatus
	Attempt        int
	IdempotencyKey string
	LeaseOwner     string
	LeaseExpiresAt time.Time
	NextRetryAt    time.Time
	DependsOn      []string
	Covers         []string
	InputSchema    string
	OutputSchema   string
	ContextDigest  string
	OutputDigest   string
	EvidenceRefs   []string
	Verifier       VerificationResult
	InputChars     int
	OutputChars    int
	ErrorCode      string
	ErrorText      string
	StartedAt      time.Time
	CompletedAt    time.Time
}

type Usage struct {
	Provider          string
	Model             string
	InputChars        int
	OutputChars       int
	InputTokens       int
	OutputTokens      int
	EstimatedTokens   int
	FinishReason      string
	ContextWindow     int
	Duration          time.Duration
	ProviderRequestID string
}

type AgentDefinition struct {
	AgentID       string
	TenantID      string
	Name          string
	Version       int
	Status        string
	Instructions  string
	Skills        []string
	AllowedTools  []string
	PreferredMode string
	CloudAllowed  bool
	MaxSteps      int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
