package main

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// mockStorage implements the Storage interface for testing.
type mockStorage struct {
	checkBucketFn  func(ctx context.Context, bucket string) (bool, error)
	createBucketFn func(ctx context.Context, bucket string) error
	headObjectFn   func(ctx context.Context, bucket, key string) (int64, error)
	getObjectFn    func(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error)
	putObjectFn    func(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error
	listObjectsFn  func(ctx context.Context, bucket, prefix string) ([]BlobInfo, error)
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

func (m *mockStorage) GetObject(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error) {
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

func (m *mockStorage) ListObjects(ctx context.Context, bucket, prefix string) ([]BlobInfo, error) {
	if m.listObjectsFn != nil {
		return m.listObjectsFn(ctx, bucket, prefix)
	}
	return []BlobInfo{}, nil
}

func (m *mockStorage) DeleteObject(ctx context.Context, bucket, key string) error {
	if m.deleteObjectFn != nil {
		return m.deleteObjectFn(ctx, bucket, key)
	}
	return nil
}

// newTestServer creates a Server with mock storage and returns the chi handler.
func newTestServer(store *mockStorage) *Server {
	return &Server{
		storage:   store,
		jwtSecret: testSecret,
		metrics:   nil,
	}
}

// doRequest creates and executes a request against the test server with a real JWT auth header.
func doRequest(t *testing.T, srv *Server, method, path string, body io.Reader, auth Auth, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)

	// Generate a real JWT for the auth middleware
	token := makeJWT(t, jwt.MapClaims{
		"user":       auth.User,
		"repository": auth.Repository,
		"writeOnce":  auth.WriteOnce,
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

func defaultAuth() Auth {
	return Auth{
		User:       testUser,
		Repository: testRepository,
		WriteOnce:  false,
	}
}

func wormAuth() Auth {
	return Auth{
		User:       testUser,
		Repository: testRepository,
		WriteOnce:  true,
	}
}
