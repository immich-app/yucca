package handlers

import (
	"context"
	"net/http"
	"testing"
)

func TestCreateRepository_Success(t *testing.T) {
	store := &mockStorage{
		checkBucketFn:  func(_ context.Context, _ string) (bool, error) { return false, nil },
		createBucketFn: func(_ context.Context, _ string) error { return nil },
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/?create=true", nil, defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateRepository_MissingCreateParam(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/", nil, defaultAuth(), nil)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestCreateRepository_AlreadyExists(t *testing.T) {
	store := &mockStorage{
		checkBucketFn: func(_ context.Context, _ string) (bool, error) { return true, nil },
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/?create=true", nil, defaultAuth(), nil)

	if rec.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", rec.Code)
	}
}

func TestDeleteRepository_NotImplemented(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodDelete, "/"+testRepository+"/", nil, defaultAuth(), nil)

	if rec.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", rec.Code)
	}
}
