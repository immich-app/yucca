package fleetbench

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"

	"yuctl/provider"
	"yuctl/resticbench"
	"yuctl/sshx"
)

// DeployOptions shape the host fleet. Regions/Size/Image default to the
// provider's own defaults when left empty (resolved in Deploy).
type DeployOptions struct {
	Hosts    int      // fleet size (default 3)
	Regions  []string // round-robined; provider default if empty
	Size     string   // size slug; provider default if empty
	Image    string   // image slug; provider default if empty
	AgentBin string   // explicit local linux/amd64 bench-agent ("" = embedded)

	// Confirm is called with the creation plan before any host is created;
	// returning false aborts. nil means proceed (--yes).
	Confirm func(plan string) bool
}

func (o *DeployOptions) defaults(d provider.Defaults) {
	if o.Hosts <= 0 {
		o.Hosts = 3
	}
	if len(o.Regions) == 0 {
		o.Regions = d.Regions
	}
	if o.Size == "" {
		o.Size = d.Size
	}
	if o.Image == "" {
		o.Image = d.Image
	}
}

// hostName is the fleet-stable name of host n (1-based) — reconciliation
// keys on these names, so deploy converges instead of duplicating.
func (s *Session) hostName(n int) string {
	return fmt.Sprintf("yucca-bench-%s-%02d", s.slug(), n)
}

