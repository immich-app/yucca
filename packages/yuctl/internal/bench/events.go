package bench

// Event is one line of the agent→orchestrator stream (JSON per line on the
// agent's stdout).
type Event struct {
	Type        string       `json:"type"` // phase_start | progress | phase_done | warning | result | fatal
	Phase       string       `json:"phase,omitempty"`
	Connections int          `json:"connections,omitempty"`
	Message     string       `json:"message,omitempty"`
	Done        int64        `json:"done,omitempty"`
	Total       int64        `json:"total,omitempty"`
	BPS         float64      `json:"bps,omitempty"`
	PhaseResult *PhaseResult `json:"phaseResult,omitempty"`
	Result      *RunResult   `json:"result,omitempty"`
}
