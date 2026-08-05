//go:build e2e

// Package e2e test: proves the load-balancing Pool works end-to-end against the
// REAL Ceph RGW running in the local k3d cluster.
//
// The harness (.mise/tasks/michael/test/e2e) port-forwards svc/rook-ceph-rgw-yucca
// to S3_ENDPOINT and exports the michael object-user credentials. This test then:
//
//  1. Fronts that single real RGW with TWO in-process transparent TCP proxies.
//     Both forward to the same Ceph store, so they are interchangeable backends —
//     exactly the production model (multiple RGW gateways, one object store).
//  2. Builds the michael Pool over the two proxy endpoints and runs the full
//     restic blob workflow through michael's real HTTP handler stack. Data really
//     lands in k3d's Ceph.
//  3. Asserts traffic spreads across both backends (least-outstanding balancing).
//  4. Fails one proxy and proves active-probe ejection + that the workflow keeps
//     working through the survivor, then restores it and proves reinstatement.
//  5. Proves passive ejection (consecutive request failures) independently.
//
// A second test reuses the same harness for claim-based cluster routing: the two
// proxies become two SEPARATE storage clusters, and the token's storageCluster
// claim decides which one serves each request.
package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"michael/internal/config"
	michaelcreds "michael/internal/credentials"
	"michael/internal/handlers"
	"michael/internal/storage"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
)

var (
	e2ePrivateKey, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	e2ePublicKey     = &e2ePrivateKey.PublicKey
)

const e2eUser = "00000000-0000-0000-0000-0000000000e2"

func e2eEnv(t *testing.T, key string) string {
	t.Helper()
	v := os.Getenv(key)
	if v == "" {
		t.Skipf("%s not set — run via `mise run michael/test/e2e` (needs the k3d cluster)", key)
	}
	return v
}

// The harness's object-user keys reach michael the way real ones do: sealed
// into the token.
var e2eSealKeys = [][]byte{bytes.Repeat([]byte{0x2a}, 32)}

func e2eCredentials(t *testing.T) michaelcreds.Credentials {
	t.Helper()
	return michaelcreds.Credentials{
		AccessKeyID:     e2eEnv(t, "S3_ACCESS_KEY_ID"),
		SecretAccessKey: e2eEnv(t, "S3_SECRET_ACCESS_KEY"),
	}
}

func e2eConfig(t *testing.T) config.Config {
	return config.Config{
		JWTPublicKey:     e2ePublicKey,
		StorageSealKeys:  e2eSealKeys,
		S3Region:         envOrE2E("S3_REGION", "us-east-1"),
		S3Endpoint:       e2eEnv(t, "S3_ENDPOINT"),
		S3ForcePathStyle: true,
	}
}

func envOrE2E(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func e2eJWT(t *testing.T, repo string, writeOnce bool) string {
	t.Helper()
	return e2eJWTForCluster(t, repo, writeOnce, "")
}

// e2eJWTForCluster mints a token carrying an explicit storageCluster claim.
// An empty storageCluster omits the claim entirely — the shape of a token
// minted before multi-cluster routing existed.
func e2eJWTForCluster(t *testing.T, repo string, writeOnce bool, storageCluster string) string {
	t.Helper()
	sealed, err := michaelcreds.Seal(e2eSealKeys[0], repo, e2eCredentials(t))
	if err != nil {
		t.Fatalf("seal storage credentials: %v", err)
	}
	claims := jwt.MapClaims{
		"user":               e2eUser,
		"repository":         repo,
		"writeOnce":          writeOnce,
		"storageCredentials": sealed,
		"exp":                jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	if storageCluster != "" {
		claims["storageCluster"] = storageCluster
	}
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	signed, err := token.SignedString(e2ePrivateKey)
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("restic:"+signed))
}

// --- controllable transparent TCP proxy ---

// tcpProxy forwards raw TCP to a target. Failing it both refuses NEW
// connections and tears down LIVE ones — the latter matters because the S3
// client keeps keep-alive connections pooled, and dropping only new connections
// would let a probe sail through a reused connection. Together this faithfully
// simulates a dead gateway (transport failure on every request).
type tcpProxy struct {
	ln     net.Listener
	target string
	mu     sync.Mutex
	failed bool
	conns  map[net.Conn]struct{}
}

func newTCPProxy(t *testing.T, target string) *tcpProxy {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	p := &tcpProxy{ln: ln, target: target, conns: map[net.Conn]struct{}{}}
	go p.serve()
	return p
}

func (p *tcpProxy) url() string { return "http://" + p.ln.Addr().String() }

func (p *tcpProxy) setFailed(v bool) {
	p.mu.Lock()
	p.failed = v
	var toClose []net.Conn
	if v {
		for c := range p.conns {
			toClose = append(toClose, c)
		}
	}
	p.mu.Unlock()
	for _, c := range toClose {
		_ = c.Close()
	}
}

func (p *tcpProxy) isFailed() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.failed
}

