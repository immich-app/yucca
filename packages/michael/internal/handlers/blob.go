package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/rs/zerolog/hlog"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
)

// GET /{path}/{type}
func (s *Server) listBlobs(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	accept := r.Header.Get("Accept")
	if accept != ContentTypeResticV2 {
		writeError(w, r,http.StatusNotImplemented, "Not Implemented")
		return
	}

	blobType := chi.URLParam(r, "type")
	prefix := blobType + "/"
	blobs, err := s.Storage.ListObjects(r.Context(), a.Repository, prefix)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("list blobs failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.Header().Set("Content-Type", ContentTypeResticV2)
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(blobs); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("failed to encode blob list response")
	}
}

// HEAD /{path}/{type}/{name}
func (s *Server) checkBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")
	key := blobType + "/" + name
	size, err := s.Storage.HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		writeError(w, r,http.StatusNotFound, "Not Found")
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
}

// GET /{path}/{type}/{name}
func (s *Server) getBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")
	key := blobType + "/" + name
	rangeHeader := r.Header.Get("Range")
	obj, err := s.Storage.GetObject(r.Context(), a.Repository, key, rangeHeader)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("get blob failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	s.respondWithS3Object(w, r, obj)
}

// POST /{path}/{type}/{name}
func (s *Server) saveBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")
	key := blobType + "/" + name
	err := s.Storage.PutObject(r.Context(), a.Repository, key, r.Body, r.ContentLength, true, name)
	if err != nil {
		if errors.Is(err, storage.ErrPreconditionFailed) {
			writeError(w, r,http.StatusForbidden, "Blob already exists")
			return
		}
		if errors.Is(err, storage.ErrChecksumMismatch) {
			writeError(w, r,http.StatusBadRequest, "Content hash does not match blob name")
			return
		}
		hlog.FromRequest(r).Error().Err(err).Msg("save blob failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && r.ContentLength > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), r.ContentLength, metrics.AuthMetricOption(a))
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/{type}/{name}
func (s *Server) deleteBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")

	if a.WriteOnce && blobType != "locks" {
		writeError(w, r,http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	key := blobType + "/" + name
	size, err := s.Storage.HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("head blob for delete failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.Storage.DeleteObject(r.Context(), a.Repository, key); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("delete blob failed")
		writeError(w, r,http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && size > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), -size, metrics.AuthMetricOption(a))
	}

	w.WriteHeader(http.StatusOK)
}
