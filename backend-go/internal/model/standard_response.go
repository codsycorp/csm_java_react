package model

import (
	"encoding/json"
	"net/http"
)

type StandardResponse struct {
	Properties   map[string]any `json:"-"`
	BinaryBody   []byte
	ContentType  string
	ExtraHeaders http.Header
}

func NewResponse() *StandardResponse {
	return &StandardResponse{
		Properties:   make(map[string]any),
		ExtraHeaders: make(http.Header),
	}
}

func (r *StandardResponse) Set(key string, value any) {
	r.Properties[key] = value
}

func (r *StandardResponse) Get(key string) (any, bool) {
	v, ok := r.Properties[key]
	return v, ok
}

func (r *StandardResponse) Code() int {
	if v, ok := r.Properties["code"]; ok {
		switch n := v.(type) {
		case int:
			return n
		case int64:
			return int(n)
		case float64:
			return int(n)
		}
	}
	return 200
}

func (r *StandardResponse) Success() bool {
	if v, ok := r.Properties["success"].(bool); ok {
		return v
	}
	return true
}

func (r *StandardResponse) Write(w http.ResponseWriter) {
	for k, vals := range r.ExtraHeaders {
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	if r.BinaryBody != nil {
		if r.ContentType != "" {
			w.Header().Set("Content-Type", r.ContentType)
		}
		w.WriteHeader(r.Code())
		_, _ = w.Write(r.BinaryBody)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(r.Code())
	_ = json.NewEncoder(w).Encode(r.Properties)
}

func ErrorResponse(code int, message string) *StandardResponse {
	r := NewResponse()
	r.Set("code", code)
	r.Set("success", false)
	r.Set("message", message)
	return r
}

func OKResponse(result any) *StandardResponse {
	r := NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("message", "ok")
	r.Set("result", result)
	return r
}

func NotImplemented(message string) *StandardResponse {
	if message == "" {
		message = "Not implemented — port from Java backend"
	}
	return ErrorResponse(501, message)
}
