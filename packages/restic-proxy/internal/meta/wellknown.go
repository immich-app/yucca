package meta

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func GetMetaUrl(wellKnownUrl string) (string, error) {
	client := http.Client{Timeout: 30 * time.Second}

	response, err := client.Get(wellKnownUrl)
	if err != nil {
		return "", err
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("could not fetch well-known: %s", response.Status)
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
