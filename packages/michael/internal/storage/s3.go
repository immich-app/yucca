package storage

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"michael/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

var (
	ErrChecksumMismatch   = errors.New("content hash does not match blob name")
	ErrPreconditionFailed = errors.New("precondition failed")
)

type S3Object struct {
	Body          io.ReadCloser
	ContentLength int64
	ContentRange  string
	ContentType   string
	ETag          string
}

type BlobInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

type Storage interface {
	CheckBucket(ctx context.Context, bucket string) (bool, error)
	CreateBucket(ctx context.Context, bucket string) error
	HeadObject(ctx context.Context, bucket, key string) (int64, error)
	GetObject(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error)
	PutObject(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error
	ListObjects(ctx context.Context, bucket, prefix string, fn func(BlobInfo) error) error
	DeleteObject(ctx context.Context, bucket, key string) error
}

type S3Storage struct {
	client *s3.Client
}

func NewS3Storage(cfg config.Config) *S3Storage {
	return NewS3StorageForEndpoint(cfg, cfg.S3Endpoint)
}

// S3Options describes how to build one backend's S3 client.
type S3Options struct {
	// Endpoint is the BaseEndpoint the SDK uses for routing, the Host header,
	// and SigV4 signing. This is the address the backend gateway must accept in
	// its zonegroup hostname list.
	Endpoint string
	// DialAddr, when set, pins the underlying TCP connection to this host:port
	// regardless of Endpoint's host. This lets michael sign with a fixed
	// hostname (Endpoint) while load-balancing across specific gateway IPs —
	// the job HAProxy used to do. Empty means dial Endpoint's host normally.
	DialAddr string
	// TLSSkipVerify disables TLS certificate verification, for gateways behind a
	// self-signed cert (matching HAProxy's `ssl verify none`).
	TLSSkipVerify bool
	// Wrap, when set, wraps the backend's transport (e.g. with per-backend
	// client metrics).
	Wrap func(http.RoundTripper) http.RoundTripper
}

// NewS3StorageForEndpoint builds an S3Storage bound to a specific endpoint,
// reusing the credentials/region/path-style from cfg. The load-balancing pool
// uses this to stamp out one client per backend gateway.
func NewS3StorageForEndpoint(cfg config.Config, endpoint string) *S3Storage {
	return NewS3StorageWithOptions(cfg, S3Options{
		Endpoint:      endpoint,
		TLSSkipVerify: cfg.S3TLSSkipVerify,
	})
}

// NewS3StorageWithOptions builds an S3Storage for the default storage cluster
// with explicit per-backend options (host-pinned dialing and/or TLS
// skip-verify) layered on the cfg credentials.
func NewS3StorageWithOptions(cfg config.Config, opts S3Options) *S3Storage {
	return NewS3StorageForCluster(cfg.DefaultCluster(), opts)
}

// NewS3StorageForCluster builds an S3Storage against one storage cluster's
// credentials, region, and path-style. Each cluster michael fronts has its own
// object-user, so credentials cannot be shared across clusters.
func NewS3StorageForCluster(cc config.ClusterConfig, opts S3Options) *S3Storage {
	s3opts := s3.Options{
		Region: cc.S3Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cc.S3AccessKeyID,
			cc.S3SecretAccessKey,
			"",
		),
		BaseEndpoint: aws.String(opts.Endpoint),
		UsePathStyle: cc.S3ForcePathStyle,

		HTTPClient: buildHTTPClient(opts)}
	return &S3Storage{client: s3.New(s3opts)}
}

// buildHTTPClient builds the HTTP client for one backend. Always custom (never
// the SDK default), so connection pooling behaves identically across
// dev/staging/prod regardless of pin-host or TLS settings.
func buildHTTPClient(opts S3Options) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()

	// Each transport serves a single gateway, and restic fans out far more
	// concurrent requests than the default per-host idle cap of 2 — anything
	// past that paid a fresh TCP+TLS handshake. Buffers sized for multi-MB
	// pack transfers (defaults are 4KB).
	transport.MaxIdleConns = 0
	transport.MaxIdleConnsPerHost = 128
	transport.IdleConnTimeout = 120 * time.Second
	transport.WriteBufferSize = 64 << 10
	transport.ReadBufferSize = 64 << 10

	if opts.TLSSkipVerify {
		if transport.TLSClientConfig == nil {
			transport.TLSClientConfig = &tls.Config{}
		}
		transport.TLSClientConfig.InsecureSkipVerify = true
	}

	if opts.DialAddr != "" {
		base := transport.DialContext
		if base == nil {
			base = (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext
		}
		// Ignore the address the SDK derived from the URL host and dial the
		// pinned backend instead. The URL host still drives the Host header,
		// SNI, and signature, so the gateway sees the expected hostname.
		transport.DialContext = func(ctx context.Context, network, _ string) (net.Conn, error) {
			return base(ctx, network, opts.DialAddr)
		}
	}

	var rt http.RoundTripper = transport
	if opts.Wrap != nil {
		rt = opts.Wrap(transport)
	}
	return &http.Client{Transport: rt}
}

