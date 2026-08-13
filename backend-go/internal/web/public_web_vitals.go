package web

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"csm_server/backend-go/internal/state"
)

type webVitalEntry struct {
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	Rating    string  `json:"rating"`
	Path      string  `json:"path"`
	ID        string  `json:"id"`
	Timestamp int64   `json:"timestamp"`
}

type webVitalSummary struct {
	Count int     `json:"count"`
	Avg   float64 `json:"avg"`
	P75   float64 `json:"p75"`
	Min   float64 `json:"min"`
	Max   float64 `json:"max"`
}

const maxWebVitalsEntries = 3000

var publicWebVitalsStore = struct {
	sync.Mutex
	entries []webVitalEntry
}{entries: make([]webVitalEntry, 0, 512)}

func ServePublicWebVitals(_ *state.AppState, w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		handlePublicWebVitalsIngest(w, r)
	case http.MethodGet:
		handlePublicWebVitalsSummary(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"success": false, "error": "method not allowed"})
	}
}

func handlePublicWebVitalsIngest(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "invalid body"})
		return
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "invalid json"})
		return
	}

	entry := webVitalEntry{
		Name:      strings.ToUpper(strings.TrimSpace(recordStr(payload, "name"))),
		Value:     recordFloat(payload, "value"),
		Rating:    strings.TrimSpace(recordStr(payload, "rating")),
		Path:      NormalizeIncomingWebPath(firstNonEmpty(recordStr(payload, "path"), "/")),
		ID:        strings.TrimSpace(recordStr(payload, "id")),
		Timestamp: time.Now().UnixMilli(),
	}

	if entry.Name == "" || entry.Value <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"success": false, "error": "missing name or value"})
		return
	}

	publicWebVitalsStore.Lock()
	publicWebVitalsStore.entries = append(publicWebVitalsStore.entries, entry)
	if len(publicWebVitalsStore.entries) > maxWebVitalsEntries {
		trimFrom := len(publicWebVitalsStore.entries) - maxWebVitalsEntries
		publicWebVitalsStore.entries = publicWebVitalsStore.entries[trimFrom:]
	}
	publicWebVitalsStore.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func handlePublicWebVitalsSummary(w http.ResponseWriter, r *http.Request) {
	path := NormalizeIncomingWebPath(strings.TrimSpace(r.URL.Query().Get("path")))
	if path == "" {
		path = "/"
	}

	publicWebVitalsStore.Lock()
	entries := make([]webVitalEntry, len(publicWebVitalsStore.entries))
	copy(entries, publicWebVitalsStore.entries)
	publicWebVitalsStore.Unlock()

	metrics := map[string][]float64{}
	for _, e := range entries {
		if path != "/" && e.Path != path {
			continue
		}
		if e.Name == "" || e.Value <= 0 {
			continue
		}
		metrics[e.Name] = append(metrics[e.Name], e.Value)
	}

	summary := map[string]webVitalSummary{}
	for name, values := range metrics {
		summary[name] = summarizeWebVital(values)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"path":    path,
		"summary": summary,
		"count":   len(entries),
	})
}

func summarizeWebVital(values []float64) webVitalSummary {
	if len(values) == 0 {
		return webVitalSummary{}
	}
	sorted := make([]float64, len(values))
	copy(sorted, values)
	sortFloat64s(sorted)

	total := 0.0
	for _, v := range sorted {
		total += v
	}
	p75Idx := int(float64(len(sorted)-1) * 0.75)
	if p75Idx < 0 {
		p75Idx = 0
	}
	if p75Idx >= len(sorted) {
		p75Idx = len(sorted) - 1
	}

	return webVitalSummary{
		Count: len(sorted),
		Avg:   total / float64(len(sorted)),
		P75:   sorted[p75Idx],
		Min:   sorted[0],
		Max:   sorted[len(sorted)-1],
	}
}

func sortFloat64s(values []float64) {
	for i := 1; i < len(values); i++ {
		j := i
		for j > 0 && values[j-1] > values[j] {
			values[j-1], values[j] = values[j], values[j-1]
			j--
		}
	}
}

func recordFloat(m map[string]any, key string) float64 {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case json.Number:
		f, _ := x.Float64()
		return f
	case string:
		f, _ := json.Number(strings.TrimSpace(x)).Float64()
		return f
	default:
		return 0
	}
}
