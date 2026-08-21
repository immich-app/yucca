// Package fleetbench deploys and drives a fleet of cloud VMs — across
// providers (DigitalOcean, Hetzner, …; see yuctl/provider) — running real
// restic clients against michael, the external-user data path over the public
// internet. It is the VM-shaped sibling of fleet/warp (fleet lifecycle:
// deploy/start/status/stop/cleanup/undeploy) built on the bench agent's
// loadgen mode: every host runs a detached supervisor looping seeded
// generate→backup cycles per client, hard-capped at the host's transfer
// allowance so a forgotten run cannot burn into paid overage. Each provider is
// a separate, independently-addressable fleet (state keyed by partition ×
// provider), so multiple providers can load michael concurrently.
package fleetbench

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"yuctl/ctxstore"
	"yuctl/fleet"
	"yuctl/provider"
	"yuctl/sshx"
)

// Legacy identifiers from the tool's bench-do/bench-wide eras survive below
// (Workdir, the tag prefix, repo prefixes, the state dir and JSON tags):
// changing any of them would orphan deployed hosts, persisted repo passwords,
// or remote state on live fleets.
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
// pinned to a host by name. Passwords are generated once and persisted —
// without them the repos can never be reopened (cleanup, restarts).
type Client struct {
	Name     string `json:"name"` // <host>-c<n>
	Host     string `json:"droplet"`
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

// Session is the resolved handle for one fleet-bench command invocation,
// scoped to one provider × partition fleet.
type Session struct {
	Partition string
	Provider  provider.Provider
	State     *State

	providerName string // slug used in the fleet tag + local filenames
	dir          string // ${XDG_CONFIG_HOME}/yuctl/bench-wide
	ssh          *sshx.Client
}

// NewSession builds the named provider's client (env/op token) and loads any
// persisted fleet state for the partition.
func NewSession(ctx context.Context, partition, providerName string) (*Session, error) {
	prov, err := provider.New(ctx, providerName)
	if err != nil {
		return nil, err
	}
	base, err := ctxstore.Dir()
	if err != nil {
		return nil, err
	}
	s := &Session{Partition: partition, Provider: prov, providerName: prov.Name(), dir: filepath.Join(base, "bench-wide")}
	if err := os.MkdirAll(filepath.Join(s.dir, "cm"), 0o700); err != nil {
		return nil, fmt.Errorf("create ssh control dir: %w", err)
	}
	// Per-fleet known_hosts: provider IPs get recycled across deployments —
	// the operator's global file would scream host-key-changed.
	s.ssh = &sshx.Client{
		User:                  prov.SSHUser(),
		IdentityFile:          s.PrivateKeyPath(),
		KnownHostsFile:        s.knownHostsPath(),
		ControlDir:            filepath.Join(s.dir, "cm"),
		ConnectTimeoutSeconds: 10,
		Retries:               2,
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

// clearFleetState drops everything host-bound (ssh key material, run info)
// but keeps the client records when repos exist: their passwords are the only
// way to ever reopen those repos (e.g. `tools bench --repo-id` with a
// re-minted URL to prune them later).
func (s *Session) clearFleetState() error {
	_ = os.Remove(s.PrivateKeyPath())
	_ = os.Remove(s.knownHostsPath())
	_ = os.RemoveAll(filepath.Join(s.dir, "cm"))
	if len(s.State.Clients) == 0 {
		_ = os.Remove(s.statePath())
		return nil
	}
	s.State.KeyID = ""
	s.State.KeyName = ""
	s.State.Run = nil
	return s.SaveState()
}

// Hosts returns the live fleet from the provider's tag listing.
func (s *Session) Hosts(ctx context.Context) ([]provider.Host, error) {
	return s.Provider.List(ctx, s.Tag())
}

// eachHost runs fn against every host in parallel — staggered by 150ms each
// so a big fleet doesn't fire all its port-22 SYNs in one burst (see
// sshx.Client.ControlDir) — and returns the first error (all hosts are still
// attempted).
func eachHost(hosts []provider.Host, fn func(d provider.Host) error) error {
	return fleet.Each(len(hosts), func(i int) error {
		time.Sleep(time.Duration(i) * 150 * time.Millisecond)
		return fn(hosts[i])
	})
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
