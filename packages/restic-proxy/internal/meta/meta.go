package meta

import (
	"encoding/json"
	"io"
	"net/http"
)

type Meta struct {
	ApiUrl string `json:"api_root"`
}

func GetMeta(metaUrl string) (Meta, error) {
	var meta Meta
	response, err := http.Get(metaUrl)

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return meta, err
	}

	if err := json.Unmarshal(body, &meta); err != nil {
		return meta, err
	}

	return meta, nil
}
