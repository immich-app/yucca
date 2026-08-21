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

	size, err := s.store(r.Context()).HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		// Restic stats the config to decide whether the repository exists — an
		// infra failure answered as 404 would present a live repo as absent.
		if !storage.IsNotFound(err) {
			hlog.FromRequest(r).Error().Err(err).Msg("head config failed")
			writeStorageError(w, r, err)
			return
		}
		writeError(w, r, http.StatusNotFound, "Not Found")
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
}

// GET /{path}/config
func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	rangeHeader := r.Header.Get("Range")
	obj, err := s.store(r.Context()).GetObject(r.Context(), a.Repository, "config", rangeHeader)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("get config failed")
		writeStorageError(w, r, err)
		return
	}

	s.respondWithS3Object(w, r, obj)
}

// POST /{path}/config
func (s *Server) saveConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	err := s.store(r.Context()).PutObject(r.Context(), a.Repository, "config", r.Body, r.ContentLength, a.WriteOnce, "")
	if err != nil {
		if errors.Is(err, storage.ErrPreconditionFailed) {
			writeError(w, r, http.StatusForbidden, "Config already exists")
			return
		}
		hlog.FromRequest(r).Error().Err(err).Msg("save config failed")
		writeStorageError(w, r, err)
		return
	}

	if s.Metrics != nil && r.ContentLength > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), r.ContentLength, metrics.BlobMetricOption(a, metrics.BlobType(r)))
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/config
func (s *Server) deleteConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	if a.WriteOnce {
		writeError(w, r, http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	size, err := s.store(r.Context()).HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("head config for delete failed")
		writeStorageError(w, r, err)
		return
	}

	if err := s.store(r.Context()).DeleteObject(r.Context(), a.Repository, "config"); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("delete config failed")
		writeStorageError(w, r, err)
		return
	}

	if s.Metrics != nil && size > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), -size, metrics.BlobMetricOption(a, metrics.BlobType(r)))
	}

	w.WriteHeader(http.StatusOK)
}