func (p *tcpProxy) track(c net.Conn) {
	p.mu.Lock()
	p.conns[c] = struct{}{}
	p.mu.Unlock()
}

func (p *tcpProxy) untrack(c net.Conn) {
	p.mu.Lock()
	delete(p.conns, c)
	p.mu.Unlock()
}

func (p *tcpProxy) serve() {
	for {
		c, err := p.ln.Accept()
		if err != nil {
			return
		}
		if p.isFailed() {
			_ = c.Close()
			continue
		}
		go p.pipe(c)
	}
}

func (p *tcpProxy) pipe(client net.Conn) {
	defer client.Close()
	up, err := net.DialTimeout("tcp", p.target, 5*time.Second)
	if err != nil {
		return
	}
	defer up.Close()
	p.track(client)
	defer p.untrack(client)
	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(up, client); done <- struct{}{} }()
	go func() { _, _ = io.Copy(client, up); done <- struct{}{} }()
	<-done
}

func (p *tcpProxy) close() { _ = p.ln.Close() }

// --- helpers ---

func targetHostPort(t *testing.T, endpoint string) string {
	t.Helper()
	u, err := url.Parse(endpoint)
	if err != nil {
		t.Fatalf("parse S3_ENDPOINT %q: %v", endpoint, err)
	}
	host := u.Host
	if u.Port() == "" {
		host = net.JoinHostPort(u.Hostname(), "80")
	}
	return host
}

func newE2EPool(t *testing.T, cfg config.Config, endpoints []string, threshold int, probeBucket string) *storage.Pool {
	t.Helper()
	dir := t.TempDir()
	path := dir + "/backends.txt"
	if err := os.WriteFile(path, []byte(joinLines(endpoints)), 0o644); err != nil {
		t.Fatalf("write backends: %v", err)
	}
	factory := func(endpoint string) (storage.Storage, error) {
		return storage.NewS3StorageForEndpoint(cfg, endpoint), nil
	}
	pool, err := storage.NewPool(storage.PoolConfig{
		EjectThreshold:    threshold,
		ProbeBucket:       probeBucket,
		ReconcileInterval: time.Hour, // we drive Reconcile manually in the test
	}, factory, storage.NewFileResolver(path), zerolog.Nop())
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	return pool
}

func joinLines(ss []string) string {
	out := ""
	for _, s := range ss {
		out += s + "\n"
	}
	return out
}

func do(t *testing.T, client *http.Client, method, url, auth string, body []byte) *http.Response {
	t.Helper()
	var r io.Reader
	if body != nil {
		r = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, r)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Authorization", auth)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return resp
}

func mustStatus(t *testing.T, resp *http.Response, want int, what string) {
	t.Helper()
	if resp.StatusCode != want {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("%s: expected %d, got %d (%s)", what, want, resp.StatusCode, bytes.TrimSpace(b))
	}
}

// rawClient builds an S3 client straight to the real RGW (not via the proxies),
// used only for test bucket cleanup.
func rawClient(cfg config.Config, creds michaelcreds.Credentials) *s3.Client {
	return s3.New(s3.Options{
		Region:       cfg.S3Region,
		Credentials:  credentials.NewStaticCredentialsProvider(creds.AccessKeyID, creds.SecretAccessKey, ""),
		BaseEndpoint: aws.String(cfg.S3Endpoint),
		UsePathStyle: true,
	})
}

func cleanupBucket(t *testing.T, cfg config.Config, bucket string) {
	t.Helper()
	c := rawClient(cfg, e2eCredentials(t))
	ctx := context.Background()
	out, err := c.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(bucket)})
	if err == nil {
		for _, o := range out.Contents {
			_, _ = c.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(bucket), Key: o.Key})
		}
	}
	if _, err := c.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Logf("cleanup: delete bucket %s: %v (non-fatal)", bucket, err)
	}
}

