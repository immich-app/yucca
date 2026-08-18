// Command bench-agent is the remote half of `yuctl tools bench` and
// `yuctl tools fleet-bench`. In bench mode (no args) it reads a resticbench.Config as
// JSON on stdin, executes the benchmark phases, and streams JSON events on
// stdout. In loadgen mode (--loadgen [config-path]) it reads a
// resticbench.LoadgenConfig — from the file, which it deletes after reading, or
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

	"yuctl/resticbench"
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

	emit := resticbench.EmitJSON(os.Stdout)
	var cfg resticbench.Config
	if err := json.NewDecoder(os.Stdin).Decode(&cfg); err != nil {
		emit(resticbench.Event{Type: "fatal", Message: "read config from stdin: " + err.Error()})
		os.Exit(1)
	}
	if err := resticbench.RunAgent(ctx, cfg, emit); err != nil {
		emit(resticbench.Event{Type: "fatal", Message: err.Error()})
		os.Exit(1)
	}
}

func loadgen(ctx context.Context, args []string) error {
	var cfg resticbench.LoadgenConfig
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

	if cfg.Op == resticbench.LoadgenOpCleanup {
		emit := resticbench.EmitJSON(os.Stdout)
		if err := resticbench.RunLoadgenCleanup(ctx, cfg, emit); err != nil {
			emit(resticbench.Event{Type: "fatal", Message: err.Error()})
			os.Exit(1)
		}
		emit(resticbench.Event{Type: "result", Result: &resticbench.RunResult{}})
		return nil
	}
	return resticbench.RunLoadgen(ctx, cfg)
}
