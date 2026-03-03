package main

import (
	"log/slog"
	"net/http"
	"strconv"
)

// POST /{path}?create=true
func (s *Server) createRepository(w http.ResponseWriter, r *http.Request) {
	auth := authFromContext(r.Context())

	createStr := r.URL.Query().Get("create")
	if createStr == "" {
		writeError(w, http.StatusBadRequest, "isCreate must be true when creating repository")
		return
	}
	isCreate, err := strconv.ParseBool(createStr)
	if err != nil || !isCreate {
		writeError(w, http.StatusBadRequest, "isCreate must be true when creating repository")
		return
	}

	exists, err := s.storage.CheckBucket(r.Context(), auth.Repository)
	if err != nil {
		slog.Error("check bucket failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if exists {
		writeError(w, http.StatusConflict, "Repository already exists")
		return
	}

	if err := s.storage.CreateBucket(r.Context(), auth.Repository); err != nil {
		slog.Error("create bucket failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}
func (s *Server) deleteRepository(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "Not Implemented")
}
