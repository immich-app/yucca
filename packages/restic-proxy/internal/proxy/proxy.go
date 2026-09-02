package proxy

import (
	"context"
	"net/http"
	"net/http/httputil"
	"restic-proxy/internal/client"
	"strings"
	"time"

	"github.com/cornelk/hashmap"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/singleflight"
)

const refreshTime = 10 * time.Minute
const refreshTimeout = 30 * time.Second

type Handler struct {
	client  client.Client
	reverse *httputil.ReverseProxy

	grants  *hashmap.Map[string, client.Grant]
	minting singleflight.Group
}

func New(cl client.Client) *Handler {
	grants := hashmap.New[string, client.Grant]()

	handler := &Handler{
		client: cl,
		grants: grants,

		reverse: reverseProxy(grants),
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

	grant, err := handler.grant(repositoryId, token)
	if err != nil {
		http.Error(writer, "failed to generated restic URL", http.StatusUnauthorized)
		log.Error().Err(err).Msg("failed to generate restic URL")
		return
	}

	log.Debug().Msg("handled request")
	route := routed{key: repositoryId, grant: grant, path: segments}
	handler.reverse.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), contextKey{}, route)))
}

func (handler *Handler) grant(key string, token string) (client.Grant, error) {
	grant, ok := handler.grants.Get(key)
	if ok && time.Until(grant.ExpiresAt) > refreshTime {
		return grant, nil
	}

	if ok && time.Until(grant.ExpiresAt) > 0 {
		handler.refresh(key, token)
		return grant, nil
	}

	return handler.mint(key, token)
}

func (handler *Handler) refresh(key string, token string) {
	go func() {
		_, err := handler.mint(key, token)
		if err != nil {
			log.Error().Err(err).Msg("failed to refresh grant")
		}
	}()
}

func (handler *Handler) mint(key string, token string) (client.Grant, error) {
	value, err, _ := handler.minting.Do(key, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), refreshTimeout)
		defer cancel()

		grant, err := handler.client.Grant(ctx, token, key)
		if err != nil {
			return client.Grant{}, err
		}

		log.Info().Time("expires_at", grant.ExpiresAt).Msg("Minted a new token")
		handler.grants.Set(key, grant)
		return grant, nil
	})

	if err != nil {
		return client.Grant{}, err
	}

	return value.(client.Grant), nil
}
