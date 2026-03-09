package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"michael/internal/auth"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
)

// GET /{path}/{type}
func (s *Server) listBlobs(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	accept := r.Header.Get("Accept")
	if accept != ContentTypeResticV2 {
		writeError(w, http.StatusNotImplemented, "Not Implemented")
		return
	}

	blobType := chi.URLParam(r, "type")
	if !validBlobTypes[blobType] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
		return
	}

	prefix := blobType + "/"
	blobs, err := s.Storage.ListObjects(r.Context(), a.Repository, prefix)
	if err != nil {
		slog.Error("list blobs failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.Header().Set("Content-Type", ContentTypeResticV2)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(blobs)
}

// HEAD /{path}/{type}/{name}
func (s *Server) checkBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")

	if !validBlobTypes[blobType] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
		return
	}

	if !sha256HexPattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "Invalid blob name")
		return
	}

	key := blobType + "/" + name
	size, err := s.Storage.HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		writeError(w, http.StatusNotFound, "Not Found")
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

	if !validBlobTypes[blobType] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
		return
	}

	if !sha256HexPattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "Invalid blob name")
		return
	}

	key := blobType + "/" + name
	rangeHeader := r.Header.Get("Range")
	obj, err := s.Storage.GetObject(r.Context(), a.Repository, key, rangeHeader)
	if err != nil {
		slog.Error("get blob failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	s.respondWithS3Object(w, r, obj)
}

// POST /{path}/{type}/{name}
func (s *Server) saveBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")

	if !validBlobTypes[blobType] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
		return
	}

	if !sha256HexPattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "Invalid blob name")
		return
	}

	key := blobType + "/" + name
	err := s.Storage.PutObject(r.Context(), a.Repository, key, r.Body, r.ContentLength, true, name)
	if err != nil {
		if errors.Is(err, storage.ErrPreconditionFailed) {
			writeError(w, http.StatusForbidden, "Blob already exists")
			return
		}
		if errors.Is(err, storage.ErrChecksumMismatch) {
			writeError(w, http.StatusBadRequest, "Content hash does not match blob name")
			return
		}
		slog.Error("save blob failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/{type}/{name}
func (s *Server) deleteBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")

	if !validBlobTypes[blobType] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid blob type: %s", blobType))
		return
	}

	if !sha256HexPattern.MatchString(name) {
		writeError(w, http.StatusBadRequest, "Invalid blob name")
		return
	}

	if a.WriteOnce && blobType != "locks" {
		writeError(w, http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	key := blobType + "/" + name
	_, err := s.Storage.HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		slog.Error("head blob for delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.Storage.DeleteObject(r.Context(), a.Repository, key); err != nil {
		slog.Error("delete blob failed", "error", err)
		writeError(w, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	w.WriteHeader(http.StatusOK)
}
