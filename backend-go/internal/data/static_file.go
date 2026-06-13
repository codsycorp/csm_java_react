package data

import (
	"os"
	"path/filepath"
	"strings"
)

// GetStaticFile resolves {data_dir}/public/{relative_path} (Java RecordManager.getStaticFile).
func (rm *RecordManager) GetStaticFile(relativePath string) string {
	rel := strings.TrimPrefix(strings.TrimPrefix(relativePath, "/"), "./")
	if rel == "" || strings.Contains(rel, "..") {
		return ""
	}
	path := filepath.Join(rm.dataDir, "public", rel)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return ""
	}
	return path
}
