package storage

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"sort"
	"strings"
)

// Resolver discovers the set of backend S3 endpoints the pool should balance
// across. Resolve is called once at startup and again on every reconcile tick,
// so implementations are expected to re-read their source each call (hot
// reload). Each returned element is a full endpoint URL, e.g.
// "http://10.0.1.5:80".
type Resolver interface {
	Resolve(ctx context.Context) ([]string, error)
	// Describe returns a short human-readable description of the source, for logs.
	Describe() string
}

// FileResolver reads endpoints from a file, one per line. Blank lines and lines
// beginning with '#' are ignored. The file is re-read on every Resolve call, so
// editing it hot-reloads the backend set on the next reconcile tick.
type FileResolver struct {
	Path string
}

func NewFileResolver(path string) *FileResolver {
	return &FileResolver{Path: path}
}

func (r *FileResolver) Describe() string { return "file:" + r.Path }

func (r *FileResolver) Resolve(_ context.Context) ([]string, error) {
	f, err := os.Open(r.Path)
	if err != nil {
		return nil, fmt.Errorf("open backend file: %w", err)
	}
	defer f.Close()

	var endpoints []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		endpoints = append(endpoints, line)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read backend file: %w", err)
	}
	return dedupeSorted(endpoints), nil
}

// DNSResolver resolves a hostname to its A/AAAA records and templates each
// resolved IP into an endpoint URL using Scheme and Port. This maps a headless
// Kubernetes Service (e.g. the Ceph RGW pods) to one backend per pod, so the
// pool balances across gateways directly instead of through a single Service
// VIP. Re-resolved on every reconcile tick to track pod churn.
type DNSResolver struct {
	Host   string
	Scheme string
	Port   string
	// LookupHost is injectable for testing; defaults to net.DefaultResolver.
	LookupHost func(ctx context.Context, host string) ([]string, error)
}

func NewDNSResolver(host, scheme, port string) *DNSResolver {
	return &DNSResolver{
		Host:       host,
		Scheme:     scheme,
		Port:       port,
		LookupHost: net.DefaultResolver.LookupHost,
	}
}

func (r *DNSResolver) Describe() string {
	return fmt.Sprintf("dns:%s://%s:%s", r.Scheme, r.Host, r.Port)
}

func (r *DNSResolver) Resolve(ctx context.Context) ([]string, error) {
	lookup := r.LookupHost
	if lookup == nil {
		lookup = net.DefaultResolver.LookupHost
	}
	addrs, err := lookup(ctx, r.Host)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", r.Host, err)
	}
	endpoints := make([]string, 0, len(addrs))
	for _, addr := range addrs {
		host := addr
		if r.Port != "" {
			host = net.JoinHostPort(addr, r.Port)
		}
		u := url.URL{Scheme: r.Scheme, Host: host}
		endpoints = append(endpoints, u.String())
	}
	return dedupeSorted(endpoints), nil
}

// dedupeSorted removes duplicates and sorts so the reconciler sees a stable,
// order-independent set (DNS in particular returns addresses in varying order).
func dedupeSorted(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}
