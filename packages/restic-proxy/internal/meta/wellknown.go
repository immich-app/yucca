package meta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"restic-proxy/internal/config"
	"time"
)

type WellKnown struct {
	MetaUrl string `json:"meta_url"`
}

func GetWellKnown(wellKnownUrl string) (WellKnown, error) {
	client := http.Client{Timeout: 30 * time.Second}

	response, err := client.Get(wellKnownUrl)
	if err != nil {
		return WellKnown{}, err
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return WellKnown{}, fmt.Errorf("could not fetch well-known: %s", response.Status)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return WellKnown{}, err
	}

	wellKnown := WellKnown{}
	if err := json.Unmarshal(body, &wellKnown); err != nil {
		return wellKnown, err
	}

	return wellKnown, nil
}

func WellKnownFromConfig(cfg config.Config) (WellKnown, error) {
	return GetWellKnown(cfg.WellKnown)
}