// Deploy converges the fleet: creates missing hosts (confirmed, with the
// hourly cost and transfer pool spelled out), trims surplus ones, files
// everything under the yucca-bench project, waits for ssh, and pushes the
// bench agent + pinned restic everywhere.
func (s *Session) Deploy(ctx context.Context, opts DeployOptions) error {
	opts.defaults(s.Provider.Defaults())

	size, err := s.Provider.ResolveSize(ctx, opts.Size)
	if err != nil {
		return err
	}
	live, err := s.Hosts(ctx)
	if err != nil {
		return err
	}

	want := map[string]string{} // name -> region
	var wantNames []string
	for i := range opts.Hosts {
		name := s.hostName(i + 1)
		want[name] = opts.Regions[i%len(opts.Regions)]
		wantNames = append(wantNames, name)
	}
	have := map[string]provider.Host{}
	for _, d := range live {
		have[d.Name] = d
	}

	var missing []string
	for _, name := range wantNames {
		if _, ok := have[name]; !ok {
			missing = append(missing, name)
		}
	}
	var surplus []provider.Host
	for _, d := range live {
		if _, ok := want[d.Name]; !ok {
			surplus = append(surplus, d)
		}
	}

	if len(missing) > 0 {
		perRegion := map[string]int{}
		for _, name := range missing {
			perRegion[want[name]]++
		}
		var regions []string
		for r, n := range perRegion {
			regions = append(regions, fmt.Sprintf("%s×%d", r, n))
		}
		sort.Strings(regions)
		plan := fmt.Sprintf("create %d %s host(s) (%s) on provider %s:\n"+
			"  regions: %s\n"+
			"  cost: $%.4f/h each → $%.2f/h ($%.0f/mo-equivalent) for the fleet of %d\n"+
			"  transfer allowance: %s per host → %s pool (hard cap enforced by the agent)",
			len(missing), size.Slug, opts.Image, s.Provider.Name(),
			strings.Join(regions, ", "),
			size.PriceHourly, size.PriceHourly*float64(opts.Hosts), size.PriceHourly*float64(opts.Hosts)*730, opts.Hosts,
			resticbench.FormatBytes(size.TransferBytes), resticbench.FormatBytes(size.TransferBytes*int64(opts.Hosts)))
		if opts.Confirm != nil && !opts.Confirm(plan) {
			return fmt.Errorf("deploy aborted")
		}
	}

	keyID, err := s.ensureKey(ctx)
	if err != nil {
		return err
	}

	if len(missing) > 0 {
		perRegion := map[string][]string{}
		for _, name := range missing {
			perRegion[want[name]] = append(perRegion[want[name]], name)
		}
		for region, names := range perRegion {
			log.Info().Str("region", region).Int("count", len(names)).Str("size", size.Slug).Msg("creating hosts")
			if _, err := s.Provider.Create(ctx, names, region, size.Slug, opts.Image, s.Tag(), keyID); err != nil {
				return err
			}
		}
	}
	for _, d := range surplus {
		log.Warn().Str("host", d.Name).Msg("destroying surplus host")
		if err := s.Provider.DeleteHost(ctx, d); err != nil {
			return err
		}
	}

	hosts, err := s.Provider.WaitActive(ctx, s.Tag(), opts.Hosts, 5*time.Minute)
	if err != nil {
		return err
	}

	// Filing under the project is organizational only — the tag is what every
	// fleet operation keys on — so a scoped token without project permissions
	// must not strand freshly created (billing!) hosts mid-deploy. Assign the
	// whole fleet on every converge; it is idempotent, so a run after a token
	// fix picks the hosts up.
	s.assignProject(ctx, hosts)

	log.Info().Int("hosts", len(hosts)).Msg("waiting for ssh")
	var sshReady atomic.Int32
	if err := eachHost(hosts, func(d provider.Host) error {
		if err := s.waitSSH(ctx, d, 4*time.Minute); err != nil {
			return err
		}
		log.Info().Str("host", d.Name).Int32("ready", sshReady.Add(1)).Int("want", len(hosts)).Msg("ssh ready")
		return nil
	}); err != nil {
		return err
	}

	agentBin, cleanup, err := resticbench.AgentBinary(opts.AgentBin)
	if err != nil {
		return err
	}
	defer cleanup()
	resticBin, err := resticbench.EnsureResticLinux(ctx)
	if err != nil {
		return err
	}
	log.Info().Int("hosts", len(hosts)).Str("restic", resticbench.ResticVersion).Msg("pushing bench agent + restic")
	if err := eachHost(hosts, func(d provider.Host) error {
		return s.ssh.Push(ctx, d.PublicIP, resticbench.RemoteBinDir,
			map[string]string{agentBin: "bench-agent", resticBin: "restic"})
	}); err != nil {
		return err
	}

	s.State.SizeSlug = size.Slug
	s.State.PriceHourly = size.PriceHourly
	s.State.TransferBytes = size.TransferBytes
	if s.State.CreatedAt.IsZero() {
		s.State.CreatedAt = time.Now().UTC()
	}
	if err := s.SaveState(); err != nil {
		return err
	}
	log.Info().Int("hosts", len(hosts)).Msg("fleet deployed and ready")
	return nil
}

// assignProject files the fleet under a provider-native grouping (DO project),
// best-effort — a no-op on providers without the concept.
func (s *Session) assignProject(ctx context.Context, hosts []provider.Host) {
	if err := s.Provider.AssignProject(ctx, hosts); err != nil {
		log.Warn().Err(err).Msg("could not file the hosts under the provider project (token likely lacks the scope); continuing — the fleet is tracked by tag")
	}
}

// ensureKey returns the fleet's provider ssh key id, generating and
// registering a fresh ed25519 keypair when the fleet has none (or the private
// key is gone).
func (s *Session) ensureKey(ctx context.Context) (string, error) {
	if s.State.KeyID != "" {
		if _, err := os.Stat(s.PrivateKeyPath()); err == nil {
			return s.State.KeyID, nil
		}
		log.Warn().Msg("fleet ssh private key file is missing; generating a fresh keypair")
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", err
	}
	block, err := ssh.MarshalPrivateKey(priv, "yuctl fleet-bench "+s.slug())
	if err != nil {
		return "", fmt.Errorf("marshal ssh private key: %w", err)
	}
	sshPub, err := ssh.NewPublicKey(pub)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return "", err
	}
	if err := os.WriteFile(s.PrivateKeyPath(), pem.EncodeToMemory(block), 0o600); err != nil {
		return "", err
	}

	name := "yuctl-bench-" + s.slug()
	keyID, err := s.Provider.EnsureKey(ctx, name, string(ssh.MarshalAuthorizedKey(sshPub)))
	if err != nil {
		return "", err
	}
	s.State.KeyID = keyID
	s.State.KeyName = name
	return keyID, s.SaveState()
}

