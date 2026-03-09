package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port                int
	JWTSecret           []byte
	S3AccessKeyID       string
	S3SecretAccessKey   string
	S3Region            string
	S3Endpoint          string
	S3ForcePathStyle    bool
	OTLPMetricsEndpoint string
	OTLPMetricsURLPath  string
	OTLPMetricsInterval time.Duration
	OTLPEnabled         bool
}

func LoadConfig() Config {
	portStr := os.Getenv("RESTIC_API_PORT")
	if portStr == "" {
		log.Fatal("RESTIC_API_PORT is required")
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1000 {
		log.Fatal("RESTIC_API_PORT must be a number >= 1000")
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET is required and must be at least 32 characters")
	}

	s3AccessKeyID := os.Getenv("S3_ACCESS_KEY_ID")
	if s3AccessKeyID == "" {
		log.Fatal("S3_ACCESS_KEY_ID is required")
	}

	s3SecretAccessKey := os.Getenv("S3_SECRET_ACCESS_KEY")
	if s3SecretAccessKey == "" {
		log.Fatal("S3_SECRET_ACCESS_KEY is required")
	}

	s3Region := os.Getenv("S3_REGION")
	if s3Region == "" {
		log.Fatal("S3_REGION is required")
	}

	s3Endpoint := os.Getenv("S3_ENDPOINT")
	if s3Endpoint == "" {
		log.Fatal("S3_ENDPOINT is required")
	}

	s3ForcePathStyle := false
	if v := os.Getenv("S3_FORCE_PATH_STYLE"); v != "" {
		s3ForcePathStyle, err = strconv.ParseBool(v)
		if err != nil {
			log.Fatalf("S3_FORCE_PATH_STYLE must be a boolean: %v", err)
		}
	}

	otlpEndpoint := os.Getenv("OTLP_METRICS_ENDPOINT")
	otlpURLPath := os.Getenv("OTLP_METRICS_URL_PATH")
	otlpInterval := 1000 * time.Millisecond
	if v := os.Getenv("OTLP_METRICS_INTERVAL_MS"); v != "" {
		ms, err := strconv.Atoi(v)
		if err != nil {
			log.Fatalf("OTLP_METRICS_INTERVAL_MS must be a number: %v", err)
		}
		otlpInterval = time.Duration(ms) * time.Millisecond
	}

	return Config{
		Port:                port,
		JWTSecret:           []byte(jwtSecret),
		S3AccessKeyID:       s3AccessKeyID,
		S3SecretAccessKey:   s3SecretAccessKey,
		S3Region:            s3Region,
		S3Endpoint:          s3Endpoint,
		S3ForcePathStyle:    s3ForcePathStyle,
		OTLPMetricsEndpoint: otlpEndpoint,
		OTLPMetricsURLPath:  otlpURLPath,
		OTLPMetricsInterval: otlpInterval,
		OTLPEnabled:         otlpEndpoint != "",
	}
}
