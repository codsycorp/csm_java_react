package data

import (
	"fmt"
	"strings"
)

const PebbleKeyPrefix = "v1|"

func PebbleKey(appID, tableName, storageKey string) string {
	return PebbleKeyPrefix + appID + "|" + tableName + "|" + storageKey
}

func TablePrefix(appID, tableName string) string {
	return PebbleKeyPrefix + appID + "|" + tableName + "|"
}

func StorageKeyCandidates(appID, tableName, base string) []string {
	return []string{
		base,
		tableName + "_" + base,
		appID + "_" + tableName + "_" + base,
	}
}

func RocksKeyFromPebbleKey(pebbleKey string) string {
	parts := strings.SplitN(strings.TrimPrefix(pebbleKey, PebbleKeyPrefix), "|", 3)
	if len(parts) == 3 {
		return parts[2]
	}
	return pebbleKey
}

// ParsePebbleKey splits a canonical key v1|app|table|storage into its parts.
func ParsePebbleKey(pebbleKey string) (appID, tableName, storageKey string, err error) {
	parts := strings.SplitN(strings.TrimPrefix(pebbleKey, PebbleKeyPrefix), "|", 3)
	if len(parts) != 3 {
		return "", "", "", fmt.Errorf("invalid pebble key: %s", pebbleKey)
	}
	return parts[0], parts[1], parts[2], nil
}
