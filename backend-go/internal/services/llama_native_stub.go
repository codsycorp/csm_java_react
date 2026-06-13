//go:build !llamacpp

package services

import (
	"errors"

	"csm_server/backend-go/internal/config"
)

var errNativeUnavailable = errors.New("native llama unavailable (build with -tags llamacpp)")

type llamaNativeBackend struct{}

func newLlamaNativeBackend(_ config.AppConfig) *llamaNativeBackend {
	return &llamaNativeBackend{}
}

func (n *llamaNativeBackend) ready() bool {
	return false
}

func (n *llamaNativeBackend) complete(_ string, _ uint32) (string, error) {
	return "", errNativeUnavailable
}

func (n *llamaNativeBackend) stream(_ string, _ uint32, _ func(string) error) error {
	return errNativeUnavailable
}

func (n *llamaNativeBackend) shutdown() {}

func (n *llamaNativeBackend) providerLabel() string {
	return ""
}
