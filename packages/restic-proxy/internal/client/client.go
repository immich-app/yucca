package client

import (
	"bytes"
	"context"
	"encoding/json/v2"
	"io"
	"net/http"
	"time"

	"restic-proxy/internal/meta"
)

type Client struct {
	api  meta.Api
	http *http.Client
}

func New(api meta.Api) Client {
	return Client{
		api: api,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (client *Client) send(ctx context.Context, method string, path string, token string, payload any, expected int, result any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}

		body = bytes.NewReader(encoded)
	}

	request, err := http.NewRequestWithContext(ctx, method, client.api.Url+path, body)
	if err != nil {
		return err
	}

	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}

	request.AddCookie(&http.Cookie{Name: AccessTokenCookie, Value: token})

	response, err := client.http.Do(request)
	if err != nil {
		return err
	}

	defer response.Body.Close()

	if response.StatusCode != expected {
		return &StatusError{Code: response.StatusCode, Status: response.Status}
	}

	decoded, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	return json.Unmarshal(decoded, result)
}
