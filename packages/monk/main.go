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
	refresh := flag.Duration("refresh", 2*time.Minute, "refresh interval")
	timeout := flag.Duration("timeout", 90*time.Second, "ceph command timeout")
	shallowPin := flag.String("shallow-interval", "", "pin the shallow target interval (e.g. 168h); empty follows the cluster")
	deepPin := flag.String("deep-interval", "", "pin the deep target interval (e.g. 672h); empty follows the cluster")
	cephCmd := flag.String("ceph-cmd", "ceph", "command prefix to reach the ceph CLI, split on spaces")
	flag.Parse()

	log := zerolog.New(os.Stderr).With().Timestamp().Logger()
	cmd := strings.Fields(*cephCmd)
	if len(cmd) == 0 {
		log.Fatal().Msg("empty -ceph-cmd")
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

	// Until the first successful cluster read, unpinned depths fall back to
	// ceph's own defaults so a cold start with an unreachable mon still serves
	// sane thresholds; the target-interval metric shows what was used.
	intervals := collector.Intervals{Global: map[collector.Depth]time.Duration{
		collector.Shallow: 7 * 24 * time.Hour,
		collector.Deep:    28 * 24 * time.Hour,
	}}
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
	exporter.MarkFailed()
	registry := prometheus.NewRegistry()
	registry.MustRegister(exporter)

	collect := func() {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		defer cancel()
		if len(pins) < len(collector.Depths) {
			if iv, err := collector.FetchIntervals(ctx, cmd); err == nil {
				intervals = applyPins(iv)
			} else {
				log.Warn().Err(err).Msg("interval read failed, keeping previous targets")
			}
		}
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
