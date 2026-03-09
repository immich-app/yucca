package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"michael/internal/storage"
)

var testBlobName = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

func TestCheckBlob_Found(t *testing.T) {
	store := &mockStorage{
		headObjectFn: func(_ context.Context, _, key string) (int64, error) {
			return 512, nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/data/"+testBlobName, nil, defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if cl := rec.Header().Get("Content-Length"); cl != "512" {
		t.Errorf("expected Content-Length 512, got %s", cl)
	}
}

func TestCheckBlob_NotFound(t *testing.T) {
	store := &mockStorage{
		headObjectFn: func(_ context.Context, _, _ string) (int64, error) {
			return 0, errors.New("not found")
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/data/"+testBlobName, nil, defaultAuth(), nil)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}

func TestCheckBlob_InvalidName(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodHead, "/"+testRepository+"/data/not-a-hash", nil, defaultAuth(), nil)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestGetBlob_Success(t *testing.T) {
	store := &mockStorage{
		getObjectFn: func(_ context.Context, _, _, _ string) (*storage.S3Object, error) {
			return &storage.S3Object{
				Body:          io.NopCloser(bytes.NewReader([]byte("blob-content"))),
				ContentLength: 12,
				ContentType:   "application/octet-stream",
			}, nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data/"+testBlobName, nil, defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != "blob-content" {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}

func TestGetBlob_RangeRequest(t *testing.T) {
	store := &mockStorage{
		getObjectFn: func(_ context.Context, _, _, rangeH string) (*storage.S3Object, error) {
			return &storage.S3Object{
				Body:          io.NopCloser(bytes.NewReader([]byte("partial"))),
				ContentLength: 7,
				ContentRange:  "bytes 0-6/12",
				ContentType:   "application/octet-stream",
			}, nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data/"+testBlobName, nil, defaultAuth(), map[string]string{
		"Range": "bytes=0-6",
	})

	if rec.Code != http.StatusPartialContent {
		t.Errorf("expected 206, got %d", rec.Code)
	}
	if cr := rec.Header().Get("Content-Range"); cr != "bytes 0-6/12" {
		t.Errorf("expected Content-Range 'bytes 0-6/12', got %s", cr)
	}
}

func TestSaveBlob_Success(t *testing.T) {
	var capturedKey string
	var capturedSHA string
	var capturedWriteOnce bool
	store := &mockStorage{
		putObjectFn: func(_ context.Context, _, key string, _ io.Reader, _ int64, writeOnce bool, sha256Hex string) error {
			capturedKey = key
			capturedSHA = sha256Hex
			capturedWriteOnce = writeOnce
			return nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/data/"+testBlobName, strings.NewReader("blob-data"), defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if capturedKey != "data/"+testBlobName {
		t.Errorf("unexpected key: %s", capturedKey)
	}
	if capturedSHA != testBlobName {
		t.Errorf("expected sha256 to be blob name, got %s", capturedSHA)
	}
	if !capturedWriteOnce {
		t.Error("expected writeOnce to be true for blob saves")
	}
}

func TestSaveBlob_InvalidName(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/data/invalid-name", strings.NewReader("data"), defaultAuth(), nil)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestSaveBlob_WORMConflict(t *testing.T) {
	store := &mockStorage{
		putObjectFn: func(_ context.Context, _, _ string, _ io.Reader, _ int64, _ bool, _ string) error {
			return storage.ErrPreconditionFailed
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/data/"+testBlobName, strings.NewReader("data"), defaultAuth(), nil)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSaveBlob_ChecksumMismatch(t *testing.T) {
	store := &mockStorage{
		putObjectFn: func(_ context.Context, _, _ string, _ io.Reader, _ int64, _ bool, _ string) error {
			return storage.ErrChecksumMismatch
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodPost, "/"+testRepository+"/data/"+testBlobName, strings.NewReader("data"), defaultAuth(), nil)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

// --- List Blobs ---

func TestListBlobs_Success(t *testing.T) {
	store := &mockStorage{
		listObjectsFn: func(_ context.Context, _, _ string) ([]storage.BlobInfo, error) {
			return []storage.BlobInfo{
				{Name: "abc123", Size: 1024},
				{Name: "def456", Size: 2048},
			}, nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data", nil, defaultAuth(), map[string]string{
		"Accept": ContentTypeResticV2,
	})

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != ContentTypeResticV2 {
		t.Errorf("expected content-type %s, got %s", ContentTypeResticV2, ct)
	}

	var blobs []storage.BlobInfo
	if err := json.NewDecoder(rec.Body).Decode(&blobs); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(blobs) != 2 {
		t.Errorf("expected 2 blobs, got %d", len(blobs))
	}
}

func TestListBlobs_MissingAcceptHeader(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data", nil, defaultAuth(), nil)

	if rec.Code != http.StatusNotImplemented {
		t.Errorf("expected 501, got %d", rec.Code)
	}
}

func TestListBlobs_InvalidType(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/invalid", nil, defaultAuth(), map[string]string{
		"Accept": ContentTypeResticV2,
	})

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestListBlobs_EmptyResult(t *testing.T) {
	store := &mockStorage{
		listObjectsFn: func(_ context.Context, _, _ string) ([]storage.BlobInfo, error) {
			return []storage.BlobInfo{}, nil
		},
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data", nil, defaultAuth(), map[string]string{
		"Accept": ContentTypeResticV2,
	})

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var blobs []storage.BlobInfo
	if err := json.NewDecoder(rec.Body).Decode(&blobs); err != nil {
		t.Fatalf("failed to decode blob list: %v", err)
	}
	if len(blobs) != 0 {
		t.Errorf("expected empty array, got %d blobs", len(blobs))
	}
}

// --- Delete Blob ---

func TestDeleteBlob_Success(t *testing.T) {
	store := &mockStorage{
		headObjectFn:   func(_ context.Context, _, _ string) (int64, error) { return 100, nil },
		deleteObjectFn: func(_ context.Context, _, _ string) error { return nil },
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodDelete, "/"+testRepository+"/data/"+testBlobName, nil, defaultAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteBlob_WORMForbidden(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodDelete, "/"+testRepository+"/data/"+testBlobName, nil, wormAuth(), nil)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}
}

func TestDeleteBlob_LocksExemptFromWORM(t *testing.T) {
	store := &mockStorage{
		headObjectFn:   func(_ context.Context, _, _ string) (int64, error) { return 100, nil },
		deleteObjectFn: func(_ context.Context, _, _ string) error { return nil },
	}
	srv := newTestServer(store)
	rec := doRequest(t, srv, http.MethodDelete, "/"+testRepository+"/locks/"+testBlobName, nil, wormAuth(), nil)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 (locks exempt from WORM), got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeleteBlob_InvalidType(t *testing.T) {
	srv := newTestServer(&mockStorage{})
	rec := doRequest(t, srv, http.MethodDelete, "/"+testRepository+"/invalid/"+testBlobName, nil, defaultAuth(), nil)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}
