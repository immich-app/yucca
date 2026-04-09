package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"michael/internal/auth"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var testSecret = []byte("cca13c34b450a77c1d4b9ecd25dff6aebc6d7417afdb31864f5943c59abd03a1")

const (
	testUser       = "00000000-0000-0000-0000-000000000001"
	testRepository = "00000000-0000-0000-0000-000000000002"
)

func makeJWT(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(testSecret)
	if err != nil {
		t.Fatalf("failed to sign JWT: %v", err)
	}
	return signed
}

func makeBasicAuth(token string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("restic:"+token))
}

// mockStorage implements the storage.Storage interface for testing.
type mockStorage struct {
	checkBucketFn  func(ctx context.Context, bucket string) (bool, error)
	createBucketFn func(ctx context.Context, bucket string) error
	headObjectFn   func(ctx context.Context, bucket, key string) (int64, error)
	getObjectFn    func(ctx context.Context, bucket, key, rangeHeader string) (*storage.S3Object, error)
	putObjectFn    func(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error
	listObjectsFn  func(ctx context.Context, bucket, prefix string) ([]storage.BlobInfo, error)
	deleteObjectFn func(ctx context.Context, bucket, key string) error
}

func (m *mockStorage) CheckBucket(ctx context.Context, bucket string) (bool, error) {
	if m.checkBucketFn != nil {
		return m.checkBucketFn(ctx, bucket)
	}
	return false, nil
}

func (m *mockStorage) CreateBucket(ctx context.Context, bucket string) error {
	if m.createBucketFn != nil {
		return m.createBucketFn(ctx, bucket)
	}
	return nil
}

func (m *mockStorage) HeadObject(ctx context.Context, bucket, key string) (int64, error) {
	if m.headObjectFn != nil {
		return m.headObjectFn(ctx, bucket, key)
	}
	return 0, errors.New("not found")
}

func (m *mockStorage) GetObject(ctx context.Context, bucket, key, rangeHeader string) (*storage.S3Object, error) {
	if m.getObjectFn != nil {
		return m.getObjectFn(ctx, bucket, key, rangeHeader)
	}
	return nil, errors.New("not found")
}

func (m *mockStorage) PutObject(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error {
	if m.putObjectFn != nil {
		return m.putObjectFn(ctx, bucket, key, body, contentLength, writeOnce, sha256Hex)
	}
	return nil
}

func (m *mockStorage) ListObjects(ctx context.Context, bucket, prefix string) ([]storage.BlobInfo, error) {
	if m.listObjectsFn != nil {
		return m.listObjectsFn(ctx, bucket, prefix)
	}
	return []storage.BlobInfo{}, nil
}

func (m *mockStorage) DeleteObject(ctx context.Context, bucket, key string) error {
	if m.deleteObjectFn != nil {
		return m.deleteObjectFn(ctx, bucket, key)
	}
	return nil
}

// newTestServer creates a Server with mock storage and returns it.
func newTestServer(store *mockStorage) *Server {
	return &Server{
		Storage:   store,
		JWTSecret: testSecret,
		Metrics:   nil,
	}
}

// doRequest creates and executes a request against the test server with a real JWT auth header.
func doRequest(t *testing.T, srv *Server, method, path string, body io.Reader, a auth.Auth, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)

	// Generate a real JWT for the auth middleware
	token := makeJWT(t, jwt.MapClaims{
		"user":       a.User,
		"repository": a.Repository,
		"writeOnce":  a.WriteOnce,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})
	req.Header.Set("Authorization", makeBasicAuth(token))

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func defaultAuth() auth.Auth {
	return auth.Auth{
		User:       testUser,
		Repository: testRepository,
		WriteOnce:  false,
	}
}

func wormAuth() auth.Auth {
	return auth.Auth{
		User:       testUser,
		Repository: testRepository,
		WriteOnce:  true,
	}
}

// parseLogLines parses JSON log output into a slice of maps.
func parseLogLines(t *testing.T, buf *bytes.Buffer) []map[string]interface{} {
	t.Helper()
	var entries []map[string]interface{}
	for _, line := range bytes.Split(bytes.TrimSpace(buf.Bytes()), []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		var entry map[string]interface{}
		if err := json.Unmarshal(line, &entry); err != nil {
			t.Fatalf("log line is not valid JSON: %s", line)
		}
		entries = append(entries, entry)
	}
	return entries
}

// findLog returns the first log entry matching all given field values.
func findLog(entries []map[string]interface{}, match map[string]interface{}) map[string]interface{} {
	for _, e := range entries {
		hit := true
		for k, v := range match {
			if e[k] != v {
				hit = false
				break
			}
		}
		if hit {
			return e
		}
	}
	return nil
}

// captureLogOutput replaces the global logger with one writing to buf, and restores it on cleanup.
func captureLogOutput(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	orig := log.Logger
	log.Logger = zerolog.New(&buf).With().Timestamp().Logger()
	t.Cleanup(func() { log.Logger = orig })
	return &buf
}

func TestAccessLogOutput(t *testing.T) {
	buf := captureLogOutput(t)

	store := &mockStorage{
		listObjectsFn: func(_ context.Context, _, _ string) ([]storage.BlobInfo, error) {
			return []storage.BlobInfo{{Name: "abc", Size: 42}}, nil
		},
	}
	srv := newTestServer(store)

	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data", nil, defaultAuth(), map[string]string{
		"Accept": ContentTypeResticV2,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	entries := parseLogLines(t, buf)
	accessLog := findLog(entries, map[string]interface{}{"status": float64(http.StatusOK)})
	if accessLog == nil {
		t.Fatalf("no access log entry found in output:\n%s", buf.String())
	}

	for _, field := range []string{"level", "status", "size", "duration", "method", "path", "time", "request_id", "remote_ip"} {
		if _, ok := accessLog[field]; !ok {
			t.Errorf("access log missing field %q, got: %v", field, accessLog)
		}
	}

	if accessLog["level"] != "info" {
		t.Errorf("expected level=info, got %v", accessLog["level"])
	}
	if accessLog["method"] != "GET" {
		t.Errorf("expected method=GET, got %v", accessLog["method"])
	}
}

func TestErrorLogOutput(t *testing.T) {
	buf := captureLogOutput(t)

	store := &mockStorage{
		listObjectsFn: func(_ context.Context, _, _ string) ([]storage.BlobInfo, error) {
			return nil, errors.New("s3 connection refused")
		},
	}
	srv := newTestServer(store)

	rec := doRequest(t, srv, http.MethodGet, "/"+testRepository+"/data", nil, defaultAuth(), map[string]string{
		"Accept": ContentTypeResticV2,
	})
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}

	entries := parseLogLines(t, buf)

	// Should have an error-level log with the error message and request context
	errLog := findLog(entries, map[string]interface{}{"level": "error"})
	if errLog == nil {
		t.Fatalf("no error log entry found in output:\n%s", buf.String())
	}

	for _, field := range []string{"error", "time", "request_id", "remote_ip", "user", "repository", "method", "route"} {
		if _, ok := errLog[field]; !ok {
			t.Errorf("error log missing field %q, got: %v", field, errLog)
		}
	}

	if errLog["error"] != "s3 connection refused" {
		t.Errorf("expected error='s3 connection refused', got %v", errLog["error"])
	}
	if errLog["message"] != "list blobs failed" {
		t.Errorf("expected message='list blobs failed', got %v", errLog["message"])
	}

	// Should also have an access log for this failed request
	accessLog := findLog(entries, map[string]interface{}{"status": float64(http.StatusInternalServerError)})
	if accessLog == nil {
		t.Fatalf("no access log entry for the 500 response:\n%s", buf.String())
	}
}

func TestAuthFailureLogOutput(t *testing.T) {
	buf := captureLogOutput(t)

	srv := newTestServer(&mockStorage{})

	// Send a request with no auth header
	req := httptest.NewRequest(http.MethodGet, "/"+testRepository+"/data", nil)
	req.Header.Set("Accept", ContentTypeResticV2)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	entries := parseLogLines(t, buf)

	// Should still get an access log even for auth failures
	accessLog := findLog(entries, map[string]interface{}{"status": float64(http.StatusUnauthorized)})
	if accessLog == nil {
		t.Fatalf("no access log entry for 401 response:\n%s", buf.String())
	}

	if accessLog["level"] != "info" {
		t.Errorf("expected level=info, got %v", accessLog["level"])
	}
}
