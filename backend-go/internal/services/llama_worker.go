//go:build llamacpp

package services

import (
	"bufio"
	"encoding/json"
	"log"
	"os"

	"csm_server/backend-go/internal/config"
)

// RunLlamaWorker runs llama inference in a child process (CSM_LLAMA_WORKER=1).
// JSONL on stdin/stdout; SIGABRT in llama.cpp only kills this process, not the HTTP server.
func RunLlamaWorker(cfg config.AppConfig) {
	log.SetOutput(os.Stderr)
	enc := json.NewEncoder(os.Stdout)
	writeLine := func(v any) {
		_ = enc.Encode(v)
	}

	backend := newLlamaNativeBackend(cfg)
	if !backend.ready() {
		writeLine(llamaWorkerResponse{OK: false, Error: "native llama not ready"})
		os.Exit(1)
	}
	if cfg.AI.LlamaPreloadOnStartup {
		if err := backend.ensureLoaded(); err != nil {
			writeLine(llamaWorkerResponse{OK: false, Error: err.Error()})
			os.Exit(1)
		}
	}
	writeLine(llamaWorkerResponse{Ready: true})

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var req llamaWorkerRequest
		if err := json.Unmarshal(line, &req); err != nil {
			writeLine(llamaWorkerResponse{OK: false, Error: err.Error()})
			continue
		}
		switch req.Op {
		case "shutdown":
			backend.shutdown()
			return
		case "complete":
			text, err := backend.complete(req.Prompt, req.MaxTokens)
			if err != nil {
				writeLine(llamaWorkerResponse{ID: req.ID, OK: false, Error: err.Error()})
				continue
			}
			writeLine(llamaWorkerResponse{ID: req.ID, OK: true, Text: text})
		case "stream":
			err := backend.stream(req.Prompt, req.MaxTokens, func(tok string) error {
				writeLine(llamaWorkerResponse{ID: req.ID, Token: tok})
				return nil
			})
			if err != nil {
				writeLine(llamaWorkerResponse{ID: req.ID, OK: false, Error: err.Error()})
				continue
			}
			writeLine(llamaWorkerResponse{ID: req.ID, OK: true, Done: true})
		default:
			writeLine(llamaWorkerResponse{ID: req.ID, OK: false, Error: "unknown op: " + req.Op})
		}
	}
	backend.shutdown()
}