// waitSSH retries a no-op ssh until the host accepts the fleet key. Fresh
// hosts take a little while between "active" and sshd+key readiness.
// Single-shot probes (the loop is the retry) with the latest failure surfaced
// periodically, so a stuck host is visible instead of a silent hang.
func (s *Session) waitSSH(ctx context.Context, d provider.Host, timeout time.Duration) error {
	start := time.Now()
	deadline := start.Add(timeout)
	lastLog := start
	for {
		_, err := s.ssh.RunOnce(ctx, d.PublicIP, "true", nil)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("host %s (%s) not reachable over ssh after %s: %w", d.Name, d.PublicIP, timeout, err)
		}
		if time.Since(lastLog) > 30*time.Second {
			lastLog = time.Now()
			log.Warn().Str("host", d.Name).Str("ip", d.PublicIP).
				Str("waited", time.Since(start).Round(time.Second).String()).
				Str("error", sshx.Tail(err.Error(), 160)).Msg("still waiting for ssh")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		// A gentle cadence: on paths that graylist port-22 SYN bursts,
		// hammering a not-yet-reachable host only extends the block.
		case <-time.After(10 * time.Second):
		}
	}
}

// Undeploy destroys the whole fleet: hosts by tag, the provider ssh key, and
// the local key/known_hosts/state files. Repositories (and their data)
// persist — run `fleet-bench cleanup` first to prune them while the hosts
// still exist.
func (s *Session) Undeploy(ctx context.Context, force bool) error {
	hosts, err := s.Hosts(ctx)
	if err != nil {
		return err
	}
	if len(hosts) == 0 {
		log.Info().Msg("no hosts tagged for this fleet")
	} else {
		if !force {
			if running, err := s.anyLoadRunning(ctx, hosts); err != nil {
				log.Warn().Err(err).Msg("could not check for running load")
			} else if running {
				return fmt.Errorf("load is still running; `yuctl tools fleet-bench stop` first (or --force)")
			}
		}
		log.Info().Int("hosts", len(hosts)).Msg("destroying fleet hosts")
		if err := s.Provider.DeleteByTag(ctx, s.Tag()); err != nil {
			return err
		}
	}
	if s.State.KeyID != "" {
		if err := s.Provider.DeleteKey(ctx, s.State.KeyID); err != nil {
			log.Warn().Err(err).Msg("could not delete the provider ssh key; remove it in the console")
		}
	}
	if len(s.State.Clients) > 0 {
		log.Warn().Int("repos", len(s.State.Clients)).
			Msg("bench repositories persist (deletion is unimplemented); their passwords stay in the fleet state file")
	}
	if err := s.clearFleetState(); err != nil {
		return err
	}
	log.Info().Msg("fleet undeployed")
	return nil
}

// anyLoadRunning reports whether any host still has an agent or restic
// process alive.
func (s *Session) anyLoadRunning(ctx context.Context, hosts []provider.Host) (bool, error) {
	running := false
	err := eachHost(hosts, func(d provider.Host) error {
		out, err := s.ssh.Run(ctx, d.PublicIP,
			`echo "$(pgrep -fc 'bench-agent --[l]oadgen') $(pgrep -xc restic)" 2>/dev/null || true`, nil)
		if err != nil {
			return err
		}
		if strings.TrimSpace(out) != "0 0" {
			running = true
		}
		return nil
	})
	return running, err
}
