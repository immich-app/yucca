package bench

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Restic wraps the restic binary against one repository. Credentials travel
// via the child's environment, never argv.
type Restic struct {
	Bin      string
	Repo     string
	Password string
	CacheDir string
}

func (r *Restic) command(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, r.Bin, args...)
	cmd.Env = append(os.Environ(),
		"RESTIC_REPOSITORY="+r.Repo,
		"RESTIC_PASSWORD="+r.Password,
		"RESTIC_CACHE_DIR="+r.CacheDir,
	)
	return cmd
}

// runJSON executes restic with --json, forwarding non-summary messages to
// onMsg and returning the final summary message (nil if none was emitted).
func (r *Restic) runJSON(ctx context.Context, onMsg func(map[string]any), args ...string) (map[string]any, error) {
	cmd := r.command(ctx, append([]string{"--json"}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	var summary map[string]any
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var msg map[string]any
		if json.Unmarshal(line, &msg) != nil {
			continue
		}
		if msg["message_type"] == "summary" {
			summary = msg
		} else if onMsg != nil {
			onMsg(msg)
		}
	}
	if err := cmd.Wait(); err != nil {
		return summary, fmt.Errorf("restic %s: %w: %s", args[0], err, tail(stderr.String(), 2000))
	}
	return summary, nil
}

func tail(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return "…" + s[len(s)-n:]
	}
	return s
}

// num pulls a numeric field out of a decoded JSON message.
func num(m map[string]any, key string) float64 {
	v, _ := m[key].(float64)
	return v
}

func str(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func (r *Restic) Version(ctx context.Context) (string, error) {
	out, err := r.command(ctx, "version").Output()
	if err != nil {
		return "", fmt.Errorf("restic version (%s): %w", r.Bin, err)
	}
	if f := strings.Fields(string(out)); len(f) >= 2 {
		return f[1], nil
	}
	return strings.TrimSpace(string(out)), nil
}

// EnsureInit initializes the repository unless it already exists.
func (r *Restic) EnsureInit(ctx context.Context) (created bool, err error) {
	if err := r.command(ctx, "cat", "config").Run(); err == nil {
		return false, nil
	}
	if _, err := r.runJSON(ctx, nil, "init"); err != nil {
		return false, err
	}
	return true, nil
}

func (r *Restic) SnapshotIDs(ctx context.Context, tag string) ([]string, error) {
	args := []string{"snapshots", "--json"}
	if tag != "" {
		args = append(args, "--tag", tag)
	}
	var stderr bytes.Buffer
	cmd := r.command(ctx, args...)
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("restic snapshots: %w: %s", err, tail(stderr.String(), 2000))
	}
	var snaps []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(out, &snaps); err != nil {
		return nil, fmt.Errorf("parse snapshots: %w", err)
	}
	ids := make([]string, 0, len(snaps))
	for _, s := range snaps {
		ids = append(ids, s.ID)
	}
	return ids, nil
}
