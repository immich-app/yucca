package handlers

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"net/http"
	"time"

	"michael/internal/auth"
	"michael/internal/cluster"
	"michael/internal/geoip"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
)

type Server struct {
	// Keyed by cluster code; a request's token selects one.
	Clusters map[string]storage.Storage
	// DefaultCluster serves tokens without a storageCluster claim (pre-multi-cluster mints).
	DefaultCluster string
	JWTPublicKey   *ecdsa.PublicKey
	Metrics        *metrics.Metrics
	// ResolveClient identifies the source network (traffic metrics + access
	// log). nil = unattributed (tests, deployments without an ASN DB).
	ResolveClient func(*http.Request) geoip.Client
}

func NewServer(s storage.Storage, jwtPublicKey *ecdsa.PublicKey, m *metrics.Metrics) *Server {
	return NewClusterServer(map[string]storage.Storage{cluster.DefaultCode: s}, cluster.DefaultCode, jwtPublicKey, m)
}

func NewClusterServer(clusters map[string]storage.Storage, defaultCluster string, jwtPublicKey *ecdsa.PublicKey, m *metrics.Metrics) *Server {
	return &Server{
		Clusters:       clusters,
		DefaultCluster: defaultCluster,
		JWTPublicKey:   jwtPublicKey,
		Metrics:        m,
	}
}

type clusterCtxKey struct{}

// resolveCluster maps the token to its storage cluster. Empty claim = default;
// an unknown cluster is an error, NOT a fallback — silently serving from the
// wrong cluster would look like data loss.
func (s *Server) resolveCluster(ctx context.Context) (string, storage.Storage, bool) {
	code := auth.FromContext(ctx).StorageCluster
	if code == "" {
		code = s.DefaultCluster
	}
	store, ok := s.Clusters[code]
	return code, store, ok
}

// clusterMiddleware resolves the cluster once, rejecting unknown ones for every
// route in one place — no handler can forget to fail closed.
func (s *Server) clusterMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code, store, ok := s.resolveCluster(r.Context())
		if !ok {
			hlog.FromRequest(r).Warn().Str("cluster", code).Msg("token names an unknown storage cluster")
			if s.Metrics != nil {
				s.Metrics.UnknownCluster.Add(r.Context(), 1, metrics.ClusterOption(code))
			}
			writeError(w, r, http.StatusBadRequest, "Unknown storage cluster")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), clusterCtxKey{}, store)))
	})
}

func (s *Server) store(ctx context.Context) storage.Storage {
	return ctx.Value(clusterCtxKey{}).(storage.Storage)
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(hlog.NewHandler(log.Logger))
	r.Use(hlog.RequestIDHandler("request_id", "X-Request-Id"))
	r.Use(hlog.RemoteAddrHandler("remote_ip"))
	r.Use(hlog.UserAgentHandler("user_agent"))
	if s.ResolveClient != nil {
		r.Use(geoip.Middleware(s.ResolveClient))
		r.Use(clientLogContext)
	}
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
		if s.ResolveClient != nil {
			r.Use(metrics.TrafficMiddleware(s.Metrics))
		}
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
		r.Use(authLogContext)
		if s.Metrics != nil {
			r.Use(metrics.CaptureAuth)
			r.Use(metrics.BlobMiddleware(s.Metrics))
		}
		// After CaptureAuth, so a request rejected for naming an unknown cluster
		// is still attributed to the identity that sent it.
		r.Use(s.clusterMiddleware)

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

// clientLogContext puts the source network on every log line. client_ip is the
// address behind the gateway (remote_ip is the gateway's); it's a log field not
// a metric label — per-address series are unbounded, drill down via VictoriaLogs.
func clientLogContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := geoip.FromContext(r.Context())
		hlog.FromRequest(r).UpdateContext(func(ctx zerolog.Context) zerolog.Context {
			return ctx.Str("client_ip", c.IP).Str("asn", c.ASN).Str("as_org", c.Org)
		})
		next.ServeHTTP(w, r)
	})
}

func authLogContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a := auth.FromContext(r.Context())
		route := chi.RouteContext(r.Context()).RoutePattern()
		// Mutate the request logger in place: AccessHandler logs through the
		// outer logger pointer — this puts user/repository on access lines.
		// method omitted (access line carries it).
		hlog.FromRequest(r).UpdateContext(func(c zerolog.Context) zerolog.Context {
			return c.Str("user", a.User).Str("repository", a.Repository).Str("route", route)
		})
		next.ServeHTTP(w, r)
	})
}
