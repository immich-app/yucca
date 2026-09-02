package proxy

import (
	"context"
	"errors"
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
const denialTime = time.Minute

type denial struct {
	err       error
	expiresAt time.Time
}

type Handler struct {
	client  client.Client
	reverse *httputil.ReverseProxy

	grants  *hashmap.Map[string, client.Grant]
	denials *hashmap.Map[string, denial]
	minting singleflight.Group
}

func New(cl client.Client) *Handler {
	grants := hashmap.New[string, client.Grant]()

	handler := &Handler{
		client:  cl,
		grants:  grants,
		denials: hashmap.New[string, denial](),

		reverse: reverseProxy(grants),
	}

	return handler
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	log := zerolog.Ctx(request.Context())

	repositoryId, sessionToken, ok := request.BasicAuth()
	if !ok || repositoryId == "" || sessionToken == "" {
		writer.Header().Set("WWW-Authenticate", `Basic realm="restic"`)
		http.Error(writer, "no credential specified", http.StatusUnauthorized)
		log.Error().Msg("no credential specified")
		return
	}

	path := strings.TrimPrefix(request.URL.Path, "/")

	grant, err := handler.grant(repositoryId, sessionToken)
	if err != nil {
		status, message := describe(err)
		http.Error(writer, message, status)
		log.Error().Err(err).Int("status", status).Msg("failed to generate restic URL")
		return
	}

	log.Debug().Msg("handled request")
	route := routed{key: repositoryId, grant: grant, path: path}
	handler.reverse.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), contextKey{}, route)))
}

func describe(err error) (int, string) {
	var status *client.StatusError
	if !errors.As(err, &status) {
		return http.StatusServiceUnavailable, "backups unreachable"
	}

	switch status.Code {
	case http.StatusUnauthorized, http.StatusForbidden:
		return http.StatusUnauthorized, "access token rejected"
	case http.StatusNotFound:
		return http.StatusNotFound, "no such repository"
	default:
		return http.StatusServiceUnavailable, "backups unavailable"
	}
}

func (handler *Handler) grant(key string, sessionToken string) (client.Grant, error) {
	grant, ok := handler.grants.Get(key)

	if grant.SessionToken != sessionToken {
		return handler.mint(key, sessionToken)
	}

	if ok && time.Until(grant.ExpiresAt) > refreshTime {
		return grant, nil
	}

	if ok && time.Until(grant.ExpiresAt) > 0 {
		handler.refresh(key, sessionToken)
		return grant, nil
	}

	return handler.mint(key, sessionToken)
}

func (handler *Handler) refresh(key string, token string) {
	go func() {
		_, err := handler.mint(key, token)
		if err != nil {
			log.Error().Err(err).Msg("failed to refresh grant")
		}
	}()
}

func (handler *Handler) mint(key string, sessionToken string) (client.Grant, error) {
	reference := sessionToken + key

	denied, ok := handler.denials.Get(reference)
	if ok && time.Now().Before(denied.expiresAt) {
		return client.Grant{}, denied.err
	}

	value, err, _ := handler.minting.Do(reference, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), refreshTimeout)
		defer cancel()

		grant, err := handler.client.Grant(ctx, sessionToken, key)
		if err != nil {
			handler.deny(reference, err)
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

func (handler *Handler) deny(reference string, err error) {
	status, _ := describe(err)
	if status == http.StatusServiceUnavailable {
		return
	}

	expiresAt := time.Now().Add(denialTime)
	log.Warn().Time("expires_at", expiresAt).Msg("Token minting temporarily denied")
	handler.denials.Set(reference, denial{err: err, expiresAt: expiresAt})
}
