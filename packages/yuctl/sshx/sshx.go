// Package sshx is yuctl's single ssh/scp layer, shelling out to the system
// OpenSSH (agent support, ssh_config, ControlMaster — a Go ssh library would
// reimplement all three badly). Scripts travel as the ssh command argument —
// visible in remote ps, so they must never contain secrets; secret payloads
// go through stdin.
package sshx

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Client carries one target family's connection policy. The zero value is a
// plain BatchMode/TOFU client using the operator's ssh defaults and agent.
type Client struct {
	// User is prepended to hosts that don't already embed one ("" = ssh
	// config).
	User string

	// IdentityFile pins a private key (with IdentitiesOnly); "" = defaults.
	IdentityFile string

	// KnownHostsFile overrides the known-hosts file. Fleets with recycled
	// provider IPs need their own — the operator's global file would scream
	// host-key-changed.
	KnownHostsFile string

	// ControlDir enables connection multiplexing with masters persisted
	// under it. Multiplexing matters beyond latency: fan-out commands
	// otherwise open a fresh port-22 TCP flow per host per command, a burst
	// pattern that trips ssh-targeted rate limiting on some paths (observed
	// as flapping per-IP port-22 SYN drops while ICMP and other ports stay
	// fine). One persistent master per host keeps the flow count flat.
	ControlDir string

	// ConnectTimeoutSeconds bounds connection establishment (0 = ssh default).
	ConnectTimeoutSeconds int

	// Retries is how many times Run re-attempts after a connection-level
	// failure (ssh exit 255: banner timeouts, resets — common when tens of
	// sessions open against fresh hosts). Remote command failures are never
	// retried; ssh reports those as the command's own exit code.
	Retries int
}

func (c *Client) dest(host string) string {
	if c.User != "" && !strings.Contains(host, "@") {
		return c.User + "@" + host
	}
	return host
}

// options are the -o/-i arguments shared by ssh and scp. accept-new (TOFU)
// keeps first contact with a freshly resolved IP from failing BatchMode.
func (c *Client) options() []string {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "ServerAliveInterval=30",
		"-o", "ServerAliveCountMax=8",
	}
	if c.KnownHostsFile != "" {
		args = append(args, "-o", "UserKnownHostsFile="+c.KnownHostsFile)
	}
	if c.ConnectTimeoutSeconds > 0 {
		args = append(args, "-o", "ConnectTimeout="+strconv.Itoa(c.ConnectTimeoutSeconds))
	}
	if c.ControlDir != "" {
		args = append(args,
			"-o", "ControlMaster=auto",
			"-o", "ControlPath="+filepath.Join(c.ControlDir, "%C"),
			"-o", "ControlPersist=300")
	}
	if c.IdentityFile != "" {
		args = append(args, "-i", c.IdentityFile, "-o", "IdentitiesOnly=yes")
	}
	return args
}

func (c *Client) Run(ctx context.Context, host, script string, stdin []byte) (string, error) {
	var lastOut string
	var lastErr error
	for attempt := 1; attempt <= c.Retries+1; attempt++ {
		out, err := c.RunOnce(ctx, host, script, stdin)
		if err == nil {
			return out, nil
		}
		lastOut, lastErr = out, err
		var exit *exec.ExitError
		if ctx.Err() != nil || !errors.As(err, &exit) || exit.ExitCode() != 255 {
			break
		}
		select {
		case <-ctx.Done():
			return lastOut, lastErr
		case <-time.After(time.Duration(attempt) * 5 * time.Second):
		}
	}
	return lastOut, lastErr
}

// RunOnce is a single ssh attempt with no retry — for callers with their own
// retry cadence (readiness polling), where nesting retries multiplies delays.
func (c *Client) RunOnce(ctx context.Context, host, script string, stdin []byte) (string, error) {
	cmd := exec.CommandContext(ctx, "ssh", append(c.options(), c.dest(host), script)...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("ssh %s: %w: %s", host, err, Tail(errb.String(), 1000))
	}
	return out.String(), nil
}

// Command is for long-lived streaming sessions; the caller owns the pipes and
// lifecycle.
func (c *Client) Command(ctx context.Context, host, remote string) *exec.Cmd {
	return exec.CommandContext(ctx, "ssh", append(c.options(), c.dest(host), remote)...)
}

// Push copies local files (keys) into remoteDir on host under the given
// remote names (values), and marks them executable.
func (c *Client) Push(ctx context.Context, host, remoteDir string, files map[string]string) error {
	if _, err := c.Run(ctx, host, "mkdir -p "+remoteDir, nil); err != nil {
		return err
	}
	names := make([]string, 0, len(files))
	for local, name := range files {
		cmd := exec.CommandContext(ctx, "scp",
			append(append([]string{"-q"}, c.options()...), local, c.dest(host)+":"+remoteDir+"/"+name)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("scp %s to %s: %w: %s", local, host, err, Tail(string(out), 500))
		}
		names = append(names, remoteDir+"/"+name)
	}
	sort.Strings(names)
	_, err := c.Run(ctx, host, "chmod +x "+strings.Join(names, " "), nil)
	return err
}

func Tail(v string, n int) string {
	v = strings.TrimSpace(v)
	if len(v) > n {
		return "…" + v[len(v)-n:]
	}
	return v
}
