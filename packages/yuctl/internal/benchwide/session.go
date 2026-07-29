// Package benchwide deploys and drives a fleet of cloud VMs — across
// providers (DigitalOcean, Hetzner, …; see internal/provider) — running real
// restic clients against michael, the external-user data path over the public
// internet. It is the VM-shaped sibling of internal/warp (fleet lifecycle:
// deploy/start/status/stop/cleanup/undeploy) built on the bench agent's
// loadgen mode: every host runs a detached supervisor looping seeded
// generate→backup cycles per client, hard-capped at the host's transfer
// allowance so a forgotten run cannot burn into paid overage. Each provider is
// a separate, independently-addressable fleet (state keyed by partition ×
// provider), so multiple providers can load michael concurrently.
package benchwide

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	yctx "yuctl/internal/context"
	"yuctl/internal/provider"
)

const (
	// Workdir is the host-side scratch root: datasets, restic caches, the
	// loadgen config (transient) and status file, and the agent log.
	Workdir    = "/var/tmp/yucca-bench-do"
	statusPath = Workdir + "/status.json"
	configPath = Workdir + "/loadgen.json"
	agentLog   = Workdir + "/agent.log"

	// tagPrefix starts every fleet tag; the provider slug and partition are
	// appended (yuctl-bench-<provider>-<partition>) so staging/prod fleets and
	// different providers coexist in one account without undeploy crossing
	// streams.
	tagPrefix = "yuctl-bench-"
)

// Client is one restic identity: its admin-api repository and password,
// pinned to a droplet by name. Passwords are generated once and persisted —
// without them the repos can never be reopened (cleanup, restarts).
type Client struct {
	Name     string `json:"name"`    // <droplet>-c<n>
	Droplet  string `json:"droplet"` // droplet name it runs on
	RepoID   string `json:"repoId"`
	RepoName string `json:"repoName"`
	Password string `json:"password"`
}

// RunInfo records the parameters of the last `start` for status displays and
// the results file.
type RunInfo struct {
	StartedAt time.Time         `json:"startedAt"`
	Label     string            `json:"label"`
	Params    map[string]string `json:"params"`
}

// State is the local fleet record (0600 — it holds repo passwords). Host
// existence itself is never trusted from here: the provider's tag listing is
// the source of truth, so fleets survive yuctl crashes and state loss only
// costs repo passwords, not orphaned hosts.
type State struct {
	Partition     string    `json:"partition"`
	Provider      string    `json:"provider"`
	CreatedAt     time.Time `json:"createdAt"`
	KeyID         string    `json:"keyId"`
	KeyName       string    `json:"keyName"`
	SizeSlug      string    `json:"sizeSlug"`
	PriceHourly   float64   `json:"priceHourly"`
	TransferBytes int64     `json:"transferBytes"` // per-host allowance
	Clients       []Client  `json:"clients"`
	Run           *RunInfo  `json:"run,omitempty"`
}

// Session is the resolved handle for one bench-wide command invocation,
// scoped to one provider × partition fleet.
type Session struct {
	Partition string
	Provider  provider.Provider
	State     *State

	providerName string // slug used in the fleet tag + local filenames
	dir          string // ${XDG_CONFIG_HOME}/yuctl/bench-wide
}

// NewSession builds the named provider's client (env/op token) and loads any
// persisted fleet state for the partition.
func NewSession(ctx context.Context, partition, providerName string) (*Session, error) {
	prov, err := provider.New(ctx, providerName)
	if err != nil {
		return nil, err
	}
	base, err := yctx.Dir()
	if err != nil {
		return nil, err
	}
	s := &Session{Partition: partition, Provider: prov, providerName: prov.Name(), dir: filepath.Join(base, "bench-wide")}
	if err := os.MkdirAll(filepath.Join(s.dir, "cm"), 0o700); err != nil {
		return nil, fmt.Errorf("create ssh control dir: %w", err)
	}
	if err := s.loadState(); err != nil {
		return nil, err
	}
	return s, nil
}

// slug is the provider×partition key used in the tag and local filenames.
func (s *Session) slug() string { return s.providerName + "-" + s.Partition }

// Tag is the fleet's provider tag/label.
func (s *Session) Tag() string { return tagPrefix + s.slug() }

func (s *Session) statePath() string {
	return filepath.Join(s.dir, "fleet-"+s.slug()+".json")
}

// PrivateKeyPath is where the fleet's ephemeral ssh private key lives.
func (s *Session) PrivateKeyPath() string {
	return filepath.Join(s.dir, "id_ed25519-"+s.slug())
}

func (s *Session) knownHostsPath() string {
	return filepath.Join(s.dir, "known_hosts-"+s.slug())
}

