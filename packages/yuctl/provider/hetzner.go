package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/rs/zerolog/log"

	"yuctl/op"
)

// hetznerTokenRef is the 1Password item holding the Hetzner Cloud API token;
// $HCLOUD_TOKEN skips op entirely, $YUCTL_HCLOUD_TOKEN_REF overrides the ref.
const hetznerTokenRef = "op://yucca_tf_prod/HCLOUD_API_TOKEN/password"

// fleetLabel is the Hetzner label key carrying the fleet-bench fleet tag; the
// tag is the value, and list/destroy select on it.
const fleetLabel = "yuctl-fleet"

// hetznerProvider talks to the Hetzner Cloud API (https://api.hetzner.cloud/v1)
// over plain net/http — the surface fleet-bench needs is small enough that a
// full SDK dependency isn't worth it.
type hetznerProvider struct {
	token string
	http  *http.Client
}

func newHetzner(ctx context.Context) (Provider, error) {
	token := os.Getenv("HCLOUD_TOKEN")
	if token == "" {
		ref := os.Getenv("YUCTL_HCLOUD_TOKEN_REF")
		if ref == "" {
			ref = hetznerTokenRef
		}
		log.Info().Str("ref", ref).Msg("reading Hetzner Cloud API token from 1Password (may prompt to unlock)")
		v, err := op.Read(ctx, ref)
		if err != nil {
			return nil, fmt.Errorf("resolve Hetzner Cloud API token: %w", err)
		}
		token = v
	}
	return &hetznerProvider{token: token, http: &http.Client{Timeout: 30 * time.Second}}, nil
}

func (p *hetznerProvider) Name() string    { return "hetzner" }
func (p *hetznerProvider) SSHUser() string { return "root" }
func (p *hetznerProvider) Defaults() Defaults {
	// fsn1 = Falkenstein (same metro as the prod cluster's transit); cpx42 is
	// the 8-vCPU shared AMD size confirmed available there.
	return Defaults{Regions: []string{"fsn1"}, Size: "cpx42", Image: "ubuntu-24.04"}
}

// req issues an authenticated JSON request and decodes a 2xx body into out
// (out may be nil). Non-2xx bodies carry the Hetzner {error:{message}} shape.
func (p *hetznerProvider) req(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, "https://api.hetzner.cloud/v1"+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.http.Do(req)
	if err != nil {
		return fmt.Errorf("hetzner %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var e struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		if e.Error.Message != "" {
			return fmt.Errorf("hetzner %s %s: %s (%s)", method, path, e.Error.Message, e.Error.Code)
		}
		return fmt.Errorf("hetzner %s %s: status %d", method, path, resp.StatusCode)
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("hetzner %s %s: decode: %w", method, path, err)
		}
	}
	return nil
}

// hServer is the subset of a Hetzner server object we read.
type hServer struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Created   string `json:"created"`
	PublicNet struct {
		IPv4 struct {
			IP string `json:"ip"`
		} `json:"ipv4"`
	} `json:"public_net"`
	Datacenter struct {
		Location struct {
			Name string `json:"name"`
		} `json:"location"`
	} `json:"datacenter"`
	ServerType struct {
		Name string `json:"name"`
	} `json:"server_type"`
}

func (s hServer) host() Host {
	h := Host{
		ID:       strconv.FormatInt(s.ID, 10),
		Name:     s.Name,
		Region:   s.Datacenter.Location.Name,
		SizeSlug: s.ServerType.Name,
		PublicIP: s.PublicNet.IPv4.IP,
		Status:   s.Status,
	}
	if t, err := time.Parse(time.RFC3339, s.Created); err == nil {
		h.Created = t
	}
	return h
}

func (p *hetznerProvider) ResolveSize(ctx context.Context, slug string) (Size, error) {
	var out struct {
		ServerTypes []struct {
			Name   string  `json:"name"`
			Cores  int     `json:"cores"`
			Memory float64 `json:"memory"` // GB
			Disk   int     `json:"disk"`   // GB
			Prices []struct {
				PriceHourly struct {
					Gross string `json:"gross"`
				} `json:"price_hourly"`
				IncludedTraffic int64 `json:"included_traffic"` // bytes
			} `json:"prices"`
		} `json:"server_types"`
	}
	if err := p.req(ctx, http.MethodGet, "/server_types?per_page=100", nil, &out); err != nil {
		return Size{}, err
	}
	for _, st := range out.ServerTypes {
		if st.Name != slug {
			continue
		}
		sz := Size{Slug: st.Name, VCPUs: st.Cores, MemoryMB: int(st.Memory * 1024), DiskGB: st.Disk}
		if len(st.Prices) > 0 {
			sz.PriceHourly, _ = strconv.ParseFloat(st.Prices[0].PriceHourly.Gross, 64)
			sz.TransferBytes = st.Prices[0].IncludedTraffic
		}
		if sz.TransferBytes <= 0 {
			sz.TransferBytes = 20 * 1e12 // Hetzner's typical 20 TB inclusion
		}
		return sz, nil
	}
	return Size{}, fmt.Errorf("unknown Hetzner server type %q", slug)
}

