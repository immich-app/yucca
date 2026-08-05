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
	"michael/internal/credentials"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awscreds "github.com/aws/aws-sdk-go-v2/credentials"
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

// ErrNoCredentials is fatal to the request by design: there is no fallback
// credential to serve it with.
var ErrNoCredentials = errors.New("no storage credentials on request")

// S3Storage owns one endpoint's HTTP transport, and caches an SDK client per
// credential pair on top of it.
type S3Storage struct {
	base        s3.Options
	clients     *clientCache
	probeClient *s3.Client
	onLookup    func(hit bool)
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
	Wrap               func(http.RoundTripper) http.RoundTripper
	OnCredentialLookup func(hit bool)
}

// NewS3StorageForEndpoint builds an S3Storage bound to a specific endpoint,
// reusing the region/path-style from cfg. The load-balancing pool uses this to
// stamp out one backend per gateway.
func NewS3StorageForEndpoint(cfg config.Config, endpoint string) *S3Storage {
	return NewS3StorageWithOptions(cfg, S3Options{
		Endpoint:      endpoint,
		TLSSkipVerify: cfg.S3TLSSkipVerify,
	})
}

// NewS3StorageWithOptions builds an S3Storage for the default storage cluster
// with explicit per-backend options (host-pinned dialing and/or TLS
// skip-verify).
func NewS3StorageWithOptions(cfg config.Config, opts S3Options) *S3Storage {
	return NewS3StorageForCluster(cfg.DefaultCluster(), opts)
}

// NewS3StorageForCluster builds an S3Storage against one storage cluster's
// region and path-style. Credentials are not part of it: they come from the
// token on each request.
func NewS3StorageForCluster(cc config.ClusterConfig, opts S3Options) *S3Storage {
	base := s3.Options{
		Region:       cc.S3Region,
		BaseEndpoint: aws.String(opts.Endpoint),
		UsePathStyle: cc.S3ForcePathStyle,
		HTTPClient:   buildHTTPClient(opts),
	}

	probeOptions := base
	probeOptions.Credentials = aws.AnonymousCredentials{}

	return &S3Storage{
		base:        base,
		clients:     newClientCache(clientCacheSize),
		probeClient: s3.New(probeOptions),
		onLookup:    opts.OnCredentialLookup,
	}
}

// All clients share the backend's transport, so a new credential costs an
// options struct, not a connection pool.
func (s *S3Storage) client(ctx context.Context) (*s3.Client, error) {
	creds, ok := credentials.FromContext(ctx)
	if !ok {
		return nil, ErrNoCredentials
	}

	key := creds.Fingerprint()
	if client, ok := s.clients.get(key); ok {
		s.lookup(true)
		return client, nil
	}
	s.lookup(false)

	options := s.base
	options.Credentials = awscreds.NewStaticCredentialsProvider(creds.AccessKeyID, creds.SecretAccessKey, "")
	client := s3.New(options)
	s.clients.put(key, client)
	return client, nil
}

func (s *S3Storage) lookup(hit bool) {
	if s.onLookup != nil {
		s.onLookup(hit)
	}
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
	_, err := s.probeClient.HeadBucket(ctx, &s3.HeadBucketInput{
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
	client, err := s.client(ctx)
	if err != nil {
		return false, err
	}
	_, err = client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return false, nil
		}
		// Also check for 404 in the operation error
		var noSuchBucket *types.NoSuchBucket
		if errors.As(err, &noSuchBucket) {
			return false, nil
		}
		return false, fmt.Errorf("check bucket: %w", err)
	}
	return true, nil
}

func (s *S3Storage) CreateBucket(ctx context.Context, bucket string) error {
	client, err := s.client(ctx)
	if err != nil {
		return err
	}
	_, err = client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		return fmt.Errorf("create bucket: %w", err)
	}
	return nil
}

func (s *S3Storage) HeadObject(ctx context.Context, bucket, key string) (int64, error) {
	client, err := s.client(ctx)
	if err != nil {
		return 0, err
	}
	out, err := client.HeadObject(ctx, &s3.HeadObjectInput{
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
	client, err := s.client(ctx)
	if err != nil {
		return nil, err
	}

	input := &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}
	if rangeHeader != "" {
		input.Range = aws.String(rangeHeader)
	}

	out, err := client.GetObject(ctx, input)
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
	client, err := s.client(ctx)
	if err != nil {
		return err
	}

	var uploadBody io.Reader = body
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
	_, err = client.PutObject(ctx, input, s3.WithAPIOptions(
		v4.SwapComputePayloadSHA256ForUnsignedPayloadMiddleware,
	), func(o *s3.Options) {
		o.RetryMaxAttempts = 1
	})
	if err != nil {
		if isPreconditionFailed(err) {
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
	client, err := s.client(ctx)
	if err != nil {
		return err
	}

	paginator := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{
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
	client, err := s.client(ctx)
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
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
	var notFound *types.NotFound
	if errors.As(err, &notFound) {
		return true
	}
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return true
	}
	var apiErr interface {
		HTTPStatusCode() int
	}
	if errors.As(err, &apiErr) {
		return apiErr.HTTPStatusCode() == 404
	}
	return false
}

// isPreconditionFailed checks if an S3 error is a 412 Precondition Failed.
func isPreconditionFailed(err error) bool {
	// aws-sdk-go-v2 wraps HTTP status in the operation error
	var apiErr interface {
		HTTPStatusCode() int
	}
	if errors.As(err, &apiErr) {
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
	var apiErr interface {
		HTTPStatusCode() int
	}
	if errors.As(err, &apiErr) {
		code := apiErr.HTTPStatusCode()
		// A transport failure (dial refused, timeout, reset) is surfaced by the
		// SDK as a ResponseError with StatusCode 0 — no response ever reached
		// us, so treat it as a backend failure alongside real 5xx responses.
		return code == 0 || code >= 500
	}
	// No HTTP status at all: the request never got a response from the gateway.
	return true
}
