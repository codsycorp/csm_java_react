package provider

import "context"

type FinishReason string

const (
	FinishReasonUnknown      FinishReason = "unknown"
	FinishReasonStop         FinishReason = "stop"
	FinishReasonMaxTokens    FinishReason = "max_tokens"
	FinishReasonContextLimit FinishReason = "context_limit"
	FinishReasonError        FinishReason = "error"
)

type CompletionRequest struct {
	Prompt    string
	MaxTokens uint32
	Task      string
}

type CompletionResponse struct {
	Text              string
	Model             string
	ProviderRequestID string
	FinishReason      FinishReason
	InputTokens       int
	OutputTokens      int
	ContextWindow     int
}

type Provider interface {
	Name() string
	Available() bool
	CountTokens(string) (int, error)
	Complete(context.Context, CompletionRequest) (CompletionResponse, error)
}

type FuncProvider struct {
	ProviderName string
	ModelName    string
	ContextSize  int
	TokenCounter func(string) (int, error)
	IsAvailable  func() bool
	CompleteFunc func(context.Context, string, uint32) (string, error)
}

func (p FuncProvider) Name() string {
	return p.ProviderName
}

func (p FuncProvider) Available() bool {
	return p.IsAvailable != nil && p.IsAvailable()
}

func (p FuncProvider) CountTokens(text string) (int, error) {
	if p.TokenCounter != nil {
		return p.TokenCounter(text)
	}
	return (len([]byte(text)) + 2) / 3, nil
}

func (p FuncProvider) Complete(ctx context.Context, req CompletionRequest) (CompletionResponse, error) {
	text, err := p.CompleteFunc(ctx, req.Prompt, req.MaxTokens)
	response := CompletionResponse{
		Text: text, Model: p.ModelName, ContextWindow: p.ContextSize,
		FinishReason: FinishReasonUnknown,
	}
	if p.TokenCounter != nil {
		response.InputTokens, _ = p.TokenCounter(req.Prompt)
		response.OutputTokens, _ = p.TokenCounter(text)
	}
	if err != nil {
		response.FinishReason = FinishReasonError
	}
	return response, err
}
