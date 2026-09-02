package meta

import (
	"net/http"
	"strings"
	"testing"
)

func TestGetMetaUrl_Success(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{"meta_url":"https://meta.example/api/meta"}`)

	metaUrl, err := GetMetaUrl(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if metaUrl != "https://meta.example/api/meta" {
		t.Errorf("expected meta url https://meta.example/api/meta, got %s", metaUrl)
	}
}

func TestGetMetaUrl_IgnoresUnknownFields(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{"meta_url":"https://meta.example/api/meta","issuer":"https://id.example"}`)

	metaUrl, err := GetMetaUrl(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if metaUrl != "https://meta.example/api/meta" {
		t.Errorf("expected meta url https://meta.example/api/meta, got %s", metaUrl)
	}
}

func TestGetMetaUrl_NonOK(t *testing.T) {
	cases := []struct {
		name   string
		status int
	}{
		{name: "not found", status: http.StatusNotFound},
		{name: "server error", status: http.StatusInternalServerError},
		{name: "bad gateway", status: http.StatusBadGateway},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := newMetaServer(t, tc.status, `{"meta_url":"https://meta.example/api/meta"}`)

			_, err := GetMetaUrl(server.URL)
			if err == nil {
				t.Fatalf("expected an error for status %d", tc.status)
			}
			if !strings.Contains(err.Error(), http.StatusText(tc.status)) {
				t.Errorf("expected the status in the error, got %v", err)
			}
		})
	}
}

func TestGetMetaUrl_MalformedBody(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `<html>not json</html>`)

	if _, err := GetMetaUrl(server.URL); err == nil {
		t.Fatal("expected an error for an unparseable body")
	}
}

func TestGetMetaUrl_Unreachable(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{}`)
	url := server.URL
	server.Close()

	if _, err := GetMetaUrl(url); err == nil {
		t.Fatal("expected an error when the well-known host refuses the connection")
	}
}

func TestGetMetaUrl_ResolvesIntoGetMeta(t *testing.T) {
	meta := newMetaServer(t, http.StatusOK, `{"api_root":"https://backups.example/api"}`)
	wellKnown := newMetaServer(t, http.StatusOK, `{"meta_url":"`+meta.URL+`"}`)

	metaUrl, err := GetMetaUrl(wellKnown.URL)
	if err != nil {
		t.Fatalf("resolve well-known: %v", err)
	}

	resolved, err := GetMeta(metaUrl)
	if err != nil {
		t.Fatalf("resolve meta: %v", err)
	}
	if resolved.ApiUrl != "https://backups.example/api" {
		t.Errorf("expected api root https://backups.example/api, got %s", resolved.ApiUrl)
	}
}

func TestGetMetaUrl_TruncatedBody(t *testing.T) {
	server := newTruncatedServer(t)

	if _, err := GetMetaUrl(server.URL); err == nil {
		t.Fatal("expected an error when the body is cut short")
	}
}
