package server

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/nhathao-nguyen/Promedia/server/internal/config"
	"github.com/nhathao-nguyen/Promedia/server/internal/handler"
)

type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
}

func New(cfg config.Config, logger *slog.Logger) *Server {
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	return &Server{
		logger: logger,
		httpServer: &http.Server{
			Addr:         cfg.HTTPAddr,
			Handler:      withCORS(mux, cfg.CORSAllowedOrigins),
			ReadTimeout:  cfg.HTTPReadTimeout,
			WriteTimeout: cfg.HTTPWriteTimeout,
			IdleTimeout:  cfg.HTTPIdleTimeout,
		},
	}
}

func (s *Server) Start() error {
	s.logger.Info("http server listening", "address", s.httpServer.Addr)
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.logger.Info("stopping http server")
	return s.httpServer.Shutdown(ctx)
}
