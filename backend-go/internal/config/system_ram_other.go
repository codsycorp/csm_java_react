//go:build !darwin && !linux

package config

func detectSystemRAMGiB() float64 {
	return 8
}
