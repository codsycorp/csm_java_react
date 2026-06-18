//go:build !llamacpp

package services

import (
	"log"
	"os"

	"csm_server/backend-go/internal/config"
)

func RunLlamaWorker(_ config.AppConfig) {
	log.Println("llama worker requires build -tags llamacpp")
	os.Exit(1)
}