// Probe performs a cheap liveness check against the backend gateway. It issues a
// HeadBucket on a sentinel bucket: any HTTP response (even 404/403, meaning the
// bucket is absent or access-denied) proves the gateway is serving, so only a
// transport-level failure (dial refused, timeout, 5xx) is treated as unhealthy.
func (s *S3Storage) Probe(ctx context.Context, bucket string) error {
	// Single-shot: a probe must not be silently retried by the SDK, or a dead
	// gateway would look slow-but-alive and add latency to every reconcile.
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(bucket),
	}, func(o *s3.Options) {
		o.RetryMaxAttempts = 1
	})
	if err != nil && isBackendFailure(err) {
		return err
	}
	return nil
}

func (s *S3Storage) CheckBucket(ctx context.Context, bucket string) (bool, error) {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		if _, ok := errors.AsType[*types.NotFound](err); ok {
			return false, nil
		}
		// Also check for 404 in the operation error
		if _, ok := errors.AsType[*types.NoSuchBucket](err); ok {
			return false, nil
		}
		return false, fmt.Errorf("check bucket: %w", err)
	}
	return true, nil
}

func (s *S3Storage) CreateBucket(ctx context.Context, bucket string) error {
	_, err := s.client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		return fmt.Errorf("create bucket: %w", err)
	}
	return nil
}

func (s *S3Storage) HeadObject(ctx context.Context, bucket, key string) (int64, error) {
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return 0, err
	}
	if out.ContentLength != nil {
		return *out.ContentLength, nil
	}
	return 0, nil
}

func (s *S3Storage) GetObject(ctx context.Context, bucket, key, rangeHeader string) (*S3Object, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	if rangeHeader != "" {
		input.Range = aws.String(rangeHeader)
	}

	out, err := s.client.GetObject(ctx, input)
	if err != nil {
		return nil, err
	}

	obj := &S3Object{
		Body: out.Body,
	}
	if out.ContentLength != nil {
		obj.ContentLength = *out.ContentLength
	}
	if out.ContentRange != nil {
		obj.ContentRange = *out.ContentRange
	}
	if out.ContentType != nil {
		obj.ContentType = *out.ContentType
	}
	if out.ETag != nil {
		obj.ETag = *out.ETag
	}
	return obj, nil
}

func (s *S3Storage) PutObject(ctx context.Context, bucket, key string, body io.Reader, contentLength int64, writeOnce bool, sha256Hex string) error {
	uploadBody := body
	var hasher *sha256Writer

	if sha256Hex != "" {
		hasher = &sha256Writer{hash: sha256.New()}
		uploadBody = io.TeeReader(body, hasher)
	}

	input := &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          uploadBody,
		ContentLength: aws.Int64(contentLength),
	}

	if writeOnce {
		input.IfNoneMatch = aws.String("*")
	}

	// Use unsigned payload so the SDK doesn't need to seek the body for signing.
	// RetryMaxAttempts=1 (no SDK retry): the body is restic's non-seekable
	// proxied stream, so any retry would try to rewind it and fail with "failed
	// to rewind transport stream for retry, request stream is not seekable" —
	// masking the real backend error and, under load, stalling clients on a
	// large fraction of PUTs. With retries off, a transient gateway error
	// surfaces cleanly and restic retries the pack itself (its body IS
	// seekable). See TestPutObject_NonSeekableBodyOn503_NoRewindRetry.
	_, err := s.client.PutObject(ctx, input, s3.WithAPIOptions(
		v4.SwapComputePayloadSHA256ForUnsignedPayloadMiddleware,
	), func(o *s3.Options) {
		o.RetryMaxAttempts = 1
	})
	if err != nil {
		if isPreconditionFailed(err) {
			// Only content-addressed writes converge: for keys that aren't the
			// content's hash (the config object) a size match proves nothing.
			if sha256Hex != "" && s.existingBlobMatches(ctx, bucket, key, contentLength) {
				return nil
			}
			return ErrPreconditionFailed
		}
		return fmt.Errorf("put object: %w", err)
	}

	if hasher != nil {
		actual := hex.EncodeToString(hasher.hash.Sum(nil))
		if actual != sha256Hex {
			zerolog.Ctx(ctx).Warn().Str("expected", sha256Hex).Str("actual", actual).Str("bucket", bucket).Str("key", key).Msg("checksum mismatch, deleting object")
			_ = s.DeleteObject(ctx, bucket, key)
			return ErrChecksumMismatch
		}
	}

	return nil
}

