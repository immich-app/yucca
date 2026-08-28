package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"columbo/internal/agent"
	"columbo/internal/bot"
	"columbo/internal/config"
	"columbo/internal/server"
	"columbo/internal/version"
	"columbo/internal/worker"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	zerolog.TimeFieldFormat = time.RFC3339
	zerolog.TimestampFunc = func() time.Time { return time.Now().UTC() }

	cfg := config.LoadConfig()

	var output io.Writer = os.Stderr
	if cfg.LogPretty {
		output = zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
	}
	log.Logger = zerolog.New(output).With().Timestamp().Caller().Logger()
	zerolog.SetGlobalLevel(cfg.LogLevel)

	addr := fmt.Sprintf(":%d", cfg.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal().Err(err).Str("addr", addr).Msg("failed to bind listener")
	}

	enabled := cfg.OpenRouterAPIKey != ""
	if !enabled {
		log.Warn().Msg("OPENROUTER_API_KEY is unset — investigation requests will be accepted and dropped")
	}

	runner := agent.NewRunner(agent.Config{
		OpenRouterURL:   cfg.OpenRouterURL,
		APIKey:          cfg.OpenRouterAPIKey,
		Model:           cfg.Model,
		TriageModel:     cfg.TriageModel,
		MetricsURL:      cfg.MetricsURL,
		LogsURL:         cfg.LogsURL,
		MaxToolCalls:    cfg.MaxToolCalls,
		ToolResultBytes: cfg.ToolResultBytes,
	})
	pool := worker.NewPool(runner, bot.NewClient(cfg.BotURL, cfg.InternalSecret), cfg.InvestigationTimeout)

	enqueue := func(inv agent.Investigation) bool {
		if !enabled {
			log.Info().Str("staffThreadId", inv.StaffThreadID).Msg("dropping investigation request (no API key)")
			return true
		}
		return pool.Enqueue(inv)
	}

	httpSrv := &http.Server{
		Addr:    addr,
		Handler: server.New(cfg.InternalSecret, enqueue).Handler(),
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool.Run(ctx, cfg.Workers)

	go func() {
		log.Info().Int("port", cfg.Port).Str("version", version.Version).Msg("starting columbo")
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
	pool.Wait()

	log.Info().Msg("shutdown complete")
}
