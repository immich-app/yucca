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
	"michael/internal/geoip"
	"michael/internal/handlers"
	"michael/internal/metrics"
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

	stores, pools := buildClusters(cfg, tm)

	if len(pools) > 0 && meterProvider != nil {
		providers := make(map[string]metrics.BackendStatsProvider, len(pools))
		for code, p := range pools {
			providers[code] = p
		}
		if err := metrics.RegisterBackendMetrics(meter, providers); err != nil {
			log.Fatal().Err(err).Msg("failed to register backend metrics")
		}
	}

	// A missing or unreadable ASN database is NOT fatal: source-network labels
	// are an observability nicety, and failing the backup data plane over them
	// would be the wrong trade. The nil database resolves every public address
	// to "unknown", so the series stay continuous either way.
	asnDB, err := geoip.Open(cfg.ASNDatabasePath)
	if err != nil {
		log.Warn().Err(err).Msg("ASN database unavailable; traffic will not be attributed to source networks")
	} else {
		log.Info().Str("path", cfg.ASNDatabasePath).Msg("ASN database loaded")
	}

	srv := handlers.NewClusterServer(stores, cfg.S3DefaultCluster, cfg.JWTPublicKey, m)
	srv.ResolveClient = func(r *http.Request) geoip.Client {
		return asnDB.Resolve(r, cfg.ClientIPHeader)
	}

	httpSrv := &http.Server{
		Addr:    addr,
		Handler: srv.Handler(),
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Drive each backend pool's reconcile/probe loop until shutdown.
	for _, pool := range pools {
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

	if err := asnDB.Close(); err != nil {
		log.Error().Err(err).Msg("ASN database close error")
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

// buildClusters builds one Storage per storage cluster michael fronts, keyed by
// cluster code, plus the subset of those that are load-balancing pools (returned
// concretely so the caller can register their metrics and run their reconcile
// loops). A single-cluster deployment yields exactly one entry, under
// cfg.S3DefaultCluster.
func buildClusters(cfg config.Config, tm *metrics.TransportMetrics) (map[string]storage.Storage, map[string]*storage.Pool) {
	stores := make(map[string]storage.Storage, len(cfg.Clusters))
	pools := make(map[string]*storage.Pool)
	for _, cc := range cfg.Clusters {
		store, pool := buildStorage(cc, tm)
		stores[cc.Code] = store
		if pool != nil {
			pools[cc.Code] = pool
		}
	}
	log.Info().Int("clusters", len(stores)).Str("default", cfg.S3DefaultCluster).Msg("storage clusters ready")
	return stores, pools
}

// buildStorage returns the Storage for one cluster. With no backend source
// configured it is a single S3 client (legacy behavior) and pool is nil. With
// source=file or source=dns it is a load-balancing Pool, also returned
// concretely so the caller can register its metrics and run its reconcile loop.
func buildStorage(cc config.ClusterConfig, tm *metrics.TransportMetrics) (storage.Storage, *storage.Pool) {
	if cc.S3BackendSource == "" {
		return storage.NewS3StorageForCluster(cc, storage.S3Options{
			Endpoint:      cc.S3Endpoint,
			TLSSkipVerify: cc.S3TLSSkipVerify,
			Wrap:          transportWrap(tm, cc.Code, cc.S3Endpoint),
		}), nil
	}

	resolver := buildResolver(cc)
	factory := backendFactory(cc, tm)
	pool, err := storage.NewPool(storage.PoolConfig{
		EjectThreshold:    cc.S3EjectThreshold,
		ProbeBucket:       cc.S3ProbeBucket,
		ReconcileInterval: cc.S3ReconcileInterval,
		RetryTokenEarn:    cc.S3RetryTokenEarn,
		RetryTokenCost:    cc.S3RetryTokenCost,
		RetryBudgetCap:    cc.S3RetryBudgetCap,
	}, factory, resolver, log.Logger.With().Str("cluster", cc.Code).Logger())
	if err != nil {
		log.Fatal().Err(err).Str("cluster", cc.Code).Msg("failed to initialize S3 backend pool")
	}
	log.Info().Str("cluster", cc.Code).Str("source", resolver.Describe()).Msg("S3 load-balancing pool enabled")
	return pool, pool
}

// backendFactory builds the per-backend Storage constructor for the pool. In
// pin-host mode each resolved backend is a gateway IP that michael dials
// directly while still signing/Host-ing with the cluster endpoint (replacing the
// HAProxy hop); otherwise the resolved endpoint is used as the S3 endpoint
// as-is.
func backendFactory(cc config.ClusterConfig, tm *metrics.TransportMetrics) storage.BackendFactory {
	if !cc.S3BackendPinHost {
		return func(endpoint string) (storage.Storage, error) {
			return storage.NewS3StorageForCluster(cc, storage.S3Options{
				Endpoint:      endpoint,
				TLSSkipVerify: cc.S3TLSSkipVerify,
				Wrap:          transportWrap(tm, cc.Code, endpoint),
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
		return storage.NewS3StorageForCluster(cc, storage.S3Options{
			Endpoint:      cc.S3Endpoint,
			DialAddr:      dial,
			TLSSkipVerify: cc.S3TLSSkipVerify,
			Wrap:          transportWrap(tm, cc.Code, dial),
		}), nil
	}
}

// transportWrap returns the metrics wrapper for one backend's transport, or
// nil when metrics are disabled.
func transportWrap(tm *metrics.TransportMetrics, cluster, backend string) func(http.RoundTripper) http.RoundTripper {
	if tm == nil {
		return nil
	}
	return func(rt http.RoundTripper) http.RoundTripper {
		return tm.Wrap(cluster, backend, rt)
	}
}

func buildResolver(cc config.ClusterConfig) storage.Resolver {
	switch cc.S3BackendSource {
	case "file":
		return storage.NewFileResolver(cc.S3BackendFile)
	case "dns":
		return storage.NewDNSResolver(cc.S3BackendDNSHost, cc.S3BackendScheme, cc.S3BackendPort)
	default:
		// LoadConfig already validated the source, so this is unreachable.
		log.Fatal().Str("cluster", cc.Code).Str("source", cc.S3BackendSource).Msg("unknown backend source")
		return nil
	}
}
