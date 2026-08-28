package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"

	"columbo/internal/agent"
)

const maxBodyBytes = 64 << 10

type Server struct {
	internalSecret string
	enqueue        func(agent.Investigation) bool
}

func New(internalSecret string, enqueue func(agent.Investigation) bool) *Server {
	return &Server{internalSecret: internalSecret, enqueue: enqueue}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /internal/investigations", s.guard(s.handleInvestigation))
	return mux
}

// guard mirrors the TS InternalGuard: constant-time compare of hashes, and
// fail closed when the secret is unconfigured.
func (s *Server) guard(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		presented := r.Header.Get("X-Internal-Secret")
		if s.internalSecret == "" || !secretsEqual(presented, s.internalSecret) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func secretsEqual(a, b string) bool {
	ha := sha256.Sum256([]byte(a))
	hb := sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(ha[:], hb[:]) == 1
}

func (s *Server) handleInvestigation(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var inv agent.Investigation
	if err := json.Unmarshal(body, &inv); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if inv.StaffThreadID == "" || inv.UserID == "" || inv.Description == "" {
		http.Error(w, "staffThreadId, userId and description are required", http.StatusBadRequest)
		return
	}
	if !s.enqueue(inv) {
		http.Error(w, "investigation queue is full", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}
