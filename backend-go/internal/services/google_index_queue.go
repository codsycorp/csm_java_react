package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	googleQueueFile   = "google-index-queue.json"
	googleHistoryFile = "google-index-history.json"
	maxRetryCount     = 3
	dedupDays         = int64(30)
	maxHistoryPerURL  = 10
)

type URLSubmissionQueue struct {
	URL           string `json:"url"`
	Action        string `json:"action"`
	Priority      int32  `json:"priority"`
	QueuedAt      int64  `json:"queuedAt"`
	RetryCount    int32  `json:"retryCount"`
	LastError     string `json:"lastError,omitempty"`
	Status        string `json:"status"`
	LastAttemptAt int64  `json:"lastAttemptAt"`
}

type URLSubmissionHistory struct {
	URL          string `json:"url"`
	Action       string `json:"action"`
	SubmittedAt  int64  `json:"submittedAt"`
	SubmittedDate string `json:"submittedDate"`
	Success      bool   `json:"success"`
	Response     string `json:"response,omitempty"`
	QuotaUsed    int32  `json:"quotaUsed"`
	SubmissionID string `json:"submissionId"`
}

type GoogleIndexQueueService struct {
	queueFile   string
	historyFile string
	mu          sync.Mutex
	queue       map[string]URLSubmissionQueue
	history     map[string][]URLSubmissionHistory
}

func NewGoogleIndexQueueService(workDir string) *GoogleIndexQueueService {
	_ = os.MkdirAll(workDir, 0o755)
	svc := &GoogleIndexQueueService{
		queueFile:   filepath.Join(workDir, googleQueueFile),
		historyFile: filepath.Join(workDir, googleHistoryFile),
		queue:       make(map[string]URLSubmissionQueue),
		history:     make(map[string][]URLSubmissionHistory),
	}
	svc.loadQueue()
	svc.loadHistory()
	return svc
}

func (q *URLSubmissionQueue) effectivePriority() float64 {
	ageHours := float64(nowMs()-q.QueuedAt) / (1000 * 60 * 60)
	return float64(11-q.Priority)*100 + ageHours
}

func newQueueItem(url, action string, priority int32) URLSubmissionQueue {
	if priority < 1 {
		priority = 1
	}
	if priority > 10 {
		priority = 10
	}
	return URLSubmissionQueue{
		URL:      url,
		Action:   action,
		Priority: priority,
		QueuedAt: nowMs(),
		Status:   "PENDING",
	}
}

func (s *GoogleIndexQueueService) AddToQueue(url, action string, priority int32) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.queue[url]; ok {
		return false
	}
	if s.isRecentlySubmittedLocked(url, dedupDays) {
		return false
	}
	s.queue[url] = newQueueItem(url, action, priority)
	s.saveQueueLocked()
	return true
}

func (s *GoogleIndexQueueService) AddBatchToQueue(urls []string, action string, priority int32) map[string]bool {
	out := make(map[string]bool, len(urls))
	for _, u := range urls {
		out[u] = s.AddToQueue(u, action, priority)
	}
	return out
}

func (s *GoogleIndexQueueService) GetNextBatch(batchSize int) []URLSubmissionQueue {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]URLSubmissionQueue, 0, len(s.queue))
	for _, item := range s.queue {
		if item.Status != "PENDING" && item.Status != "FAILED" {
			continue
		}
		if item.RetryCount >= maxRetryCount {
			continue
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].effectivePriority() > items[j].effectivePriority()
	})
	if len(items) > batchSize {
		items = items[:batchSize]
	}
	return items
}

func (s *GoogleIndexQueueService) MarkAsProcessing(url string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if item, ok := s.queue[url]; ok {
		item.Status = "PROCESSING"
		item.LastAttemptAt = nowMs()
		s.queue[url] = item
		s.saveQueueLocked()
	}
}

func (s *GoogleIndexQueueService) MarkAsCompleted(url string, success bool, response string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.queue[url]
	if !ok {
		return
	}
	delete(s.queue, url)
	if success {
		hist := newHistory(item.URL, item.Action, true)
		hist.Response = response
		s.history[item.URL] = append(s.history[item.URL], hist)
		s.trimHistoryLocked(item.URL)
		s.saveQueueLocked()
		s.saveHistoryLocked()
		return
	}
	item.RetryCount++
	item.LastError = response
	if item.RetryCount >= maxRetryCount {
		hist := newHistory(item.URL, item.Action, false)
		hist.Response = response
		s.history[item.URL] = append(s.history[item.URL], hist)
		s.trimHistoryLocked(item.URL)
	} else {
		item.Status = "PENDING"
		s.queue[url] = item
	}
	s.saveQueueLocked()
	s.saveHistoryLocked()
}

