package main

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"michael/internal/handlers"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

var drainKey, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

const (
	drainUser = "00000000-0000-0000-0000-0000000000d1"
	drainRepo = "00000000-0000-0000-0000-0000000000d2"
	drainBlob = "1111111111111111111111111111111111111111111111111111111111111111"
)

// drainStorage stands in for the S3 backend. PutObject drains the request body
// and then blocks until release is closed, so a test can hold one blob upload
// open across an entire drain the way a slow restic client would.
type drainStorage struct {
	started     chan string
	release     chan struct{}
	releaseOnce sync.Once
	mu          sync.Mutex
	stored      map[string]int
}

func (d *drainStorage) releaseAll() { d.releaseOnce.Do(func() { close(d.release) }) }

func newDrainStorage() *drainStorage {
	return &drainStorage{
		started: make(chan string, 8),
		release: make(chan struct{}),
		stored:  map[string]int{},
	}
}

func (d *drainStorage) PutObject(ctx context.Context, bucket, key string, body io.Reader, _ int64, _ bool, _ string) error {
	n, err := io.Copy(io.Discard, body)
	if err != nil {
		return err
	}
	d.started <- key
	// "locks" blobs return immediately: a test needs some request that completes
	// on its own while another is still pinned open.
	if !strings.HasPrefix(key, "locks/") {
		<-d.release
	}
	d.mu.Lock()
	d.stored[key] = int(n)
	d.mu.Unlock()
	return nil
}

func (d *drainStorage) storedBytes(key string) (int, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	n, ok := d.stored[key]
	return n, ok
}

func (d *drainStorage) CheckBucket(context.Context, string) (bool, error) { return true, nil }
func (d *drainStorage) CreateBucket(context.Context, string) error        { return nil }
func (d *drainStorage) HeadObject(context.Context, string, string) (int64, error) {
	return 0, nil
}
func (d *drainStorage) GetObject(context.Context, string, string, string) (*storage.S3Object, error) {
	return nil, errors.New("not used")
}
func (d *drainStorage) ListObjects(context.Context, string, string, func(storage.BlobInfo) error) error {
	return nil
}
func (d *drainStorage) DeleteObject(context.Context, string, string) error { return nil }

func drainAuthHeader(t *testing.T) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"user":       drainUser,
		"repository": drainRepo,
		"writeOnce":  false,
	})
	signed, err := token.SignedString(drainKey)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("restic:"+signed))
}

// drainHarness is michael's real handler stack on a real TCP listener, reached
// over a real HTTP client — the drain is about socket lifecycle, so httptest's
// in-memory shortcuts would test the wrong thing.
type drainHarness struct {
	store   *drainStorage
	srv     *handlers.Server
	httpSrv *http.Server
	addr    string
	client  *http.Client
}

func newDrainHarness(t *testing.T) *drainHarness {
	t.Helper()
	store := newDrainStorage()
	srv := handlers.NewServer(store, &drainKey.PublicKey, nil)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	httpSrv := &http.Server{Handler: srv.Handler()}
	go func() { _ = httpSrv.Serve(ln) }()

	h := &drainHarness{
		store:   store,
		srv:     srv,
		httpSrv: httpSrv,
		addr:    ln.Addr().String(),
		client:  &http.Client{Transport: &http.Transport{}},
	}
	t.Cleanup(func() {
		store.releaseAll()
		_ = httpSrv.Close()
	})
	return h
}

func (h *drainHarness) url(path string) string { return "http://" + h.addr + path }

func (h *drainHarness) putBlob(t *testing.T, blobType, name, body string) (*http.Response, error) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, h.url("/"+drainRepo+"/"+blobType+"/"+name), strings.NewReader(body))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", drainAuthHeader(t))
	return h.client.Do(req)
}

