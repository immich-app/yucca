package handlers

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"michael/internal/auth"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
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
