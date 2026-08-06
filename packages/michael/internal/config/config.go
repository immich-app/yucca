package config

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"michael/internal/cluster"

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

	// S3 load-balancing pool. Empty S3BackendSource = single S3Endpoint
	// (legacy); "file"/"dns" = balance across resolved gateways.
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

	// S3DefaultCluster: cluster the flat S3_* fields describe; serves tokens
	// without a storageCluster claim.
	S3DefaultCluster string
	// Clusters is every storage cluster this michael fronts, the default one
	// first, followed by any declared in S3_CLUSTERS_FILE.
	Clusters []ClusterConfig

	// ASNDatabasePath: MaxMind-format IP→ASN DB (baked into the image); absent
	// still serves, with every source network reported unknown.
	ASNDatabasePath string
	// ClientIPHeader: gateway-written client address header; only its LAST
	// entry is trusted — see geoip.ClientAddr.
	ClientIPHeader string

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

// ClusterConfig: everything to talk to ONE storage cluster (endpoint,
// credentials, pool settings). Flat S3_* env = default cluster;
// S3_CLUSTERS_FILE declares additional ones.
type ClusterConfig struct {
	Code              string
	S3AccessKeyID     string
	S3SecretAccessKey string
	S3Region          string
	S3Endpoint        string
	S3ForcePathStyle  bool

	S3BackendSource     string // "" | "file" | "dns"
	S3BackendFile       string
	S3BackendDNSHost    string
	S3BackendScheme     string
	S3BackendPort       string
	S3BackendPinHost    bool
	S3TLSSkipVerify     bool
	S3ProbeBucket       string
	S3EjectThreshold    int
	S3ReconcileInterval time.Duration
}

func (c Config) DefaultCluster() ClusterConfig {
	return ClusterConfig{
		Code:                c.S3DefaultCluster,
		S3AccessKeyID:       c.S3AccessKeyID,
		S3SecretAccessKey:   c.S3SecretAccessKey,
		S3Region:            c.S3Region,
		S3Endpoint:          c.S3Endpoint,
		S3ForcePathStyle:    c.S3ForcePathStyle,
		S3BackendSource:     c.S3BackendSource,
		S3BackendFile:       c.S3BackendFile,
		S3BackendDNSHost:    c.S3BackendDNSHost,
		S3BackendScheme:     c.S3BackendScheme,
		S3BackendPort:       c.S3BackendPort,
		S3BackendPinHost:    c.S3BackendPinHost,
		S3TLSSkipVerify:     c.S3TLSSkipVerify,
		S3ProbeBucket:       c.S3ProbeBucket,
		S3EjectThreshold:    c.S3EjectThreshold,
		S3ReconcileInterval: c.S3ReconcileInterval,
	}
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

	// Scheme/port default from S3_ENDPOINT so a DNS source only needs the hostname.
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

	defaultCluster := envOr("S3_DEFAULT_CLUSTER", cluster.DefaultCode)
	if !cluster.IsValidCode(defaultCluster) {
		log.Fatal().Str("value", defaultCluster).Msgf("S3_DEFAULT_CLUSTER must match %s", cluster.CodePattern)
	}

	asnDatabasePath := envOr("ASN_DB_PATH", "/etc/michael/asn.mmdb")
	clientIPHeader := envOr("CLIENT_IP_HEADER", "X-Forwarded-For")

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

	cfg := Config{
		Port:                port,
		JWTPublicKey:        jwtPublicKey,
		S3AccessKeyID:       s3AccessKeyID,
		S3SecretAccessKey:   s3SecretAccessKey,
		S3Region:            s3Region,
		S3Endpoint:          s3Endpoint,
		S3ForcePathStyle:    s3ForcePathStyle,
		S3BackendSource:     backendSource,
		S3BackendFile:       backendFile,
		S3BackendDNSHost:    backendDNSHost,
		S3BackendScheme:     backendScheme,
		S3BackendPort:       backendPort,
		S3BackendPinHost:    backendPinHost,
		S3TLSSkipVerify:     tlsSkipVerify,
		S3ProbeBucket:       probeBucket,
		S3EjectThreshold:    ejectThreshold,
		S3ReconcileInterval: reconcileInterval,
		S3DefaultCluster:    defaultCluster,
		ASNDatabasePath:     asnDatabasePath,
		ClientIPHeader:      clientIPHeader,
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

	cfg.Clusters = []ClusterConfig{cfg.DefaultCluster()}
	if path := os.Getenv("S3_TOPOLOGY_FILE"); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			log.Fatal().Err(err).Str("path", path).Msg("failed to read S3_TOPOLOGY_FILE")
		}
		clusters, err := ParseTopologyClusters(data, os.Getenv("SITE_CODE"), cfg.DefaultCluster(), os.Getenv)
		if err != nil {
			log.Fatal().Err(err).Str("path", path).Msg("invalid S3_TOPOLOGY_FILE")
		}
		cfg.Clusters = clusters
	} else if path := os.Getenv("S3_CLUSTERS_FILE"); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			log.Fatal().Err(err).Str("path", path).Msg("failed to read S3_CLUSTERS_FILE")
		}
		extra, err := ParseClusters(data, cfg.DefaultCluster(), os.Getenv)
		if err != nil {
			log.Fatal().Err(err).Str("path", path).Msg("invalid S3_CLUSTERS_FILE")
		}
		cfg.Clusters = append(cfg.Clusters, extra...)
	}

	return cfg
}