// healthyCount returns how many backends in the pool are currently healthy.
func healthyCount(p *storage.Pool) int {
	n := 0
	for _, s := range p.Stats() {
		if s.Healthy {
			n++
		}
	}
	return n
}

func statByEndpoint(p *storage.Pool, endpoint string) (storage.BackendStat, bool) {
	for _, s := range p.Stats() {
		if s.Endpoint == endpoint {
			return s, true
		}
	}
	return storage.BackendStat{}, false
}

// TestE2E_PoolAgainstRealRGW is the full end-to-end proof.
func TestE2E_PoolAgainstRealRGW(t *testing.T) {
	cfg := e2eConfig(t)
	target := targetHostPort(t, cfg.S3Endpoint)

	// Two interchangeable backends, both proxying to the same real RGW.
	pa := newTCPProxy(t, target)
	pb := newTCPProxy(t, target)
	defer pa.close()
	defer pb.close()
	endpoints := []string{pa.url(), pb.url()}

	// Repository == bucket name, and michael requires it to be a UUID.
	repo := uuid.NewString()
	defer cleanupBucket(t, cfg, repo)

	pool := newE2EPool(t, cfg, endpoints, 2, repo)
	if got := healthyCount(pool); got != 2 {
		t.Fatalf("expected 2 healthy backends after initial probe, got %d", got)
	}
	t.Logf("pool up: 2 backends healthy against real RGW (%s)", cfg.S3Endpoint)

	srv := httptest.NewServer(handlers.NewServer(pool, cfg.JWTPublicKey, cfg.StorageSealKeys, nil).Handler())
	defer srv.Close()
	client := srv.Client()
	auth := e2eJWT(t, repo, false)

	// ---- Phase 1: full restic workflow through the pool, real data to Ceph ----
	resp := do(t, client, http.MethodPost, srv.URL+"/"+repo+"/?create=true", auth, nil)
	mustStatus(t, resp, http.StatusOK, "create repo")
	resp.Body.Close()

	resp = do(t, client, http.MethodPost, srv.URL+"/"+repo+"/?create=true", auth, nil)
	mustStatus(t, resp, http.StatusConflict, "create repo again")
	resp.Body.Close()

	cfgData := []byte("e2e restic config blob")
	resp = do(t, client, http.MethodPost, srv.URL+"/"+repo+"/config", auth, cfgData)
	mustStatus(t, resp, http.StatusOK, "save config")
	resp.Body.Close()

	resp = do(t, client, http.MethodGet, srv.URL+"/"+repo+"/config", auth, nil)
	mustStatus(t, resp, http.StatusOK, "get config")
	got, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !bytes.Equal(got, cfgData) {
		t.Fatalf("config roundtrip mismatch: %q", got)
	}

	// Several blobs so the balancer has work to spread across both backends.
	blobNames := make([]string, 0, 6)
	for i := range 6 {
		data := []byte(fmt.Sprintf("e2e blob payload number %d", i))
		sum := sha256.Sum256(data)
		name := hex.EncodeToString(sum[:])
		blobNames = append(blobNames, name)

		resp = do(t, client, http.MethodPost, srv.URL+"/"+repo+"/data/"+name, auth, data)
		mustStatus(t, resp, http.StatusOK, "save blob")
		resp.Body.Close()

		resp = do(t, client, http.MethodGet, srv.URL+"/"+repo+"/data/"+name, auth, nil)
		mustStatus(t, resp, http.StatusOK, "get blob")
		rb, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if !bytes.Equal(rb, data) {
			t.Fatalf("blob %d roundtrip mismatch", i)
		}
	}

	// List blobs (restic v2).
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/"+repo+"/data", nil)
	req.Header.Set("Authorization", auth)
	req.Header.Set("Accept", handlers.ContentTypeResticV2)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("list blobs: %v", err)
	}
	var listed []storage.BlobInfo
	_ = json.NewDecoder(resp.Body).Decode(&listed)
	resp.Body.Close()
	if len(listed) != len(blobNames) {
		t.Fatalf("list: expected %d blobs, got %d", len(blobNames), len(listed))
	}

	// Assert the load balancer actually spread traffic across BOTH backends.
	sa, _ := statByEndpoint(pool, pa.url())
	sb, _ := statByEndpoint(pool, pb.url())
	t.Logf("balancing: backend A served %d reqs (%d up / %d down bytes), backend B served %d reqs (%d up / %d down)",
		sa.Requests, sa.UploadedBytes, sa.DownloadedBytes, sb.Requests, sb.UploadedBytes, sb.DownloadedBytes)
	if sa.Requests == 0 || sb.Requests == 0 {
		t.Fatalf("expected both backends to serve traffic, got A=%d B=%d", sa.Requests, sb.Requests)
	}

	// ---- Phase 2: active-probe ejection; workflow continues via survivor ----
	pa.setFailed(true)
	if err := pool.Reconcile(context.Background()); err != nil {
		t.Logf("reconcile resolver note: %v", err)
	}
	if healthyCount(pool) != 1 {
		t.Fatalf("expected exactly 1 healthy backend after ejecting A, got %d", healthyCount(pool))
	}
	if s, _ := statByEndpoint(pool, pa.url()); s.Healthy {
		t.Fatal("backend A should be ejected after failing its probe")
	}
	t.Log("backend A ejected via active probe; routing only to B")

	// All operations still succeed through the surviving backend.
	data := []byte("blob written while A is down")
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:])
	blobNames = append(blobNames, name)
	resp = do(t, client, http.MethodPost, srv.URL+"/"+repo+"/data/"+name, auth, data)
	mustStatus(t, resp, http.StatusOK, "save blob during ejection")
	resp.Body.Close()
	resp = do(t, client, http.MethodGet, srv.URL+"/"+repo+"/data/"+name, auth, nil)
	mustStatus(t, resp, http.StatusOK, "get blob during ejection")
	resp.Body.Close()
	t.Log("workflow continued successfully while A was ejected")

	// ---- Phase 3: reinstatement ----
	pa.setFailed(false)
	if err := pool.Reconcile(context.Background()); err != nil {
		t.Logf("reconcile note: %v", err)
	}
	if healthyCount(pool) != 2 {
		t.Fatalf("expected both backends healthy after A recovers, got %d", healthyCount(pool))
	}
	t.Log("backend A reinstated via active probe; both healthy again")

	// ---- Phase 4: passive ejection (consecutive request failures) ----
	pb.setFailed(true)
	// Hit backend B directly until its consecutive-failure streak trips ejection.
	// (Some calls land on A and succeed; B's per-backend streak is what matters.)
	ejected := false
	for i := range 12 {
		_, _ = pool.HeadObject(context.Background(), repo, "config")
		if s, _ := statByEndpoint(pool, pb.url()); !s.Healthy {
			ejected = true
			t.Logf("backend B passively ejected after %d driven requests", i+1)
			break
		}
	}
	if !ejected {
		t.Fatal("backend B was not passively ejected despite repeated failures")
	}
	pb.setFailed(false)
	if err := pool.Reconcile(context.Background()); err != nil {
		t.Logf("reconcile note: %v", err)
	}
	if healthyCount(pool) != 2 {
		t.Fatalf("expected both backends healthy after B recovers, got %d", healthyCount(pool))
	}
	t.Log("backend B reinstated; e2e proof complete")

	// ---- cleanup of created blobs/config (bucket removed by deferred cleanup) ----
	for _, n := range blobNames {
		resp = do(t, client, http.MethodDelete, srv.URL+"/"+repo+"/data/"+n, auth, nil)
		resp.Body.Close()
	}
	resp = do(t, client, http.MethodDelete, srv.URL+"/"+repo+"/config", auth, nil)
	resp.Body.Close()
}

