package proxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"restic-proxy/internal/client"
	"restic-proxy/internal/meta"
)

type fakeAPI struct {
	mutex        sync.Mutex
	repositories map[string]string
	lists        atomic.Int64
	creates      atomic.Int64
	tokens       []string
}

func newFakeAPI(t *testing.T, backendURL string, repositories map[string]string) (*fakeAPI, client.Client) {
	t.Helper()
	api := &fakeAPI{repositories: repositories}

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		cookie, err := request.Cookie(client.AccessTokenCookie)
		if err == nil {
			api.mutex.Lock()
			api.tokens = append(api.tokens, cookie.Value)
			api.mutex.Unlock()
		}

		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/repository":
			api.lists.Add(1)
			api.list(writer)
		case request.Method == http.MethodPost && request.URL.Path == "/repository":
			api.creates.Add(1)
			api.create(writer, request)
		case request.Method == http.MethodPost && strings.HasSuffix(request.URL.Path, "/restic"):
			api.grant(t, writer, request, backendURL)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)

	return api, client.New(meta.Api{Url: server.URL})
}

func (api *fakeAPI) create(writer http.ResponseWriter, request *http.Request) {
	time.Sleep(20 * time.Millisecond)

	var body struct {
		Name string `json:"name"`
	}

	_ = json.NewDecoder(request.Body).Decode(&body)

	api.mutex.Lock()
	id := fmt.Sprintf("00000000-0000-4000-8000-%012d", len(api.repositories)+1)
	api.repositories[body.Name] = id
	api.mutex.Unlock()

	writer.WriteHeader(http.StatusCreated)
	fmt.Fprintf(writer, `{"repository":{"id":%q,"name":%q,"worm":false}}`, id, body.Name)
}

func (api *fakeAPI) list(writer http.ResponseWriter) {
	api.mutex.Lock()
	defer api.mutex.Unlock()

	entries := []string{}
	for name, id := range api.repositories {
		entries = append(entries, fmt.Sprintf(`{"id":%q,"name":%q,"worm":false}`, id, name))
	}

	writer.WriteHeader(http.StatusOK)
	fmt.Fprintf(writer, `{"repositories":[%s]}`, strings.Join(entries, ","))
}

func (api *fakeAPI) delete(name string) {
	api.mutex.Lock()
	defer api.mutex.Unlock()
	delete(api.repositories, name)
}

func (api *fakeAPI) grant(t *testing.T, writer http.ResponseWriter, request *http.Request, backendURL string) {
	id := strings.TrimSuffix(strings.TrimPrefix(request.URL.Path, "/repository/"), "/restic")

	api.mutex.Lock()
	known := false
	for _, existing := range api.repositories {
		known = known || existing == id
	}

	api.mutex.Unlock()

	if !known {
		writer.WriteHeader(http.StatusNotFound)
		return
	}

	token := makeJWT(t, map[string]any{"exp": time.Now().Add(time.Hour).Unix()})
	writer.WriteHeader(http.StatusCreated)
	fmt.Fprintf(writer, `{"url":"rest:http://restic:%s@%s/%s"}`, token, hostOf(t, backendURL), id)
}

func newSmartProxy(t *testing.T, cl client.Client, sessionToken string, smart bool) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(New(cl, sessionToken, smart))
	t.Cleanup(server.Close)
	return server
}

func TestSmart_ExistingNameResolvesToItsRepository(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{"photos": testRepository})
	proxy := newSmartProxy(t, cl, "", true)

	response := do(t, proxy, "/config", "photos", testToken)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	if seen.path != "/"+testRepository+"/config" {
		t.Errorf("expected the backend path of the existing repository, got %s", seen.path)
	}

	if api.creates.Load() != 0 {
		t.Errorf("expected no repository to be created, got %d", api.creates.Load())
	}
}

func TestSmart_MissingNameIsCreatedOnceUnderConcurrency(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{})
	proxy := newSmartProxy(t, cl, "", true)

	var group sync.WaitGroup
	statuses := make(chan int, 10)
	for range 10 {
		group.Go(func() {
			statuses <- do(t, proxy, "/config", "documents", testToken).StatusCode
		})
	}

	group.Wait()
	close(statuses)

	for status := range statuses {
		if status != http.StatusOK {
			t.Errorf("expected 200, got %d", status)
		}
	}

	if api.creates.Load() != 1 {
		t.Errorf("expected exactly one repository to be created, got %d", api.creates.Load())
	}
}

func TestSmart_ResolvedNameIsCached(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{"photos": testRepository})
	proxy := newSmartProxy(t, cl, "", true)

	do(t, proxy, "/config", "photos", testToken)
	do(t, proxy, "/config", "photos", testToken)
	do(t, proxy, "/keys/abc", "photos", testToken)

	if api.lists.Load() != 1 {
		t.Errorf("expected one list call, got %d", api.lists.Load())
	}
}

func TestSmart_DeletedRepositoryIsRecreated(t *testing.T) {
	var seen backendRequest
	backend := newBackend(t, http.StatusOK, &seen)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{"photos": testRepository})
	proxy := newSmartProxy(t, cl, "", true)

	do(t, proxy, "/config", "photos", testToken)
	api.delete("photos")

	handler := proxy.Config.Handler.(*Handler)
	handler.grants.Del(testRepository)

	failed := do(t, proxy, "/config", "photos", testToken)
	if failed.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for the deleted repository, got %d", failed.StatusCode)
	}

	recreated := do(t, proxy, "/config", "photos", testToken)
	if recreated.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 after recreation, got %d", recreated.StatusCode)
	}

	if api.creates.Load() != 1 {
		t.Errorf("expected the repository to be recreated once, got %d", api.creates.Load())
	}

	if seen.path == "/"+testRepository+"/config" {
		t.Error("expected the backend path of the recreated repository")
	}
}

func TestSmart_NameRejectedWhenDisabled(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{"photos": testRepository})
	proxy := newSmartProxy(t, cl, "", false)

	response := do(t, proxy, "/config", "photos", testToken)

	if response.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", response.StatusCode)
	}

	if api.lists.Load() != 0 {
		t.Errorf("expected no API call, got %d list calls", api.lists.Load())
	}
}

func TestSmart_DefaultSessionTokenFillsEmptyPassword(t *testing.T) {
	backend := newBackend(t, http.StatusOK, nil)
	api, cl := newFakeAPI(t, backend.URL, map[string]string{"photos": testRepository})
	proxy := newSmartProxy(t, cl, "configured-token", true)

	request, err := http.NewRequest(http.MethodGet, proxy.URL+"/config", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	request.SetBasicAuth("photos", "")

	response, err := proxy.Client().Do(request)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}

	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, response.Body)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}

	for _, token := range api.tokens {
		if token != "configured-token" {
			t.Errorf("expected every API call to use the configured token, got %q", token)
		}
	}
}
