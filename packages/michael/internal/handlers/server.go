package handlers

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"net/http"
	"time"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/revocation"
	"michael/internal/storage"

	"michael/internal/httputil"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
)

type Server struct {
	Storage      storage.Storage
	JWTPublicKey *ecdsa.PublicKey
	Metrics      *metrics.Metrics
	// Optional restic-token validity checks (nil = disabled). A present Redis
	// marker means valid; an absent one means revoked/unknown → denied. A Redis
	// outage honors previously-valid tokens for a bounded grace window, then denies.
	Validator revocation.Validator
	// Connection types whose tokens are validity-checked (the `connection` JWT
	// claim). A token whose type is absent from this set is skipped — non-revocable
	// types (e.g. immich) keep no marker, so checking them would wrongly deny.
	RevocableTypes map[string]bool
}

func NewServer(s storage.Storage, jwtPublicKey *ecdsa.PublicKey, m *metrics.Metrics) *Server {
	return &Server{
		Storage:      s,
		JWTPublicKey: jwtPublicKey,
		Metrics:      m,
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(hlog.NewHandler(log.Logger))
	r.Use(hlog.RequestIDHandler("request_id", "X-Request-Id"))
	r.Use(hlog.RemoteAddrHandler("remote_ip"))
	r.Use(hlog.UserAgentHandler("user_agent"))
	r.Use(hlog.AccessHandler(func(r *http.Request, status, size int, duration time.Duration) {
		route := chi.RouteContext(r.Context()).RoutePattern()
		if route == "" {
			route = r.URL.Path
		}
		hlog.FromRequest(r).Info().
			Int("status", status).
			Int("size", size).
			Dur("duration", duration).
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Msgf("%s %s (%d)", r.Method, route, status)
	}))
	r.Use(chimw.Recoverer)
	if s.Metrics != nil {
		r.Use(metrics.Middleware(s.Metrics))
	}

	var onLookup func(hit bool)
	if s.Metrics != nil {
		onLookup = func(hit bool) {
			if hit {
				s.Metrics.AuthCacheHits.Add(context.Background(), 1)
			} else {
				s.Metrics.AuthCacheMisses.Add(context.Background(), 1)
			}
		}
	}
	verifier := auth.NewVerifier(s.JWTPublicKey, onLookup)

	r.Route("/{path}", func(r chi.Router) {
		r.Use(verifier.Middleware())
		// Runs on every request, after auth: the verifier caches whole tokens,
		// so a revoked-but-cached token would otherwise never be re-checked.
		r.Use(s.revocationMiddleware)
		r.Use(authLogContext)
		if s.Metrics != nil {
			r.Use(metrics.BlobMiddleware(s.Metrics))
		}

		r.Post("/", s.createRepository)
		r.Delete("/", s.deleteRepository)

		r.Head("/config", s.checkConfig)
		r.Get("/config", s.getConfig)
		r.Post("/config", s.saveConfig)
		r.Delete("/config", s.deleteConfig)

		r.Group(func(r chi.Router) {
			r.Use(validateBlobType)
			r.Get("/{type}", s.listBlobs)
			r.Get("/{type}/", s.listBlobs)
		})
		r.Group(func(r chi.Router) {
			r.Use(validateBlobType)
			r.Use(validateBlobName)
			r.Head("/{type}/{name}", s.checkBlob)
			r.Get("/{type}/{name}", s.getBlob)
			r.Post("/{type}/{name}", s.saveBlob)
			r.Delete("/{type}/{name}", s.deleteBlob)
		})
	})

	return r
}

func (s *Server) countRevocation(ctx context.Context, outcome string) {
	if s.Metrics != nil {
		s.Metrics.RevocationChecks.Add(ctx, 1, metrics.RevocationCheckOption(outcome))
	}
}

func (s *Server) revocationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Validator == nil {
			next.ServeHTTP(w, r)
			return
		}

		a := auth.FromContext(r.Context())
		if a.Jti == "" {
			// Legacy token predating jti claims — nothing to check.
			s.countRevocation(r.Context(), "skipped")
			next.ServeHTTP(w, r)
			return
		}
		if !s.RevocableTypes[a.Connection] {
			// Non-revocable connection type (e.g. immich) — no validity marker is
			// maintained for it, so an absent marker must NOT deny. Skip the check.
			s.countRevocation(r.Context(), "skipped")
			next.ServeHTTP(w, r)
			return
		}

		decision, err := s.Validator.Check(r.Context(), a.Jti)
		switch decision {
		case revocation.DecisionValid:
			s.countRevocation(r.Context(), "allowed")
			next.ServeHTTP(w, r)
		case revocation.DecisionGrace:
			// Redis is down but this jti was recently valid — allow, degraded.
			hlog.FromRequest(r).Warn().Err(err).Msg("validity store unreachable; honoring cached-valid token within grace")
			s.countRevocation(r.Context(), "grace")
			next.ServeHTTP(w, r)
		case revocation.DecisionUnavailable:
			// Redis is down and this jti has no valid grace entry — fail closed.
			hlog.FromRequest(r).Warn().Err(err).Msg("validity store unreachable and no grace; denying")
			s.countRevocation(r.Context(), "unavailable")
			httputil.WriteError(w, r, http.StatusUnauthorized, "Token validity could not be verified")
		default: // DecisionInvalid
			s.countRevocation(r.Context(), "revoked")
			httputil.WriteError(w, r, http.StatusUnauthorized, "Token revoked")
		}
	})
}

func validateBlobType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		blobType := chi.URLParam(r, "type")
		if !validBlobTypes[blobType] {
			writeError(w, r, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func validateBlobName(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := chi.URLParam(r, "name")
		if !sha256HexPattern.MatchString(name) {
			writeError(w, r, http.StatusBadRequest, "Invalid blob name")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authLogContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a := auth.FromContext(r.Context())
		route := chi.RouteContext(r.Context()).RoutePattern()
		l := hlog.FromRequest(r).With().
			Str("user", a.User).
			Str("repository", a.Repository).
			Str("method", r.Method).
			Str("route", route).
			Logger()
		r = r.WithContext(l.WithContext(r.Context()))
		next.ServeHTTP(w, r)
	})
}
