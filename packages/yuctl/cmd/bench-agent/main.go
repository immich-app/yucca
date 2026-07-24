// Command bench-agent is the remote half of `yuctl tools bench`: it runs on a
// management host, reads a bench.Config as JSON on stdin, executes the
// benchmark phases, and streams JSON events on stdout. The orchestrator pushes
// it over ssh; it is embedded into yuctl by the build task.
package main

import (
	"context"
	"encoding/json"
	"os"
	"os/signal"
	"syscall"

	"yuctl/internal/bench"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	emit := bench.EmitJSON(os.Stdout)
	var cfg bench.Config
	if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		emit(bench.Event{Type: "fatal", Message: "read config from stdin: " + err.Error()})
		os.Exit(1)
	}
	if err := bench.RunAgent(ctx, cfg, emit); err != nil {
		emit(bench.Event{Type: "fatal", Message: err.Error()})
		os.Exit(1)
	}
}
