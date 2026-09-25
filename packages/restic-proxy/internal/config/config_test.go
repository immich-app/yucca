package config

import (
	"os"
	"testing"

	"github.com/rs/zerolog"
)

func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"RESTIC_PROXY_HOST", "RESTIC_PROXY_PORT", "RESTIC_PROXY_WELL_KNOWN", "RESTIC_PROXY_DEFAULT_SESSION_TOKEN", "RESTIC_PROXY_ALLOW_INSECURE_BEHAVIOUR", "LOG_LEVEL", "LOG_FORMAT"} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	clearEnv(t)

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Host != "127.0.0.1" {
		t.Errorf("expected host 127.0.0.1, got %s", cfg.Host)
	}
	if cfg.Port != 1434 {
		t.Errorf("expected port 1434, got %d", cfg.Port)
	}
	if cfg.WellKnown != "https://meta.futo.cloud/.well-known/yucca.json" {
		t.Errorf("expected the production well-known, got %s", cfg.WellKnown)
	}
	if cfg.LogLevel.Level != zerolog.InfoLevel {
		t.Errorf("expected info level, got %s", cfg.LogLevel.Level)
	}
	if !cfg.LogPretty.Pretty {
		t.Error("expected pretty logging by default")
	}
}

func TestLoadConfig_Overrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("RESTIC_PROXY_HOST", "0.0.0.0")
	t.Setenv("RESTIC_PROXY_PORT", "9999")
	t.Setenv("RESTIC_PROXY_WELL_KNOWN", "http://localhost:8080/.well-known/yucca.json")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Host != "0.0.0.0" {
		t.Errorf("expected host 0.0.0.0, got %s", cfg.Host)
	}
	if cfg.Port != 9999 {
		t.Errorf("expected port 9999, got %d", cfg.Port)
	}
	if cfg.WellKnown != "http://localhost:8080/.well-known/yucca.json" {
		t.Errorf("unexpected well-known: %s", cfg.WellKnown)
	}
}

func TestLoadConfig_LogLevel(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  zerolog.Level
	}{
		{name: "trace", value: "trace", want: zerolog.TraceLevel},
		{name: "debug", value: "debug", want: zerolog.DebugLevel},
		{name: "warn", value: "warn", want: zerolog.WarnLevel},
		{name: "error", value: "error", want: zerolog.ErrorLevel},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("LOG_LEVEL", tc.value)

			cfg, err := LoadConfig()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.LogLevel.Level != tc.want {
				t.Errorf("expected %s, got %s", tc.want, cfg.LogLevel.Level)
			}
		})
	}
}

func TestLoadConfig_LogLevelInvalid(t *testing.T) {
	clearEnv(t)
	t.Setenv("LOG_LEVEL", "gibberish")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for an unparseable level")
	}
}

func TestLoadConfig_LogFormat(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "pretty", value: "pretty", want: true},
		{name: "json", value: "json", want: false},
		{name: "anything else is structured", value: "console", want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("LOG_FORMAT", tc.value)

			cfg, err := LoadConfig()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.LogPretty.Pretty != tc.want {
				t.Errorf("expected pretty %v, got %v", tc.want, cfg.LogPretty.Pretty)
			}
		})
	}
}

func TestLoadConfig_PortInvalid(t *testing.T) {
	clearEnv(t)
	t.Setenv("RESTIC_PROXY_PORT", "not-a-port")

	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected an error for a non-numeric port")
	}
}

func TestLoadConfig_DefaultSessionTokenListener(t *testing.T) {
	cases := []struct {
		name     string
		host     string
		insecure string
		wantErr  bool
	}{
		{name: "loopback ipv4", host: "127.0.0.1", wantErr: false},
		{name: "loopback ipv6", host: "::1", wantErr: false},
		{name: "all interfaces", host: "0.0.0.0", wantErr: true},
		{name: "hostname", host: "localhost", wantErr: true},
		{name: "all interfaces allowed insecure", host: "0.0.0.0", insecure: "true", wantErr: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("RESTIC_PROXY_DEFAULT_SESSION_TOKEN", "configured-token")
			t.Setenv("RESTIC_PROXY_HOST", tc.host)

			if tc.insecure != "" {
				t.Setenv("RESTIC_PROXY_ALLOW_INSECURE_BEHAVIOUR", tc.insecure)
			}

			_, err := LoadConfig()
			if tc.wantErr && err == nil {
				t.Fatal("expected an error for a default session token on a non-loopback host")
			}

			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
