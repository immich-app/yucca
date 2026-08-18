package cmdutil

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"yuctl/adminapi"
	"yuctl/ctxstore"
	"yuctl/discovery"
)

// AdminFlags is the shared flag set for commands that talk to the admin-api.
type AdminFlags struct {
	URL       string
	Insecure  bool
	Reauth    bool
	NoBrowser bool
}

func (a *AdminFlags) Register(c *cobra.Command) {
	c.Flags().StringVar(&a.URL, "admin-url", "", "admin-api base URL (default: derived from discovery, or $YUCTL_ADMIN_API_URL)")
	c.Flags().BoolVar(&a.Insecure, "insecure-skip-tls-verify", false, "skip TLS verification")
	c.Flags().BoolVar(&a.Reauth, "reauth", false, "force a fresh browser login")
	c.Flags().BoolVar(&a.NoBrowser, "no-browser", false, "do not auto-open the browser; just print the login URL")
}

func (a *AdminFlags) httpClient() *http.Client {
	hc := &http.Client{Timeout: 30 * time.Second}
	if a.Insecure {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		hc.Transport = tr
	}
	return hc
}

// Client resolves context and topology through the factory and returns an
// authenticated admin-api client plus the selected partition. The common path
// for every admin-backed command.
func (a *AdminFlags) Client(ctx context.Context, f *Factory) (*adminapi.Client, string, error) {
	cc, err := f.Context()
	if err != nil {
		return nil, "", err
	}
	topo, err := f.Topology(ctx)
	if err != nil {
		return nil, "", err
	}
	client, _, err := a.Login(ctx, f, cc, topo)
	if err != nil {
		return nil, "", err
	}
	return client, cc.Partition, nil
}

// Login returns an authenticated admin-api client, reusing the cached
// per-partition session when valid and running the browser loopback flow
// otherwise. topo may be nil when the admin URL comes from --admin-url or
// $YUCTL_ADMIN_API_URL.
func (a *AdminFlags) Login(ctx context.Context, f *Factory, cc *ctxstore.Context, topo *discovery.Topology) (*adminapi.Client, *adminapi.Token, error) {
	adminURL, err := a.resolveAdminURL(topo, cc)
	if err != nil {
		return nil, nil, err
	}
	hc := a.httpClient()

	token, err := adminapi.LoadToken(cc.Partition)
	if err != nil {
		return nil, nil, err
	}
	if a.Reauth || !token.Valid() {
		var openFn func(string) error
		if !a.NoBrowser {
			openFn = OpenBrowser
		}
		fresh, err := adminapi.BrowserLogin(ctx, hc, adminURL, openFn, func(loginURL string) {
			fmt.Fprintln(f.IO.Err, "Complete the login in your browser:")
			fmt.Fprintf(f.IO.Err, "  %s\n", loginURL)
		})
		if err != nil {
			return nil, nil, fmt.Errorf("browser login: %w", err)
		}
		token = *fresh
		if err := adminapi.SaveToken(cc.Partition, token); err != nil {
			return nil, nil, err
		}
	}

	return adminapi.NewClient(adminURL, token, hc), &token, nil
}

// OptionalTopology resolves the topology only when Login will need it to
// derive the admin URL — an explicit --admin-url or $YUCTL_ADMIN_API_URL
// skips state access entirely (the context file alone names the token-cache
// partition).
func (a *AdminFlags) OptionalTopology(ctx context.Context, f *Factory) (*discovery.Topology, error) {
	if a.URL != "" || os.Getenv("YUCTL_ADMIN_API_URL") != "" {
		return nil, nil
	}
	return f.Topology(ctx)
}

// resolveAdminURL applies the override chain: --admin-url > $YUCTL_ADMIN_API_URL
// > derived from the primary region's discovery.
func (a *AdminFlags) resolveAdminURL(topo *discovery.Topology, cc *ctxstore.Context) (string, error) {
	if a.URL != "" {
		return a.URL, nil
	}
	if env := os.Getenv("YUCTL_ADMIN_API_URL"); env != "" {
		return env, nil
	}
	if topo == nil {
		return "", fmt.Errorf("no topology available to derive the admin-api URL; pass --admin-url or set YUCTL_ADMIN_API_URL")
	}
	primary := topo.PrimaryRegion(cc.Partition)
	if primary == "" {
		return "", fmt.Errorf("no primary region found for partition %q (no stack with discovery.role==\"primary\")", cc.Partition)
	}
	return deriveAdminURL(topo, cc.Partition, primary)
}

// deriveAdminURL builds the admin-api origin for the partition's primary
// region from its k8s discovery payload: the Talos API endpoint lives at
// kube.<cluster>.<region>.<provider>.yucca.futo.network, and the admin-api is
// published on the same NetBird overlay zone as admin.<...> (the
// YUCCA_ADMIN_HOST cluster-setting follows the same convention).
func deriveAdminURL(topo *discovery.Topology, partition, region string) (string, error) {
	k8s := topo.Kubernetes(partition, region)
	if k8s == nil || k8s.APIEndpoint == "" {
		return "", fmt.Errorf("no kubernetes discovery payload for %s@%s; pass --admin-url or set YUCTL_ADMIN_API_URL", partition, region)
	}
	u, err := url.Parse(k8s.APIEndpoint)
	if err != nil {
		return "", fmt.Errorf("parse api_endpoint %q: %w", k8s.APIEndpoint, err)
	}
	host, ok := strings.CutPrefix(u.Hostname(), "kube.")
	if !ok {
		return "", fmt.Errorf("api_endpoint host %q does not start with kube.; pass --admin-url or set YUCTL_ADMIN_API_URL", u.Hostname())
	}
	return "https://admin." + host, nil
}
