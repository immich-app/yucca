package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"restic-proxy/internal/config"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.TimestampFunc = func() time.Time { return time.Now().UTC() }

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Panic().Err(err).Msg("failed to parse config")
		os.Exit(1)
	}

	if cfg.LogPretty.Pretty {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}

	listen := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	listener, err := net.Listen("tcp", listen)
	if err != nil {
		log.Panic().Err(err).Msg("failed to bind listener")
		os.Exit(2)
	}

	handler := http.HandlerFunc(func(
		writer http.ResponseWriter, request *http.Request,
	) {
		log.Printf("%s %s", request.Method, request.URL.Path)
		http.Error(writer, "not forwarding yet", http.StatusNotImplemented)
	})

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 30 * time.Second,
	}

	log.Info().Str("address", listener.Addr().String()).Msg("Listening for requests")
	log.Info().Msg(fmt.Sprintf("Point restic at rest:http://restic:<TOKEN>@%s/<REPOSITORY>", listener.Addr().String()))

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal().Err(err).Msg("server stopped")
		os.Exit(1)
	}
}
