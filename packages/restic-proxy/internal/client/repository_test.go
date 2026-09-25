package client

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"restic-proxy/internal/meta"
)

func TestCreateRepository_Success(t *testing.T) {
	var seen request
	var sent string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, r *http.Request) {
		seen.method = r.Method
		seen.path = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		sent = string(body)
		writer.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(writer, `{"repository":{"id":"repo-1","name":"photos","worm":true}}`)
	}))
	t.Cleanup(server.Close)
	client := New(meta.Api{Url: server.URL})

	repository, err := client.CreateRepository(context.Background(), testToken, "photos", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if seen.method != http.MethodPost || seen.path != "/repository" {
		t.Errorf("unexpected request: %s %s", seen.method, seen.path)
	}

	if sent != `{"name":"photos","worm":true}` {
		t.Errorf("unexpected body: %s", sent)
	}

	if repository != (Repository{Id: "repo-1", Name: "photos", Worm: true}) {
		t.Errorf("unexpected repository: %+v", repository)
	}
}

func TestListRepositories_Success(t *testing.T) {
	var seen request
	client := newAPI(t, http.StatusOK, `{"repositories":[{"id":"repo-1","name":"photos","worm":false}]}`, &seen)

	repositories, err := client.ListRepositories(context.Background(), testToken)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if seen.method != http.MethodGet || seen.path != "/repository" || seen.cookie != testToken {
		t.Errorf("unexpected request: %+v", seen)
	}

	if len(repositories) != 1 || repositories[0].Id != "repo-1" {
		t.Errorf("unexpected repositories: %+v", repositories)
	}
}
