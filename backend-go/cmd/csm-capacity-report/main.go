package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

func main() {
	config.LoadEnvFiles()
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init: %v\n", err)
		os.Exit(1)
	}
	defer rm.ShutdownAll()

	report := rm.BuildCapacityReport()
	report.GeneratedAt = time.Now().UTC().Format(time.RFC3339Nano)
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(report); err != nil {
		fmt.Fprintf(os.Stderr, "encode: %v\n", err)
		os.Exit(1)
	}
}
