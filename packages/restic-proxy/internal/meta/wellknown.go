package meta

import (
	"encoding/json"
	"io"
	"net/http"
)

const wellKnownUrl = "https://meta.futo.cloud/.well-known/yucca.json"

func GetMetaUrl() (string, error) {
	response, err := http.Get(wellKnownUrl)

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
