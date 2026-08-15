package storage

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"michael/internal/config"

	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// readOnly hides io.Seeker so the SDK gets a plain non-seekable stream — what
// michael proxies in prod (restic's r.Body wrapped in a TeeReader for hashing).
// The SDK cannot rewind it to retry.
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
	// Restic's REST listing has no pagination: ListObjects must walk every
	// ListObjectsV2 page or a >1000-key repo silently truncates (tail packs "missing").
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

// TestPutObject_NonSeekableBodyOn503_NoRewindRetry reproduces the prod
// throughput collapse: on a retryable 5xx the SDK retryer rewound restic's
// non-seekable pack body — "failed to rewind transport stream for retry" —
// surfacing as an opaque 500 (~28% of requests under load, fleet stalled).
// Asserts: no rewind attempted, exactly one upload, clean underlying backend
// error (restic retries the pack; its body IS seekable). RED before the s3.go
// RetryMaxAttempts=1 fix, GREEN after.
func TestPutObject_NonSeekableBodyOn503_NoRewindRetry(t *testing.T) {
	var puts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			atomic.AddInt32(&puts, 1)
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
	if n := atomic.LoadInt32(&puts); n != 1 {
		t.Fatalf("expected exactly 1 upload attempt (no retry on a non-seekable body), got %d", n)
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
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	url := srv.URL
	srv.Close()

	s := NewS3StorageForEndpoint(probeConfig(), url)
	if err := s.Probe(context.Background(), "probe-bucket"); err == nil {
		t.Error("Probe against down gateway: expected unhealthy, got nil")
	}
}

func TestNewS3StorageWithOptions_PinsDialAndPreservesHost(t *testing.T) {
	// Stand-in gateway: DialAddr points here, the signing host is unresolvable —
	// arrival proves the pin; the recorded Host proves signing used the
	// endpoint, not the dial IP (HAProxy-replacement behavior).
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

	noSkip := NewS3StorageWithOptions(probeConfig(), S3Options{
		Endpoint: "https://s3.signing-host.invalid",
		DialAddr: dialAddr,
	})
	if err := noSkip.Probe(context.Background(), "probe-bucket"); err == nil {
		t.Error("expected TLS verification failure without skip-verify")
	}

	skip := NewS3StorageWithOptions(probeConfig(), S3Options{
		Endpoint:      "https://s3.signing-host.invalid",
		DialAddr:      dialAddr,
		TLSSkipVerify: true,
	})
	if err := skip.Probe(context.Background(), "probe-bucket"); err != nil {
		t.Errorf("Probe with skip-verify against self-signed gateway: %v", err)
	}
}

type genericError struct {
	msg string
}

func (e *genericError) Error() string { return e.msg }

type httpError struct {
	statusCode int
}

func (e *httpError) Error() string       { return "http error" }
func (e *httpError) HTTPStatusCode() int { return e.statusCode }
