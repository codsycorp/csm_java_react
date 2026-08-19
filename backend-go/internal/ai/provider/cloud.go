package provider

import (
	"context"
	"fmt"
	"os"
)

// CloudProvider is a stub adapter for hybrid routing.
// It is disabled unless CSM_AI_CLOUD_ENABLED=true and a provider key is present.
type CloudProvider struct {
	NameValue string
}

func NewCloudProvider(name string) *CloudProvider {
	return &CloudProvider{NameValue: name}
}

func (c *CloudProvider) Name() string {
	if c.NameValue == "" {
		return "cloud"
	}
	return c.NameValue
}

func (c *CloudProvider) Available() bool {
	return os.Getenv("CSM_AI_CLOUD_ENABLED") == "true" && os.Getenv("CSM_AI_CLOUD_KEY") != ""
}

func (c *CloudProvider) CountTokens(text string) (int, error) {
	return (len([]byte(text)) + 2) / 3, nil
}

func (c *CloudProvider) Complete(ctx context.Context, req CompletionRequest) (CompletionResponse, error) {
	if !c.Available() {
		return CompletionResponse{FinishReason: FinishReasonError}, fmt.Errorf("cloud provider not configured")
	}
	// Stub: real implementation would call OpenAI/Gemini/Claude API.
	return CompletionResponse{
		Text:          "{\"title\":\"Cloud title\",\"content\":\"<p>Cloud content.</p>\"}",
		Model:         c.Name(),
		FinishReason:  FinishReasonStop,
		InputTokens:   len(req.Prompt) / 3,
		OutputTokens:  50,
		ContextWindow: 128000,
	}, nil
}
