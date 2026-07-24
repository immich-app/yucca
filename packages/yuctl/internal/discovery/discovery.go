// Package discovery resolves the live yucca topology by reading Terraform state
// objects directly from the shared `yucca-tf-state` S3 bucket and parsing each
// stack's `discovery` output (see internal/state). It never shells out to
// `terragrunt output`, so it works without a checkout, provider plugins, or
// `terragrunt init`.
//
// Stack enumeration is auto-detected: it prefers walking a local
// `tf/deployment` tree (cheap, offline, and authoritative for *which* stacks
// exist), and falls back to a `ListObjectsV2` sweep of the bucket. Either way,
// live values come from a `GetObject` on each `terraform.tfstate`.
package discovery

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/rs/zerolog"

	"yuctl/internal/op"
	"yuctl/internal/state"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	// Bucket is the shared Terraform state bucket (OVH eu-west-par).
	Bucket = "yucca-tf-state"
	// KeyPrefix is the per-stack state key prefix after the Workstream 1 rekey
	// (`yucca/<partition>/<region>/<stack>/terraform.tfstate`).
	KeyPrefix = "yucca/"

	// s3Endpoint / s3Region mirror the terragrunt remote_state backend exactly.
	s3Endpoint = "https://s3.eu-west-par.io.cloud.ovh.net/"
	s3Region   = "eu-west-par"

	// Default 1Password references for the state-bucket credentials. These match
	// the AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY lines in tf/.env. Overridable
	// via the env vars below for `op run` / CI contexts.
	defaultAccessKeyRef = "op://yucca_tf/TF_STATE_S3_ACCESS_KEY/password"
	defaultSecretKeyRef = "op://yucca_tf/TF_STATE_S3_SECRET_KEY/password"
)

// Stack identifies one Terraform stack and its state object key.
type Stack struct {
	Partition string
	Region    string
	Stack     string // joined sub-stack path (e.g. "talos", "htz-fsn1/netbird")
	Key       string // full S3 object key
}

// ResolvedStack is a Stack with its parsed discovery envelope.
type ResolvedStack struct {
	Stack
	Discovery state.Discovery
}

// Topology is every resolved stack across the bucket.
type Topology struct {
	Stacks []ResolvedStack
}

// Client reads state from S3.
type Client struct {
	s3  *s3.Client
	log zerolog.Logger
}

