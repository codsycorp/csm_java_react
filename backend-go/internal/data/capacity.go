package data

import (
	"os"
	"path/filepath"
	"strings"
)

// TableCapacity describes on-disk footprint for one app/table Pebble store.
type TableCapacity struct {
	AppID     string `json:"app_id"`
	Table     string `json:"table"`
	Path      string `json:"path"`
	Bytes     int64  `json:"bytes"`
	FileCount int    `json:"file_count"`
}

// CapacityReport is a point-in-time storage snapshot for capacity planning.
type CapacityReport struct {
	PebbleRoot   string          `json:"pebble_root"`
	TotalBytes   int64           `json:"total_bytes"`
	TableCount   int             `json:"table_count"`
	Tables       []TableCapacity `json:"tables"`
	TopTables    []TableCapacity `json:"top_tables"`
	GeneratedAt  string          `json:"generated_at"`
}

// BuildCapacityReport walks the Pebble root and aggregates per-table stats.
func (rm *RecordManager) BuildCapacityReport() CapacityReport {
	report := CapacityReport{PebbleRoot: rm.pebbleRoot}
	if rm.pebbleRoot == "" {
		return report
	}
	tableMap := map[string]*TableCapacity{}
	_ = filepath.Walk(rm.pebbleRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(rm.pebbleRoot, path)
		if err != nil {
			return nil
		}
		parts := strings.Split(rel, string(os.PathSeparator))
		if len(parts) < 2 {
			return nil
		}
		appID, table := parts[0], parts[1]
		key := appID + "/" + table
		tc, ok := tableMap[key]
		if !ok {
			tc = &TableCapacity{
				AppID: appID,
				Table: table,
				Path:  filepath.Join(rm.pebbleRoot, appID, table),
			}
			tableMap[key] = tc
		}
		tc.Bytes += info.Size()
		tc.FileCount++
		report.TotalBytes += info.Size()
		return nil
	})
	for _, tc := range tableMap {
		report.Tables = append(report.Tables, *tc)
	}
	report.TableCount = len(report.Tables)
	report.TopTables = topNTables(report.Tables, 10)
	return report
}

func topNTables(tables []TableCapacity, n int) []TableCapacity {
	if n <= 0 || len(tables) == 0 {
		return nil
	}
	sorted := append([]TableCapacity(nil), tables...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].Bytes > sorted[i].Bytes {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	if len(sorted) > n {
		sorted = sorted[:n]
	}
	return sorted
}