func (p *hetznerProvider) EnsureKey(ctx context.Context, name, publicKey string) (string, error) {
	// Delete any same-named leftover first.
	var existing struct {
		SSHKeys []struct {
			ID int64 `json:"id"`
		} `json:"ssh_keys"`
	}
	if err := p.req(ctx, http.MethodGet, "/ssh_keys?name="+name, nil, &existing); err != nil {
		return "", err
	}
	for _, k := range existing.SSHKeys {
		log.Warn().Str("key", name).Msg("deleting leftover Hetzner ssh key of the same name")
		_ = p.req(ctx, http.MethodDelete, "/ssh_keys/"+strconv.FormatInt(k.ID, 10), nil, nil)
	}
	var out struct {
		SSHKey struct {
			ID int64 `json:"id"`
		} `json:"ssh_key"`
	}
	body := map[string]any{"name": name, "public_key": publicKey}
	if err := p.req(ctx, http.MethodPost, "/ssh_keys", body, &out); err != nil {
		return "", err
	}
	return strconv.FormatInt(out.SSHKey.ID, 10), nil
}

func (p *hetznerProvider) DeleteKey(ctx context.Context, keyID string) error {
	return p.req(ctx, http.MethodDelete, "/ssh_keys/"+keyID, nil, nil)
}

func (p *hetznerProvider) Create(ctx context.Context, names []string, region, size, image, tag, keyID string) ([]Host, error) {
	id, err := strconv.ParseInt(keyID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("hetzner ssh key id %q: %w", keyID, err)
	}
	var hosts []Host
	for _, name := range names {
		body := map[string]any{
			"name":        name,
			"server_type": size,
			"image":       image,
			"location":    region,
			"ssh_keys":    []int64{id},
			"labels":      map[string]string{fleetLabel: tag},
		}
		var out struct {
			Server hServer `json:"server"`
		}
		if err := p.req(ctx, http.MethodPost, "/servers", body, &out); err != nil {
			return hosts, fmt.Errorf("create hetzner server %s in %s: %w", name, region, err)
		}
		hosts = append(hosts, out.Server.host())
	}
	return hosts, nil
}

func (p *hetznerProvider) List(ctx context.Context, tag string) ([]Host, error) {
	var out struct {
		Servers []hServer `json:"servers"`
	}
	if err := p.req(ctx, http.MethodGet, "/servers?label_selector="+fleetLabel+"="+tag+"&per_page=100", nil, &out); err != nil {
		return nil, err
	}
	hosts := make([]Host, len(out.Servers))
	for i, s := range out.Servers {
		hosts[i] = s.host()
	}
	sort.Slice(hosts, func(i, j int) bool { return hosts[i].Name < hosts[j].Name })
	return hosts, nil
}

func (p *hetznerProvider) WaitActive(ctx context.Context, tag string, want int, timeout time.Duration) ([]Host, error) {
	deadline := time.Now().Add(timeout)
	lastReady := -1
	for {
		hosts, err := p.List(ctx, tag)
		if err != nil {
			return nil, err
		}
		ready := 0
		for _, h := range hosts {
			if h.Status == "running" && h.PublicIP != "" {
				ready++
			}
		}
		if ready >= want && len(hosts) >= want {
			return hosts, nil
		}
		if ready != lastReady {
			lastReady = ready
			log.Info().Int("ready", ready).Int("want", want).Msg("waiting for hetzner servers to become active")
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("only %d/%d hetzner servers active after %s", ready, want, timeout)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func (p *hetznerProvider) DeleteHost(ctx context.Context, h Host) error {
	return p.req(ctx, http.MethodDelete, "/servers/"+h.ID, nil, nil)
}

func (p *hetznerProvider) DeleteByTag(ctx context.Context, tag string) error {
	hosts, err := p.List(ctx, tag)
	if err != nil {
		return err
	}
	for _, h := range hosts {
		if err := p.DeleteHost(ctx, h); err != nil {
			return fmt.Errorf("delete hetzner server %s: %w", h.Name, err)
		}
	}
	deadline := time.Now().Add(3 * time.Minute)
	for {
		left, err := p.List(ctx, tag)
		if err != nil {
			return err
		}
		if len(left) == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%d hetzner servers still present after delete", len(left))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

// AssignProject is a no-op: Hetzner Cloud has no project-assignment API step
// (the token is already scoped to a project).
func (p *hetznerProvider) AssignProject(ctx context.Context, hosts []Host) error { return nil }
