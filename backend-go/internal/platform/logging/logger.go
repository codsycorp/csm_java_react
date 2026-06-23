package logging

import (
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"
)

// Logger emits structured JSON lines when enabled (CSM_STRUCTURED_LOGS=true).
type Logger struct {
	mu       sync.Mutex
	std      *log.Logger
	enabled  bool
	service  string
}

var defaultLogger = New(false, "csm-go")

func envService() string {
	if v := os.Getenv("CSM_SERVICE_NAME"); v != "" {
		return v
	}
	return "csm-go"
}

// Default returns the process-wide structured logger.
func Default() *Logger { return defaultLogger }

// Configure replaces the default logger settings at startup.
func Configure(enabled bool, service string) {
	if service == "" {
		service = "csm-go"
	}
	defaultLogger = New(enabled, service)
}

func New(enabled bool, service string) *Logger {
	return &Logger{
		std:     log.New(os.Stdout, "", 0),
		enabled: enabled,
		service: service,
	}
}

func (l *Logger) Info(msg string, fields map[string]any)  { l.emit("info", msg, fields) }
func (l *Logger) Warn(msg string, fields map[string]any)  { l.emit("warn", msg, fields) }
func (l *Logger) Error(msg string, fields map[string]any) { l.emit("error", msg, fields) }

func (l *Logger) emit(level, msg string, fields map[string]any) {
	if fields == nil {
		fields = map[string]any{}
	}
	if !l.enabled {
		l.mu.Lock()
		l.std.Printf("[%s] %s %v", level, msg, fields)
		l.mu.Unlock()
		return
	}
	entry := map[string]any{
		"ts":      time.Now().UTC().Format(time.RFC3339Nano),
		"level":   level,
		"service": l.service,
		"msg":     msg,
	}
	for k, v := range fields {
		entry[k] = v
	}
	b, err := json.Marshal(entry)
	if err != nil {
		log.Printf("[%s] %s (marshal err: %v)", level, msg, err)
		return
	}
	l.mu.Lock()
	l.std.Println(string(b))
	l.mu.Unlock()
}
