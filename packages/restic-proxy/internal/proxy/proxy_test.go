package proxy

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"net/url"

	"restic-proxy/internal/client"
	"restic-proxy/internal/meta"

	"github.com/rs/zerolog"
)

const (
	testToken      = "user-access-token"
	testRepository = "repo-1"
)

// The proxy logs a line per forwarded request at debug. Run at the shipped
// default so neither tests nor benchmarks measure the logger.
func TestMain(m *testing.M) {
	zerolog.SetGlobalLevel(zerolog.InfoLevel)
	os.Exit(m.Run())
}

func makeJWT(t *testing.T, claims map[string]any) string {
	t.Helper()
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}
	return "header." + base64.RawURLEncoding.EncodeToString(payload) + ".signature"
}

type backendRequest struct {
	path     string
	user     string
	password string
}

// newBackend stands in for michael: it records what the proxy forwarded and
// answers with status.
func newBackend(t *testing.T, status int, seen *backendRequest) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if seen != nil {
			user, password, _ := request.BasicAuth()
			*seen = backendRequest{path: request.URL.Path, user: user, password: password}
		}
		writer.WriteHeader(status)
		fmt.Fprint(writer, "backend-body")
	}))
	t.Cleanup(server.Close)
	return server
}

// newAPI stands in for yucca-api, handing out grants that point at backendURL.
func newAPI(t *testing.T, backendURL string, status int, mints *atomic.Int64) client.Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		if mints != nil {
			mints.Add(1)
		}
		if status != http.StatusCreated {
			writer.WriteHeader(status)
			return
		}

		token := makeJWT(t, map[string]any{"exp": time.Now().Add(time.Hour).Unix()})
		writer.WriteHeader(http.StatusCreated)
		fmt.Fprintf(writer, `{"url":"rest:%s://restic:%s@%s/%s"}`, "http", token, hostOf(t, backendURL), testRepository)
	}))
	t.Cleanup(server.Close)
	return client.New(meta.Api{Url: server.URL})
}

func hostOf(t *testing.T, rawURL string) string {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse %s: %v", rawURL, err)
	}
	return parsed.Host
}

func newProxy(t *testing.T, cl client.Client) (*Handler, *httptest.Server) {
	t.Helper()
	handler := New(cl)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return handler, server
}

func do(t *testing.T, server *httptest.Server, path, repository, token string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, server.URL+path, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if token != "" {
		request.SetBasicAuth(repository, token)
	}

	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	t.Cleanup(func() { response.Body.Close() })
	return response
}

func TestServeHTTP_NoCredential(t *testing.T) {
	cases := []struct {
		name       string
		repository string
		token      string
		basicAuth  bool
	}{
		{name: "no authorization header", repository: "", token: "", basicAuth: false},
		{name: "no repository", repository: "", token: testToken, basicAuth: true},
		{name: "no token", repository: testRepository, token: "", basicAuth: true},
		{name: "neither", repository: "", token: "", basicAuth: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var mints atomic.Int64
			_, proxy := newProxy(t, newAPI(t, "http://unused.example", http.StatusCreated, &mints))

			request, err := http.NewRequest(http.MethodGet, proxy.URL+"/config", nil)
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			if tc.basicAuth {
				request.SetBasicAuth(tc.repository, tc.token)
			}

			response, err := proxy.Client().Do(request)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer response.Body.Close()

			if response.StatusCode != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", response.StatusCode)
			}
			if got := response.Header.Get("WWW-Authenticate"); got != `Basic realm="restic"` {
				t.Errorf("expected a basic-auth challenge, got %q", got)
			}
			if mints.Load() != 0 {
				t.Errorf("expected no mint for a rejected credential, got %d", mints.Load())
			}
		})
	}
}

func TestServeHTTP_ForwardsToBackend(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	_, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))

	response := do(t, proxy, "/data/abc123", testRepository, testToken)

	if response.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", response.StatusCode)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != "backend-body" {
		t.Errorf("expected the backend body to pass through, got %q", body)
	}
	if seen.path != "/"+testRepository+"/data/abc123" {
		t.Errorf("unexpected forwarded path: %s", seen.path)
	}
	if seen.user != "restic" {
		t.Errorf("expected the backend user restic, got %s", seen.user)
	}
	if seen.password == testToken {
		t.Error("expected the minted JWT to replace the user's access token")
	}
}

