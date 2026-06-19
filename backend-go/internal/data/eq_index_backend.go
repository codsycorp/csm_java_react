package data

import "csm_server/backend-go/internal/config"

// eqIndexBackend resolves field equality filters to canonical Pebble record keys.
// Implementations: in-memory map (fast, RAM-heavy) or Pebble on SSD (Rust-like, low RAM).
type eqIndexBackend interface {
	upsert(appID, tableName, pebbleKey string, record map[string]any)
	deletePebbleKey(pebbleKey string)
	deleteTable(appID, tableName string)
	keys(appID, tableName, fieldName, fieldValue string, limit int) []string
	listTablePebbleKeys(appID, tableName string, offset, limit int) ([]string, int)
	countTableKeys(appID, tableName string) int
	close()
}

func newEqIndexBackend(cfg config.AppConfig) (eqIndexBackend, error) {
	switch cfg.EqIndexMode {
	case "", "memory":
		return newEqIndexStore(), nil
	case "pebble":
		return newPebbleEqIndexStore(cfg.EqIndexRoot)
	default:
		return newEqIndexStore(), nil
	}
}
