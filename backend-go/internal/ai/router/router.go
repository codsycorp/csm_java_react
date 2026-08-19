package router

import (
	"context"
	"fmt"
	"strings"

	"csm_server/backend-go/internal/ai/provider"
)

// Decision captures why a provider was chosen.
type Decision struct {
	Provider      string  `json:"provider"`
	Model         string  `json:"model"`
	Reason        string  `json:"reason"`
	CloudUsed     bool    `json:"cloudUsed"`
	InputTokens   int     `json:"inputTokens"`
	OutputTokens  int     `json:"outputTokens"`
	ContextWindow int     `json:"contextWindow"`
	EstCostUSD    float64 `json:"estCostUsd"`
}

// ModelPolicy mirrors the blueprint agent.modelPolicy block.
type ModelPolicy struct {
	Preferred       string  `json:"preferred"`
	MinimumQuality  float64 `json:"minimumQuality"`
	CloudAllowed    bool    `json:"cloudAllowed"`
	CloudDataPolicy string  `json:"cloudDataPolicy"`
	MaxInputTokens  int     `json:"maxInputTokens"`
	MaxOutputTokens int     `json:"maxOutputTokens"`
	MaxCostUSD      float64 `json:"maxCostUsd"`
}

// Capability describes what a provider can do right now.
type Capability struct {
	Provider      string  `json:"provider"`
	Model         string  `json:"model"`
	Available     bool    `json:"available"`
	ContextWindow int     `json:"contextWindow"`
	QualityScore  float64 `json:"qualityScore"`
	CostPer1KIn   float64 `json:"costPer1KIn"`
	CostPer1KOut  float64 `json:"costPer1KOut"`
}

// Registry lists candidate providers.
type Registry struct {
	Providers []provider.Provider
}

func New(providers ...provider.Provider) *Registry {
	return &Registry{Providers: providers}
}

// Route picks a provider for a request according to the blueprint hybrid rules.
func (r *Registry) Route(ctx context.Context, policy ModelPolicy, inputTokens, outputTokens int, dataTags []string) (Decision, error) {
	if policy.Preferred == "" {
		policy.Preferred = "local"
	}
	if policy.MinimumQuality <= 0 {
		policy.MinimumQuality = 0.5
	}

	local := r.find("local")
	cloud := r.find("cloud")

	localCap := capabilityOf(local, "local")
	cloudCap := capabilityOf(cloud, "cloud")

	// Privacy gate: if any data tag is sensitive, force local when available.
	hasSensitiveData := hasSensitiveTag(dataTags)
	if hasSensitiveData && localCap.Available && localCap.ContextWindow >= inputTokens+outputTokens {
		return decisionFrom(localCap, inputTokens, outputTokens, "local_first_sensitive_data"), nil
	}

	// Preferred local path.
	if policy.Preferred == "local" && localCap.Available {
		if localCap.QualityScore >= policy.MinimumQuality && localCap.ContextWindow >= inputTokens+outputTokens {
			return decisionFrom(localCap, inputTokens, outputTokens, "preferred_local_meets_gate"), nil
		}
	}

	// Fallback to cloud if allowed and capable.
	if policy.CloudAllowed && cloudCap.Available {
		if cloudCap.QualityScore >= policy.MinimumQuality && cloudCap.ContextWindow >= inputTokens+outputTokens {
			est := estimateCost(cloudCap, inputTokens, outputTokens)
			if policy.MaxCostUSD <= 0 || est <= policy.MaxCostUSD {
				d := decisionFrom(cloudCap, inputTokens, outputTokens, "local_unmet_fallback_cloud")
				d.CloudUsed = true
				d.EstCostUSD = est
				return d, nil
			}
		}
	}

	// If local is available but quality gate failed, still use local unless cloud is mandatory.
	if localCap.Available {
		return decisionFrom(localCap, inputTokens, outputTokens, "local_available_below_quality_gate"), nil
	}

	return Decision{}, fmt.Errorf("no provider available: local=%v cloud=%v", localCap.Available, cloudCap.Available)
}

func (r *Registry) find(name string) provider.Provider {
	for _, p := range r.Providers {
		if p != nil && p.Name() == name {
			return p
		}
	}
	return nil
}

func capabilityOf(p provider.Provider, name string) Capability {
	if p == nil {
		return Capability{Provider: name, Available: false}
	}
	_ = p.Available()
	return Capability{
		Provider:      p.Name(),
		Model:         "unknown",
		Available:     p.Available(),
		ContextWindow: 8192,
		QualityScore:  0.75,
		CostPer1KIn:   0.0,
		CostPer1KOut:  0.0,
	}
}

func decisionFrom(cap Capability, inTokens, outTokens int, reason string) Decision {
	return Decision{
		Provider:      cap.Provider,
		Model:         cap.Model,
		Reason:        reason,
		CloudUsed:     false,
		InputTokens:   inTokens,
		OutputTokens:  outTokens,
		ContextWindow: cap.ContextWindow,
		EstCostUSD:    estimateCost(cap, inTokens, outTokens),
	}
}

func estimateCost(cap Capability, inTokens, outTokens int) float64 {
	return (float64(inTokens)*cap.CostPer1KIn + float64(outTokens)*cap.CostPer1KOut) / 1000.0
}

func hasSensitiveTag(tags []string) bool {
	for _, t := range tags {
		lower := strings.ToLower(strings.TrimSpace(t))
		if lower == "secret" || lower == "cross_tenant" || lower == "pii" || lower == "private" {
			return true
		}
	}
	return false
}
