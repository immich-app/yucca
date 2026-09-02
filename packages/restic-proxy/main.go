package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"restic-proxy/internal/client"
	"restic-proxy/internal/config"
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

	client := client.New(api)
	proxy := proxy.New(client)
	handler := hlog.NewHandler(log.Logger)(hlog.MethodHandler("method")(hlog.URLHandler("path")(hlog.RemoteAddrHandler("remote_addr")(proxy))))

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 30 * time.Second,
	}

	log.Info().Str("address", listener.Addr().String()).Msg("Listening for requests")
	log.Info().Msg(fmt.Sprintf("Point restic at rest:http://<REPOSITORY>:<TOKEN>@%s", listener.Addr().String()))

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal().Err(err).Msg("server stopped")
	}
}
