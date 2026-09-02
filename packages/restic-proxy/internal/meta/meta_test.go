package meta

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newMetaServer(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(status)
		fmt.Fprint(writer, body)
	}))
	t.Cleanup(server.Close)
	return server
}

func TestGetMeta_Success(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{"api_root":"https://backups.example/api"}`)

	meta, err := GetMeta(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if meta.ApiUrl != "https://backups.example/api" {
		t.Errorf("expected api root https://backups.example/api, got %s", meta.ApiUrl)
	}
}

func TestGetMeta_IgnoresUnknownFields(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{"api_root":"https://backups.example/api","sites":[{"code":"fsn"}]}`)

	meta, err := GetMeta(server.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if meta.ApiUrl != "https://backups.example/api" {
		t.Errorf("expected api root https://backups.example/api, got %s", meta.ApiUrl)
	}
}

func TestGetMeta_NonOK(t *testing.T) {
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
			server := newMetaServer(t, tc.status, `{"api_root":"https://backups.example/api"}`)

			_, err := GetMeta(server.URL)
			if err == nil {
				t.Fatalf("expected an error for status %d", tc.status)
			}
			if !strings.Contains(err.Error(), http.StatusText(tc.status)) {
				t.Errorf("expected the status in the error, got %v", err)
			}
		})
	}
}

func TestGetMeta_MalformedBody(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `<html>not json</html>`)

	if _, err := GetMeta(server.URL); err == nil {
		t.Fatal("expected an error for an unparseable body")
	}
}

func TestGetMeta_Unreachable(t *testing.T) {
	server := newMetaServer(t, http.StatusOK, `{}`)
	url := server.URL
	server.Close()

	if _, err := GetMeta(url); err == nil {
		t.Fatal("expected an error when the meta host refuses the connection")
	}
}

// newTruncatedServer promises more bytes than it delivers, then drops the
// connection, so the read fails after the status check has passed.
func newTruncatedServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Length", "1000")
		writer.WriteHeader(http.StatusOK)
		fmt.Fprint(writer, "short")
		writer.(http.Flusher).Flush()
		panic(http.ErrAbortHandler)
	}))
	t.Cleanup(server.Close)
	return server
}

func TestGetMeta_TruncatedBody(t *testing.T) {
	server := newTruncatedServer(t)

	if _, err := GetMeta(server.URL); err == nil {
		t.Fatal("expected an error when the body is cut short")
	}
}

func newCountingServer(t *testing.T, hits *int, body func() string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		*hits++
		fmt.Fprint(writer, body())
	}))
	t.Cleanup(server.Close)
	return server
}
