package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"michael/internal/auth"
	"michael/internal/storage"
)

// HEAD /{path}/config
func (s *Server) checkConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	size, err := s.Storage.HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		writeError(w, http.StatusNotFound, "Not Found")
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
		slog.Error("get config failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
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
			writeError(w, http.StatusForbidden, "Config already exists")
			return
		}
		slog.Error("save config failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/config
func (s *Server) deleteConfig(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	if a.WriteOnce {
		writeError(w, http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	_, err := s.Storage.HeadObject(r.Context(), a.Repository, "config")
	if err != nil {
		slog.Error("head config for delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.Storage.DeleteObject(r.Context(), a.Repository, "config"); err != nil {
		slog.Error("delete config failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}
