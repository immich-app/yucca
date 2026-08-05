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
	// Clusters holds one Storage per storage cluster this michael fronts, keyed
	// by cluster code. A request's token selects one of them.
	Clusters map[string]storage.Storage
	// DefaultCluster is the code served to tokens carrying no storageCluster
	// claim — every token minted before multi-cluster routing existed.
	DefaultCluster string
	JWTPublicKey   *ecdsa.PublicKey
	Metrics        *metrics.Metrics
	// ResolveClient identifies the source network of a request, for the traffic
	// metrics and the access log. Optional: nil leaves both unattributed, which
	// is what the tests and any deployment without an ASN database get.
	ResolveClient func(*http.Request) geoip.Client
}

// NewServer builds a single-cluster server: everything is served from s under
// the default cluster code.
func NewServer(s storage.Storage, jwtPublicKey *ecdsa.PublicKey, m *metrics.Metrics) *Server {
	return NewClusterServer(map[string]storage.Storage{cluster.DefaultCode: s}, cluster.DefaultCode, jwtPublicKey, m)
}

// NewClusterServer builds a server fronting several storage clusters, routing
// each request by its token's storageCluster claim.
func NewClusterServer(clusters map[string]storage.Storage, defaultCluster string, jwtPublicKey *ecdsa.PublicKey, m *metrics.Metrics) *Server {
	return &Server{
		Clusters:       clusters,
		DefaultCluster: defaultCluster,
		JWTPublicKey:   jwtPublicKey,
		Metrics:        m,
	}
}

type clusterCtxKey struct{}

// resolveCluster maps the request's token to the storage cluster serving it. An
// absent (or empty) storageCluster claim means the default cluster; a claim
// naming a cluster this michael does not front is an error rather than a
// fallback — silently serving a repository from the wrong cluster would look
// like data loss to the client.
func (s *Server) resolveCluster(ctx context.Context) (string, storage.Storage, bool) {
	code := auth.FromContext(ctx).StorageCluster
	if code == "" {
		code = s.DefaultCluster
	}
	store, ok := s.Clusters[code]
	return code, store, ok
}

// clusterMiddleware resolves the request's storage cluster once, up front, and
// rejects unknown ones for every route at the same place — so no handler can
// forget to fail closed.
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

// store returns the storage cluster this request routes to. clusterMiddleware
// has already resolved it and rejected unknown clusters, so by the time a
// handler runs the lookup has succeeded.
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

// clientLogContext puts the source network on every log line for the request.
// client_ip is the address behind the gateway — remote_ip is the gateway's own
// — and it lives on the log rather than on a metric label because per-address
// series are unbounded; drilling from a busy AS to the addresses inside it is a
// VictoriaLogs query.
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
		// Mutate the request logger in place instead of deriving a new one:
		// the AccessHandler completion line logs through the outer request's
		// logger pointer, so this is what puts user/repository on access logs.
		// method is omitted — the access line already carries it.
		hlog.FromRequest(r).UpdateContext(func(c zerolog.Context) zerolog.Context {
			return c.Str("user", a.User).Str("repository", a.Repository).Str("route", route)
		})
		next.ServeHTTP(w, r)
	})
}
