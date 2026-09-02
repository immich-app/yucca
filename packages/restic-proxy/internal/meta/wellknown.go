package meta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/rs/zerolog/log"
)

const wellKnownUrl = "https://meta.futo.cloud/.well-known/yucca.json"

func GetMetaUrl() (string, error) {
	response, err := http.Get(wellKnownUrl)
	if err != nil {
		return "", err
	}

	if response.StatusCode != http.StatusOK {
		log.Error().Int("status_code", response.StatusCode).Msg("could not fetch well-known")
		return "", fmt.Errorf("could not fetch well-known")
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}

	var wellKnown struct {
		MetaUrl string `json:"meta_url"`
	}

	if err := json.Unmarshal(body, &wellKnown); err != nil {
		return "", err
	}

	return wellKnown.MetaUrl, nil
}
