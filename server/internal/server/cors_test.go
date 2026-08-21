package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithCORSAllowsConfiguredOrigin(t *testing.T) {
	handler := withCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), []string{"http://localhost:5173", "http://192.168.1.10:5173"})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("expected configured CORS header, got %q", got)
	}
}

func TestWithCORSRejectsUnconfiguredOrigin(t *testing.T) {
	handler := withCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), []string{"http://localhost:5173"})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://untrusted.example")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no CORS header, got %q", got)
	}
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
}
