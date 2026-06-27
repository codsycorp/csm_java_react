package services

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
)

type liveWebSignalMatrix struct {
	InternetHints      []string `json:"internetHints"`
	RealtimeCues       []string `json:"realtimeCues"`
	WeatherSignals     []string `json:"weatherSignals"`
	GeneralFactSignals []string `json:"generalFactSignals"`
}

var (
	liveWebSignalsOnce   sync.Once
	liveWebSignalsCached liveWebSignalMatrix
)

func getLiveWebSignalMatrix() liveWebSignalMatrix {
	liveWebSignalsOnce.Do(func() {
		liveWebSignalsCached = defaultLiveWebSignalMatrix()
		if raw := strings.TrimSpace(os.Getenv("AI_LIVE_WEB_SIGNAL_MATRIX_JSON")); raw != "" {
			var custom liveWebSignalMatrix
			if json.Unmarshal([]byte(raw), &custom) == nil {
				liveWebSignalsCached = mergeLiveWebSignalMatrix(liveWebSignalsCached, custom)
			}
		}
	})
	return liveWebSignalsCached
}

func defaultLiveWebSignalMatrix() liveWebSignalMatrix {
	return liveWebSignalMatrix{
		InternetHints: []string{
			"internet", "online", "tra cứu", "tra cuu", "xem trên mạng", "xem tren mang",
		},
		RealtimeCues: []string{
			"mới nhất", "moi nhat", "latest", "current", "real-time", "realtime",
			"hôm nay", "hom nay", "ngày mai", "ngay mai", "tomorrow", "today",
		},
		WeatherSignals: []string{
			"thời tiết", "thoi tiet", "weather", "nhiệt độ", "nhiet do", "mưa", "mua",
			"rain", "forecast", "dự báo", "du bao", "humidity", "độ ẩm", "do am",
		},
		GeneralFactSignals: []string{
			"tin tức", "tin tuc", "news", "giá", "gia", "price", "tỷ giá", "ty gia",
			"lãi suất", "lai suat", "chỉ số", "chi so", "stock", "crypto",
		},
	}
}

func mergeLiveWebSignalMatrix(base, custom liveWebSignalMatrix) liveWebSignalMatrix {
	out := base
	if len(custom.InternetHints) > 0 {
		out.InternetHints = custom.InternetHints
	}
	if len(custom.RealtimeCues) > 0 {
		out.RealtimeCues = custom.RealtimeCues
	}
	if len(custom.WeatherSignals) > 0 {
		out.WeatherSignals = custom.WeatherSignals
	}
	if len(custom.GeneralFactSignals) > 0 {
		out.GeneralFactSignals = custom.GeneralFactSignals
	}
	return out
}
