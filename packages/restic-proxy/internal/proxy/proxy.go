package proxy

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"restic-proxy/internal/client"
	"strings"
	"sync/atomic"
	"time"
	"uuid"

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

	sessionToken        string
	smartAutoRepository bool

	grants           *hashmap.Map[string, client.Grant]
	denials          *hashmap.Map[string, denial]
	autoRepositories *hashmap.Map[string, string]
	minting          singleflight.Group

	throttle atomic.Pointer[throttle]
}

func New(cl client.Client, sessionToken string, smartAutoRepository bool) *Handler {
	grants := hashmap.New[string, client.Grant]()

	handler := &Handler{
		client:  cl,
		reverse: reverseProxy(grants),

		sessionToken:        sessionToken,
		smartAutoRepository: smartAutoRepository,

		grants:           grants,
		denials:          hashmap.New[string, denial](),
		autoRepositories: hashmap.New[string, string](),
	}

	return handler
}

func (handler *Handler) Throttle(bytesPerSec int, quietHours string) error {
	limit, err := newThrottle(bytesPerSec, quietHours)
	if err != nil {
		return err
	}

	handler.throttle.Store(limit)
	return nil
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()
	log := zerolog.Ctx(ctx)

	repositoryId, sessionToken, ok := request.BasicAuth()
	if sessionToken == "" && handler.sessionToken != "" {
		sessionToken = handler.sessionToken
	}

	if !ok || repositoryId == "" || sessionToken == "" {
		writer.Header().Set("WWW-Authenticate", `Basic realm="restic"`)
		http.Error(writer, "no credential specified", http.StatusUnauthorized)
		log.Error().Msg("no credential specified")
		return
	}

	requested := repositoryId
	_, err := uuid.Parse(repositoryId)
	if err != nil && !handler.smartAutoRepository {
		http.Error(writer, "invalid repository ID and smart auto repository is not enabled", http.StatusBadRequest)
		log.Error().Msg("invalid repository ID and smart auto repository is not enabled")
		return
	}

	if err != nil {
		repositoryId, err = handler.smartResolve(repositoryId, sessionToken)
		if err != nil {
			status, message := describe(err)
			http.Error(writer, message, status)
			log.Error().Err(err).Int("status", status).Msg("failed to resolve smart auto repository")
			return
		}
	}

	path := strings.TrimPrefix(request.URL.Path, "/")

	grant, err := handler.grant(repositoryId, sessionToken)
	if err != nil {
		status, message := describe(err)
		if status == http.StatusNotFound {
			handler.autoRepositories.Del(sessionToken + requested)
		}

		http.Error(writer, message, status)
		log.Error().Err(err).Int("status", status).Msg("failed to generate restic URL")
		return
	}

	log.Debug().Msg("handled request")
	request.Body = pace(ctx, request.Body, &handler.throttle)

	route := routed{key: repositoryId, grant: grant, path: path}
	handler.reverse.ServeHTTP(writer, request.WithContext(context.WithValue(ctx, contextKey{}, route)))
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

func (handler *Handler) smartResolve(name string, sessionToken string) (string, error) {
	reference := sessionToken + name

	repositoryId, ok := handler.autoRepositories.Get(reference)
	if ok {
		return repositoryId, nil
	}

	value, err, _ := handler.minting.Do("resolve:"+reference, func() (any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), refreshTimeout)
		defer cancel()

		repositories, err := handler.client.ListRepositories(ctx, sessionToken)
		if err != nil {
			return "", fmt.Errorf("failed to list repositories for smart auto repository: %w", err)
		}

		for _, repository := range repositories {
			if repository.Name == name {
				return repository.Id, nil
			}
		}

		repository, err := handler.client.CreateRepository(ctx, sessionToken, name, false)
		if err != nil {
			return "", fmt.Errorf("failed to create repository for smart auto repository: %w", err)
		}

		return repository.Id, nil
	})

	if err != nil {
		return "", err
	}

	handler.autoRepositories.Set(reference, value.(string))
	return value.(string), nil
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
