package handlers

import (
	"github.com/rs/zerolog/hlog"
	"net/http"
	"strconv"

	"michael/internal/auth"
)

// POST /{path}?create=true
func (s *Server) createRepository(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	createStr := r.URL.Query().Get("create")
	if createStr == "" {
		writeError(w, r, http.StatusBadRequest, "isCreate must be true when creating repository")
		return
	}
	isCreate, err := strconv.ParseBool(createStr)
	if err != nil || !isCreate {
		writeError(w, r, http.StatusBadRequest, "isCreate must be true when creating repository")
		return
	}

	exists, err := s.store(r.Context()).CheckBucket(r.Context(), a.Repository)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("check bucket failed")
		writeStorageError(w, r, err)
		return
	}

	if exists {
		writeError(w, r, http.StatusConflict, "Repository already exists")
		return
	}

	if err := s.store(r.Context()).CreateBucket(r.Context(), a.Repository); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("create bucket failed")
		writeStorageError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}
func (s *Server) deleteRepository(w http.ResponseWriter, r *http.Request) {
	writeError(w, r, http.StatusNotImplemented, "Not Implemented")
}
