package handlers

import (
	"net/http"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/hlog"
	"github.com/rs/zerolog/log"
)

type Server struct {
	Storage   storage.Storage
	JWTSecret []byte
	Metrics   *metrics.Metrics
}

func NewServer(s storage.Storage, jwtSecret []byte, m *metrics.Metrics) *Server {
	return &Server{
		Storage:   s,
		JWTSecret: jwtSecret,
		Metrics:   m,
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(hlog.NewHandler(log.Logger))
	r.Use(hlog.RequestIDHandler("request_id", "X-Request-Id"))
	r.Use(hlog.RemoteAddrHandler("remote_ip"))
	r.Use(hlog.UserAgentHandler("user_agent"))
	r.Use(chimw.Recoverer)
	if s.Metrics != nil {
		r.Use(metrics.Middleware(s.Metrics))
	}

	r.Route("/{path}", func(r chi.Router) {
		r.Use(auth.Middleware(s.JWTSecret))
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

		r.Get("/{type}", s.listBlobs)
		r.Get("/{type}/", s.listBlobs)
		r.Head("/{type}/{name}", s.checkBlob)
		r.Get("/{type}/{name}", s.getBlob)
		r.Post("/{type}/{name}", s.saveBlob)
		r.Delete("/{type}/{name}", s.deleteBlob)
	})

	return r
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
