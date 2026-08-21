package storage

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"michael/internal/config"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// readOnly hides any io.Seeker the underlying reader implements, so the value
// handed to the S3 SDK is a plain, non-seekable stream — exactly what michael
// proxies in production (restic's r.Body, further wrapped in an io.TeeReader
// for hashing). The SDK cannot rewind it to retry.
type readOnly struct{ r io.Reader }

func (ro readOnly) Read(p []byte) (int, error) { return ro.r.Read(p) }

func TestIsPreconditionFailed_NilError(t *testing.T) {
	if isPreconditionFailed(nil) {
		t.Error("expected false for nil error")
	}
}

func TestIsPreconditionFailed_GenericError(t *testing.T) {
	err := &genericError{msg: "some error"}
	if isPreconditionFailed(err) {
		t.Error("expected false for generic error")
	}
}

func TestIsPreconditionFailed_412Error(t *testing.T) {
	err := &httpError{statusCode: 412}
	if !isPreconditionFailed(err) {
		t.Error("expected true for 412 error")
	}
}

func TestIsPreconditionFailed_404Error(t *testing.T) {
	err := &httpError{statusCode: 404}
	if isPreconditionFailed(err) {
		t.Error("expected false for 404 error")
	}
}

func TestIsBackendFailure(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"404 not found", &httpError{statusCode: 404}, false},
		{"403 denied", &httpError{statusCode: 403}, false},
		{"409 conflict", &httpError{statusCode: 409}, false},
		{"412 precondition", &httpError{statusCode: 412}, false},
		{"500 server error", &httpError{statusCode: 500}, true},
		{"503 unavailable", &httpError{statusCode: 503}, true},
		{"transport error (no status)", &genericError{msg: "dial tcp: connection refused"}, true},
		{"wrapped transport error", errors.New("wrapped: unexpected EOF"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isBackendFailure(tc.err); got != tc.want {
				t.Errorf("isBackendFailure(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsNotFound(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"generic error", &genericError{msg: "boom"}, false},
		{"404", &httpError{statusCode: 404}, true},
		{"403", &httpError{statusCode: 403}, false},
		{"500", &httpError{statusCode: 500}, false},
		{"types.NotFound", &types.NotFound{}, true},
		{"types.NoSuchKey", &types.NoSuchKey{}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsNotFound(tc.err); got != tc.want {
				t.Errorf("IsNotFound(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestListObjects_PaginatesAllPages(t *testing.T) {
	// Restic's REST listing has no pagination, so ListObjects must walk every
	// ListObjectsV2 page — a repo past 1000 keys otherwise gets silently
	// truncated and restic reports the tail packs as missing.
	var tokens []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("continuation-token")
		tokens = append(tokens, token)
		w.Header().Set("Content-Type", "application/xml")
		if token == "" {
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name><Prefix>data/</Prefix><KeyCount>2</KeyCount><MaxKeys>2</MaxKeys>
  <IsTruncated>true</IsTruncated><NextContinuationToken>tok-2</NextContinuationToken>
  <Contents><Key>data/aa</Key><Size>1</Size></Contents>
  <Contents><Key>data/bb</Key><Size>2</Size></Contents>
</ListBucketResult>`))
			return
		}
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name><Prefix>data/</Prefix><KeyCount>1</KeyCount><MaxKeys>2</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>data/cc</Key><Size>3</Size></Contents>
</ListBucketResult>`))
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	var blobs []BlobInfo
	err := s.ListObjects(context.Background(), "bucket", "data/", func(b BlobInfo) error {
		blobs = append(blobs, b)
		return nil
	})
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}

	// Names are full keys; prefix-stripping is the caller's job.
	want := []BlobInfo{{Name: "data/aa", Size: 1}, {Name: "data/bb", Size: 2}, {Name: "data/cc", Size: 3}}
	if len(blobs) != len(want) {
		t.Fatalf("got %d blobs (%v), want %d", len(blobs), blobs, len(want))
	}
	for i, b := range blobs {
		if b != want[i] {
			t.Errorf("blob[%d] = %+v, want %+v", i, b, want[i])
		}
	}
	if len(tokens) != 2 || tokens[0] != "" || tokens[1] != "tok-2" {
		t.Errorf("continuation tokens sent = %q, want [\"\" \"tok-2\"]", tokens)
	}
}

func TestListObjects_EmptyListing(t *testing.T) {
	// An empty listing completes without invoking the callback.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name><Prefix>data/</Prefix><KeyCount>0</KeyCount><MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
</ListBucketResult>`))
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	calls := 0
	err := s.ListObjects(context.Background(), "bucket", "data/", func(BlobInfo) error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if calls != 0 {
		t.Fatalf("expected no callbacks for empty listing, got %d", calls)
	}
}

// TestPutObject_NonSeekableBodyOn503_NoRewindRetry reproduces the production
// throughput collapse: michael streams restic's non-seekable pack body straight
// into S3 PutObject, and when the gateway returns a retryable 5xx the SDK's
// default retryer tries to rewind the body to resend it — which fails with
// "failed to rewind transport stream for retry, request stream is not seekable"
// and surfaces as an opaque 500 to restic. Under load this hit ~28% of requests
// and stalled the whole fleet.
//
// The desired behaviour (asserted here) is: no rewind is ever attempted, exactly
// one upload is made, and the caller gets the clean underlying backend error —
// which restic retries at the pack level (its own body IS seekable). RED before
// the s3.go RetryMaxAttempts=1 fix, GREEN after.
func TestPutObject_NonSeekableBodyOn503_NoRewindRetry(t *testing.T) {
	var puts atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			puts.Add(1)
			_, _ = io.Copy(io.Discard, r.Body) // let the client finish sending
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	body := readOnly{strings.NewReader("restic-pack-bytes")}
	err := s.PutObject(context.Background(), "bucket", "data/deadbeef", body, int64(len("restic-pack-bytes")), true, "")

	if err == nil {
		t.Fatal("expected an error from the 503 gateway, got nil")
	}
	// The bug: a retry on the non-seekable body fails to rewind and masks the
	// real backend error.
	if msg := err.Error(); strings.Contains(msg, "rewind") || strings.Contains(msg, "not seekable") {
		t.Fatalf("PutObject attempted a rewind-for-retry on a non-seekable body: %v", err)
	}
	// And with retries off, the gateway must see exactly one upload attempt.
	if n := puts.Load(); n != 1 {
		t.Fatalf("expected exactly 1 upload attempt (no retry on a non-seekable body), got %d", n)
	}
}

// worm412Server simulates a WORM gateway mid restic-Save-recovery: every PUT
// hits the If-None-Match precondition (the ambiguously-failed upload actually
// committed), and HEAD reports the committed object's size.
func worm412Server(headStatus int, headSize int64, puts, heads *atomic.Int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			puts.Add(1)
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusPreconditionFailed)
		case http.MethodHead:
			heads.Add(1)
			if headStatus != http.StatusOK {
				w.WriteHeader(headStatus)
				return
			}
			w.Header().Set("Content-Length", strconv.FormatInt(headSize, 10))
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
}

const testBlobName = "0000000000000000000000000000000000000000000000000000000000000000"

func TestPutObject_PreconditionWithMatchingBlob_ConvergesToSuccess(t *testing.T) {
	body := "restic-pack-bytes"
	var puts, heads atomic.Int32
	srv := worm412Server(http.StatusOK, int64(len(body)), &puts, &heads)
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	err := s.PutObject(context.Background(), "bucket", "data/"+testBlobName, readOnly{strings.NewReader(body)}, int64(len(body)), true, testBlobName)
	if err != nil {
		t.Fatalf("expected converged success for matching existing blob, got %v", err)
	}
	if heads.Load() != 1 {
		t.Errorf("expected 1 HEAD to verify the existing blob, got %d", heads.Load())
	}
}

func TestPutObject_PreconditionWithDifferentSize_Fails(t *testing.T) {
	body := "restic-pack-bytes"
	var puts, heads atomic.Int32
	srv := worm412Server(http.StatusOK, 999, &puts, &heads)
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	err := s.PutObject(context.Background(), "bucket", "data/"+testBlobName, readOnly{strings.NewReader(body)}, int64(len(body)), true, testBlobName)
	if !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("expected ErrPreconditionFailed for size mismatch, got %v", err)
	}
}

func TestPutObject_PreconditionHeadError_Fails(t *testing.T) {
	body := "restic-pack-bytes"
	var puts, heads atomic.Int32
	srv := worm412Server(http.StatusInternalServerError, 0, &puts, &heads)
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	err := s.PutObject(context.Background(), "bucket", "data/"+testBlobName, readOnly{strings.NewReader(body)}, int64(len(body)), true, testBlobName)
	if !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("expected ErrPreconditionFailed when verification HEAD fails, got %v", err)
	}
}

func TestPutObject_PreconditionWithoutContentHash_Fails(t *testing.T) {
	// The config object's key is not a content hash, so a size match proves
	// nothing and the 412 must surface.
	body := "repo-config"
	var puts, heads atomic.Int32
	srv := worm412Server(http.StatusOK, int64(len(body)), &puts, &heads)
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	err := s.PutObject(context.Background(), "bucket", "config", readOnly{strings.NewReader(body)}, int64(len(body)), true, "")
	if !errors.Is(err, ErrPreconditionFailed) {
		t.Fatalf("expected ErrPreconditionFailed for non-content-addressed key, got %v", err)
	}
	if heads.Load() != 0 {
		t.Errorf("expected no verification HEAD for non-content-addressed key, got %d", heads.Load())
	}
}

func probeConfig() config.Config {
	return config.Config{
		S3AccessKeyID:     "test",
		S3SecretAccessKey: "test",
		S3Region:          "us-east-1",
		S3ForcePathStyle:  true,
	}
}

func TestProbe_HealthyOn404(t *testing.T) {
	// A gateway that answers HeadBucket with 404 is alive: probe must succeed.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	if err := s.Probe(context.Background(), "probe-bucket"); err != nil {
		t.Errorf("Probe against 404 gateway: expected healthy, got %v", err)
	}
}

func TestProbe_HealthyOn200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	if err := s.Probe(context.Background(), "probe-bucket"); err != nil {
		t.Errorf("Probe against 200 gateway: expected healthy, got %v", err)
	}
}

func TestProbe_UnhealthyOn503(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), srv.URL)
	if err := s.Probe(context.Background(), "probe-bucket"); err == nil {
		t.Error("Probe against 503 gateway: expected unhealthy, got nil")
	}
}

func TestProbe_UnhealthyOnConnRefused(t *testing.T) {
	// Start a server then close it so the port refuses connections.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), url)
	if err := s.Probe(context.Background(), "probe-bucket"); err == nil {
		t.Error("Probe against down gateway: expected unhealthy, got nil")
	}
}

func TestNewS3StorageWithOptions_PinsDialAndPreservesHost(t *testing.T) {
	// A stand-in gateway. We point DialAddr at it but give the SDK an
	// unresolvable signing host — if the request arrives, the pin worked, and
	// the recorded Host proves signing/Host used the signing endpoint, not the
	// dial IP. This is exactly the HAProxy-replacement behavior.
	var gotHost string
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
		gotHost = r.Host
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	dialAddr := srv.Listener.Addr().String()
	s := NewS3StorageWithOptions(probeConfig(), S3Options{
		Endpoint: "http://s3.signing-host.invalid",
		DialAddr: dialAddr,
	})
	if err := s.Probe(context.Background(), "probe-bucket"); err != nil {
		t.Fatalf("Probe through pinned dial: %v", err)
	}
	if !hit {
		t.Fatal("request never reached the pinned gateway")
	}
	if gotHost != "s3.signing-host.invalid" {
		t.Errorf("Host header = %q, want the signing host (not the dial IP)", gotHost)
	}
}

func TestNewS3StorageWithOptions_TLSSkipVerify(t *testing.T) {
	// Self-signed TLS server (httptest's default cert is not in system roots).
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	dialAddr := srv.Listener.Addr().String()

	// Without skip-verify, the self-signed cert must fail the probe.
	noSkip := NewS3StorageWithOptions(probeConfig(), S3Options{
		Endpoint: "https://s3.signing-host.invalid",
		DialAddr: dialAddr,
	})
	if err := noSkip.Probe(context.Background(), "probe-bucket"); err == nil {
		t.Error("expected TLS verification failure without skip-verify")
	}

	// With skip-verify, it must succeed (gateway answered 404 = alive).
	skip := NewS3StorageWithOptions(probeConfig(), S3Options{
		Endpoint:      "https://s3.signing-host.invalid",
		DialAddr:      dialAddr,
		TLSSkipVerify: true,
	})
	if err := skip.Probe(context.Background(), "probe-bucket"); err != nil {
		t.Errorf("Probe with skip-verify against self-signed gateway: %v", err)
	}
}

// test helpers

type genericError struct {
	msg string
}

func (e *genericError) Error() string { return e.msg }

type httpError struct {
	statusCode int
}

func (e *httpError) Error() string       { return "http error" }
func (e *httpError) HTTPStatusCode() int { return e.statusCode }
