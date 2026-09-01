package config

import (
	"reflect"

	"github.com/caarlos0/env/v11"
	"github.com/rs/zerolog"
)

type Config struct {
	Host string `env:"RESTIC_PROXY_HOST" envDefault:"127.0.0.1"`
	Port int    `env:"RESTIC_PROXY_PORT" envDefault:"1434"`

	LogLevel  LogLevelNewType  `env:"LOG_LEVEL" envDefault:"debug"`
	LogPretty LogPrettyNewType `env:"LOG_FORMAT" envDefault:"pretty"`
}

type LogLevelNewType struct {
	Level zerolog.Level
}

type LogPrettyNewType struct {
	Pretty bool
}

func LoadConfig() (Config, error) {
	return env.ParseAsWithOptions[Config](env.Options{
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
}
