package resticbench

import (
	"bufio"
	"encoding/json"
	"io"
)

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

// ScanEvents consumes a newline-JSON event stream, invoking handle per event.
// Non-JSON lines are skipped (agent stderr never lands here, but a remote
// shell may still chirp).
func ScanEvents(r io.Reader, handle func(Event)) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1<<20), 8<<20)
	for sc.Scan() {
		var ev Event
		if json.Unmarshal(sc.Bytes(), &ev) == nil {
			handle(ev)
		}
	}
	return sc.Err()
}
