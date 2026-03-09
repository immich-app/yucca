package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"michael/internal/config"
	"michael/internal/handlers"
	"michael/internal/metrics"
	"michael/internal/storage"

	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

func main() {
	cfg := config.LoadConfig()
	store := storage.NewS3Storage(cfg)

	var m *metrics.Metrics
	var meterProvider *sdkmetric.MeterProvider
	if cfg.OTLPEnabled {
		var err error
		meterProvider, err = metrics.SetupMeterProvider(cfg)
		if err != nil {
			slog.Error("failed to setup meter provider", "error", err)
			os.Exit(1)
		}
		meter := meterProvider.Meter("michael")
		m, err = metrics.NewMetrics(meter)
		if err != nil {
			slog.Error("failed to create metrics", "error", err)
			os.Exit(1)
		}
		slog.Info("OpenTelemetry metrics enabled", "endpoint", cfg.OTLPMetricsEndpoint)
	}

	srv := handlers.NewServer(store, cfg.JWTSecret, m)

	addr := fmt.Sprintf(":%d", cfg.Port)
	httpSrv := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("starting michael", "port", cfg.Port)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
		os.Exit(1)
	}

	if meterProvider != nil {
		if err := meterProvider.Shutdown(shutdownCtx); err != nil {
			slog.Error("meter provider shutdown error", "error", err)
		}
	}

	slog.Info("shutdown complete")
}
