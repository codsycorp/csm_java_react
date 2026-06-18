//go:build linux

package config

import (
	"os"
	"strconv"
	"strings"
)

func detectSystemRAMGiB() float64 {
	b, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 8
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(line, "MemTotal:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			break
		}
		kb, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil || kb == 0 {
			break
		}
		return float64(kb) / (1024 * 1024)
	}
	return 8
}
