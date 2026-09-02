package meta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/rs/zerolog/log"
)

type Meta struct {
	ApiUrl string `json:"api_root"`
}

func GetMeta(metaUrl string) (Meta, error) {
	var meta Meta
	response, err := http.Get(metaUrl)
	if err != nil {
		return meta, err
	}

	if response.StatusCode != http.StatusOK {
		log.Error().Int("status_code", response.StatusCode).Msg("could not fetch meta")
		return meta, fmt.Errorf("could not fetch meta")
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return meta, err
	}

	if err := json.Unmarshal(body, &meta); err != nil {
		return meta, err
	}

	return meta, nil
}
