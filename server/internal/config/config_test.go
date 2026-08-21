package config

import (
	"path/filepath"
	"testing"
	"time"
)

var runtimeKeys = []string{
	"HTTP_ADDR",
	"CORS_ALLOWED_ORIGINS",
	"HTTP_READ_TIMEOUT",
	"HTTP_WRITE_TIMEOUT",
	"HTTP_IDLE_TIMEOUT",
	"SHUTDOWN_TIMEOUT",
}

func TestLoadReadsEnvironmentFile(t *testing.T) {
	t.Setenv(environmentFileKey, filepath.Join("testdata", "valid.env"))
	for _, key := range runtimeKeys {
		t.Setenv(key, "")
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.HTTPAddr != ":9080" {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":9080")
	}
	if len(cfg.CORSAllowedOrigins) != 2 || cfg.CORSAllowedOrigins[0] != "http://localhost:5173" || cfg.CORSAllowedOrigins[1] != "http://127.0.0.1:5173" {
		t.Errorf("CORSAllowedOrigins = %q", cfg.CORSAllowedOrigins)
	}
	if cfg.HTTPReadTimeout != 11*time.Second {
		t.Errorf("HTTPReadTimeout = %v", cfg.HTTPReadTimeout)
	}
	if cfg.HTTPWriteTimeout != 12*time.Second {
		t.Errorf("HTTPWriteTimeout = %v", cfg.HTTPWriteTimeout)
	}
	if cfg.HTTPIdleTimeout != 13*time.Second {
		t.Errorf("HTTPIdleTimeout = %v", cfg.HTTPIdleTimeout)
	}
	if cfg.ShutdownTimeout != 14*time.Second {
		t.Errorf("ShutdownTimeout = %v", cfg.ShutdownTimeout)
	}
}

func TestLoadPrefersProcessEnvironment(t *testing.T) {
	t.Setenv(environmentFileKey, filepath.Join("testdata", "valid.env"))
	for _, key := range runtimeKeys {
		t.Setenv(key, "")
	}
	t.Setenv("HTTP_ADDR", ":9090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.HTTPAddr != ":9090" {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":9090")
	}
}

func TestLoadRequiresEveryRuntimeValue(t *testing.T) {
	_, err := load(func(key string) (string, bool) {
		if key == "HTTP_ADDR" {
			return ":8080", true
		}
		return "", false
	})
	if err == nil {
		t.Fatal("load() error = nil, want missing configuration error")
	}
}

func TestLoadRejectsNonPositiveDuration(t *testing.T) {
	values := map[string]string{
		"HTTP_ADDR":            ":8080",
		"CORS_ALLOWED_ORIGINS": "http://localhost:5173",
		"HTTP_READ_TIMEOUT":    "0s",
		"HTTP_WRITE_TIMEOUT":   "10s",
		"HTTP_IDLE_TIMEOUT":    "60s",
		"SHUTDOWN_TIMEOUT":     "10s",
	}

	_, err := load(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})
	if err == nil {
		t.Fatal("load() error = nil, want duration validation error")
	}
}

func TestLoadRejectsWildcardCORSOrigin(t *testing.T) {
	values := map[string]string{
		"HTTP_ADDR":            ":8080",
		"CORS_ALLOWED_ORIGINS": "*",
		"HTTP_READ_TIMEOUT":    "10s",
		"HTTP_WRITE_TIMEOUT":   "10s",
		"HTTP_IDLE_TIMEOUT":    "60s",
		"SHUTDOWN_TIMEOUT":     "10s",
	}

	_, err := load(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})
	if err == nil {
		t.Fatal("load() error = nil, want wildcard CORS validation error")
	}
}

func TestLoadNormalizesAndDeduplicatesCORSOrigins(t *testing.T) {
	values := map[string]string{
		"HTTP_ADDR":            ":8080",
		"CORS_ALLOWED_ORIGINS": "HTTP://LOCALHOST:5173/, http://localhost:5173",
		"HTTP_READ_TIMEOUT":    "10s",
		"HTTP_WRITE_TIMEOUT":   "10s",
		"HTTP_IDLE_TIMEOUT":    "60s",
		"SHUTDOWN_TIMEOUT":     "10s",
	}

	cfg, err := load(func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	})
	if err != nil {
		t.Fatalf("load() error = %v", err)
	}
	if len(cfg.CORSAllowedOrigins) != 1 || cfg.CORSAllowedOrigins[0] != "http://localhost:5173" {
		t.Fatalf("CORSAllowedOrigins = %q", cfg.CORSAllowedOrigins)
	}
}
