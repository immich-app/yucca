// Command bench-agent is the remote half of `yuctl tools bench` and
// `yuctl tools bench-do`. In bench mode (no args) it reads a bench.Config as
// JSON on stdin, executes the benchmark phases, and streams JSON events on
// stdout. In loadgen mode (--loadgen [config-path]) it reads a
// bench.LoadgenConfig — from the file, which it deletes after reading, or
// from stdin when no path is given — and either supervises the detached
// continuous load or runs the synchronous repo cleanup. The orchestrator
// pushes it over ssh; it is embedded into yuctl by the build task.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"yuctl/internal/bench"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if len(os.Args) > 1 && os.Args[1] == "--loadgen" {
		if err := loadgen(ctx, os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "bench-agent loadgen:", err)
			os.Exit(1)
		}
		return
	}

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

func loadgen(ctx context.Context, args []string) error {
	var cfg bench.LoadgenConfig
	if len(args) > 0 {
		// Config file: written 0600 by the launcher, consumed exactly once.
		b, err := os.ReadFile(args[0])
		if err != nil {
			return err
		}
		_ = os.Remove(args[0])
		if err := json.Unmarshal(b, &cfg); err != nil {
			return fmt.Errorf("parse %s: %w", args[0], err)
		}
	} else if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		return fmt.Errorf("read config from stdin: %w", err)
	}

	if cfg.Op == bench.LoadgenOpCleanup {
		emit := bench.EmitJSON(os.Stdout)
		if err := bench.RunLoadgenCleanup(ctx, cfg, emit); err != nil {
			emit(bench.Event{Type: "fatal", Message: err.Error()})
			os.Exit(1)
		}
		emit(bench.Event{Type: "result", Result: &bench.RunResult{}})
		return nil
	}
	return bench.RunLoadgen(ctx, cfg)
}
