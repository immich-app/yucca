package config

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/pem"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type Config struct {
	Port              int
	JWTPublicKey      *ecdsa.PublicKey
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3Region          string
	S3Endpoint        string
	S3ForcePathStyle  bool

	// S3 load-balancing pool. When S3BackendSource is empty, michael talks to
	// the single S3Endpoint (legacy behavior). When set to "file" or "dns", it
	// balances across the resolved backend gateways instead.
	S3BackendSource     string // "" | "file" | "dns"
	S3BackendFile       string // path, for source=file
	S3BackendDNSHost    string // hostname to resolve, for source=dns
	S3BackendScheme     string // scheme to template around resolved IPs (default from S3Endpoint)
	S3BackendPort       string // port to template around resolved IPs (default from S3Endpoint)
	S3BackendPinHost    bool   // dial each resolved backend IP but sign/Host with S3Endpoint
	S3TLSSkipVerify     bool   // skip TLS verification to backends (self-signed gateways)
	S3ProbeBucket       string // sentinel bucket for active health probes
	S3EjectThreshold    int    // consecutive transport failures before ejection
	S3ReconcileInterval time.Duration
	OTLPMetricsEndpoint string
	OTLPMetricsURLPath  string
	OTLPMetricsInterval time.Duration
	OTLPEnabled         bool
	OTLPLogsEndpoint    string
	OTLPLogsURLPath     string
	OTLPLogsEnabled     bool
	LogLevel            zerolog.Level
	LogPretty           bool

	// Restic-token validity checking. Empty RedisAddr disables it (e.g.
	// secondary regions, which have no local validity-marker population path).
	RedisAddr          string
	RedisTimeout       time.Duration
	RevocationFreshTTL time.Duration
	RevocationGraceTTL time.Duration
	// Connection types whose tokens are validity-checked. Non-revocable types
	// (e.g. immich, which has no validity marker) are skipped so an absent marker
	// never wrongly denies them. Mirrors @common/server ConnectionTypeInfos.revocable.
	RevocableConnectionTypes map[string]bool
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

	backendSource := os.Getenv("S3_BACKEND_SOURCE")
	backendFile := os.Getenv("S3_BACKEND_FILE")
	backendDNSHost := os.Getenv("S3_BACKEND_DNS_HOST")

	// Scheme/port default to those parsed from S3_ENDPOINT, so a DNS source only
	// needs the hostname configured.
	defScheme, defPort := schemeAndPort(s3Endpoint)
	backendScheme := envOr("S3_BACKEND_SCHEME", defScheme)
	backendPort := envOr("S3_BACKEND_PORT", defPort)

	backendPinHost := false
	if v := os.Getenv("S3_BACKEND_PIN_HOST"); v != "" {
		backendPinHost, err = strconv.ParseBool(v)
		if err != nil {
			log.Fatal().Err(err).Msg("S3_BACKEND_PIN_HOST must be a boolean")
		}
	}

	tlsSkipVerify := false
	if v := os.Getenv("S3_TLS_SKIP_VERIFY"); v != "" {
		tlsSkipVerify, err = strconv.ParseBool(v)
		if err != nil {
			log.Fatal().Err(err).Msg("S3_TLS_SKIP_VERIFY must be a boolean")
		}
	}

	probeBucket := os.Getenv("S3_PROBE_BUCKET")

	ejectThreshold := 3
	if v := os.Getenv("S3_EJECT_THRESHOLD"); v != "" {
		ejectThreshold, err = strconv.Atoi(v)
		if err != nil || ejectThreshold < 1 {
			log.Fatal().Msg("S3_EJECT_THRESHOLD must be a number >= 1")
		}
	}

	reconcileInterval := 5 * time.Second
	if v := os.Getenv("S3_RECONCILE_INTERVAL_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil || ms < 1 {
			log.Fatal().Msg("S3_RECONCILE_INTERVAL_MS must be a number >= 1")
		}
		reconcileInterval = time.Duration(ms) * time.Millisecond
	}

	switch backendSource {
	case "":
		// single-endpoint mode
	case "file":
		if backendFile == "" {
			log.Fatal().Msg("S3_BACKEND_FILE is required when S3_BACKEND_SOURCE=file")
		}
	case "dns":
		if backendDNSHost == "" {
			log.Fatal().Msg("S3_BACKEND_DNS_HOST is required when S3_BACKEND_SOURCE=dns")
		}
	default:
		log.Fatal().Str("value", backendSource).Msg("S3_BACKEND_SOURCE must be '', 'file', or 'dns'")
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

	redisAddr := os.Getenv("REDIS_ADDR")
	redisTimeout := 50 * time.Millisecond
	if v := os.Getenv("REDIS_TIMEOUT_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil || ms < 1 {
			log.Fatal().Msg("REDIS_TIMEOUT_MS must be a positive number")
		}
		redisTimeout = time.Duration(ms) * time.Millisecond
	}
	// Fresh: how long a confirmed decision is served without touching Redis, so
	// a revoke takes effect within this window. Grace: how long a previously-valid
	// jti keeps working while Redis is unreachable, before michael fails closed.
	revocationFreshTTL := 60 * time.Second
	if v := os.Getenv("REVOCATION_FRESH_TTL_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil || ms < 1 {
			log.Fatal().Msg("REVOCATION_FRESH_TTL_MS must be a positive number")
		}
		revocationFreshTTL = time.Duration(ms) * time.Millisecond
	}
	revocationGraceTTL := 300 * time.Second
	if v := os.Getenv("REVOCATION_GRACE_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil || ms < 1 {
			log.Fatal().Msg("REVOCATION_GRACE_MS must be a positive number")
		}
		revocationGraceTTL = time.Duration(ms) * time.Millisecond
	}
	if revocationGraceTTL < revocationFreshTTL {
		log.Fatal().Msg("REVOCATION_GRACE_MS must be >= REVOCATION_FRESH_TTL_MS")
	}
	revocableTypes := parseCSVSet(envOr("REVOCABLE_CONNECTION_TYPES", "restic"))

	return Config{
		Port:                     port,
		JWTPublicKey:             jwtPublicKey,
		S3AccessKeyID:            s3AccessKeyID,
		S3SecretAccessKey:        s3SecretAccessKey,
		S3Region:                 s3Region,
		S3Endpoint:               s3Endpoint,
		S3ForcePathStyle:         s3ForcePathStyle,
		S3BackendSource:          backendSource,
		S3BackendFile:            backendFile,
		S3BackendDNSHost:         backendDNSHost,
		S3BackendScheme:          backendScheme,
		S3BackendPort:            backendPort,
		S3BackendPinHost:         backendPinHost,
		S3TLSSkipVerify:          tlsSkipVerify,
		S3ProbeBucket:            probeBucket,
		S3EjectThreshold:         ejectThreshold,
		S3ReconcileInterval:      reconcileInterval,
		OTLPMetricsEndpoint:      otlpEndpoint,
		OTLPMetricsURLPath:       otlpURLPath,
		OTLPMetricsInterval:      otlpInterval,
		OTLPEnabled:              otlpEndpoint != "",
		OTLPLogsEndpoint:         otlpLogsEndpoint,
		OTLPLogsURLPath:          otlpLogsURLPath,
		OTLPLogsEnabled:          otlpLogsEndpoint != "",
		LogLevel:                 logLevel,
		LogPretty:                logPretty,
		RedisAddr:                redisAddr,
		RedisTimeout:             redisTimeout,
		RevocationFreshTTL:       revocationFreshTTL,
		RevocationGraceTTL:       revocationGraceTTL,
		RevocableConnectionTypes: revocableTypes,
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// parseCSVSet turns "restic, s3" into {"restic":true,"s3":true}, trimming blanks.
func parseCSVSet(csv string) map[string]bool {
	set := make(map[string]bool)
	for _, part := range strings.Split(csv, ",") {
		if p := strings.TrimSpace(part); p != "" {
			set[p] = true
		}
	}
	return set
}

// schemeAndPort extracts the scheme and port from an endpoint URL, used to
// default the templating for DNS-resolved backends. Falls back to http and the
// scheme's default port when unset.
func schemeAndPort(endpoint string) (scheme, port string) {
	scheme, port = "http", "80"
	u, err := url.Parse(endpoint)
	if err != nil {
		return scheme, port
	}
	if u.Scheme != "" {
		scheme = u.Scheme
	}
	if p := u.Port(); p != "" {
		port = p
	} else if scheme == "https" {
		port = "443"
	}
	return scheme, port
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