func (s *GoogleIndexQueueService) RemoveFromQueue(url string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.queue[url]; !ok {
		return false
	}
	delete(s.queue, url)
	s.saveQueueLocked()
	return true
}

func (s *GoogleIndexQueueService) GetQueueInfo() map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	pending, processing, failed := 0, 0, 0
	for _, item := range s.queue {
		switch item.Status {
		case "PENDING":
			pending++
		case "PROCESSING":
			processing++
		case "FAILED":
			failed++
		}
	}
	return map[string]any{
		"total":        len(s.queue),
		"pending":      pending,
		"processing":   processing,
		"failed":       failed,
		"history_urls": len(s.history),
	}
}

func (s *GoogleIndexQueueService) GetQueueItems(page, pageSize int) []URLSubmissionQueue {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]URLSubmissionQueue, 0, len(s.queue))
	for _, item := range s.queue {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].effectivePriority() > items[j].effectivePriority()
	})
	start := page * pageSize
	if start >= len(items) {
		return nil
	}
	end := start + pageSize
	if end > len(items) {
		end = len(items)
	}
	return items[start:end]
}

func (s *GoogleIndexQueueService) GetHistory(url string) []URLSubmissionHistory {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]URLSubmissionHistory(nil), s.history[url]...)
}

func (s *GoogleIndexQueueService) GetRecentHistory(limit int) []URLSubmissionHistory {
	s.mu.Lock()
	defer s.mu.Unlock()
	all := make([]URLSubmissionHistory, 0)
	for _, list := range s.history {
		all = append(all, list...)
	}
	sort.Slice(all, func(i, j int) bool {
		return all[i].SubmittedAt > all[j].SubmittedAt
	})
	if len(all) > limit {
		all = all[:limit]
	}
	return all
}

func (s *GoogleIndexQueueService) isRecentlySubmittedLocked(url string, days int64) bool {
	list := s.history[url]
	cutoff := nowMs() - days*24*60*60*1000
	for _, h := range list {
		if h.Success && h.SubmittedAt >= cutoff {
			return true
		}
	}
	return false
}

func (s *GoogleIndexQueueService) trimHistoryLocked(url string) {
	list := s.history[url]
	if len(list) <= maxHistoryPerURL {
		return
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].SubmittedAt > list[j].SubmittedAt
	})
	s.history[url] = list[:maxHistoryPerURL]
}

func (s *GoogleIndexQueueService) loadQueue() {
	data, err := os.ReadFile(s.queueFile)
	if err != nil || len(data) == 0 {
		return
	}
	var list []URLSubmissionQueue
	if json.Unmarshal(data, &list) != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.queue = make(map[string]URLSubmissionQueue, len(list))
	for _, item := range list {
		s.queue[item.URL] = item
	}
}

func (s *GoogleIndexQueueService) loadHistory() {
	data, err := os.ReadFile(s.historyFile)
	if err != nil || len(data) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = json.Unmarshal(data, &s.history)
}

func (s *GoogleIndexQueueService) saveQueueLocked() {
	list := make([]URLSubmissionQueue, 0, len(s.queue))
	for _, item := range s.queue {
		list = append(list, item)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.queueFile, data, 0o644)
}

func (s *GoogleIndexQueueService) saveHistoryLocked() {
	data, err := json.MarshalIndent(s.history, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.historyFile, data, 0o644)
}

func newHistory(url, action string, success bool) URLSubmissionHistory {
	ts := nowMs()
	return URLSubmissionHistory{
		URL:           url,
		Action:        action,
		SubmittedAt:   ts,
		SubmittedDate: time.Now().Format("2006-01-02"),
		Success:       success,
		SubmissionID:  genSubmissionID(),
	}
}

func genSubmissionID() string {
	return fmtSubmissionID(nowMs())
}

func fmtSubmissionID(ts int64) string {
	return fmt.Sprintf("%d-%d", ts, time.Now().UnixNano())
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}