func TestServeHTTP_RepositoryRoot(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	_, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))

	do(t, proxy, "/", testRepository, testToken)

	if seen.path != "/"+testRepository+"/" {
		t.Errorf("unexpected forwarded path: %s", seen.path)
	}
}

func TestServeHTTP_RepositoryComesFromCredential(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	_, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, nil))

	// A leading segment that looks like a repository is part of the path now:
	// only the credential names the repository.
	do(t, proxy, "/repo-x/config", testRepository, testToken)

	if seen.path != "/"+testRepository+"/repo-x/config" {
		t.Errorf("unexpected forwarded path: %s", seen.path)
	}
}

func TestServeHTTP_MintFailureStatuses(t *testing.T) {
	cases := []struct {
		name   string
		api    int
		want   int
		reason string
	}{
		{name: "token rejected", api: http.StatusUnauthorized, want: http.StatusUnauthorized},
		{name: "token forbidden", api: http.StatusForbidden, want: http.StatusUnauthorized},
		{name: "unknown repository", api: http.StatusNotFound, want: http.StatusNotFound},
		{name: "api broken", api: http.StatusInternalServerError, want: http.StatusServiceUnavailable},
		{name: "api shedding", api: http.StatusBadGateway, want: http.StatusServiceUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, proxy := newProxy(t, newAPI(t, "http://unused.example", tc.api, nil))

			response := do(t, proxy, "/config", testRepository, testToken)

			if response.StatusCode != tc.want {
				t.Errorf("expected %d, got %d", tc.want, response.StatusCode)
			}
		})
	}
}

func TestServeHTTP_ApiUnreachableIsRetryable(t *testing.T) {
	_, proxy := newProxy(t, client.New(meta.Api{Url: "http://127.0.0.1:1"}))

	response := do(t, proxy, "/config", testRepository, testToken)

	// 503 is retried by restic; 401 would abort the backup permanently.
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", response.StatusCode)
	}
}

func TestGrant_ServesCachedGrant(t *testing.T) {
	var mints atomic.Int64
	backend := newBackend(t, http.StatusOK, nil)
	handler, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, &mints))

	handler.grants.Set(testRepository, client.Grant{
		Scheme:    "http",
		Host:      hostOf(t, backend.URL),
		Path:      "/" + testRepository,
		Password:  "cached-jwt",
		ExpiresAt: time.Now().Add(time.Hour),
	})

	do(t, proxy, "/config", testRepository, testToken)

	if mints.Load() != 0 {
		t.Errorf("expected no mint for a fresh cached grant, got %d", mints.Load())
	}
}

func TestGrant_MintsWhenExpired(t *testing.T) {
	var mints atomic.Int64
	backend := newBackend(t, http.StatusOK, nil)
	handler, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, &mints))

	handler.grants.Set(testRepository, client.Grant{
		Scheme:    "http",
		Host:      hostOf(t, backend.URL),
		Path:      "/" + testRepository,
		Password:  "stale-jwt",
		ExpiresAt: time.Now().Add(-time.Minute),
	})

	do(t, proxy, "/config", testRepository, testToken)

	if mints.Load() != 1 {
		t.Errorf("expected one mint for an expired grant, got %d", mints.Load())
	}
}

func TestGrant_SeparateGrantPerRepository(t *testing.T) {
	var mints atomic.Int64
	backend := newBackend(t, http.StatusOK, nil)
	_, proxy := newProxy(t, newAPI(t, backend.URL, http.StatusCreated, &mints))

	do(t, proxy, "/config", "repo-a", testToken)
	do(t, proxy, "/config", "repo-b", testToken)

	if mints.Load() != 2 {
		t.Errorf("expected a mint per repository, got %d", mints.Load())
	}
}

