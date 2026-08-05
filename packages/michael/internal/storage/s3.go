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
	// Endpoint drives SDK routing, Host header, and SigV4 signing; must be in
	// the gateway's zonegroup hostname list.
	Endpoint string
	// DialAddr, when set, pins the TCP connection to this host:port while
	// Endpoint keeps driving signing/Host — fixed-hostname signing with per-IP
	// load-balancing (ex-HAProxy job). Empty = dial Endpoint's host.
	DialAddr string
	// TLSSkipVerify: for self-signed gateway certs (HAProxy `ssl verify none` equivalent).
	TLSSkipVerify bool
	// Wrap, when set, wraps the backend's transport (e.g. with per-backend
	// client metrics).
	Wrap func(http.RoundTripper) http.RoundTripper
}

// NewS3StorageForEndpoint builds an S3Storage bound to one endpoint, reusing
// cfg credentials/region/path-style; the pool stamps one per gateway.
func NewS3StorageForEndpoint(cfg config.Config, endpoint string) *S3Storage {
	return NewS3StorageWithOptions(cfg, S3Options{
		Endpoint:      endpoint,
		TLSSkipVerify: cfg.S3TLSSkipVerify,
	})
}

// NewS3StorageWithOptions builds an S3Storage for the default storage cluster
// with explicit per-backend options layered on the cfg credentials.
func NewS3StorageWithOptions(cfg config.Config, opts S3Options) *S3Storage {
	return NewS3StorageForCluster(cfg.DefaultCluster(), opts)
}

// NewS3StorageForCluster builds against one cluster's credentials/region/path-style;
// each cluster has its own object-user, so credentials can't be shared.
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
	}
	s3opts.HTTPClient = buildHTTPClient(opts)
	return &S3Storage{client: s3.New(s3opts)}
}

// buildHTTPClient builds one backend's HTTP client. Always custom (never SDK
// default) so pooling behaves identically across dev/staging/prod.
func buildHTTPClient(opts S3Options) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()

	// One gateway per transport; restic's fan-out blows past the default
	// per-host idle cap of 2 (fresh TCP+TLS beyond it). Buffers sized for
	// multi-MB packs (defaults 4KB).
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
		// Dial the pinned backend, not the URL host; the URL host still drives
		// Host header, SNI, and signature.
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

// Probe: HeadBucket on a sentinel bucket. Any HTTP response (even 404/403)
// proves the gateway serves; only transport failure/5xx is unhealthy.
func (s *S3Storage) Probe(ctx context.Context, bucket string) error {
	// Single-shot: SDK retries would make a dead gateway look slow-but-alive.
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
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return false, nil
		}
		var noSuchBucket *types.NoSuchBucket
		if errors.As(err, &noSuchBucket) {
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

	// Unsigned payload: no body seek needed for signing. RetryMaxAttempts=1:
	// the body is restic's non-seekable proxied stream — an SDK retry fails with
	// "failed to rewind transport stream", masking the real error and stalling
	// PUTs under load; restic retries the pack itself (its body IS seekable).
	// See TestPutObject_NonSeekableBodyOn503_NoRewindRetry.
	_, err := s.client.PutObject(ctx, input, s3.WithAPIOptions(
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

// ListObjects streams each page to fn instead of buffering: restic's REST
// protocol has no pagination, so a large repo is one response and TTFB would
// otherwise wait on every 1000-key page. Names are full keys; fn error aborts.
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

// isBackendFailure reports gateway unhealth: 4xx = gateway responded fine (not
// a health failure); 5xx or no HTTP status (dial refused, timeout, reset,
// unexpected EOF) = transport/backend failure.
func isBackendFailure(err error) bool {
	if err == nil {
		return false
	}
	// Cancelled/expired context = caller gave up (client disconnect), not a
	// backend health signal — must not eject a healthy gateway.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var apiErr interface {
		HTTPStatusCode() int
	}
	if errors.As(err, &apiErr) {
		code := apiErr.HTTPStatusCode()
		// SDK surfaces transport failures as ResponseError with StatusCode 0 —
		// no response reached us; treat like 5xx.
		return code == 0 || code >= 500
	}
	// No HTTP status at all: the request never got a response from the gateway.
	return true
}