// totalRequests sums the requests every backend in a pool has served.
func totalRequests(p *storage.Pool) int64 {
	var n int64
	for _, s := range p.Stats() {
		n += s.Requests
	}
	return n
}

// TestE2E_ClusterRoutingAgainstRealRGW proves claim-based routing end-to-end:
// michael fronts TWO storage clusters (each a one-backend pool over its own TCP
// proxy to the real RGW) and the token's storageCluster claim decides which one
// serves the request. Both proxies reach the same Ceph — what is under test is
// which cluster's pool the traffic went through, which the per-pool request
// counters show exactly.
func TestE2E_ClusterRoutingAgainstRealRGW(t *testing.T) {
	cfg := e2eConfig(t)
	target := targetHostPort(t, cfg.S3Endpoint)

	pa := newTCPProxy(t, target)
	pb := newTCPProxy(t, target)
	defer pa.close()
	defer pb.close()

	defaultRepo := uuid.NewString()
	spiceRepo := uuid.NewString()
	defer cleanupBucket(t, cfg, defaultRepo)
	defer cleanupBucket(t, cfg, spiceRepo)

	defaultPool := newE2EPool(t, cfg, []string{pa.url()}, 2, defaultRepo)
	spicePool := newE2EPool(t, cfg, []string{pb.url()}, 2, spiceRepo)

	srv := httptest.NewServer(handlers.NewClusterServer(map[string]storage.Storage{
		"default": defaultPool,
		"spice":   spicePool,
	}, "default", cfg.JWTPublicKey, cfg.StorageSealKeys, nil).Handler())
	defer srv.Close()
	client := srv.Client()

	// A repository is a bucket, so each cluster gets its own to write into.
	runWorkflow := func(repo, auth string) {
		t.Helper()
		resp := do(t, client, http.MethodPost, srv.URL+"/"+repo+"/?create=true", auth, nil)
		mustStatus(t, resp, http.StatusOK, "create repo")
		resp.Body.Close()

		data := []byte("cluster routing payload for " + repo)
		resp = do(t, client, http.MethodPost, srv.URL+"/"+repo+"/config", auth, data)
		mustStatus(t, resp, http.StatusOK, "save config")
		resp.Body.Close()

		resp = do(t, client, http.MethodGet, srv.URL+"/"+repo+"/config", auth, nil)
		mustStatus(t, resp, http.StatusOK, "get config")
		got, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if !bytes.Equal(got, data) {
			t.Fatalf("config roundtrip mismatch on %s: %q", repo, got)
		}
	}

	// ---- A token with NO claim must be served by the default cluster ----
	beforeDefault, beforeSpice := totalRequests(defaultPool), totalRequests(spicePool)
	runWorkflow(defaultRepo, e2eJWT(t, defaultRepo, false))
	if totalRequests(defaultPool) <= beforeDefault {
		t.Fatal("a token with no storageCluster claim did not reach the default cluster")
	}
	if got := totalRequests(spicePool); got != beforeSpice {
		t.Fatalf("a token with no claim leaked %d requests to the non-default cluster", got-beforeSpice)
	}
	t.Log("legacy (claimless) token routed to the default cluster")

	// ---- A token claiming "spice" must be served by that cluster ----
	beforeDefault, beforeSpice = totalRequests(defaultPool), totalRequests(spicePool)
	runWorkflow(spiceRepo, e2eJWTForCluster(t, spiceRepo, false, "spice"))
	if totalRequests(spicePool) <= beforeSpice {
		t.Fatal("a token claiming spice did not reach the spice cluster")
	}
	if got := totalRequests(defaultPool); got != beforeDefault {
		t.Fatalf("a token claiming spice leaked %d requests to the default cluster", got-beforeDefault)
	}
	t.Log("storageCluster=spice routed to the spice cluster")

	// ---- A claim naming a cluster michael doesn't front must fail closed ----
	beforeDefault, beforeSpice = totalRequests(defaultPool), totalRequests(spicePool)
	unknown := e2eJWTForCluster(t, defaultRepo, false, "sietch")
	resp := do(t, client, http.MethodGet, srv.URL+"/"+defaultRepo+"/config", unknown, nil)
	mustStatus(t, resp, http.StatusBadRequest, "unknown cluster")
	resp.Body.Close()
	if totalRequests(defaultPool) != beforeDefault || totalRequests(spicePool) != beforeSpice {
		t.Fatal("a request for an unknown cluster reached a real cluster")
	}
	t.Log("unknown storageCluster rejected with 400 and no backend traffic")

	// ---- cleanup (buckets removed by the deferred cleanups) ----
	for repo, auth := range map[string]string{
		defaultRepo: e2eJWT(t, defaultRepo, false),
		spiceRepo:   e2eJWTForCluster(t, spiceRepo, false, "spice"),
	} {
		resp := do(t, client, http.MethodDelete, srv.URL+"/"+repo+"/config", auth, nil)
		resp.Body.Close()
	}
}
