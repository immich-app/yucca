package config

import (
	"errors"
	"net"
	"reflect"

	"github.com/caarlos0/env/v11"
	"github.com/rs/zerolog"
)

type Config struct {
	Host      string `env:"RESTIC_PROXY_HOST" envDefault:"127.0.0.1"`
	Port      int    `env:"RESTIC_PROXY_PORT" envDefault:"1434"`
	WellKnown string `env:"RESTIC_PROXY_WELL_KNOWN" envDefault:"https://meta.futo.cloud/.well-known/yucca.json"`
	MetaUrl   string `env:"RESTIC_PROXY_META_URL"`
	ApiUrl    string `env:"RESTIC_PROXY_API_URL"`
	ReadyFd   int    `env:"RESTIC_PROXY_READY_FD"`

	ThrottleBytesPerSec int    `env:"RESTIC_PROXY_THROTTLE_BYTES_PER_SEC" envDefault:"0"`
	ThrottleQuietHours  string `env:"RESTIC_PROXY_THROTTLE_QUIET_HOURS"`

	SessionToken           string `env:"RESTIC_PROXY_DEFAULT_SESSION_TOKEN"`
	AllowInsecureBehaviour bool   `env:"RESTIC_PROXY_ALLOW_INSECURE_BEHAVIOUR" envDefault:"false"`

	SmartAutoRepository bool `env:"RESTIC_PROXY_SMART_AUTO_REPOSITORY" envDefault:"false"`

	LogLevel  LogLevelNewType  `env:"LOG_LEVEL" envDefault:"info"`
	LogPretty LogPrettyNewType `env:"LOG_FORMAT" envDefault:"pretty"`
}

type LogLevelNewType struct {
	Level zerolog.Level
}

type LogPrettyNewType struct {
	Pretty bool
}

func LoadConfig() (Config, error) {
	cfg, err := env.ParseAsWithOptions[Config](env.Options{
		FuncMap: map[reflect.Type]env.ParserFunc{
			reflect.TypeOf(LogLevelNewType{}): func(v string) (any, error) {
				parsed, err := zerolog.ParseLevel(v)
				if err != nil {
					return nil, err
				}

				return LogLevelNewType{Level: parsed}, nil
			},
			reflect.TypeOf(LogPrettyNewType{}): func(v string) (any, error) {
				return LogPrettyNewType{Pretty: v == "pretty"}, nil
			},
		},
	})

	if err != nil {
		return Config{}, err
	}

	host := net.ParseIP(cfg.Host)
	if cfg.SessionToken != "" && (host == nil || !host.IsLoopback()) && !cfg.AllowInsecureBehaviour {
		return Config{}, errors.New("RESTIC_PROXY_DEFAULT_SESSION_TOKEN requires a loopback RESTIC_PROXY_HOST or RESTIC_PROXY_ALLOW_INSECURE_BEHAVIOUR=true")
	}

	return cfg, nil
}
