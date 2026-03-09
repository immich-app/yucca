package handlers

import (
	"net/http"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	if s.Metrics != nil {
		r.Use(metrics.Middleware(s.Metrics))
	}

	r.Route("/{path}", func(r chi.Router) {
		r.Use(auth.Middleware(s.JWTSecret))
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
