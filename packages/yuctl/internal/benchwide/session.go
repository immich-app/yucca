// Package benchwide drives a fleet of cloud VMs (DigitalOcean, Hetzner, …; see
// internal/provider) running real restic clients against michael — the
// external-user path over the public internet. VM-shaped sibling of
// internal/warp (deploy/start/status/stop/cleanup/undeploy), built on the
// bench agent's loadgen mode: each host loops seeded generate→backup cycles
// under a detached supervisor, hard-capped at the host's transfer allowance so
// a forgotten run can't burn into paid overage. State is keyed partition ×
// provider — independent fleets, providers can load michael concurrently.
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

// Client is one restic identity (admin-api repo + password), pinned to a
// droplet by name. Passwords persist — repos are unreopenable without them.
type Client struct {
	Name     string `json:"name"`    // <droplet>-c<n>
	Droplet  string `json:"droplet"` // droplet name it runs on
	RepoID   string `json:"repoId"`
	RepoName string `json:"repoName"`
	Password string `json:"password"`
}

type RunInfo struct {
	StartedAt time.Time         `json:"startedAt"`
	Label     string            `json:"label"`
	Params    map[string]string `json:"params"`
}

// State is the local fleet record (0600 — holds repo passwords). Host
// existence is never trusted from here: the provider tag listing is truth, so
// state loss costs only repo passwords, never orphaned hosts.
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

func (s *Session) Tag() string { return tagPrefix + s.slug() }

func (s *Session) statePath() string {
	return filepath.Join(s.dir, "fleet-"+s.slug()+".json")
}

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

// clearFleetState drops droplet-bound bits (ssh keys, run info) but keeps
// client records while repos exist — their passwords are the only way to
// reopen them (`tools bench --repo-id` + re-minted URL to prune later).
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

// sshArgs: ephemeral identity, per-fleet known_hosts (recycled droplet IPs
// would trip host-key-changed in the global file), TOFU, and multiplexing.
// Multiplexing is load-bearing: a fresh port-22 flow per droplet per command
// trips ssh-targeted rate limiting on some paths (flapping per-IP SYN drops
// while ICMP stays fine); one persistent master keeps the flow count flat.
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

// sshRun executes script (combined stdout; stdin may be nil). The script rides
// ssh argv — visible in remote ps, NEVER secrets; secrets go via stdin.
// Connection failures (exit 255: banner timeouts/resets, common on fresh
// droplets) are retried; remote command failures (own exit code) are not.
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

// sshRunOnce: single attempt, no retry — for callers with their own cadence
// (waitSSH); nested retries would multiply delays.
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

// eachDroplet runs fn on every host in parallel, staggered 150ms apiece to
// avoid one port-22 SYN burst (see sshArgs); first error returned, all attempted.
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
