package proxy

import (
	"context"
	"net/http"
	"net/http/httputil"
	"restic-proxy/internal/client"
	"strings"
	"sync"
	"time"

	"github.com/cornelk/hashmap"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

const refreshTime = 10 * time.Minute

type Handler struct {
	client  client.Client
	reverse *httputil.ReverseProxy

	refreshMutex sync.Mutex
	grants       *hashmap.Map[string, client.Grant]
}

func New(cl client.Client) *Handler {
	grants := hashmap.New[string, client.Grant]()

	handler := &Handler{
		client:  cl,
		reverse: reverseProxy(grants),

		refreshMutex: sync.Mutex{},
		grants:       grants,
	}

	return handler
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	log := zerolog.Ctx(request.Context())

	_, token, ok := request.BasicAuth()
	if !ok || token == "" {
		writer.Header().Set("WWW-Authenticate", `Basic realm="restic"`)
		http.Error(writer, "no credential specified", http.StatusUnauthorized)
		log.Error().Msg("no credential specified")
		return
	}

	path := strings.TrimPrefix(request.URL.Path, "/")
	repositoryId, segments, _ := strings.Cut(path, "/")

	// TODO: embed the repositoryId into the token
	// => this will mean token becomes the grant key again
	// => reverse.go: need to prepend repoId

	grant, err := handler.grant(request.Context(), repositoryId, token)
	if err != nil {
		http.Error(writer, "failed to generated restic URL", http.StatusUnauthorized)
		log.Error().Err(err).Msg("failed to generate restic URL")
		return
	}

	log.Debug().Msg("handled request")
	route := routed{key: repositoryId, grant: grant, path: segments}
	handler.reverse.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), contextKey{}, route)))
}

func (handler *Handler) grant(ctx context.Context, key string, token string) (client.Grant, error) {
	grant, ok := handler.grants.Get(key)
	if ok && time.Until(grant.ExpiresAt) > refreshTime {
		return grant, nil
	}

	// TODO: spawn background goroutine to refresh token

	handler.refreshMutex.Lock()

	// TODO: check if grant appears after unlock

	defer handler.refreshMutex.Unlock()

	grant, err := handler.client.Grant(ctx, token, key)
	if err != nil {
		return client.Grant{}, err
	}

	log.Info().Time("expires_at", grant.ExpiresAt).Msg("Minted a new token")
	handler.grants.Set(key, grant)
	return grant, nil
}
