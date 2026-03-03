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

	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

func main() {
	cfg := LoadConfig()
	storage := NewS3Storage(cfg)

	var metrics *Metrics
	var meterProvider *sdkmetric.MeterProvider
	if cfg.OTLPEnabled {
		var err error
		meterProvider, err = SetupMeterProvider(cfg)
		if err != nil {
			slog.Error("failed to setup meter provider", "error", err)
			os.Exit(1)
		}
		meter := meterProvider.Meter("michael")
		metrics, err = NewMetrics(meter)
		if err != nil {
			slog.Error("failed to create metrics", "error", err)
			os.Exit(1)
		}
		slog.Info("OpenTelemetry metrics enabled", "endpoint", cfg.OTLPMetricsEndpoint)
	}

	server := NewServer(storage, cfg, metrics)

	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: server.Handler(),
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("starting michael", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
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
