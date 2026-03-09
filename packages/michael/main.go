package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"michael/internal/config"
	"michael/internal/handlers"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

func main() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.TimestampFunc = func() time.Time { return time.Now().UTC() }
	log.Logger = zerolog.New(os.Stderr).With().Timestamp().Logger()

	cfg := config.LoadConfig()
	zerolog.SetGlobalLevel(cfg.LogLevel)
	store := storage.NewS3Storage(cfg)

	var m *metrics.Metrics
	var meterProvider *sdkmetric.MeterProvider
	if cfg.OTLPEnabled {
		var err error
		meterProvider, err = metrics.SetupMeterProvider(cfg)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to setup meter provider")
		}
		meter := meterProvider.Meter("michael")
		m, err = metrics.NewMetrics(meter)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create metrics")
		}
		log.Info().Str("endpoint", cfg.OTLPMetricsEndpoint).Msg("OpenTelemetry metrics enabled")
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
		log.Info().Int("port", cfg.Port).Msg("starting michael")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("shutdown error")
	}

	if meterProvider != nil {
		if err := meterProvider.Shutdown(shutdownCtx); err != nil {
			log.Error().Err(err).Msg("meter provider shutdown error")
		}
	}

	log.Info().Msg("shutdown complete")
}
