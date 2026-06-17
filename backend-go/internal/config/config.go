package config

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ServerConfig struct {
	Host string
	Port int
}

type SocketConfig struct {
	Host string
	Port int
}

type RedisConfig struct {
	Host  string
	Port  int
	TTLMs uint64
}

type AuthRateLimitConfig struct {
	MaxRequestsPerMinute uint32
	WindowMs             uint64
}

type AIConfig struct {
	LlamaModelPath        string
	LlamaNativeEnabled    bool
	LlamaPreloadOnStartup   bool
	LlamaGPULayers          int32
	LlamaUseMlock           bool
	LlamaContextWindow      uint32
	LlamaMaxTokens          uint32
	LlamaMaxPromptChars     int
	LlamaThreads            int32
	LlamaBatchSize          uint32
	LlamaUbatchSize         uint32
	LlamaUseMmap            bool
	ContextDir              string
	MenuMasterPromptPath    string
	CodeMasterPromptPath    string
}

type GoogleIndexConfig struct {
	ServiceAccountPath string
	DailyLimit         int32
	WorkDir            string
}

type AppConfig struct {
	Server          ServerConfig
	Socket          SocketConfig
	DataDir         string
	NativeDataDir   string
	PebbleRoot      string
	PebbleLegacy    string // optional monolithic csm.kv for read fallback during migration
	SearchDBPath    string
	SearchDBDir     string
	VectorStoreDir  string
	RocksDBRoot     string // legacy source for one-time migrate only
	RocksDBBackup   string
	LuceneIndexRoot string
	JWTSecret       string
	Redis           RedisConfig
	AuthRateLimit   AuthRateLimitConfig
	AI              AIConfig
	GoogleIndex          GoogleIndexConfig
	StartupReindex       bool
	StartupReindexTables []string
	// EqIndexMode: "pebble" (SSD, low RAM) or "memory" (fast, high RAM).
	EqIndexMode string
	EqIndexRoot string
	// Pebble tuning — shared cache keeps RAM bounded when many tables are open.
	PebbleCacheMB        int
	PebbleMemTableMB     int
	PebbleIndexMemTableMB int
	VectorRecordsEnabled bool
}

