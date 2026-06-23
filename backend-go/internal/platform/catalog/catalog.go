package catalog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"csm_server/backend-go/internal/config"
)

// Dataset describes a registered data product (data mesh / catalog stub).
type Dataset struct {
	ID          string   `json:"id"`
	AppID       string   `json:"app_id"`
	Table       string   `json:"table"`
	Owner       string   `json:"owner"`
	Description string   `json:"description"`
	Tags        []string `json:"tags,omitempty"`
	PIIFields   []string `json:"pii_fields,omitempty"`
	UpdatedAt   string   `json:"updated_at"`
}

// Registry persists dataset metadata as JSON files (upgrade path: DataHub/OpenMetadata).
type Registry struct {
	root    string
	mu      sync.RWMutex
	enabled bool
}

func OpenRegistry(cfg config.AppConfig) (*Registry, error) {
	if !cfg.Platform.CatalogEnabled {
		return &Registry{enabled: false}, nil
	}
	root := cfg.Platform.CatalogDir
	if root == "" {
		root = filepath.Join(cfg.NativeDataDir, "catalog")
	}
	if err := config.EnsureDir(root); err != nil {
		return nil, err
	}
	r := &Registry{root: root, enabled: true}
	r.seedDefaults()
	return r, nil
}

func (r *Registry) Enabled() bool { return r != nil && r.enabled }

func (r *Registry) seedDefaults() {
	defaults := []Dataset{
		{ID: "csm/csm_accounts", AppID: "csm", Table: "csm_accounts", Owner: "platform", Description: "System accounts (PII)", PIIFields: []string{"email", "phone", "username", "pass"}, Tags: []string{"pii", "auth"}},
		{ID: "csm/csm_group_members", AppID: "csm", Table: "csm_group_members", Owner: "platform", Description: "Sub-user accounts", PIIFields: []string{"email", "login_identifier", "pass"}, Tags: []string{"pii", "auth"}},
		{ID: "csm/sys_autos", AppID: "csm", Table: "sys_autos", Owner: "platform", Description: "Dynamic business tables metadata", Tags: []string{"metadata"}},
	}
	for _, d := range defaults {
		_ = r.Upsert(d)
	}
}

func (r *Registry) Upsert(d Dataset) error {
	if !r.Enabled() {
		return nil
	}
	if d.ID == "" {
		d.ID = d.AppID + "/" + d.Table
	}
	d.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	b, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(r.root, sanitizeID(d.ID)+".json")
	r.mu.Lock()
	defer r.mu.Unlock()
	return os.WriteFile(path, b, 0o644)
}

func (r *Registry) List() ([]Dataset, error) {
	if !r.Enabled() {
		return nil, nil
	}
	entries, err := os.ReadDir(r.root)
	if err != nil {
		return nil, err
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []Dataset
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		b, err := os.ReadFile(filepath.Join(r.root, e.Name()))
		if err != nil {
			continue
		}
		var d Dataset
		if json.Unmarshal(b, &d) == nil {
			out = append(out, d)
		}
	}
	return out, nil
}

func (r *Registry) Get(id string) (*Dataset, error) {
	if !r.Enabled() {
		return nil, nil
	}
	path := filepath.Join(r.root, sanitizeID(id)+".json")
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var d Dataset
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, err
	}
	return &d, nil
}

func sanitizeID(id string) string {
	return filepath.Base(fmt.Sprintf("%s", id))
}
