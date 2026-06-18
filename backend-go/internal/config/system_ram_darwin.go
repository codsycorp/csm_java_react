//go:build darwin

package config

import (
	"os/exec"
	"strconv"
	"strings"
)

func detectSystemRAMGiB() float64 {
	out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return 8
	}
	bytes, err := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
	if err != nil || bytes == 0 {
		return 8
	}
	return float64(bytes) / (1024 * 1024 * 1024)
}