// clustersFile is the S3_CLUSTERS_FILE document: clusters fronted IN ADDITION
// to the flat-S3_* default.
type clustersFile struct {
	Clusters []clusterEntry `json:"clusters"`
}

type topologyFile struct {
	SchemaVersion int            `json:"schema_version"`
	DefaultSite   string         `json:"default_site"`
	Sites         []topologySite `json:"sites"`
}

type topologySite struct {
	Code           string            `json:"code"`
	DisplayName    string            `json:"display_name"`
	Description    string            `json:"description"`
	RestURL        string            `json:"rest_url"`
	DefaultCluster string            `json:"default_cluster"`
	Clusters       []topologyCluster `json:"clusters"`
}

type topologyCluster struct {
	Code             string        `json:"code"`
	DisplayName      string        `json:"display_name"`
	Active           bool          `json:"active"`
	RGWAdminEndpoint string        `json:"rgw_admin_endpoint"`
	S3               *clusterEntry `json:"s3"`
}

// clusterEntry: one cluster in S3_CLUSTERS_FILE. Credential fields are env-var
// NAMES (file stays a plain ConfigMap, secrets in a k8s Secret). Pointer fields
// distinguish absent-inherit-default from explicit false.
type clusterEntry struct {
	Code           string `json:"code"`
	Endpoint       string `json:"endpoint"`
	Region         string `json:"region"`
	ForcePathStyle *bool  `json:"force_path_style"`
	AccessKeyEnv   string `json:"access_key_env"`
	SecretKeyEnv   string `json:"secret_key_env"`

	// Backend pool: deliberately NOT inherited — an inherited DNS host/file
	// would silently point at the default cluster's gateways. Absent = single-endpoint.
	BackendSource  string `json:"backend_source"`
	BackendFile    string `json:"backend_file"`
	BackendDNSHost string `json:"backend_dns_host"`
	// Scheme/port default to those parsed from this entry's own endpoint.
	BackendScheme string `json:"backend_scheme"`
	BackendPort   string `json:"backend_port"`
	PinHost       *bool  `json:"pin_host"`

	TLSSkipVerify       *bool  `json:"tls_skip_verify"`
	ProbeBucket         string `json:"probe_bucket"`
	EjectThreshold      int    `json:"eject_threshold"`
	ReconcileIntervalMS int    `json:"reconcile_interval_ms"`
}

// ParseClusters decodes S3_CLUSTERS_FILE extras; def fills unset knobs, getenv
// resolves credential env names. Unknown fields rejected — a typo'd key would
// silently leave an inherited default.
func ParseClusters(data []byte, def ClusterConfig, getenv func(string) string) ([]ClusterConfig, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc clustersFile
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("decode clusters: %w", err)
	}

	seen := map[string]struct{}{def.Code: {}}
	out := make([]ClusterConfig, 0, len(doc.Clusters))
	for i, e := range doc.Clusters {
		cc, err := e.toConfig(def, getenv)
		if err != nil {
			return nil, fmt.Errorf("clusters[%d]: %w", i, err)
		}
		if _, dup := seen[cc.Code]; dup {
			return nil, fmt.Errorf("clusters[%d]: duplicate cluster code %q", i, cc.Code)
		}
		seen[cc.Code] = struct{}{}
		out = append(out, cc)
	}
	return out, nil
}

// ParseTopologyClusters selects one site's clusters from the shared fleet
// topology. Every cluster (incl. default) needs a non-secret s3 block naming
// credential env vars — one declarative list for API placement + michael routing.
func ParseTopologyClusters(
	data []byte,
	siteCode string,
	def ClusterConfig,
	getenv func(string) string,
) ([]ClusterConfig, error) {
	if !cluster.IsValidCode(siteCode) {
		return nil, fmt.Errorf("SITE_CODE %q must match %s", siteCode, cluster.CodePattern)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc topologyFile
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("decode topology: %w", err)
	}

	var site *topologySite
	for i := range doc.Sites {
		if doc.Sites[i].Code == siteCode {
			if site != nil {
				return nil, fmt.Errorf("duplicate site code %q", siteCode)
			}
			site = &doc.Sites[i]
		}
	}
	if site == nil {
		return nil, fmt.Errorf("site %q is not declared", siteCode)
	}
	if site.DefaultCluster != def.Code {
		return nil, fmt.Errorf(
			"site %q default_cluster %q does not match S3_DEFAULT_CLUSTER %q",
			siteCode,
			site.DefaultCluster,
			def.Code,
		)
	}

	seen := make(map[string]struct{}, len(site.Clusters))
	byCode := make(map[string]ClusterConfig, len(site.Clusters))
	for i, declared := range site.Clusters {
		if declared.S3 == nil {
			return nil, fmt.Errorf("site %q clusters[%d] %q has no s3 configuration", siteCode, i, declared.Code)
		}
		entry := *declared.S3
		entry.Code = declared.Code
		cc, err := entry.toConfig(def, getenv)
		if err != nil {
			return nil, fmt.Errorf("site %q clusters[%d]: %w", siteCode, i, err)
		}
		if _, duplicate := seen[cc.Code]; duplicate {
			return nil, fmt.Errorf("site %q has duplicate cluster code %q", siteCode, cc.Code)
		}
		if !strings.HasPrefix(cc.Code, siteCode+"-") {
			return nil, fmt.Errorf("cluster code %q must start with %q", cc.Code, siteCode+"-")
		}
		seen[cc.Code] = struct{}{}
		byCode[cc.Code] = cc
	}

	defaultConfig, ok := byCode[def.Code]
	if !ok {
		return nil, fmt.Errorf("site %q default_cluster %q is not declared", siteCode, def.Code)
	}
	out := []ClusterConfig{defaultConfig}
	for _, declared := range site.Clusters {
		if declared.Code != def.Code {
			out = append(out, byCode[declared.Code])
		}
	}
	return out, nil
}

