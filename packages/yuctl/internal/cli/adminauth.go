package cli

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
	yctx "yuctl/internal/context"
	"yuctl/internal/discovery"
)

// adminFlags is the shared flag set for commands that talk to the admin-api.
type adminFlags struct {
	adminURL  string
	insecure  bool
	reauth    bool
	noBrowser bool
}

func (f *adminFlags) register(c *cobra.Command) {
	c.Flags().StringVar(&f.adminURL, "admin-url", "", "admin-api base URL (default: derived from discovery, or $YUCTL_ADMIN_API_URL)")
	c.Flags().BoolVar(&f.insecure, "insecure-skip-tls-verify", false, "skip TLS verification")
	c.Flags().BoolVar(&f.reauth, "reauth", false, "force a fresh browser login")
	c.Flags().BoolVar(&f.noBrowser, "no-browser", false, "do not auto-open the browser; just print the login URL")
}

func (f *adminFlags) httpClient() *http.Client {
	hc := &http.Client{Timeout: 30 * time.Second}
	if f.insecure {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		hc.Transport = tr
	}
	return hc
}

// deriveAdminURL builds the primary region's admin-api origin from its k8s
// payload: Talos API = kube.<cluster>.<region>.<provider>.yucca.futo.network;
// admin-api = admin.<same NetBird overlay zone> (YUCCA_ADMIN_HOST follows the
// same convention).
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

// resolveAdminURL applies the override chain: --admin-url > $YUCTL_ADMIN_API_URL
// > derived from the primary region's discovery.
func (f *adminFlags) resolveAdminURL(topo *discovery.Topology, cc *yctx.Context) (string, error) {
	if f.adminURL != "" {
		return f.adminURL, nil
	}
	if env := os.Getenv("YUCTL_ADMIN_API_URL"); env != "" {
		return env, nil
	}
	primary := topo.PrimaryRegion(cc.Partition)
	if primary == "" {
		return "", fmt.Errorf("no primary region found for partition %q (no stack with discovery.role==\"primary\")", cc.Partition)
	}
	return deriveAdminURL(topo, cc.Partition, primary)
}

// adminLogin returns an authed admin-api client: cached per-partition session
// when valid, else the browser loopback flow.
func (f *adminFlags) adminLogin(ctx context.Context, cmd *cobra.Command, cc *yctx.Context, topo *discovery.Topology) (*adminapi.Client, *adminapi.Token, error) {
	adminURL, err := f.resolveAdminURL(topo, cc)
	if err != nil {
		return nil, nil, err
	}
	hc := f.httpClient()

	token, err := adminapi.LoadToken(cc.Partition)
	if err != nil {
		return nil, nil, err
	}
	if f.reauth || !token.Valid() {
		var openFn func(string) error
		if !f.noBrowser {
			openFn = openBrowser
		}
		fresh, err := adminapi.BrowserLogin(ctx, hc, adminURL, openFn, func(loginURL string) {
			out := cmd.ErrOrStderr()
			fmt.Fprintln(out, "Complete the login in your browser:")
			fmt.Fprintf(out, "  %s\n", loginURL)
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

// openBrowser opens url in the OS default browser, best-effort.
func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func newLoginCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "login",
		Short: "Log in to the partition's yucca-admin-api via the browser",
		Long: "Authenticate against the selected partition's admin-api (primary region):\n" +
			"opens the admin-api CLI login in your browser, receives a one-time code on a\n" +
			"127.0.0.1 listener, exchanges it for a 24h session JWT, and caches it at\n" +
			"${XDG_CONFIG_HOME:-~/.config}/yuctl/admin-token-<partition>.json.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			cc, err := requireContext()
			if err != nil {
				return err
			}
			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}

			client, token, err := flags.adminLogin(ctx, cmd, cc, topo)
			if err != nil {
				return err
			}

			// Round-trip the session so "login" only succeeds when the API
			// actually accepts the token.
			sub, err := client.GetAuth(ctx)
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "logged in to %s as %s (expires %s)\n",
				cc.Partition, sub, token.Expiry.Local().Format(time.RFC3339))
			return nil
		},
	}
	flags.register(c)
	return c
}
