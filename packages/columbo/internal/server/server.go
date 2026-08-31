package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"

	"columbo/internal/agent"
	"columbo/internal/worker"
)

const maxBodyBytes = 64 << 10

type Investigations interface {
	Enqueue(inv agent.Investigation) bool
	StartAdhoc(userID, prompt string) (string, error)
	GetAdhoc(id string) (worker.AdhocJob, bool)
}

type Server struct {
	internalSecret string
	investigations Investigations
}

func New(internalSecret string, investigations Investigations) *Server {
	return &Server{internalSecret: internalSecret, investigations: investigations}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /internal/investigations", s.guard(s.handleInvestigation))
	mux.HandleFunc("POST /internal/investigations/adhoc", s.guard(s.handleAdhocStart))
	mux.HandleFunc("GET /internal/investigations/adhoc/{id}", s.guard(s.handleAdhocGet))
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
	var inv agent.Investigation
	if !decodeBody(w, r, &inv) {
		return
	}
	if inv.StaffThreadID == "" || inv.UserID == "" || inv.Description == "" {
		http.Error(w, "staffThreadId, userId and description are required", http.StatusBadRequest)
		return
	}
	if !s.investigations.Enqueue(inv) {
		http.Error(w, "investigation queue is full", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) handleAdhocStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"userId"`
		Prompt string `json:"prompt"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if req.UserID == "" || req.Prompt == "" {
		http.Error(w, "userId and prompt are required", http.StatusBadRequest)
		return
	}
	id, err := s.investigations.StartAdhoc(req.UserID, req.Prompt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func (s *Server) handleAdhocGet(w http.ResponseWriter, r *http.Request) {
	job, ok := s.investigations.GetAdhoc(r.PathValue("id"))
	if !ok {
		http.Error(w, "unknown investigation", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func decodeBody(w http.ResponseWriter, r *http.Request, out any) bool {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return false
	}
	if err := json.Unmarshal(body, out); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return false
	}
	return true
}
