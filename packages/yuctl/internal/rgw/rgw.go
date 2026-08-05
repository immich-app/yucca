// Package rgw drives the RadosGW admin ops API and the bucket-ownership S3
// calls behind `yuctl repos migrate-storage-credentials`.
package rgw

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awscreds "github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Credentials is one S3 identity.
type Credentials struct {
	AccessKeyID     string
	SecretAccessKey string
}

// emptyPayloadHash is the SigV4 hash of an empty body; every admin ops call
// here sends one.
var emptyPayloadHash = func() string {
	sum := sha256.Sum256(nil)
	return hex.EncodeToString(sum[:])
}()

// AdminClient calls the RadosGW admin ops API with a users+buckets admin
// credential.
type AdminClient struct {
	endpoint string
	region   string
	creds    aws.Credentials
	http     *http.Client
}

func NewAdminClient(endpoint, region string, creds Credentials, insecureTLS bool) *AdminClient {
	hc := &http.Client{Timeout: 30 * time.Second}
	if insecureTLS {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		hc.Transport = tr
	}
	return &AdminClient{
		endpoint: strings.TrimRight(endpoint, "/"),
		region:   region,
		creds: aws.Credentials{
			AccessKeyID:     creds.AccessKeyID,
			SecretAccessKey: creds.SecretAccessKey,
		},
		http: hc,
	}
}

// Bucket is the slice of the admin API's bucket stats yuctl acts on.
type Bucket struct {
	Bucket string `json:"bucket"`
	ID     string `json:"id"`
	Owner  string `json:"owner"`
	Usage  struct {
		Main struct {
			NumObjects int64 `json:"num_objects"`
			SizeActual int64 `json:"size_actual"`
		} `json:"rgw.main"`
	} `json:"usage"`
}

func (b Bucket) Objects() int64 { return b.Usage.Main.NumObjects }
func (b Bucket) Bytes() int64   { return b.Usage.Main.SizeActual }

// ListBuckets reads every bucket with its owner and usage, which is how the
// orphan report tells a stranded repository bucket from a live one.
func (c *AdminClient) ListBuckets(ctx context.Context) ([]Bucket, error) {
	var out []Bucket
	if err := c.do(ctx, http.MethodGet, "/admin/bucket", url.Values{
		"stats":  {"true"},
		"format": {"json"},
	}, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// RemoveBucket deletes a bucket and, with purgeObjects, everything in it.
func (c *AdminClient) RemoveBucket(ctx context.Context, bucket string, purgeObjects bool) error {
	return c.do(ctx, http.MethodDelete, "/admin/bucket", url.Values{
		"bucket":        {bucket},
		"purge-objects": {strconv.FormatBool(purgeObjects)},
		"format":        {"json"},
	}, nil)
}

// RemoveUser needs a users-capable credential, so purge resolves the
// provisioner separately from the bucket-only migrator.
func (c *AdminClient) RemoveUser(ctx context.Context, uid string) error {
	err := c.do(ctx, http.MethodDelete, "/admin/user", url.Values{
		"uid":        {uid},
		"purge-data": {"false"},
		"format":     {"json"},
	}, nil)
	if err != nil && strings.Contains(err.Error(), "NoSuchUser") {
		return nil
	}
	return err
}

// GetBucket reads one bucket's stats, which is how the migration learns its
// current owner and its bucket id.
func (c *AdminClient) GetBucket(ctx context.Context, bucket string) (*Bucket, error) {
	var out Bucket
	if err := c.do(ctx, http.MethodGet, "/admin/bucket", url.Values{
		"bucket": {bucket},
		"stats":  {"true"},
		"format": {"json"},
	}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// LinkBucket moves a bucket to another owner. The bucket id is passed alongside
// the name because RGW resolves an unqualified name against the *caller's*
// tenant, which is not the owner here.
func (c *AdminClient) LinkBucket(ctx context.Context, bucket, bucketID, uid string) error {
	return c.do(ctx, http.MethodPut, "/admin/bucket", url.Values{
		"bucket":    {bucket},
		"bucket-id": {bucketID},
		"uid":       {uid},
		"format":    {"json"},
	}, nil)
}

func (c *AdminClient) do(ctx context.Context, method, path string, query url.Values, out any) error {
	u := c.endpoint + path + "?" + query.Encode()
	req, err := http.NewRequestWithContext(ctx, method, u, nil)
	if err != nil {
		return err
	}
	if err := v4.NewSigner().SignHTTP(ctx, c.creds, req, emptyPayloadHash, "s3", c.region, time.Now().UTC()); err != nil {
		return fmt.Errorf("sign %s %s: %w", method, path, err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%s %s: status %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("parse %s %s response: %w", method, path, err)
		}
	}
	return nil
}

// EnforceBucketOwner sets ObjectOwnership to BucketOwnerEnforced, which makes
// RGW ignore per-object ACLs so the bucket's owner controls every object in it.
// It must be signed by the CURRENT owner, and must run before the bucket is
// linked to its new one: without it, objects written by the old owner stay
// readable only by the old owner.
func EnforceBucketOwner(ctx context.Context, endpoint, region string, creds Credentials, bucket string, insecureTLS bool) error {
	hc := &http.Client{Timeout: 30 * time.Second}
	if insecureTLS {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		hc.Transport = tr
	}

	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(endpoint),
		UsePathStyle: true,
		HTTPClient:   hc,
		Credentials: awscreds.NewStaticCredentialsProvider(
			creds.AccessKeyID,
			creds.SecretAccessKey,
			"",
		),
	})

	_, err := client.PutBucketOwnershipControls(ctx, &s3.PutBucketOwnershipControlsInput{
		Bucket: aws.String(bucket),
		OwnershipControls: &types.OwnershipControls{
			Rules: []types.OwnershipControlsRule{
				{ObjectOwnership: types.ObjectOwnershipBucketOwnerEnforced},
			},
		},
	})
	if err != nil {
		return fmt.Errorf(
			"set BucketOwnerEnforced on %s: %w "+
				"(if this RGW does not support bucket ownership controls, chown the bucket on a ceph host instead: "+
				"`radosgw-admin bucket chown --bucket=%s --uid=<uid>`)",
			bucket, err, bucket,
		)
	}
	return nil
}
