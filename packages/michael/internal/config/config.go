package config

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/pem"
	"os"
	"strconv"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type Config struct {
	Port                int
	JWTPublicKey        *ecdsa.PublicKey
	S3AccessKeyID       string
	S3SecretAccessKey   string
	S3Region            string
	S3Endpoint          string
	S3ForcePathStyle    bool
	OTLPMetricsEndpoint string
	OTLPMetricsURLPath  string
	OTLPMetricsInterval time.Duration
	OTLPEnabled         bool
	OTLPLogsEndpoint    string
	OTLPLogsURLPath     string
	OTLPLogsEnabled     bool
	LogLevel            zerolog.Level
	LogPretty           bool
}

func LoadConfig() Config {
	portStr := os.Getenv("RESTIC_API_PORT")
	if portStr == "" {
		log.Fatal().Msg("RESTIC_API_PORT is required")
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1000 {
		log.Fatal().Msg("RESTIC_API_PORT must be a number >= 1000")
	}

	jwtPublicKey := parseES256PublicKey(os.Getenv("JWT_PUBLIC_KEY"))

	s3AccessKeyID := os.Getenv("S3_ACCESS_KEY_ID")
	if s3AccessKeyID == "" {
		log.Fatal().Msg("S3_ACCESS_KEY_ID is required")
	}

	s3SecretAccessKey := os.Getenv("S3_SECRET_ACCESS_KEY")
	if s3SecretAccessKey == "" {
		log.Fatal().Msg("S3_SECRET_ACCESS_KEY is required")
	}

	s3Region := os.Getenv("S3_REGION")
	if s3Region == "" {
		log.Fatal().Msg("S3_REGION is required")
	}

	s3Endpoint := os.Getenv("S3_ENDPOINT")
	if s3Endpoint == "" {
		log.Fatal().Msg("S3_ENDPOINT is required")
	}

	s3ForcePathStyle := false
	if v := os.Getenv("S3_FORCE_PATH_STYLE"); v != "" {
		s3ForcePathStyle, err = strconv.ParseBool(v)
		if err != nil {
			log.Fatal().Err(err).Msg("S3_FORCE_PATH_STYLE must be a boolean")
		}
	}

	otlpEndpoint := os.Getenv("OTLP_METRICS_ENDPOINT")
	otlpURLPath := os.Getenv("OTLP_METRICS_URL_PATH")
	otlpInterval := 1000 * time.Millisecond
	if v := os.Getenv("OTLP_METRICS_INTERVAL_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil {
			log.Fatal().Err(err).Msg("OTLP_METRICS_INTERVAL_MS must be a number")
		}
		otlpInterval = time.Duration(ms) * time.Millisecond
	}

	otlpLogsEndpoint := os.Getenv("OTLP_LOGS_ENDPOINT")
	otlpLogsURLPath := os.Getenv("OTLP_LOGS_URL_PATH")

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
		Port:                port,
		JWTPublicKey:        jwtPublicKey,
		S3AccessKeyID:       s3AccessKeyID,
		S3SecretAccessKey:   s3SecretAccessKey,
		S3Region:            s3Region,
		S3Endpoint:          s3Endpoint,
		S3ForcePathStyle:    s3ForcePathStyle,
		OTLPMetricsEndpoint: otlpEndpoint,
		OTLPMetricsURLPath:  otlpURLPath,
		OTLPMetricsInterval: otlpInterval,
		OTLPEnabled:         otlpEndpoint != "",
		OTLPLogsEndpoint:    otlpLogsEndpoint,
		OTLPLogsURLPath:     otlpLogsURLPath,
		OTLPLogsEnabled:     otlpLogsEndpoint != "",
		LogLevel:            logLevel,
		LogPretty:           logPretty,
	}
}

func parseES256PublicKey(key string) *ecdsa.PublicKey {
	if key == "" {
		log.Fatal().Msg("JWT_PUBLIC_KEY is required")
	}

	block, _ := pem.Decode([]byte(key))
	if block == nil {
		log.Fatal().Msg("JWT_PUBLIC_KEY must be a PEM-encoded ECDSA P-256 public key")
	}

	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		log.Fatal().Err(err).Msg("JWT_PUBLIC_KEY could not be parsed")
	}

	pub, ok := parsed.(*ecdsa.PublicKey)
	if !ok {
		log.Fatal().Msg("JWT_PUBLIC_KEY must be an ECDSA public key")
	}
	if pub.Curve != elliptic.P256() {
		log.Fatal().Msg("JWT_PUBLIC_KEY must use the P-256 curve (ES256)")
	}

	return pub
}
