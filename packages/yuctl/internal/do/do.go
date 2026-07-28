// Package do wraps the DigitalOcean API (godo) for the bench-do droplet
// fleet: token resolution via 1Password, the yucca-bench project, ephemeral
// SSH keys, and tagged droplet lifecycle. Nothing here knows about restic or
// michael — it is pure fleet plumbing.
package do

import (
	"context"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/digitalocean/godo"
	"github.com/rs/zerolog/log"

	"yuctl/internal/op"
)

const (
	// TokenRef is the 1Password item holding the DO API token; the
	// DIGITALOCEAN_TOKEN env var (godo's own convention) skips op entirely.
	TokenRef = "op://yucca/do_api_token/password"

	// ProjectName is the DO project every bench droplet is filed under,
	// created on first use.
	ProjectName = "yucca-bench"
)

// Client is a thin godo wrapper scoped to bench-do's needs.
type Client struct {
	do *godo.Client
}

// NewClient resolves the API token ($DIGITALOCEAN_TOKEN, else the op ref —
// overridable via $YUCTL_DO_TOKEN_REF) and builds the godo client.
func NewClient(ctx context.Context) (*Client, error) {
	token := os.Getenv("DIGITALOCEAN_TOKEN")
	if token == "" {
		ref := os.Getenv("YUCTL_DO_TOKEN_REF")
		if ref == "" {
			ref = TokenRef
		}
		log.Info().Str("ref", ref).Msg("reading DigitalOcean API token from 1Password (may prompt to unlock)")
		v, err := op.Read(ctx, ref)
		if err != nil {
			return nil, fmt.Errorf("resolve DO API token: %w", err)
		}
		token = v
	}
	return &Client{do: godo.NewFromToken(token)}, nil
}

// EnsureProject returns the ProjectName project's ID, creating the project if
// the account does not have it yet.
func (c *Client) EnsureProject(ctx context.Context) (string, error) {
	opt := &godo.ListOptions{PerPage: 200}
	for {
		projects, resp, err := c.do.Projects.List(ctx, opt)
		if err != nil {
			return "", fmt.Errorf("list DO projects: %w", err)
		}
		for _, p := range projects {
			if p.Name == ProjectName {
				return p.ID, nil
			}
		}
		if resp.Links == nil || resp.Links.IsLastPage() {
			break
		}
		opt.Page++
	}
	log.Info().Str("project", ProjectName).Msg("creating DO project")
	p, _, err := c.do.Projects.Create(ctx, &godo.CreateProjectRequest{
		Name:        ProjectName,
		Purpose:     "Operational / Developer tooling",
		Description: "yuctl tools bench-do restic load-test fleets",
		Environment: "Development",
	})
	if err != nil {
		return "", fmt.Errorf("create DO project %s: %w", ProjectName, err)
	}
	return p.ID, nil
}

// AssignDroplets files droplets under the project.
func (c *Client) AssignDroplets(ctx context.Context, projectID string, dropletIDs []int) error {
	if len(dropletIDs) == 0 {
		return nil
	}
	res := make([]any, len(dropletIDs))
	for i, id := range dropletIDs {
		res[i] = fmt.Sprintf("do:droplet:%d", id)
	}
	if _, _, err := c.do.Projects.AssignResources(ctx, projectID, res...); err != nil {
		return fmt.Errorf("assign droplets to project %s: %w", ProjectName, err)
	}
	return nil
}

// RegisterKey uploads a public key under name, replacing any leftover key of
// the same name from a crashed run.
func (c *Client) RegisterKey(ctx context.Context, name, publicKey string) (int, error) {
	opt := &godo.ListOptions{PerPage: 200}
	for {
		keys, resp, err := c.do.Keys.List(ctx, opt)
		if err != nil {
			return 0, fmt.Errorf("list DO ssh keys: %w", err)
		}
		for _, k := range keys {
			if k.Name == name {
				log.Warn().Str("key", name).Msg("deleting leftover DO ssh key of the same name")
				if _, err := c.do.Keys.DeleteByID(ctx, k.ID); err != nil {
					return 0, fmt.Errorf("delete leftover key %s: %w", name, err)
				}
			}
		}
		if resp.Links == nil || resp.Links.IsLastPage() {
			break
		}
		opt.Page++
	}
	k, _, err := c.do.Keys.Create(ctx, &godo.KeyCreateRequest{Name: name, PublicKey: publicKey})
	if err != nil {
		return 0, fmt.Errorf("register DO ssh key: %w", err)
	}
	return k.ID, nil
}

// DeleteKey removes a registered key; a 404 is not an error.
func (c *Client) DeleteKey(ctx context.Context, id int) error {
	resp, err := c.do.Keys.DeleteByID(ctx, id)
	if err != nil {
		if resp != nil && resp.StatusCode == 404 {
			return nil
		}
		return fmt.Errorf("delete DO ssh key %d: %w", id, err)
	}
	return nil
}

// Size describes one droplet size the fleet can use.
type Size struct {
	Slug        string
	VCPUs       int
	MemoryMB    int
	DiskGB      int
	PriceHourly float64
	// TransferTB is DO's included outbound transfer for the size. DO markets
	// it as "TB"; we bill the cap conservatively as decimal TB (1e12 bytes)
	// so the auto-stop errs on the early side.
	TransferTB float64
}