func TestDescribe(t *testing.T) {
	cases := []struct {
		name    string
		err     error
		want    int
		message string
	}{
		{name: "transport failure", err: errors.New("dial tcp: refused"), want: http.StatusServiceUnavailable, message: "backups unreachable"},
		{name: "unauthorized", err: &client.StatusError{Code: http.StatusUnauthorized}, want: http.StatusUnauthorized, message: "access token rejected"},
		{name: "forbidden", err: &client.StatusError{Code: http.StatusForbidden}, want: http.StatusUnauthorized, message: "access token rejected"},
		{name: "not found", err: &client.StatusError{Code: http.StatusNotFound}, want: http.StatusNotFound, message: "no such repository"},
		{name: "server error", err: &client.StatusError{Code: http.StatusInternalServerError}, want: http.StatusServiceUnavailable, message: "backups unavailable"},
		{name: "wrapped", err: fmt.Errorf("minting: %w", &client.StatusError{Code: http.StatusNotFound}), want: http.StatusNotFound, message: "no such repository"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, message := describe(tc.err)

			if status != tc.want {
				t.Errorf("expected status %d, got %d", tc.want, status)
			}
			if message != tc.message {
				t.Errorf("expected message %q, got %q", tc.message, message)
			}
		})
	}
}

// newSignallingAPI reports each mint on the returned channel so a test can wait
// for a background refresh instead of sleeping.
func newSignallingAPI(t *testing.T, backendURL string, status int) (client.Client, chan struct{}) {
	t.Helper()
	minted := make(chan struct{}, 4)

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		defer func() { minted <- struct{}{} }()

		if status != http.StatusCreated {
			writer.WriteHeader(status)
			return
		}

		token := makeJWT(t, map[string]any{"exp": time.Now().Add(time.Hour).Unix()})
		writer.WriteHeader(http.StatusCreated)
		fmt.Fprintf(writer, `{"url":"rest:http://restic:%s@%s/%s"}`, token, hostOf(t, backendURL), testRepository)
	}))
	t.Cleanup(server.Close)

	return client.New(meta.Api{Url: server.URL}), minted
}

func awaitMint(t *testing.T, minted chan struct{}) {
	t.Helper()
	select {
	case <-minted:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for a background mint")
	}
}

// awaitGrant waits for the stored grant to satisfy want. The API answering is
// not enough: the refresh stores the grant after the response is read, so the
// mint signal alone races the write.
func awaitGrant(t *testing.T, handler *Handler, want func(client.Grant) bool) client.Grant {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if grant, ok := handler.grants.Get(testRepository); ok && want(grant) {
			return grant
		}
		time.Sleep(time.Millisecond)
	}

	t.Fatal("timed out waiting for the refreshed grant")
	return client.Grant{}
}

func TestGrant_RefreshesInBackground(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	cl, minted := newSignallingAPI(t, backend.URL, http.StatusCreated)
	handler, proxy := newProxy(t, cl)

	// Inside the refresh margin but still valid: the request must be served
	// from cache while the replacement is minted behind it.
	stale := client.Grant{
		Scheme:    "http",
		Host:      hostOf(t, backend.URL),
		Path:      "/" + testRepository,
		Password:  "cached-jwt",
		ExpiresAt: time.Now().Add(time.Minute),
	}
	handler.grants.Set(testRepository, stale)

	response := do(t, proxy, "/config", testRepository, testToken)

	if response.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", response.StatusCode)
	}
	if seen.password != "cached-jwt" {
		t.Errorf("expected the cached grant to serve the request, got %q", seen.password)
	}

	awaitMint(t, minted)

	refreshed := awaitGrant(t, handler, func(grant client.Grant) bool {
		return grant.Password != stale.Password
	})
	if !refreshed.ExpiresAt.After(stale.ExpiresAt) {
		t.Error("expected the refreshed grant to expire later than the stale one")
	}
}

func TestGrant_RefreshFailureKeepsServing(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	cl, minted := newSignallingAPI(t, backend.URL, http.StatusInternalServerError)
	handler, proxy := newProxy(t, cl)

	stale := client.Grant{
		Scheme:    "http",
		Host:      hostOf(t, backend.URL),
		Path:      "/" + testRepository,
		Password:  "cached-jwt",
		ExpiresAt: time.Now().Add(time.Minute),
	}
	handler.grants.Set(testRepository, stale)

	response := do(t, proxy, "/config", testRepository, testToken)

	if response.StatusCode != http.StatusOK {
		t.Errorf("expected the cached grant to serve the request, got %d", response.StatusCode)
	}

	awaitMint(t, minted)

	kept, ok := handler.grants.Get(testRepository)
	if !ok {
		t.Fatal("expected the grant to survive a failed refresh")
	}
	if kept.Password != "cached-jwt" {
		t.Errorf("expected the cached grant to be kept, got %q", kept.Password)
	}
}
