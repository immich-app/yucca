package httputil

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/hlog"
)

type ErrorResponse struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	RequestID  string `json:"requestId,omitempty"`
}

func WriteError(w http.ResponseWriter, r *http.Request, code int, message string) {
	reqID, _ := hlog.IDFromRequest(r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(ErrorResponse{
		StatusCode: code,
		Message:    message,
		RequestID:  reqID.String(),
	}); err != nil {
		hlog.FromRequest(r).Error().Err(err).Msg("failed to write error response")
	}
}
