package client

import (
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
