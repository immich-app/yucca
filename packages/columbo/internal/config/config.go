package config

import (
	"os"
	"strconv"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type Config struct {
	Port           int
	InternalSecret string

	// OpenRouterAPIKey empty ⇒ columbo idles: investigation requests are
	// accepted and dropped, mirroring how the bot idles without its token.
	OpenRouterAPIKey string
	OpenRouterURL    string
	Model            string
	TriageModel      string

	// MetricsURL is the Prometheus-API root (…/api/v1/* is appended);
	// LogsURL is the VictoriaLogs host root (…/select/logsql/query is appended).
	MetricsURL string
	LogsURL    string

	BotURL string

	MaxToolCalls         int
	InvestigationTimeout time.Duration
	ToolResultBytes      int
	Workers              int

	LogLevel  zerolog.Level
	LogPretty bool
}

func LoadConfig() Config {
	portStr := os.Getenv("COLUMBO_PORT")
	if portStr == "" {
		log.Fatal().Msg("COLUMBO_PORT is required")
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1000 {
		log.Fatal().Msg("COLUMBO_PORT must be a number >= 1000")
	}

	logLevel := zerolog.InfoLevel
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		parsed, err := zerolog.ParseLevel(v)
		if err != nil {
			log.Fatal().Str("value", v).Msg("LOG_LEVEL must be a valid level (trace, debug, info, warn, error, fatal, panic)")
		}
		logLevel = parsed
	}

	logPretty := false
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		switch v {
		case "json", "pretty":
			logPretty = v == "pretty"
		default:
			log.Fatal().Str("value", v).Msg("LOG_FORMAT must be 'json' or 'pretty'")
		}
	}

	return Config{
		Port:                 port,
		InternalSecret:       os.Getenv("INTERNAL_SECRET"),
		OpenRouterAPIKey:     os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterURL:        envOr("OPENROUTER_URL", "https://openrouter.ai/api/v1"),
		Model:                envOr("COLUMBO_MODEL", "z-ai/glm-5.3-flash"),
		TriageModel:          envOr("COLUMBO_TRIAGE_MODEL", "deepseek/deepseek-v4-flash-0731"),
		MetricsURL:           envOr("O11Y_METRICS_URL", "http://localhost:8428"),
		LogsURL:              envOr("O11Y_LOGS_URL", "http://localhost:9428"),
		BotURL:               envOr("FUTO_BACKUPS_BOT_URL", "http://localhost:3050"),
		MaxToolCalls:         envIntMin("COLUMBO_MAX_TOOL_CALLS", 16, 1),
		InvestigationTimeout: time.Duration(envIntMin("COLUMBO_TIMEOUT_SECONDS", 300, 10)) * time.Second,
		ToolResultBytes:      envIntMin("COLUMBO_TOOL_RESULT_BYTES", 12288, 512),
		Workers:              envIntMin("COLUMBO_WORKERS", 2, 1),
		LogLevel:             logLevel,
		LogPretty:            logPretty,
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntMin(key string, fallback, minimum int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < minimum {
		log.Fatal().Msgf("%s must be a number >= %d", key, minimum)
	}
	return n
}
