package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/rs/zerolog/hlog"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/storage"
)

// HEAD /{path}/config
func (s *Server) checkConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	size, err := s.Storage.HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		writeError(w, r,http.StatusNotFound, "Not Found")
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
}

// GET /{path}/config
func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	rangeHeader := r.Header.Get("Range")
	obj, err := s.Storage.GetObject(r.Context(), a.Repository, "config", rangeHeader)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("get config failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	s.respondWithS3Object(w, r, obj)
}

// POST /{path}/config
func (s *Server) saveConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	err := s.Storage.PutObject(r.Context(), a.Repository, "config", r.Body, r.ContentLength, a.WriteOnce, "")
	if err != nil {
		if errors.Is(err, storage.ErrPreconditionFailed) {
			writeError(w, r,http.StatusForbidden, "Config already exists")
			return
		}
		hlog.FromRequest(r).Error().Err(err).Msg("save config failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && r.ContentLength > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), r.ContentLength, metrics.AuthMetricOption(a))
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/config
func (s *Server) deleteConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	if a.WriteOnce {
		writeError(w, r,http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	size, err := s.Storage.HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("head config for delete failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.Storage.DeleteObject(r.Context(), a.Repository, "config"); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("delete config failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && size > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), -size, metrics.AuthMetricOption(a))
	}

	w.WriteHeader(http.StatusOK)
}
