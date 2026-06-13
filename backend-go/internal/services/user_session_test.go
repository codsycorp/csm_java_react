package services

import (
	"os"
	"path/filepath"
	"testing"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/data"
	"csm_server/backend-go/internal/security"
)

func TestSessionWriteAndJWTResolve(t *testing.T) {
	dataDir := filepath.Join("..", "..", "..", "backend", "csm_datas")
	if _, err := os.Stat(filepath.Join(dataDir, "native", "pebble", "csm.kv")); err != nil {
		t.Skip("pebble store not present")
	}
	os.Setenv("APP_DATA_DIR", dataDir)
	cfg := config.LoadFromEnv()
	rm, err := data.NewRecordManager(cfg)
	if err != nil {
		t.Fatalf("open pebble: %v", err)
	}
	defer rm.ShutdownAll()

	us := NewUserService(rm)
	jwt := security.NewJWTUtil(cfg.JWTSecret)

	user := us.findAccountUser("email", "phanmemmottrieu@gmail.com")
	if user == nil {
		t.Skip("test user not in database")
	}

	refresh := "test-refresh-" + t.Name()
	us.UpdateSessionToken(user, refresh, "127.0.0.1", "TestUA/1.0", 9999999999999, 99, "")

	subject := deref(user.AppToken)
	if subject == "" {
		subject = deref(user.ID)
	}
	token := jwt.GenerateTokenWithUID(subject, deref(user.ID), 99)

	resolved := us.ResolveFromJWT(jwt, token)
	if resolved == nil {
		t.Fatal("ResolveFromJWT returned nil after session write")
	}
	if resolved.LoginVersion == nil || *resolved.LoginVersion != 99 {
		t.Fatalf("expected login_version 99, got %v", resolved.LoginVersion)
	}
	found := us.FindUserByRefreshToken(refresh, true)
	if found == nil {
		t.Fatal("refresh token not found after session write")
	}
}
