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
	LlamaModelPath          string
	LlamaServerURL          string
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
	PebblePath      string
	SearchDBPath    string
	SearchDBDir     string
	RocksDBRoot     string // legacy source for one-time migrate only
	RocksDBBackup   string
	LuceneIndexRoot string
	JWTSecret       string
	Redis           RedisConfig
	AuthRateLimit   AuthRateLimitConfig
	AI              AIConfig
	GoogleIndex     GoogleIndexConfig
}

func LoadFromEnv() AppConfig {
	dataDir := resolveDataDir()
	nativeDir := envPath("CSM_NATIVE_DATA_DIR", filepath.Join(dataDir, "native"))
	pebblePath := envPath("CSM_PEBBLE_PATH", filepath.Join(nativeDir, "pebble", "csm.kv"))
	searchDBPath := envPath("CSM_SEARCH_DB_PATH", filepath.Join(nativeDir, "search", "vectors.db"))
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
		PebblePath:      pebblePath,
		SearchDBPath:    searchDBPath,
		SearchDBDir:     filepath.Dir(searchDBPath),
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
			LlamaServerURL:      envString("AI_LOCAL_LLAMA_SERVER_URL", "http://127.0.0.1:8888"),
			LlamaContextWindow:  envUint32("AI_LOCAL_LLAMA_CONTEXT_WINDOW", 8192),
			LlamaMaxTokens:      envUint32("AI_LOCAL_LLAMA_MAX_TOKENS", 768),
			LlamaMaxPromptChars: envInt("AI_LOCAL_LLAMA_MAX_PROMPT_CHARS", 32_000),
			LlamaThreads:        int32(envInt("AI_LOCAL_LLAMA_THREADS", 4)),
			LlamaBatchSize:      envUint32("AI_LOCAL_LLAMA_BATCH_SIZE", 128),
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
	}
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

// godotenvLoad wraps joho/godotenv without forcing import in tests.
func godotenvLoad(path string) error {
	return godotenvLoadImpl(path)
}
