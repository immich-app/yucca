package meta

import "restic-proxy/internal/config"

type Api struct {
	Url string
}

func ApiFromConfig(cfg config.Config) (Api, error) {
	if cfg.ApiUrl != "" {
		return Api{Url: cfg.ApiUrl}, nil
	}

	metaUrl, err := MetaUrlFromConfig(cfg)
	if err != nil {
		return Api{}, err
	}

	meta, err := GetMeta(metaUrl)
	if err != nil {
		return Api{}, err
	}

	return Api{Url: meta.ApiUrl}, nil
}
