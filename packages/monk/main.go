package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"

	"monk/internal/collector"
	"monk/internal/version"
)

func main() {
	listen := flag.String("listen", ":9284", "metrics listen address")
	refresh := flag.Duration("refresh", 2*time.Minute, "pg ls refresh interval")
	timeout := flag.Duration("timeout", 90*time.Second, "pg ls command timeout")
	shallowInterval := flag.Duration("shallow-interval", 7*24*time.Hour, "target interval for shallow scrubs")
	deepInterval := flag.Duration("deep-interval", 28*24*time.Hour, "target interval for deep scrubs")
	cephCmd := flag.String("ceph-cmd", "ceph", "command prefix to reach the ceph CLI, split on spaces")
	flag.Parse()

	log := zerolog.New(os.Stderr).With().Timestamp().Logger()
	cmd := strings.Fields(*cephCmd)
	if len(cmd) == 0 {
		log.Fatal().Msg("empty -ceph-cmd")
	}
	intervals := map[collector.Depth]time.Duration{
		collector.Shallow: *shallowInterval,
		collector.Deep:    *deepInterval,
	}

	exporter := &collector.Exporter{Intervals: intervals}
	exporter.MarkFailed()
	registry := prometheus.NewRegistry()
	registry.MustRegister(exporter)

	collect := func() {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		defer cancel()
		raw, err := collector.Fetch(ctx, cmd)
		if err == nil {
			var snap *collector.Snapshot
			if snap, err = collector.Compute(raw, start, intervals); err == nil {
				exporter.Store(snap, time.Since(start))
				log.Info().Dur("took", time.Since(start)).Int("pools", len(snap.Pools)).Int("parse_errors", snap.ParseErrors).Msg("collected")
				return
			}
		}
		exporter.MarkFailed()
		log.Error().Err(err).Msg("collection failed")
	}

	go func() {
		collect()
		for range time.Tick(*refresh) {
			collect()
		}
	}()

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	server := &http.Server{Addr: *listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Info().Str("version", version.Version).Str("listen", *listen).Msg("serving")
	if err := server.ListenAndServe(); err != nil {
		log.Fatal().Err(err).Msg("listen failed")
	}
}
