package handlers

import (
	"io"
	"net/http"
	"regexp"
	"strconv"

	"michael/internal/auth"
	"michael/internal/httputil"
	"michael/internal/metrics"
	"michael/internal/storage"

	"github.com/rs/zerolog/hlog"
)

const (
	ContentTypeBinary   = "application/octet-stream"
	ContentTypeResticV2 = "application/vnd.x.restic.rest.v2"
)

var validBlobTypes = map[string]bool{
	"data": true, "index": true, "keys": true, "locks": true, "snapshots": true,
}

var sha256HexPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

var writeError = httputil.WriteError

func (s *Server) respondWithS3Object(w http.ResponseWriter, r *http.Request, obj *storage.S3Object) {
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
		ct = ContentTypeBinary
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

	if s.Metrics != nil && obj.ContentLength > 0 {
		a := auth.FromContext(r.Context())
		s.Metrics.RequestedBytes.Add(r.Context(), obj.ContentLength, metrics.AuthMetricOption(a))
	}

	if _, err := io.Copy(w, obj.Body); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("error streaming response")
	}
}