// NewClient builds the S3 client. Credentials come from AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY when already present (e.g. under `op run`), otherwise
// they are resolved from 1Password via `op read` (refs overridable through
// YUCTL_TF_STATE_ACCESS_KEY_REF / YUCTL_TF_STATE_SECRET_KEY_REF).
func NewClient(ctx context.Context, logger zerolog.Logger) (*Client, error) {
	accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")
	if accessKey == "" || secretKey == "" {
		accessRef := envOr("YUCTL_TF_STATE_ACCESS_KEY_REF", defaultAccessKeyRef)
		secretRef := envOr("YUCTL_TF_STATE_SECRET_KEY_REF", defaultSecretKeyRef)
		var err error
		if accessKey, err = op.Read(ctx, accessRef); err != nil {
			return nil, fmt.Errorf("resolve state-bucket access key: %w", err)
		}
		if secretKey, err = op.Read(ctx, secretRef); err != nil {
			return nil, fmt.Errorf("resolve state-bucket secret key: %w", err)
		}
	}

	client := s3.New(s3.Options{
		Region:       s3Region,
		BaseEndpoint: aws.String(s3Endpoint),
		UsePathStyle: true,
		Credentials:  credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	})
	return &Client{s3: client, log: logger}, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Resolve discovers stacks (local tree preferred, else bucket listing), reads
// each state object, and returns the populated topology. Stacks whose state has
// no `discovery` output yet are skipped with a debug log.
func (c *Client) Resolve(ctx context.Context) (*Topology, error) {
	stacks, src, err := c.enumerate(ctx)
	if err != nil {
		return nil, err
	}
	c.log.Debug().Str("source", src).Int("stacks", len(stacks)).Msg("enumerated stacks")

	topo := &Topology{}
	for _, st := range stacks {
		raw, err := c.getObject(ctx, st.Key)
		if err != nil {
			// A locally-enumerated stack may not have been applied yet (no state
			// object). Skip rather than abort the whole resolve.
			c.log.Debug().Str("key", st.Key).Err(err).Msg("skip: state object unreadable")
			continue
		}
		d, err := state.ParseDiscovery(raw)
		if err != nil {
			c.log.Warn().Str("key", st.Key).Err(err).Msg("skip: discovery parse failed")
			continue
		}
		if d == nil {
			c.log.Debug().Str("key", st.Key).Msg("skip: no discovery output")
			continue
		}
		topo.Stacks = append(topo.Stacks, ResolvedStack{Stack: st, Discovery: *d})
	}
	return topo, nil
}

// enumerate returns candidate stacks, preferring a local tf/deployment tree.
func (c *Client) enumerate(ctx context.Context) ([]Stack, string, error) {
	if dir := findDeploymentDir(); dir != "" {
		stacks, err := enumerateLocal(dir)
		if err != nil {
			return nil, "", err
		}
		if len(stacks) > 0 {
			return stacks, "local:" + dir, nil
		}
	}
	stacks, err := c.enumerateBucket(ctx)
	if err != nil {
		return nil, "", err
	}
	return stacks, "bucket", nil
}

// findDeploymentDir walks up from the working directory looking for a
// `tf/deployment` directory, returning its absolute path or "".
func findDeploymentDir() string {
	if override := os.Getenv("YUCTL_TF_DEPLOYMENT_DIR"); override != "" {
		if isDir(override) {
			return override
		}
	}
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		candidate := filepath.Join(dir, "tf", "deployment")
		if isDir(candidate) {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func isDir(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

// enumerateLocal walks tf/deployment finding every directory that contains a
// terragrunt.hcl and sits at depth >= 2 (partition/region/<stack...>). The root
// terragrunt.hcl (depth 0) is ignored.
func enumerateLocal(root string) ([]Stack, error) {
	var stacks []Stack
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || d.Name() != "terragrunt.hcl" {
			return nil
		}
		rel, err := filepath.Rel(root, filepath.Dir(path))
		if err != nil {
			return err
		}
		if rel == "." {
			return nil // root terragrunt.hcl
		}
		segs := strings.Split(filepath.ToSlash(rel), "/")
		if len(segs) < 2 {
			return nil // partition-only or region-only dir, not a stack
		}
		st := stackFromSegments(segs)
		stacks = append(stacks, st)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk %s: %w", root, err)
	}
	sortStacks(stacks)
	return stacks, nil
}

// enumerateBucket lists every `*/terraform.tfstate` under the yucca/ prefix.
func (c *Client) enumerateBucket(ctx context.Context) ([]Stack, error) {
	var stacks []Stack
	p := s3.NewListObjectsV2Paginator(c.s3, &s3.ListObjectsV2Input{
		Bucket: aws.String(Bucket),
		Prefix: aws.String(KeyPrefix),
	})
	for p.HasMorePages() {
		page, err := p.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list %s/%s: %w", Bucket, KeyPrefix, err)
		}
		for _, obj := range page.Contents {
			if obj.Key == nil || !strings.HasSuffix(*obj.Key, "/terraform.tfstate") {
				continue
			}
			st, ok := stackFromKey(*obj.Key)
			if ok {
				stacks = append(stacks, st)
			}
		}
	}
	sortStacks(stacks)
	return stacks, nil
}

// stackFromSegments builds a Stack from path segments [partition, region, sub...].
func stackFromSegments(segs []string) Stack {
	partition, region := segs[0], segs[1]
	sub := strings.Join(segs[2:], "/")
	return Stack{
		Partition: partition,
		Region:    region,
		Stack:     sub,
		Key:       fmt.Sprintf("%s%s/%s/%s/terraform.tfstate", KeyPrefix, partition, region, sub),
	}
}

// stackFromKey parses `yucca/<partition>/<region>/<stack...>/terraform.tfstate`.
func stackFromKey(key string) (Stack, bool) {
	trimmed := strings.TrimPrefix(key, KeyPrefix)
	trimmed = strings.TrimSuffix(trimmed, "/terraform.tfstate")
	segs := strings.Split(trimmed, "/")
	if len(segs) < 3 {
		return Stack{}, false
	}
	st := stackFromSegments(segs)
	st.Key = key
	return st, true
}

func (c *Client) getObject(ctx context.Context, key string) ([]byte, error) {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func sortStacks(s []Stack) {
	sort.Slice(s, func(i, j int) bool {
		if s[i].Partition != s[j].Partition {
			return s[i].Partition < s[j].Partition
		}
		if s[i].Region != s[j].Region {
			return s[i].Region < s[j].Region
		}
		return s[i].Stack < s[j].Stack
	})
}

// ---- Topology queries -------------------------------------------------------

// Regions returns the distinct partition@region pairs present in the topology.
func (t *Topology) Regions() []string {
	seen := map[string]struct{}{}
	var out []string
	for _, s := range t.Stacks {
		if s.Region == "global" {
			continue
		}
		key := s.Partition + "@" + s.Region
		if _, ok := seen[key]; !ok {
			seen[key] = struct{}{}
			out = append(out, key)
		}
	}
	sort.Strings(out)
	return out
}

// HasRegion reports whether any stack exists for partition@region.
func (t *Topology) HasRegion(partition, region string) bool {
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Region == region {
			return true
		}
	}
	return false
}

// Kubernetes returns the region's single k8s/talos discovery payload, or nil.
func (t *Topology) Kubernetes(partition, region string) *state.Kubernetes {
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Region == region && s.Discovery.Kubernetes != nil {
			return s.Discovery.Kubernetes
		}
	}
	return nil
}

// CephClusters merges every ceph payload in the region into a single map keyed
// by friendly cluster name.
func (t *Topology) CephClusters(partition, region string) map[string]state.CephCluster {
	out := map[string]state.CephCluster{}
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Region == region {
			for name, cc := range s.Discovery.CephClusters {
				out[name] = cc
			}
		}
	}
	return out
}

// MgmtHosts returns the region's management-host roster (fabric payload), or
// nil for regions without a fabric stack (e.g. austin).
func (t *Topology) MgmtHosts(partition, region string) []state.MgmtHost {
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Region == region && s.Discovery.Fabric != nil && len(s.Discovery.Fabric.MgmtHosts) > 0 {
			return s.Discovery.Fabric.MgmtHosts
		}
	}
	return nil
}

// PrimaryRegion returns the region name whose discovery.role == "primary" for
// the given partition, or "" if none is found.
func (t *Topology) PrimaryRegion(partition string) string {
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Discovery.Role == "primary" {
			return s.Region
		}
	}
	return ""
}

// RegionMeta returns any region_meta envelope for partition@region (the first
// stack found), used to derive hostnames (admin-api etc.).
func (t *Topology) RegionMeta(partition, region string) (state.RegionMeta, bool) {
	for _, s := range t.Stacks {
		if s.Partition == partition && s.Region == region {
			return s.Discovery.RegionMeta, true
		}
	}
	return state.RegionMeta{}, false
}