func LoadFromEnv() AppConfig {
	dataDir := resolveDataDir()
	nativeDir := envPath("CSM_NATIVE_DATA_DIR", filepath.Join(dataDir, "native"))
	pebbleRoot := envPath("CSM_PEBBLE_ROOT", filepath.Join(nativeDir, "pebble"))
	pebbleLegacy := resolvePebbleLegacy(nativeDir, pebbleRoot)
	searchDBPath := envPath("CSM_SEARCH_DB_PATH", filepath.Join(nativeDir, "search", "vectors.db"))
	vectorStoreDir := envPath("CSM_VECTOR_DIR", filepath.Join(nativeDir, "vector", "chromem"))
	rocksdbRoot := envPath("ROCKSDB_ROOT_DIR", filepath.Join(dataDir, "database"))
	return AppConfig{
		Server: ServerConfig{
			Host: envString("SERVER_HOST", "0.0.0.0"),
			Port: envInt("SERVER_PORT", 9999),
		},
		Socket: SocketConfig{
			Host: envString("SOCKET_SERVER_HOST", "0.0.0.0"),
			Port: envInt("SOCKET_SERVER_PORT", 15301),
		},
		DataDir:         dataDir,
		NativeDataDir:   nativeDir,
		PebbleRoot:      pebbleRoot,
		PebbleLegacy:    pebbleLegacy,
		SearchDBPath:    searchDBPath,
		SearchDBDir:     filepath.Dir(searchDBPath),
		VectorStoreDir:  vectorStoreDir,
		RocksDBRoot:     rocksdbRoot,
		RocksDBBackup:   envPath("ROCKSDB_BACKUP_DIR", filepath.Join(dataDir, "backups")),
		LuceneIndexRoot: envPath("LUCENE_INDEX_ROOT_DIR", filepath.Join(dataDir, "lucene_index")),
		JWTSecret:       envString("JWT_SECRET", "change-me-to-a-strong-secretge"),
		Redis: RedisConfig{
			Host:  envString("REDIS_HOST", "localhost"),
			Port:  envInt("REDIS_PORT", 6379),
			TTLMs: envUint64("REDIS_TTL_MS", 600_000),
		},
		AuthRateLimit: AuthRateLimitConfig{
			MaxRequestsPerMinute: envUint32("AUTH_RATE_LIMIT_MAX", 120),
			WindowMs:             envUint64("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
		},
		AI: AIConfig{
			LlamaModelPath: envPath(
				"AI_LOCAL_LLAMA_MODEL_PATH",
				filepath.Join(dataDir, "ai_local", "model", "model.gguf"),
			),
			LlamaNativeEnabled:    envFlagTrue("AI_LOCAL_LLAMA_NATIVE_ENABLED", true),
			LlamaPreloadOnStartup: envFlagTrue("AI_LOCAL_LLAMA_PRELOAD_ON_STARTUP", false),
			LlamaGPULayers:      int32(envInt("AI_LOCAL_LLAMA_GPU_LAYERS", 0)),
			LlamaUseMlock:       envFlagTrue("AI_LOCAL_LLAMA_USE_MLOCK", false),
			LlamaContextWindow:  envUint32("AI_LOCAL_LLAMA_CONTEXT_WINDOW", 8192),
			LlamaMaxTokens:      envUint32("AI_LOCAL_LLAMA_MAX_TOKENS", 768),
			LlamaMaxPromptChars: envInt("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", 32_000),
			LlamaThreads:        int32(envInt("AI_LOCAL_LLAMA_THREADS", 4)),
			LlamaBatchSize:      envUint32("AI_LOCAL_LLAMA_BATCH_SIZE", 512),
			LlamaUbatchSize:     envUint32("AI_LOCAL_LLAMA_UBATCH_SIZE", 64),
			LlamaUseMmap:        envFlagTrue("AI_LOCAL_LLAMA_USE_MMAP", true),
			ContextDir:          envPath("AI_CONTEXT_DIR", filepath.Join(dataDir, "ai_local")),
			MenuMasterPromptPath: envPath(
				"AI_MENU_MASTER_PROMPT_PATH",
				filepath.Join(dataDir, "ai_local", "ai_menu_master_prompt.md"),
			),
			CodeMasterPromptPath: envPath(
				"AI_CODE_MASTER_PROMPT_PATH",
				filepath.Join(dataDir, "ai_local", "ai_code_master_prompt.md"),
			),
		},
		GoogleIndex: GoogleIndexConfig{
			ServiceAccountPath: envPath(
				"GOOGLE_INDEX_SERVICE_ACCOUNT_PATH",
				"./index-google-service-account.json",
			),
			DailyLimit: int32(envInt("GOOGLE_INDEX_DAILY_LIMIT", 200)),
			WorkDir:    envPath("GOOGLE_INDEX_WORK_DIR", filepath.Join(dataDir, "google_index")),
		},
		StartupReindex:       envFlagTrue("CSM_STARTUP_REINDEX", true),
		StartupReindexTables: envStringList("CSM_STARTUP_REINDEX_TABLES", []string{"csm/csm_accounts", "csm/csm_group_members", "csm/sys_autos"}),
		EqIndexMode:          envString("CSM_EQ_INDEX_MODE", defaultEqIndexMode()),
		EqIndexRoot:          envPath("CSM_EQ_INDEX_ROOT", filepath.Join(nativeDir, "eq_index")),
		PebbleCacheMB:        envInt("CSM_PEBBLE_CACHE_MB", defaultPebbleCacheMB()),
		PebbleMemTableMB:     envInt("CSM_PEBBLE_MEMTABLE_MB", defaultPebbleMemTableMB()),
		PebbleIndexMemTableMB: envInt("CSM_PEBBLE_INDEX_MEMTABLE_MB", defaultPebbleIndexMemTableMB()),
		VectorRecordsEnabled: envFlagTrue("CSM_VECTOR_RECORDS_ENABLED", defaultVectorRecordsEnabled()),
	}
}

func defaultEqIndexMode() string {
	profile := strings.ToLower(os.Getenv("CSM_LOCAL_PROFILE"))
	if profile == "" {
		profile = strings.ToLower(os.Getenv("AI_LOCAL_MODE"))
	}
	switch profile {
	case "8gb", "7b", "local-8gb":
		return "pebble"
	default:
		return "memory"
	}
}

func defaultPebbleCacheMB() int {
	if defaultEqIndexMode() == "pebble" {
		return 32
	}
	return 64
}

func defaultPebbleMemTableMB() int {
	if defaultEqIndexMode() == "pebble" {
		return 8
	}
	return 32
}

func defaultPebbleIndexMemTableMB() int {
	if defaultEqIndexMode() == "pebble" {
		return 4
	}
	return 8
}

func defaultVectorRecordsEnabled() bool {
	return defaultEqIndexMode() != "pebble"
}

func (c AppConfig) EffectiveLlamaMaxTokens() uint32 {
	if c.AI.LlamaMaxTokens > 0 {
		return c.AI.LlamaMaxTokens
	}
	return 768
}

func (c AppConfig) EffectiveLlamaContextWindow() uint32 {
	if c.AI.LlamaContextWindow > 0 {
		return c.AI.LlamaContextWindow
	}
	return 8192
}

// EffectiveLlamaBatchSize — llama.cpp requires prompt tokens <= n_batch per decode step.
func (c AppConfig) EffectiveLlamaBatchSize() uint32 {
	batch := c.AI.LlamaBatchSize
	if batch == 0 {
		batch = 512
	}
	ctx := c.EffectiveLlamaContextWindow()
	if batch > ctx {
		batch = ctx
	}
	if batch < 512 && ctx >= 512 {
		batch = 512
	}
	return batch
}

func (c AppConfig) EffectiveCodeStreamPromptCap() int {
	cap := c.AI.LlamaMaxPromptChars
	if cap <= 0 {
		cap = 32_000
	}
	if cap < 8_000 {
		return 8_000
	}
	return cap
}

func LoadEnvFiles() {
	if home := os.Getenv("CSM_HOME"); home != "" {
		if info, err := os.Stat(home); err == nil && info.IsDir() {
			_ = os.Chdir(home)
			_ = godotenvLoad(filepath.Join(home, "config.env"))
		}
	}
	_ = godotenvLoad("config.env")
	_ = godotenvLoad("../config.env")

	profile := strings.ToLower(os.Getenv("CSM_LOCAL_PROFILE"))
	if profile == "" {
		profile = strings.ToLower(os.Getenv("AI_LOCAL_MODE"))
	}
	var overlay string
	switch profile {
	case "strong", "local-strong":
		overlay = "config.local-strong.env"
	case "8gb", "7b", "local-8gb":
		overlay = "config.local-8gb.env"
	}
	if overlay != "" {
		for _, p := range []string{overlay, filepath.Join("..", overlay)} {
			if _, err := os.Stat(p); err == nil {
				_ = godotenvLoad(p)
				break
			}
		}
	}
}

func EnsureDir(path string) error {
	return os.MkdirAll(path, 0o755)
}

func SkipStartupDBInit() bool {
	return envFlagTrue("CSM_SKIP_STARTUP_DB_INIT", false)
}

func deployRoot() string {
	if home := os.Getenv("CSM_HOME"); home != "" {
		if info, err := os.Stat(home); err == nil && info.IsDir() {
			return home
		}
	}
	if wd, err := os.Getwd(); err == nil {
		return wd
	}
	return "."
}

func resolveDataDir() string {
	if v := os.Getenv("APP_DATA_DIR"); v != "" {
		return envPath("APP_DATA_DIR", v)
	}
	candidates := []string{
		"./backend/csm_datas",
		"../backend/csm_datas",
		"./csm_datas",
		"../csm_datas",
	}
	for _, p := range candidates {
		resolved := resolveDeployPath(p)
		if st, err := os.Stat(filepath.Join(resolved, "database")); err == nil && st.IsDir() {
			return resolved
		}
	}
	return resolveDeployPath("./backend/csm_datas")
}

func resolveDeployPath(path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Clean(filepath.Join(deployRoot(), path))
}

func envPath(key, def string) string {
	return resolveDeployPath(envString(key, def))
}

func envString(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envUint32(key string, def uint32) uint32 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil {
			return uint32(n)
		}
	}
	return def
}

