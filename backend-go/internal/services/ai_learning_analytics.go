package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
)

type AILearningDailyPoint struct {
	Date      string `json:"date"`
	CodeCount int    `json:"codeCount"`
	MenuCount int    `json:"menuCount"`
	Total     int    `json:"total"`
}

type AILearningDailyStats struct {
	AppID          string                 `json:"appId"`
	Days           int                    `json:"days"`
	GeneratedAtMs  int64                  `json:"generatedAtMs"`
	JournalEnabled bool                   `json:"journalEnabled"`
	Source         string                 `json:"source"`
	CodeSamples    int                    `json:"codeSamples"`
	MenuSamples    int                    `json:"menuSamples"`
	TotalSamples   int                    `json:"totalSamples"`
	Points         []AILearningDailyPoint `json:"points"`
}

type AILearningMaintenanceReport struct {
	Success          bool                 `json:"success"`
	AppID            string               `json:"appId"`
	GeneratedAtMs    int64                `json:"generatedAtMs"`
	ReportPath       string               `json:"reportPath"`
	JournalCodePath  string               `json:"journalCodePath"`
	JournalMenuPath  string               `json:"journalMenuPath"`
	JournalCodeBytes int64                `json:"journalCodeBytes"`
	JournalMenuBytes int64                `json:"journalMenuBytes"`
	Stats30d         AILearningDailyStats `json:"stats30d"`
}

func normalizeLearningDays(days int) int {
	if days <= 0 {
		return 30
	}
	if days > 365 {
		return 365
	}
	return days
}

func dateKeyFromMs(ms int64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(ms).Format("2006-01-02")
}

func indexDateWindow(days int, now time.Time) []string {
	out := make([]string, 0, days)
	for i := days - 1; i >= 0; i-- {
		out = append(out, now.AddDate(0, 0, -i).Format("2006-01-02"))
	}
	return out
}

// BuildAILearningDailyStats returns day-by-day growth stats for learning data.
func BuildAILearningDailyStats(cfg config.AppConfig, rm *data.RecordManager, appID string, days int) AILearningDailyStats {
	days = normalizeLearningDays(days)
	appID = strings.TrimSpace(appID)
	if appID == "" {
		appID = "csm"
	}

	stats := AILearningDailyStats{
		AppID:          appID,
		Days:           days,
		GeneratedAtMs:  time.Now().UnixMilli(),
		JournalEnabled: learningJournalEnabled(),
		Source:         "window_store",
	}

	var codeEntries []CodeLearningEntry
	var menuEntries []MenuLearningEntry
	if learningJournalEnabled() {
		if rows, err := loadCodeLearningJournalEntries(cfg, appID); err == nil {
			codeEntries = rows
		}
		if rows, err := loadMenuLearningJournalEntries(cfg, appID); err == nil {
			menuEntries = rows
		}
		if len(codeEntries) > 0 || len(menuEntries) > 0 {
			stats.Source = "journal"
		}
	}
	if len(codeEntries) == 0 {
		if rows, err := loadCodeLearningEntries(cfg, rm, appID); err == nil {
			codeEntries = rows
		}
	}
	if len(menuEntries) == 0 {
		if rows, err := loadMenuLearningEntries(cfg, rm, appID); err == nil {
			menuEntries = rows
		}
	}

	stats.CodeSamples = len(codeEntries)
	stats.MenuSamples = len(menuEntries)
	stats.TotalSamples = stats.CodeSamples + stats.MenuSamples

	codePerDay := map[string]int{}
	for _, entry := range codeEntries {
		if k := dateKeyFromMs(entry.CreatedAtMs); k != "" {
			codePerDay[k]++
		}
	}
	menuPerDay := map[string]int{}
	for _, entry := range menuEntries {
		if k := dateKeyFromMs(entry.CreatedAtMs); k != "" {
			menuPerDay[k]++
		}
	}

	dates := indexDateWindow(days, time.Now())
	points := make([]AILearningDailyPoint, 0, len(dates))
	for _, date := range dates {
		code := codePerDay[date]
		menu := menuPerDay[date]
		points = append(points, AILearningDailyPoint{
			Date:      date,
			CodeCount: code,
			MenuCount: menu,
			Total:     code + menu,
		})
	}
	stats.Points = points
	return stats
}

func fileSizeOrZero(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func learningReportPath(cfg config.AppConfig, appID string, t time.Time) string {
	base := filepath.Join(cfg.AI.ContextDir, "ai_learning_reports")
	name := "ai_learning_daily_" + safeAppIDForLearning(appID) + "_" + t.Format("20060102") + ".json"
	return filepath.Join(base, name)
}

// RunAILearningNightlyMaintenance creates a daily report for long-term learning health.
func RunAILearningNightlyMaintenance(cfg config.AppConfig, rm *data.RecordManager, appID string) AILearningMaintenanceReport {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		appID = "csm"
	}
	now := time.Now()
	stats := BuildAILearningDailyStats(cfg, rm, appID, 30)
	journalCodePath := learningJournalPath(cfg, appID, "code")
	journalMenuPath := learningJournalPath(cfg, appID, "menu")
	report := AILearningMaintenanceReport{
		Success:          true,
		AppID:            appID,
		GeneratedAtMs:    now.UnixMilli(),
		JournalCodePath:  journalCodePath,
		JournalMenuPath:  journalMenuPath,
		JournalCodeBytes: fileSizeOrZero(journalCodePath),
		JournalMenuBytes: fileSizeOrZero(journalMenuPath),
		Stats30d:         stats,
	}

	reportPath := learningReportPath(cfg, appID, now)
	if err := os.MkdirAll(filepath.Dir(reportPath), 0o755); err != nil {
		report.Success = false
		report.ReportPath = reportPath
		return report
	}
	payload, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		report.Success = false
		report.ReportPath = reportPath
		return report
	}
	if err := os.WriteFile(reportPath, payload, 0o644); err != nil {
		report.Success = false
		report.ReportPath = reportPath
		return report
	}
	report.ReportPath = reportPath

	// Keep latest 60 daily reports per app.
	reportDir := filepath.Dir(reportPath)
	entries, err := os.ReadDir(reportDir)
	if err == nil {
		var files []string
		prefix := "ai_learning_daily_" + safeAppIDForLearning(appID) + "_"
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			if strings.HasPrefix(name, prefix) && strings.HasSuffix(name, ".json") {
				files = append(files, filepath.Join(reportDir, name))
			}
		}
		sort.Strings(files)
		if len(files) > 60 {
			for _, stale := range files[:len(files)-60] {
				_ = os.Remove(stale)
			}
		}
	}

	return report
}