func (h *drainHarness) readyStatus(t *testing.T) int {
	t.Helper()
	resp, err := h.client.Get(h.url("/readyz"))
	if err != nil {
		t.Fatalf("GET /readyz: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode
}

// The whole point of the two phases: while the drain delay runs the instance is
// unready but fully functional, and only once the listener closes does it stop
// taking connections — with the upload that was already running still finishing.
func TestDrainServesThroughTheDelayThenFinishesInFlight(t *testing.T) {
	h := newDrainHarness(t)
	payload := strings.Repeat("x", 4096)

	if got := h.readyStatus(t); got != http.StatusOK {
		t.Fatalf("ready before drain: got %d, want 200", got)
	}

	uploadDone := make(chan *http.Response, 1)
	uploadErr := make(chan error, 1)
	go func() {
		resp, err := h.putBlob(t, "data", drainBlob, payload)
		if err != nil {
			uploadErr <- err
			return
		}
		uploadDone <- resp
	}()

	select {
	case key := <-h.store.started:
		if key != "data/"+drainBlob {
			t.Fatalf("unexpected in-flight key %q", key)
		}
	case err := <-uploadErr:
		t.Fatalf("upload failed before drain started: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("upload never reached the storage layer")
	}

	drainErr := make(chan error, 1)
	drainStarted := time.Now()
	go func() { drainErr <- drain(h.srv, h.httpSrv, 750*time.Millisecond, 10*time.Second) }()

	// Phase one: unready, but new work is still accepted and served in full.
	waitFor(t, 2*time.Second, "readyz to report draining", func() bool {
		return h.readyStatus(t) == http.StatusServiceUnavailable
	})
	if elapsed := time.Since(drainStarted); elapsed > 700*time.Millisecond {
		t.Fatalf("readiness only flipped after %s — the delay had already elapsed", elapsed)
	}

	lockName := strings.Repeat("a", 64)
	resp, err := h.putBlob(t, "locks", lockName, "lock")
	if err != nil {
		t.Fatalf("request during drain delay failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("request during drain delay: got %d, want 200", resp.StatusCode)
	}
	<-h.store.started

	// Phase two: the listener closes, so nothing new can connect.
	waitFor(t, 5*time.Second, "listener to stop accepting", func() bool {
		c, err := net.DialTimeout("tcp", h.addr, 500*time.Millisecond)
		if err != nil {
			return true
		}
		_ = c.Close()
		return false
	})

	select {
	case <-uploadDone:
		t.Fatal("the in-flight upload completed before it was released")
	default:
	}

	h.store.releaseAll()

	select {
	case resp := <-uploadDone:
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("in-flight upload finished with %d, want 200", resp.StatusCode)
		}
	case err := <-uploadErr:
		t.Fatalf("in-flight upload was cut off by the shutdown: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("in-flight upload never completed")
	}

	if n, ok := h.store.storedBytes("data/" + drainBlob); !ok || n != len(payload) {
		t.Fatalf("blob stored as %d bytes (present=%v), want %d", n, ok, len(payload))
	}

	select {
	case err := <-drainErr:
		if err != nil {
			t.Fatalf("drain returned %v, want nil once the upload finished", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("drain never returned after the upload finished")
	}
}

// A pooled-but-idle keep-alive is what restic leaves behind between blobs. It
// must not hold the pod open, and the server has to close it rather than leave
// restic holding a socket it will never answer again. Driven over a raw
// connection so the assertion is about the server's FIN and not about whatever
// http.Transport decides to do with its pool.
func TestDrainClosesIdleKeepAlives(t *testing.T) {
	h := newDrainHarness(t)

	conn, err := net.Dial("tcp", h.addr)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer func() { _ = conn.Close() }()

	body := "lock"
	req := "POST /" + drainRepo + "/locks/" + strings.Repeat("b", 64) + " HTTP/1.1\r\n" +
		"Host: " + h.addr + "\r\n" +
		"Authorization: " + drainAuthHeader(t) + "\r\n" +
		"Content-Length: " + strconv.Itoa(len(body)) + "\r\n\r\n" + body
	if _, err := conn.Write([]byte(req)); err != nil {
		t.Fatalf("write request: %v", err)
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("warm-up request: got %d, want 200", resp.StatusCode)
	}
	if resp.Close {
		t.Fatal("server closed the connection before the drain; the test proves nothing")
	}
	<-h.store.started

	started := time.Now()
	if err := drain(h.srv, h.httpSrv, 0, 10*time.Second); err != nil {
		t.Fatalf("drain returned %v, want nil with only idle connections open", err)
	}
	if elapsed := time.Since(started); elapsed > 3*time.Second {
		t.Fatalf("drain waited %s on an idle keep-alive", elapsed)
	}

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := br.Read(make([]byte, 1)); !errors.Is(err, io.EOF) {
		t.Fatalf("idle keep-alive read returned %v, want EOF (server should have closed it)", err)
	}
}

// The shutdown timeout is a ceiling, not a promise: a transfer that outlives it
// is reported rather than waited on forever, so the kubelet's grace period is
// never what ends the process.
func TestDrainReportsRequestsPastTheDeadline(t *testing.T) {
	h := newDrainHarness(t)

	go func() { _, _ = h.putBlob(t, "data", drainBlob, "payload") }()
	<-h.store.started

	err := drain(h.srv, h.httpSrv, 0, 250*time.Millisecond)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("drain returned %v, want context.DeadlineExceeded", err)
	}
}

func waitFor(t *testing.T, limit time.Duration, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out after %s waiting for %s", limit, what)
}