// existingBlobMatches reports whether the object that failed a write-once
// PUT's precondition already holds this exact blob. Restic recovers from an
// ambiguously-failed upload (michael reported an error but the gateway
// committed the object) by re-POSTing the pack — on a WORM repository that
// lands here as a 412, and surfacing it as an error would turn a healed
// transient into a permanent backup failure (403 is permanent for restic; see
// docs/restic-retries.md). Blob keys are the content's sha256 and every object
// written through michael had that hash verified on the wire, so a size match
// identifies the same blob without re-reading it.
func (s *S3Storage) existingBlobMatches(ctx context.Context, bucket, key string, contentLength int64) bool {
	if contentLength <= 0 {
		return false
	}
	size, err := s.HeadObject(ctx, bucket, key)
	return err == nil && size == contentLength
}

// sha256Writer wraps a hash.Hash for use with io.TeeReader.
type sha256Writer struct {
	hash interface {
		Write(p []byte) (n int, err error)
		Sum(b []byte) []byte
	}
}

func (w *sha256Writer) Write(p []byte) (n int, err error) {
	return w.hash.Write(p)
}

// ListObjects streams every object under prefix to fn as pages arrive, instead
// of buffering the whole listing — restic's REST protocol has no pagination, so
// a large repo is one response and TTFB otherwise waits on every ListObjectsV2
// page (1000 keys each). Names are full object keys; callers strip what they
// need. An fn error aborts the walk.
func (s *S3Storage) ListObjects(ctx context.Context, bucket, prefix string, fn func(BlobInfo) error) error {
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	for paginator.HasMorePages() {
		out, err := paginator.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("list objects: %w", err)
		}
		for _, obj := range out.Contents {
			if obj.Key == nil || obj.Size == nil {
				continue
			}
			if err := fn(BlobInfo{Name: *obj.Key, Size: *obj.Size}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *S3Storage) DeleteObject(ctx context.Context, bucket, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

// IsNotFound reports whether err is an S3 404 — the object (or bucket) does
// not exist, as opposed to a storage failure.
func IsNotFound(err error) bool {
	if _, ok := errors.AsType[*types.NotFound](err); ok {
		return true
	}
	if _, ok := errors.AsType[*types.NoSuchKey](err); ok {
		return true
	}
	if apiErr, ok := errors.AsType[interface {
		error
		HTTPStatusCode() int
	}](err); ok {
		return apiErr.HTTPStatusCode() == 404
	}
	return false
}

// isPreconditionFailed checks if an S3 error is a 412 Precondition Failed.
func isPreconditionFailed(err error) bool {
	// aws-sdk-go-v2 wraps HTTP status in the operation error
	if apiErr, ok := errors.AsType[interface {
		error
		HTTPStatusCode() int
	}](err); ok {
		return apiErr.HTTPStatusCode() == 412
	}
	return false
}

// isBackendFailure reports whether err indicates the S3 backend (gateway) is
// unhealthy, as opposed to a normal application-level response. A 4xx status
// (404 missing, 403 denied, 409 conflict, 412 precondition, …) means the
// gateway responded correctly and is NOT a health failure. A 5xx status, or an
// error carrying no HTTP status at all (dial refused, timeout, connection
// reset, unexpected EOF), is a transport/backend failure.
func isBackendFailure(err error) bool {
	if err == nil {
		return false
	}
	// A cancelled/expired context is the caller giving up (e.g. the restic
	// client disconnected mid-stream), not a backend health signal — don't let
	// it eject an otherwise-healthy gateway.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if apiErr, ok := errors.AsType[interface {
		error
		HTTPStatusCode() int
	}](err); ok {
		code := apiErr.HTTPStatusCode()
		// A transport failure (dial refused, timeout, reset) is surfaced by the
		// SDK as a ResponseError with StatusCode 0 — no response ever reached
		// us, so treat it as a backend failure alongside real 5xx responses.
		return code == 0 || code >= 500
	}
	// No HTTP status at all: the request never got a response from the gateway.
	return true
}
