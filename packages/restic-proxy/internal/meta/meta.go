package meta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Meta struct {
	ApiUrl string `json:"api_root"`
}

func GetMeta(metaUrl string) (Meta, error) {
	client := http.Client{Timeout: 30 * time.Second}

	var meta Meta
	response, err := client.Get(metaUrl)
	if err != nil {
		return meta, err
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return meta, fmt.Errorf("could not fetch meta: %s", response.Status)
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