func envUint64(key string, def uint64) uint64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseUint(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

func envFlagTrue(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok {
		return def
	}
	v = strings.TrimSpace(strings.ToLower(v))
	return v == "1" || v == "true" || v == "yes"
}

func envStringList(key string, def []string) []string {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return def
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		return def
	}
	return out
}

// HTTPEnableLogger controls chi request logging (disable in production with CSM_HTTP_LOGGER=0).
func HTTPEnableLogger() bool {
	return envFlagTrue("CSM_HTTP_LOGGER", true)
}

// resolvePebbleLegacy returns the path to a monolithic csm.kv if present (read fallback).
func resolvePebbleLegacy(nativeDir, pebbleRoot string) string {
	if v := os.Getenv("CSM_PEBBLE_LEGACY"); v != "" {
		return envPath("CSM_PEBBLE_LEGACY", v)
	}
	// Backward compat: CSM_PEBBLE_PATH used to point at the single store file.
	if v := os.Getenv("CSM_PEBBLE_PATH"); v != "" {
		return envPath("CSM_PEBBLE_PATH", v)
	}
	candidate := filepath.Join(pebbleRoot, "csm.kv")
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}
	// Also check legacy location under native/pebble/csm.kv
	alt := filepath.Join(nativeDir, "pebble", "csm.kv")
	if _, err := os.Stat(alt); err == nil {
		return alt
	}
	return ""
}

// godotenvLoad wraps joho/godotenv without forcing import in tests.
func godotenvLoad(path string) error {
	return godotenvLoadImpl(path)
}
