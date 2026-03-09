package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"github.com/rs/zerolog/log"

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
	ListObjects(ctx context.Context, bucket, prefix string) ([]BlobInfo, error)
	DeleteObject(ctx context.Context, bucket, key string) error
}

type S3Storage struct {
	client *s3.Client
}

func NewS3Storage(cfg config.Config) *S3Storage {
	client := s3.New(s3.Options{
		Region: cfg.S3Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.S3AccessKeyID,
			cfg.S3SecretAccessKey,
			"",
		),
		BaseEndpoint: aws.String(cfg.S3Endpoint),
		UsePathStyle: cfg.S3ForcePathStyle,
	})

	return &S3Storage{client: client}
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

	// Use unsigned payload so the SDK doesn't need to seek the body for signing.
	_, err := s.client.PutObject(ctx, input, s3.WithAPIOptions(
		v4.SwapComputePayloadSHA256ForUnsignedPayloadMiddleware,
	))
	if err != nil {
		if isPreconditionFailed(err) {
			return ErrPreconditionFailed
		}
		return fmt.Errorf("put object: %w", err)
	}

	if hasher != nil {
		actual := hex.EncodeToString(hasher.hash.Sum(nil))
		if actual != sha256Hex {
			log.Warn().Str("expected", sha256Hex).Str("actual", actual).Str("bucket", bucket).Str("key", key).Msg("checksum mismatch, deleting object")
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

func (s *S3Storage) ListObjects(ctx context.Context, bucket, prefix string) ([]BlobInfo, error) {
	out, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, fmt.Errorf("list objects: %w", err)
	}

	if out.KeyCount == nil || *out.KeyCount == 0 {
		return []BlobInfo{}, nil
	}

	blobs := make([]BlobInfo, 0, len(out.Contents))
	for _, obj := range out.Contents {
		if obj.Key == nil || obj.Size == nil {
			continue
		}
		name := *obj.Key
		if len(name) > len(prefix) {
			name = name[len(prefix):]
		}
		blobs = append(blobs, BlobInfo{
			Name: name,
			Size: *obj.Size,
		})
	}

	return blobs, nil
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