func (s *Session) loadState() error {
	b, err := os.ReadFile(s.statePath())
	if os.IsNotExist(err) {
		s.State = &State{Partition: s.Partition}
		return nil
	}
	if err != nil {
		return fmt.Errorf("read fleet state: %w", err)
	}
	var st State
	if err := json.Unmarshal(b, &st); err != nil {
		return fmt.Errorf("parse fleet state %s: %w", s.statePath(), err)
	}
	s.State = &st
	return nil
}

// SaveState atomically persists the fleet state at 0600.
func (s *Session) SaveState() error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s.State, "", "  ")
	if err != nil {
		return err
	}
	p := s.statePath()
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// clearFleetState drops everything droplet-bound (ssh key material, run
// info) but keeps the client records when repos exist: their passwords are
// the only way to ever reopen those repos (e.g. `tools bench --repo-id` with
// a re-minted URL to prune them later).
func (s *Session) clearFleetState() error {
	os.Remove(s.PrivateKeyPath())
	os.Remove(s.knownHostsPath())
	os.RemoveAll(filepath.Join(s.dir, "cm"))
	if len(s.State.Clients) == 0 {
		os.Remove(s.statePath())
		return nil
	}
	s.State.KeyID = ""
	s.State.KeyName = ""
	s.State.Run = nil
	return s.SaveState()
}

// sshArgs are the fleet ssh options: the ephemeral identity, a per-fleet
// known_hosts (droplet IPs get recycled across deployments — the global file
// would scream host-key-changed), TOFU on first contact, and connection
// multiplexing. Multiplexing matters beyond latency: status/watch/start
// otherwise open a fresh port-22 TCP flow per droplet per command, a burst
// pattern that trips ssh-targeted rate limiting on some paths (observed as
// flapping per-IP port-22 SYN drops while ICMP and other ports stay fine).
// One persistent master per droplet keeps the flow count flat.
func (s *Session) sshArgs(extra ...string) []string {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "UserKnownHostsFile=" + s.knownHostsPath(),
		"-o", "ConnectTimeout=10",
		"-o", "ServerAliveInterval=30",
		"-o", "ServerAliveCountMax=8",
		"-o", "ControlMaster=auto",
		"-o", "ControlPath=" + filepath.Join(s.dir, "cm", "%C"),
		"-o", "ControlPersist=300",
		"-i", s.PrivateKeyPath(),
		"-o", "IdentitiesOnly=yes",
	}
	return append(args, extra...)
}

// sshRun executes script on the droplet, returning combined stdout. stdin may
// be nil. The script travels as the ssh command argument (visible in remote
// ps — it must never contain secrets); secret payloads go through stdin.
// Connection-level failures (ssh exit 255: banner timeouts, resets — common
// when tens of sessions open against fresh droplets) are retried; remote
// command failures are not, ssh reports those as the command's own exit code.
func (s *Session) sshRun(ctx context.Context, ip, script string, stdin []byte) (string, error) {
	var lastOut string
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		out, err := s.sshRunOnce(ctx, ip, script, stdin)
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

// sshRunOnce is a single ssh attempt with no retry — used by callers that
// implement their own retry cadence (waitSSH), where nesting retries would
// multiply the delays.
func (s *Session) sshRunOnce(ctx context.Context, ip, script string, stdin []byte) (string, error) {
	cmd := exec.CommandContext(ctx, "ssh", s.sshArgs(s.Provider.SSHUser()+"@"+ip, script)...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var out, errb bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return out.String(), fmt.Errorf("ssh %s: %w: %s", ip, err, tailStr(errb.String(), 1000))
	}
	return out.String(), nil
}

func tailStr(v string, n int) string {
	v = strings.TrimSpace(v)
	if len(v) > n {
		return "…" + v[len(v)-n:]
	}
	return v
}

// Droplets returns the live fleet from the provider's tag listing. (Named for
// the historical DO fleet; a host is a host on any provider.)
func (s *Session) Droplets(ctx context.Context) ([]provider.Host, error) {
	return s.Provider.List(ctx, s.Tag())
}

// eachDroplet runs fn against every host in parallel — staggered by 150ms each
// so a big fleet doesn't fire all its port-22 SYNs in one burst (see sshArgs)
// — and returns the first error (all hosts are still attempted).
func eachDroplet(hosts []provider.Host, fn func(d provider.Host) error) error {
	var wg sync.WaitGroup
	errs := make([]error, len(hosts))
	for i, d := range hosts {
		wg.Add(1)
		go func(i int, d provider.Host) {
			defer wg.Done()
			time.Sleep(time.Duration(i) * 150 * time.Millisecond)
			errs[i] = fn(d)
		}(i, d)
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