func (e clusterEntry) toConfig(def ClusterConfig, getenv func(string) string) (ClusterConfig, error) {
	if !cluster.IsValidCode(e.Code) {
		return ClusterConfig{}, fmt.Errorf("code %q must match %s", e.Code, cluster.CodePattern)
	}
	if e.Endpoint == "" {
		return ClusterConfig{}, fmt.Errorf("cluster %q: endpoint is required", e.Code)
	}
	if e.AccessKeyEnv == "" || e.SecretKeyEnv == "" {
		return ClusterConfig{}, fmt.Errorf("cluster %q: access_key_env and secret_key_env are required", e.Code)
	}
	accessKey := getenv(e.AccessKeyEnv)
	if accessKey == "" {
		return ClusterConfig{}, fmt.Errorf("cluster %q: %s is unset or empty", e.Code, e.AccessKeyEnv)
	}
	secretKey := getenv(e.SecretKeyEnv)
	if secretKey == "" {
		return ClusterConfig{}, fmt.Errorf("cluster %q: %s is unset or empty", e.Code, e.SecretKeyEnv)
	}

	switch e.BackendSource {
	case "":
	case "file":
		if e.BackendFile == "" {
			return ClusterConfig{}, fmt.Errorf("cluster %q: backend_file is required when backend_source=file", e.Code)
		}
	case "dns":
		if e.BackendDNSHost == "" {
			return ClusterConfig{}, fmt.Errorf("cluster %q: backend_dns_host is required when backend_source=dns", e.Code)
		}
	default:
		return ClusterConfig{}, fmt.Errorf("cluster %q: backend_source must be '', 'file', or 'dns'", e.Code)
	}

	if e.EjectThreshold < 0 {
		return ClusterConfig{}, fmt.Errorf("cluster %q: eject_threshold must be >= 1", e.Code)
	}
	if e.ReconcileIntervalMS < 0 {
		return ClusterConfig{}, fmt.Errorf("cluster %q: reconcile_interval_ms must be >= 1", e.Code)
	}

	scheme, port := schemeAndPort(e.Endpoint)
	cc := ClusterConfig{
		Code:                e.Code,
		S3AccessKeyID:       accessKey,
		S3SecretAccessKey:   secretKey,
		S3Region:            firstNonEmpty(e.Region, def.S3Region),
		S3Endpoint:          e.Endpoint,
		S3ForcePathStyle:    boolOr(e.ForcePathStyle, def.S3ForcePathStyle),
		S3BackendSource:     e.BackendSource,
		S3BackendFile:       e.BackendFile,
		S3BackendDNSHost:    e.BackendDNSHost,
		S3BackendScheme:     firstNonEmpty(e.BackendScheme, scheme),
		S3BackendPort:       firstNonEmpty(e.BackendPort, port),
		S3BackendPinHost:    boolOr(e.PinHost, def.S3BackendPinHost),
		S3TLSSkipVerify:     boolOr(e.TLSSkipVerify, def.S3TLSSkipVerify),
		S3ProbeBucket:       firstNonEmpty(e.ProbeBucket, def.S3ProbeBucket),
		S3EjectThreshold:    def.S3EjectThreshold,
		S3ReconcileInterval: def.S3ReconcileInterval,
	}
	if e.EjectThreshold > 0 {
		cc.S3EjectThreshold = e.EjectThreshold
	}
	if e.ReconcileIntervalMS > 0 {
		cc.S3ReconcileInterval = time.Duration(e.ReconcileIntervalMS) * time.Millisecond
	}
	return cc, nil
}

func firstNonEmpty(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}

func boolOr(v *bool, fallback bool) bool {
	if v != nil {
		return *v
	}
	return fallback
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// schemeAndPort extracts scheme/port from an endpoint URL for DNS-backend
// templating; defaults http and the scheme's default port.
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
