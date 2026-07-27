package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"michael/internal/config"
	"michael/internal/handlers"
	"michael/internal/metrics"
	"michael/internal/revocation"
	"michael/internal/storage"
	"michael/internal/version"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	otelmetric "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

func main() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.TimestampFunc = func() time.Time { return time.Now().UTC() }

	cfg := config.LoadConfig()

	var output io.Writer = os.Stderr
	if cfg.LogPretty {
		output = zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
	}

	var otelLogWriter *metrics.OTLPLogWriter
	if cfg.OTLPLogsEnabled {
		logProvider, err := metrics.SetupLogProvider(cfg)
		if err != nil {
			log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
			log.Fatal().Err(err).Msg("failed to setup OTLP log provider")
		}
		otelLogWriter = metrics.NewOTLPLogWriter(logProvider)
		output = io.MultiWriter(output, otelLogWriter)
	}
	log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
	zerolog.SetGlobalLevel(cfg.LogLevel)

	// Bind the listener BEFORE the (potentially slow) backend pool init, so the
	// kubelet's tcpSocket startup probe sees the process as alive while probes
	// run. With the port bound late, N unreachable backends once pushed init
	// past the startup budget and crash-looped the deployment.
	addr := fmt.Sprintf(":%d", cfg.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal().Err(err).Str("addr", addr).Msg("failed to bind listener")
	}

	if cfg.OTLPLogsEnabled {
		log.Info().Str("endpoint", cfg.OTLPLogsEndpoint).Msg("OpenTelemetry logs enabled")
	}

	// Metrics before storage: the backend transports are built instrumented.
	var m *metrics.Metrics
	var tm *metrics.TransportMetrics
	var meter otelmetric.Meter
	var meterProvider *sdkmetric.MeterProvider
	if cfg.OTLPEnabled {
		var err error
		meterProvider, err = metrics.SetupMeterProvider(cfg)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to setup meter provider")
		}
		meter = meterProvider.Meter("michael")
		m, err = metrics.NewMetrics(meter)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create metrics")
		}
		tm, err = metrics.NewTransportMetrics(meter)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to create transport metrics")
		}
		log.Info().Str("endpoint", cfg.OTLPMetricsEndpoint).Msg("OpenTelemetry metrics enabled")
	}

	store, pool := buildStorage(cfg, tm)

	if pool != nil && meterProvider != nil {
		if err := metrics.RegisterBackendMetrics(meter, pool); err != nil {
			log.Fatal().Err(err).Msg("failed to register backend metrics")
		}
	}

	srv := handlers.NewServer(store, cfg.JWTPublicKey, m)
	if cfg.RedisAddr != "" {
		srv.Revoker = revocation.NewRedisRevoker(cfg.RedisAddr, cfg.RedisTimeout, cfg.RevocationCacheTTL)
		log.Info().Str("addr", cfg.RedisAddr).Dur("cache_ttl", cfg.RevocationCacheTTL).
			Msg("restic token revocation checking enabled")
	} else {
		log.Info().Msg("REDIS_ADDR not set; restic token revocation checking disabled")
	}

	httpSrv := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Drive the backend pool's reconcile/probe loop until shutdown.
	if pool != nil {
		go pool.Run(ctx)
	}

	go func() {
		log.Info().Int("port", cfg.Port).Str("version", version.Version).Msg("starting michael")
		if err := httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
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

	if otelLogWriter != nil {
		if err := otelLogWriter.Shutdown(shutdownCtx); err != nil {
			log.Error().Err(err).Msg("OTLP log provider shutdown error")
		}
	}

	log.Info().Msg("shutdown complete")
}

// buildStorage returns the Storage handed to the server. With no backend source
// configured it is a single S3 client (legacy behavior) and pool is nil. With
// source=file or source=dns it is a load-balancing Pool, also returned
// concretely so the caller can register its metrics and run its reconcile loop.
func buildStorage(cfg config.Config, tm *metrics.TransportMetrics) (storage.Storage, *storage.Pool) {
	if cfg.S3BackendSource == "" {
		return storage.NewS3StorageWithOptions(cfg, storage.S3Options{
			Endpoint:      cfg.S3Endpoint,
			TLSSkipVerify: cfg.S3TLSSkipVerify,
			Wrap:          transportWrap(tm, cfg.S3Endpoint),
		}), nil
	}

	resolver := buildResolver(cfg)
	factory := backendFactory(cfg, tm)
	pool, err := storage.NewPool(storage.PoolConfig{
		EjectThreshold:    cfg.S3EjectThreshold,
		ProbeBucket:       cfg.S3ProbeBucket,
		ReconcileInterval: cfg.S3ReconcileInterval,
	}, factory, resolver, log.Logger)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize S3 backend pool")
	}
	log.Info().Str("source", resolver.Describe()).Msg("S3 load-balancing pool enabled")
	return pool, pool
}

// backendFactory builds the per-backend Storage constructor for the pool. In
// pin-host mode each resolved backend is a gateway IP that michael dials
// directly while still signing/Host-ing with cfg.S3Endpoint (replacing the
// HAProxy hop); otherwise the resolved endpoint is used as the S3 endpoint
// as-is.
func backendFactory(cfg config.Config, tm *metrics.TransportMetrics) storage.BackendFactory {
	if !cfg.S3BackendPinHost {
		return func(endpoint string) (storage.Storage, error) {
			return storage.NewS3StorageWithOptions(cfg, storage.S3Options{
				Endpoint:      endpoint,
				TLSSkipVerify: cfg.S3TLSSkipVerify,
				Wrap:          transportWrap(tm, endpoint),
			}), nil
		}
	}
	return func(endpoint string) (storage.Storage, error) {
		u, err := url.Parse(endpoint)
		if err != nil {
			return nil, fmt.Errorf("parse backend endpoint %q: %w", endpoint, err)
		}
		dial := u.Host
		if u.Port() == "" {
			port := "443"
			if u.Scheme == "http" {
				port = "80"
			}
			dial = net.JoinHostPort(u.Hostname(), port)
		}
		return storage.NewS3StorageWithOptions(cfg, storage.S3Options{
			Endpoint:      cfg.S3Endpoint,
			DialAddr:      dial,
			TLSSkipVerify: cfg.S3TLSSkipVerify,
			Wrap:          transportWrap(tm, dial),
		}), nil
	}
}

// transportWrap returns the metrics wrapper for one backend's transport, or
// nil when metrics are disabled.
func transportWrap(tm *metrics.TransportMetrics, backend string) func(http.RoundTripper) http.RoundTripper {
	if tm == nil {
		return nil
	}
	return func(rt http.RoundTripper) http.RoundTripper {
		return tm.Wrap(backend, rt)
	}
}

func buildResolver(cfg config.Config) storage.Resolver {
	switch cfg.S3BackendSource {
	case "file":
		return storage.NewFileResolver(cfg.S3BackendFile)
	case "dns":
		return storage.NewDNSResolver(cfg.S3BackendDNSHost, cfg.S3BackendScheme, cfg.S3BackendPort)
	default:
		// LoadConfig already validated the source, so this is unreachable.
		log.Fatal().Str("source", cfg.S3BackendSource).Msg("unknown backend source")
		return nil
	}
}