// TransferBytes is the conservative byte value of the size's allowance.
func (s Size) TransferBytes() int64 {
	return int64(s.TransferTB * 1e12)
}

// GetSize resolves a size slug to its pricing and transfer allowance.
func (c *Client) GetSize(ctx context.Context, slug string) (*Size, error) {
	opt := &godo.ListOptions{PerPage: 200}
	for {
		sizes, resp, err := c.do.Sizes.List(ctx, opt)
		if err != nil {
			return nil, fmt.Errorf("list DO sizes: %w", err)
		}
		for _, s := range sizes {
			if s.Slug == slug {
				return &Size{
					Slug:        s.Slug,
					VCPUs:       s.Vcpus,
					MemoryMB:    s.Memory,
					DiskGB:      s.Disk,
					PriceHourly: s.PriceHourly,
					TransferTB:  s.Transfer,
				}, nil
			}
		}
		if resp.Links == nil || resp.Links.IsLastPage() {
			break
		}
		opt.Page++
	}
	return nil, fmt.Errorf("unknown DO size slug %q", slug)
}

// Droplet is the subset of droplet state bench-do tracks.
type Droplet struct {
	ID       int
	Name     string
	Region   string
	SizeSlug string
	PublicIP string
	Status   string
	Created  time.Time
}

func fromGodo(d godo.Droplet) Droplet {
	out := Droplet{
		ID:       d.ID,
		Name:     d.Name,
		SizeSlug: d.SizeSlug,
		Status:   d.Status,
	}
	if d.Region != nil {
		out.Region = d.Region.Slug
	}
	if ip, err := d.PublicIPv4(); err == nil {
		out.PublicIP = ip
	}
	if t, err := time.Parse(time.RFC3339, d.Created); err == nil {
		out.Created = t
	}
	return out
}

// maxMultiCreate is DO's hard cap on names per multi-create request; larger
// batches 422 ("cannot create more than 10 droplets at a time"), so we chunk.
const maxMultiCreate = 10

// CreateDroplets creates droplets in a single region (DO's multi-create is
// per-region) with the fleet tag and ssh key, chunked to DO's per-request cap.
func (c *Client) CreateDroplets(ctx context.Context, names []string, region, size, image, tag string, keyID int) ([]Droplet, error) {
	var out []Droplet
	for start := 0; start < len(names); start += maxMultiCreate {
		end := min(start+maxMultiCreate, len(names))
		batch := names[start:end]
		req := &godo.DropletMultiCreateRequest{
			Names:   batch,
			Region:  region,
			Size:    size,
			Image:   godo.DropletCreateImage{Slug: image},
			SSHKeys: []godo.DropletCreateSSHKey{{ID: keyID}},
			Tags:    []string{tag},
		}
		droplets, _, err := c.do.Droplets.CreateMultiple(ctx, req)
		if err != nil {
			return out, fmt.Errorf("create %d droplets in %s: %w", len(batch), region, err)
		}
		for _, d := range droplets {
			out = append(out, fromGodo(d))
		}
	}
	return out, nil
}

// ListByTag returns every droplet carrying the fleet tag, sorted by name.
func (c *Client) ListByTag(ctx context.Context, tag string) ([]Droplet, error) {
	var out []Droplet
	opt := &godo.ListOptions{PerPage: 200}
	for {
		droplets, resp, err := c.do.Droplets.ListByTag(ctx, tag, opt)
		if err != nil {
			return nil, fmt.Errorf("list droplets by tag %s: %w", tag, err)
		}
		for _, d := range droplets {
			out = append(out, fromGodo(d))
		}
		if resp.Links == nil || resp.Links.IsLastPage() {
			break
		}
		opt.Page++
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// DeleteByTag destroys every droplet carrying the tag and waits until the
// listing is empty.
func (c *Client) DeleteByTag(ctx context.Context, tag string) error {
	if _, err := c.do.Droplets.DeleteByTag(ctx, tag); err != nil {
		return fmt.Errorf("delete droplets by tag %s: %w", tag, err)
	}
	deadline := time.Now().Add(3 * time.Minute)
	for {
		left, err := c.ListByTag(ctx, tag)
		if err != nil {
			return err
		}
		if len(left) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d droplets still present after delete-by-tag; check the DO console", len(left))
		}
		log.Info().Int("remaining", len(left)).Msg("waiting for droplets to be destroyed")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

// DeleteDroplet destroys a single droplet by ID (used to trim surplus).
func (c *Client) DeleteDroplet(ctx context.Context, id int) error {
	if _, err := c.do.Droplets.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete droplet %d: %w", id, err)
	}
	return nil
}

// WaitActive polls the tagged fleet until every droplet is active with a
// public IPv4, returning the refreshed listing.
func (c *Client) WaitActive(ctx context.Context, tag string, want int, timeout time.Duration) ([]Droplet, error) {
	deadline := time.Now().Add(timeout)
	lastReady := -1
	for {
		droplets, err := c.ListByTag(ctx, tag)
		if err != nil {
			return nil, err
		}
		ready := 0
		for _, d := range droplets {
			if d.Status == "active" && d.PublicIP != "" {
				ready++
			}
		}
		if ready >= want && len(droplets) >= want {
			return droplets, nil
		}
		if ready != lastReady {
			lastReady = ready
			log.Info().Int("ready", ready).Int("want", want).Msg("waiting for droplets to become active")
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("only %d/%d droplets active after %s", ready, want, timeout)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}
