// Package provider abstracts the cloud hosting a bench-wide fleet so the
// lifecycle (deploy/start/status/stop/cleanup/undeploy) is provider-identical.
// Each provider is pure VM plumbing (create/list/destroy tagged hosts,
// ephemeral ssh key, size price + transfer allowance), restic/michael-agnostic.
// Implementations live beside this file (do.go, hetzner.go); New resolves by
// name — OVH slots in as another implementation + New case.
package provider

import (
	"context"
	"fmt"
	"time"
)

type Host struct {
	ID       string // provider-native id, as a string (DO int, Hetzner int, …)
	Name     string
	Region   string
	SizeSlug string
	PublicIP string
	Status   string
	Created  time.Time
}

// Size describes one VM size: pricing and the included outbound transfer the
// agent's wire cap is derived from.
type Size struct {
	Slug          string
	VCPUs         int
	MemoryMB      int
	DiskGB        int
	PriceHourly   float64
	TransferBytes int64 // included outbound transfer (conservative, decimal)
}

// Defaults are a provider's out-of-the-box fleet placement, used when the CLI
// flags are left empty so `--provider hetzner` needs no other flags.
type Defaults struct {
	Regions []string
	Size    string
	Image   string
}

// Provider is one cloud's fleet plumbing, keyed on an opaque fleet tag — the
// provider's tag listing is truth, so a yuctl crash never orphans billable hosts.
type Provider interface {
	// Name: stable slug (do, hetzner, ovh) — part of the fleet tag and state
	// filename, so per-provider/partition fleets coexist without undeploy crossing streams.
	Name() string
	// SSHUser is the login the provider's default image ships (root, ubuntu…).
	SSHUser() string
	Defaults() Defaults

	ResolveSize(ctx context.Context, slug string) (Size, error)

	// EnsureKey uploads publicKey under name, replacing a same-named leftover
	// from a crashed run, and returns the provider key id.
	EnsureKey(ctx context.Context, name, publicKey string) (keyID string, err error)
	DeleteKey(ctx context.Context, keyID string) error

	// Create makes the named hosts in one region with the fleet tag + ssh key
	// (DO multi-creates per region; Hetzner one per call — same signature).
	Create(ctx context.Context, names []string, region, size, image, tag, keyID string) ([]Host, error)
	// List returns every host carrying the tag, sorted by name.
	List(ctx context.Context, tag string) ([]Host, error)
	// WaitActive blocks until want hosts are running with a public IPv4.
	WaitActive(ctx context.Context, tag string, want int, timeout time.Duration) ([]Host, error)
	DeleteHost(ctx context.Context, h Host) error
	// DeleteByTag destroys every host carrying the tag and waits for the
	// listing to empty.
	DeleteByTag(ctx context.Context, tag string) error

	// AssignProject files the fleet under a provider-native grouping (DO
	// project); best-effort, no-op nil where the concept doesn't exist.
	AssignProject(ctx context.Context, hosts []Host) error
}

func Names() []string { return []string{"do", "hetzner"} }

// Builds the provider's API client; token via env or 1Password.
func New(ctx context.Context, name string) (Provider, error) {
	switch name {
	case "do", "digitalocean", "":
		return newDO(ctx)
	case "hetzner", "hcloud", "hz":
		return newHetzner(ctx)
	default:
		return nil, fmt.Errorf("unknown provider %q (known: %v)", name, Names())
	}
}
