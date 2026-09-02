package client

import (
	"net/http"
	"time"

	"restic-proxy/internal/meta"
)

type Client struct {
	meta meta.Meta
	http *http.Client
}

func New(meta meta.Meta) Client {
	return Client{
		meta: meta,
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}
