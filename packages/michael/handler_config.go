package main

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
)

// HEAD /{path}/config
func (s *Server) checkConfig(w http.ResponseWriter, r *http.Request) {
	auth := authFromContext(r.Context())

	size, err := s.storage.HeadObject(r.Context(), auth.Repository, "config")
	if err != nil {
		writeError(w, http.StatusNotFound, "Not Found")
		return
	}

	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
}

// GET /{path}/config
func (s *Server) getConfig(w http.ResponseWriter, r *http.Request) {
	auth := authFromContext(r.Context())

	rangeHeader := r.Header.Get("Range")
	obj, err := s.storage.GetObject(r.Context(), auth.Repository, "config", rangeHeader)
	if err != nil {
		slog.Error("get config failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	s.respondWithS3Object(w, r, obj)
}

// POST /{path}/config
func (s *Server) saveConfig(w http.ResponseWriter, r *http.Request) {
	auth := authFromContext(r.Context())

	err := s.storage.PutObject(r.Context(), auth.Repository, "config", r.Body, r.ContentLength, auth.WriteOnce, "")
	if err != nil {
		if errors.Is(err, ErrPreconditionFailed) {
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
	auth := authFromContext(r.Context())

	if auth.WriteOnce {
		writeError(w, http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	_, err := s.storage.HeadObject(r.Context(), auth.Repository, "config")
	if err != nil {
		slog.Error("head config for delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.storage.DeleteObject(r.Context(), auth.Repository, "config"); err != nil {
		slog.Error("delete config failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}
