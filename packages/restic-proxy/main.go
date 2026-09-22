package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"restic-proxy/internal/client"
	"restic-proxy/internal/config"
	"restic-proxy/internal/ipc"
	"restic-proxy/internal/meta"
	"restic-proxy/internal/proxy"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.TimestampFunc = func() time.Time { return time.Now().UTC() }

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Error().Err(err).Msg("failed to parse config")
		os.Exit(3)
	}

	zerolog.SetGlobalLevel(cfg.LogLevel.Level)

	if cfg.LogPretty.Pretty {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}

	log.Info().Str("wellknown", cfg.WellKnown).Msg("Loaded config for restic proxy")

	api, err := meta.ApiFromConfig(cfg)
	if err != nil {
		log.Error().Err(err).Msg("failed to find API url")
		os.Exit(4)
	}

	log.Info().Str("api_url", api.Url).Msg("Resolved API")

	listen := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	listener, err := net.Listen("tcp", listen)
	if err != nil {
		log.Error().Err(err).Msg("failed to bind listener")
		os.Exit(6)
	}

	parent, err := ipc.ReportReadyFromConfig(cfg, listener.Addr())
	if err != nil {
		log.Error().Err(err).Msg("failed to push address to parent process")
		os.Exit(7)
	}

	client := client.New(api)
	proxy := proxy.New(client)
	if err := proxy.Throttle(cfg.ThrottleBytesPerSec, cfg.ThrottleQuietHours); err != nil {
		log.Error().Err(err).Msg("failed to apply the configured throttle")
		os.Exit(5)
	}

	handler := hlog.NewHandler(log.Logger)(hlog.MethodHandler("method")(hlog.URLHandler("path")(hlog.RemoteAddrHandler("remote_addr")(proxy))))

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 30 * time.Second,
	}

	if parent != nil {
		go func() {
			ipc.ReadControl(parent, func(control ipc.Control) {
				switch control.Type {
				case ipc.ControlThrottle:
					applyThrottle(proxy, control.Throttle)
				default:
					log.Warn().Str("type", string(control.Type)).Msg("Ignored an unknown control message")
				}
			})

			log.Info().Msg("Parent process exited, shutting down")

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = server.Shutdown(ctx)
		}()
	}

	log.Info().Str("address", listener.Addr().String()).Msg("Listening for requests")
	log.Info().Msg(fmt.Sprintf("Point restic at rest:http://<REPOSITORY>:<TOKEN>@%s", listener.Addr().String()))

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal().Err(err).Msg("server stopped")
	}
}

func applyThrottle(handler *proxy.Handler, throttle *ipc.ThrottleControl) {
	if throttle == nil {
		log.Warn().Msg("Ignored a throttle control message without a throttle")
		return
	}

	if err := handler.Throttle(throttle.BytesPerSec, throttle.QuietHours); err != nil {
		log.Error().Err(err).Msg("Ignored an unusable throttle update")
		return
	}

	log.Info().Int("bytes_per_sec", throttle.BytesPerSec).Str("quiet_hours", throttle.QuietHours).Msg("Throttle updated")
}
