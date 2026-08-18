package provider

import (
	"context"
	"strconv"
	"time"

	"yuctl/do"
)

// doProvider adapts the DigitalOcean client (yuctl/do) to Provider. It owns
// no logic of its own — just the Host/Size translation and the int⇄string id
// bridging Provider's opaque ids require.
type doProvider struct{ c *do.Client }

func newDO(ctx context.Context) (Provider, error) {
	c, err := do.NewClient(ctx)
	if err != nil {
		return nil, err
	}
	return &doProvider{c: c}, nil
}

func (p *doProvider) Name() string    { return "do" }
func (p *doProvider) SSHUser() string { return "root" }
func (p *doProvider) Defaults() Defaults {
	return Defaults{
		Regions: []string{"fra1", "ams3", "lon1", "nyc3"},
		Size:    "s-2vcpu-4gb",
		Image:   "ubuntu-24-04-x64",
	}
}

func hostFromDroplet(d do.Droplet) Host {
	return Host{
		ID:       strconv.Itoa(d.ID),
		Name:     d.Name,
		Region:   d.Region,
		SizeSlug: d.SizeSlug,
		PublicIP: d.PublicIP,
		Status:   d.Status,
		Created:  d.Created,
	}
}

func (p *doProvider) ResolveSize(ctx context.Context, slug string) (Size, error) {
	s, err := p.c.GetSize(ctx, slug)
	if err != nil {
		return Size{}, err
	}
	return Size{
		Slug:          s.Slug,
		VCPUs:         s.VCPUs,
		MemoryMB:      s.MemoryMB,
		DiskGB:        s.DiskGB,
		PriceHourly:   s.PriceHourly,
		TransferBytes: s.TransferBytes(),
	}, nil
}

func (p *doProvider) EnsureKey(ctx context.Context, name, publicKey string) (string, error) {
	id, err := p.c.RegisterKey(ctx, name, publicKey)
	if err != nil {
		return "", err
	}
	return strconv.Itoa(id), nil
}

func (p *doProvider) DeleteKey(ctx context.Context, keyID string) error {
	id, err := strconv.Atoi(keyID)
	if err != nil {
		return err
	}
	return p.c.DeleteKey(ctx, id)
}

func (p *doProvider) Create(ctx context.Context, names []string, region, size, image, tag, keyID string) ([]Host, error) {
	id, err := strconv.Atoi(keyID)
	if err != nil {
		return nil, err
	}
	droplets, err := p.c.CreateDroplets(ctx, names, region, size, image, tag, id)
	if err != nil {
		return nil, err
	}
	return mapHosts(droplets), nil
}

func (p *doProvider) List(ctx context.Context, tag string) ([]Host, error) {
	droplets, err := p.c.ListByTag(ctx, tag)
	if err != nil {
		return nil, err
	}
	return mapHosts(droplets), nil
}

func (p *doProvider) WaitActive(ctx context.Context, tag string, want int, timeout time.Duration) ([]Host, error) {
	droplets, err := p.c.WaitActive(ctx, tag, want, timeout)
	if err != nil {
		return nil, err
	}
	return mapHosts(droplets), nil
}

func (p *doProvider) DeleteHost(ctx context.Context, h Host) error {
	id, err := strconv.Atoi(h.ID)
	if err != nil {
		return err
	}
	return p.c.DeleteDroplet(ctx, id)
}

func (p *doProvider) DeleteByTag(ctx context.Context, tag string) error {
	return p.c.DeleteByTag(ctx, tag)
}

// AssignProject files the fleet under the yucca-bench DO project (best-effort;
// the caller logs and continues on error).
func (p *doProvider) AssignProject(ctx context.Context, hosts []Host) error {
	projectID, err := p.c.EnsureProject(ctx)
	if err != nil {
		return err
	}
	ids := make([]int, 0, len(hosts))
	for _, h := range hosts {
		if id, err := strconv.Atoi(h.ID); err == nil {
			ids = append(ids, id)
		}
	}
	return p.c.AssignDroplets(ctx, projectID, ids)
}

func mapHosts(droplets []do.Droplet) []Host {
	out := make([]Host, len(droplets))
	for i, d := range droplets {
		out[i] = hostFromDroplet(d)
	}
	return out
}
