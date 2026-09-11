package main

import (
	"context"
	"errors"
	"flag"
	"maps"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"

	"monk/internal/collector"
	"monk/internal/version"
)

func main() {
	listen := flag.String("listen", ":9284", "metrics listen address")
	refresh := flag.Duration("refresh", 2*time.Minute, "refresh interval")
	timeout := flag.Duration("timeout", 90*time.Second, "ceph command timeout")
	shallowPin := flag.String("shallow-interval", "", "pin the shallow target interval (e.g. 168h); empty follows the cluster")
	deepPin := flag.String("deep-interval", "", "pin the deep target interval (e.g. 672h); empty follows the cluster")
	cephCmd := flag.String("ceph-cmd", "ceph", "command prefix to reach the ceph CLI, split on spaces")
	flag.Parse()

	log := zerolog.New(os.Stderr).Level(zerolog.InfoLevel).With().Timestamp().Logger()
	cmd := strings.Fields(*cephCmd)
	if len(cmd) == 0 {
		log.Fatal().Msg("empty -ceph-cmd")
	}
	if *refresh <= 0 || *timeout <= 0 {
		log.Fatal().Dur("refresh", *refresh).Dur("timeout", *timeout).Msg("refresh and timeout must be positive")
	}
	pins := map[collector.Depth]time.Duration{}
	for depth, pin := range map[collector.Depth]string{collector.Shallow: *shallowPin, collector.Deep: *deepPin} {
		if pin == "" {
			continue
		}
		d, err := time.ParseDuration(pin)
		if err != nil || d <= 0 {
			log.Fatal().Str("value", pin).Msg("invalid interval pin")
		}
		pins[depth] = d
	}

	// Until the first successful cluster read, unpinned inputs fall back to
	// ceph's own defaults (max and deep intervals both one week, min interval
	// one day; osd_deep_scrub_interval's 28d on spice is that cluster's
	// tuning, not ceph's default) so a cold start with an unreachable mon
	// still serves overdue; late and breach stay unexported until a snapshot
	// is computed from a successful read, and the interval-read metrics show
	// whether it is live.
	intervals := collector.Intervals{
		Global: map[collector.Depth]time.Duration{
			collector.Shallow: 7 * 24 * time.Hour,
			collector.Deep:    7 * 24 * time.Hour,
		},
		Scheduler: collector.Policy{
			Interval: map[collector.Depth]time.Duration{
				collector.Shallow: collector.DefaultSchedulerMinInterval,
				collector.Deep:    7 * 24 * time.Hour,
			},
			Ratio: maps.Clone(collector.DefaultSchedulerRatios),
		},
		Health: collector.Policy{
			Interval: map[collector.Depth]time.Duration{
				collector.Shallow: 7 * 24 * time.Hour,
				collector.Deep:    7 * 24 * time.Hour,
			},
			Ratio: maps.Clone(collector.DefaultWarnRatios),
		},
	}
	applyPins := func(iv collector.Intervals) collector.Intervals {
		for depth, d := range pins {
			iv.Global[depth] = d
			for _, overrides := range iv.PerPool {
				delete(overrides, depth)
			}
		}
		return iv
	}
	intervals = applyPins(intervals)

	exporter := &collector.Exporter{}
	registry := prometheus.NewRegistry()
	registry.MustRegister(exporter)
	buildInfo := prometheus.NewGauge(prometheus.GaugeOpts{
		Name:        "ceph_scrub_build_info",
		Help:        "monk build metadata",
		ConstLabels: prometheus.Labels{"version": version.Version},
	})
	buildInfo.Set(1)
	registry.MustRegister(buildInfo)

	// Transitions and changed causes log at error/info; a repeat of the same
	// failure stays quiet so a mon outage does not write an identical line
	// every refresh forever.
	collectFailing, intervalFailing := false, false
	var lastCollectErr, lastIntervalErr string
	collect := func(parent context.Context) {
		start := time.Now()
		ctx, cancel := context.WithTimeout(parent, *timeout)
		defer cancel()
		if iv, err := collector.FetchIntervals(ctx, cmd); err == nil {
			intervals = applyPins(iv)
			exporter.StoreIntervalRead(true, start)
			if intervalFailing {
				intervalFailing = false
				log.Info().Msg("interval read recovered")
			}
		} else {
			exporter.StoreIntervalRead(false, start)
			if !intervalFailing || err.Error() != lastIntervalErr {
				intervalFailing = true
				lastIntervalErr = err.Error()
				log.Warn().Err(err).Msg("interval read failing, keeping previous targets")
			}
		}
		raw, err := collector.Fetch(ctx, cmd)
		if err == nil {
			var snap *collector.Snapshot
			if snap, err = collector.Compute(raw, start, intervals); err == nil {
				exporter.Store(snap, time.Since(start))
				if collectFailing {
					collectFailing = false
					log.Info().Msg("collection recovered")
				}
				log.Debug().Dur("took", time.Since(start)).Int("pools", len(snap.Pools)).Int("parse_errors", snap.ParseErrors).Msg("collected")
				return
			}
		}
		exporter.MarkFailed()
		if !collectFailing || err.Error() != lastCollectErr {
			collectFailing = true
			lastCollectErr = err.Error()
			log.Error().Err(err).Msg("collection failing")
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		ticker := time.NewTicker(*refresh)
		defer ticker.Stop()
		collect(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				collect(ctx)
			}
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	server := &http.Server{
		Addr:              *listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	log.Info().Str("version", version.Version).Str("listen", *listen).Msg("serving")
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("listen failed")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("shutdown complete")
}
