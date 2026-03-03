package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

const (
	contentTypeBinary   = "application/octet-stream"
	contentTypeResticV2 = "application/vnd.x.restic.rest.v2"
)

var validBlobTypes = map[string]bool{
	"data": true, "index": true, "keys": true, "locks": true, "snapshots": true,
}

var sha256HexPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type ErrorResponse struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
}

type Server struct {
	storage   Storage
	jwtSecret []byte
	metrics   *Metrics
}

func NewServer(storage Storage, cfg Config, metrics *Metrics) *Server {
	return &Server{
		storage:   storage,
		jwtSecret: cfg.JWTSecret,
		metrics:   metrics,
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	if s.metrics != nil {
		r.Use(metricsMiddleware(s.metrics))
	}

	r.Route("/{path}", func(r chi.Router) {
		r.Use(authMiddleware(s.jwtSecret))
		if s.metrics != nil {
			r.Use(blobMetricsMiddleware(s.metrics))
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

func writeError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(ErrorResponse{
		StatusCode: code,
		Message:    message,
	})
}

func (s *Server) respondWithS3Object(w http.ResponseWriter, r *http.Request, obj *S3Object) {
	defer obj.Body.Close()

	// If-None-Match → 304
	if etag := r.Header.Get("If-None-Match"); etag != "" && etag == obj.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	if obj.ETag != "" {
		w.Header().Set("ETag", obj.ETag)
	}

	ct := obj.ContentType
	if ct == "" {
		ct = contentTypeBinary
	}
	w.Header().Set("Content-Type", ct)

	if obj.ContentRange != "" {
		w.Header().Set("Content-Range", obj.ContentRange)
	}

	if obj.ContentLength > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(obj.ContentLength, 10))
	}

	// Range → 206
	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" && rangeHeader != "bytes=0-" {
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	if s.metrics != nil && obj.ContentLength > 0 {
		auth := authFromContext(r.Context())
		s.metrics.RequestedBytes.Add(r.Context(), obj.ContentLength, authMetricOption(auth))
	}

	if _, err := io.Copy(w, obj.Body); err != nil {
		slog.Error("error streaming response", "error", err)
	}
}
