package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/rs/zerolog/hlog"

	"michael/internal/auth"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/go-chi/chi/v5"
)

// GET /{path}/{type}
//
// Streams the restic v2 JSON array as listing pages arrive instead of
// buffering the whole repo listing. data/ (the bulk of a repo, hex-named) fans
// out across 16 hex prefixes: RGW scans them in parallel and each shard lands
// on its own pool backend.
func (s *Server) listBlobs(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())

	accept := r.Header.Get("Accept")
	if accept != ContentTypeResticV2 {
		writeError(w, r, http.StatusNotImplemented, "Not Implemented")
		return
	}

	blobType := chi.URLParam(r, "type")
	typePrefix := blobType + "/"

	prefixes := []string{typePrefix}
	if blobType == "data" {
		prefixes = make([]string, 16)
		for i := range prefixes {
			prefixes[i] = fmt.Sprintf("%s%x", typePrefix, i)
		}
	}

	store := s.store(r.Context())
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var (
		mu    sync.Mutex
		buf   *bufio.Writer
		first = true
	)
	emit := func(b storage.BlobInfo) error {
		name := strings.TrimPrefix(b.Name, typePrefix)
		if name == "" {
			return nil
		}
		entry, err := json.Marshal(storage.BlobInfo{Name: name, Size: b.Size})
		if err != nil {
			return err
		}
		mu.Lock()
		defer mu.Unlock()
		if first {
			first = false
			w.Header().Set("Content-Type", ContentTypeResticV2)
			w.WriteHeader(http.StatusOK)
			buf = bufio.NewWriterSize(w, 64<<10)
			if _, err := buf.WriteString("["); err != nil {
				return err
			}
		} else if _, err := buf.WriteString(","); err != nil {
			return err
		}
		_, err = buf.Write(entry)
		return err
	}

	var (
		wg      sync.WaitGroup
		errOnce sync.Once
		listErr error
	)
	for _, prefix := range prefixes {
		wg.Add(1)
		go func(prefix string) {
			defer wg.Done()
			if err := store.ListObjects(ctx, a.Repository, prefix, emit); err != nil {
				errOnce.Do(func() {
					listErr = err
					cancel()
				})
			}
		}(prefix)
	}
	wg.Wait()

	if listErr != nil {
		hlog.FromRequest(r).Error().Err(listErr).Msg("list blobs failed")
		if first {
			writeError(w, r, http.StatusInternalServerError, "An error occurred with the storage server")
			return
		}
		// The 200 and part of the body are already out; abort the connection
		// so the client sees a truncated response, not a valid-looking list.
		panic(http.ErrAbortHandler)
	}

	if first {
		w.Header().Set("Content-Type", ContentTypeResticV2)
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write([]byte("[]")); err != nil {
			hlog.FromRequest(r).Error().Err(err).Msg("failed to write blob list response")
		}
		return
	}
	if _, err := buf.WriteString("]"); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("failed to write blob list response")
		return
	}
	if err := buf.Flush(); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("failed to flush blob list response")
	}
}

// HEAD /{path}/{type}/{name}
func (s *Server) checkBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")
	key := blobType + "/" + name
	size, err := s.store(r.Context()).HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		writeError(w, r, http.StatusNotFound, "Not Found")
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
	obj, err := s.store(r.Context()).GetObject(r.Context(), a.Repository, key, rangeHeader)
	if err != nil {
		hlog.FromRequest(r).Error().Err(err).Str("repository", a.Repository).Str("key", key).Msg("get blob failed: backend storage error")
		if s.Metrics != nil {
			s.Metrics.StorageErrors.Add(r.Context(), 1, metrics.StorageErrorOption("get", metrics.BlobType(r)))
		}
		writeError(w, r, http.StatusInternalServerError, "An error occurred with the storage server")
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
	err := s.store(r.Context()).PutObject(r.Context(), a.Repository, key, r.Body, r.ContentLength, true, name)
	if err != nil {
		if errors.Is(err, storage.ErrPreconditionFailed) {
			writeError(w, r, http.StatusForbidden, "Blob already exists")
			return
		}
		if errors.Is(err, storage.ErrChecksumMismatch) {
			writeError(w, r, http.StatusBadRequest, "Content hash does not match blob name")
			return
		}
		hlog.FromRequest(r).Error().Err(err).Str("repository", a.Repository).Str("key", key).Msg("save blob failed: backend storage error")
		if s.Metrics != nil {
			s.Metrics.StorageErrors.Add(r.Context(), 1, metrics.StorageErrorOption("put", metrics.BlobType(r)))
		}
		writeError(w, r, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && r.ContentLength > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), r.ContentLength, metrics.BlobMetricOption(a, metrics.BlobType(r)))
	}

	w.WriteHeader(http.StatusOK)
}

// DELETE /{path}/{type}/{name}
func (s *Server) deleteBlob(w http.ResponseWriter, r *http.Request) {
	a := auth.FromContext(r.Context())
	blobType := chi.URLParam(r, "type")
	name := chi.URLParam(r, "name")

	if a.WriteOnce && blobType != "locks" {
		writeError(w, r, http.StatusForbidden, "Not permitted to write to WORM repository")
		return
	}

	key := blobType + "/" + name
	size, err := s.store(r.Context()).HeadObject(r.Context(), a.Repository, key)
	if err != nil {
		// Idempotent delete: restic removes blobs it isn't sure were uploaded
		// (e.g. cleanup after a failed save) — an already-absent blob is success.
		if storage.IsNotFound(err) {
			w.WriteHeader(http.StatusOK)
			return
		}
		hlog.FromRequest(r).Error().Err(err).Msg("head blob for delete failed")
		writeError(w, r, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if err := s.store(r.Context()).DeleteObject(r.Context(), a.Repository, key); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("delete blob failed")
		writeError(w, r, http.StatusInternalServerError, "An error occurred with the storage server")
		return
	}

	if s.Metrics != nil && size > 0 {
		s.Metrics.StoredBytes.Add(r.Context(), -size, metrics.BlobMetricOption(a, metrics.BlobType(r)))
	}

	w.WriteHeader(http.StatusOK)
}
