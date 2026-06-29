package cli

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newUsersCmd builds the `users` subtree.
//
// NOTE: `users list` is UNTESTED against a live admin-api. It depends on
// out-of-band setup that does not exist yet: a public OIDC device client for the
// admin scope, and admin-api ingress exposure (in-cluster-only today). The flow
// is implemented to spec (device-authorization → cookie auth → cursor
// pagination) but has not been exercised end-to-end.
func newUsersCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "users",
		Short: "User administration via yucca-admin-api (UNTESTED: needs admin OIDC client + ingress)",
	}
	cmd.AddCommand(newUsersListCmd())
	return cmd
}

func newUsersListCmd() *cobra.Command {
	var (
		issuerFlag   string
		clientIDFlag string
		scopeFlag    string
		adminURLFlag string
		limitFlag    string
		insecure     bool
		reauth       bool
	)
	c := &cobra.Command{
		Use:   "list",
		Short: "List users in the partition's primary region (UNTESTED end-to-end)",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cc, err := requireContext()
			if err != nil {
				return err
			}

			limit, err := adminapi.ParseLimit(limitFlag)
			if err != nil {
				return err
			}

			// Resolve the partition's PRIMARY region (discovery.role=="primary").
			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}
			primary := topo.PrimaryRegion(cc.Partition)
			if primary == "" {
				return fmt.Errorf("no primary region found for partition %q (no stack with discovery.role==\"primary\")", cc.Partition)
			}

			// Derive the admin-api base URL (override > derived from region domain).
			adminURL := adminURLFlag
			if adminURL == "" {
				adminURL = os.Getenv("YUCTL_ADMIN_API_URL")
			}
			if adminURL == "" {
				meta, ok := topo.RegionMeta(cc.Partition, primary)
				if !ok || meta.Domain == "" {
					return fmt.Errorf("cannot derive admin-api URL: region_meta.domain is empty for %s@%s; pass --admin-url or set YUCTL_ADMIN_API_URL", cc.Partition, primary)
				}
				adminURL = "https://yucca-admin-api." + meta.Domain
			}

			issuer := firstNonEmpty(issuerFlag, os.Getenv("OIDC_ADMIN_ISSUER"))
			if issuer == "" {
				return fmt.Errorf("OIDC issuer required: pass --issuer or set OIDC_ADMIN_ISSUER")
			}
			clientID := firstNonEmpty(clientIDFlag, os.Getenv("OIDC_ADMIN_DEVICE_CLIENT_ID"))
			if clientID == "" {
				return fmt.Errorf("OIDC device client id required: pass --client-id or set OIDC_ADMIN_DEVICE_CLIENT_ID")
			}
			scope := firstNonEmpty(scopeFlag, "openid profile email")

			hc := &http.Client{Timeout: 30 * time.Second}
			if insecure {
				tr := http.DefaultTransport.(*http.Transport).Clone()
				tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
				hc.Transport = tr
			}

			// Reuse a cached token unless expired or --reauth.
			token, err := adminapi.LoadToken(cc.Partition)
			if err != nil {
				return err
			}
			if reauth || !token.Valid() {
				fresh, err := adminapi.DeviceLogin(ctx, hc, issuer, clientID, scope, func(verificationURI, userCode, complete string) {
					out := cmd.ErrOrStderr()
					fmt.Fprintln(out, "To authenticate, open the following URL and enter the code:")
					if complete != "" {
						fmt.Fprintf(out, "  %s\n", complete)
					}
					fmt.Fprintf(out, "  URL:  %s\n", verificationURI)
					fmt.Fprintf(out, "  code: %s\n", userCode)
				})
				if err != nil {
					return fmt.Errorf("device login: %w", err)
				}
				token = *fresh
				if err := adminapi.SaveToken(cc.Partition, token); err != nil {
					return err
				}
			}

			client := adminapi.NewClient(adminURL, token, hc)
			users, err := client.ListUsers(ctx, limit)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tSUB\tNAME\tEMAIL\tDISABLED")
			for _, u := range users {
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%t\n", u.ID, u.Sub, u.Name, u.Email, u.Disabled)
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d user(s) in %s@%s (primary)\n", len(users), cc.Partition, primary)
			return nil
		},
	}
	c.Flags().StringVar(&issuerFlag, "issuer", "", "OIDC issuer URL (default: $OIDC_ADMIN_ISSUER)")
	c.Flags().StringVar(&clientIDFlag, "client-id", "", "public OIDC device client id (default: $OIDC_ADMIN_DEVICE_CLIENT_ID)")
	c.Flags().StringVar(&scopeFlag, "scope", "", "OIDC scope (default: openid profile email)")
	c.Flags().StringVar(&adminURLFlag, "admin-url", "", "admin-api base URL (default: derived from region domain or $YUCTL_ADMIN_API_URL)")
	c.Flags().StringVar(&limitFlag, "limit", "", "page size for the admin-api (default: server default)")
	c.Flags().BoolVar(&insecure, "insecure-skip-tls-verify", false, "skip TLS verification")
	c.Flags().BoolVar(&reauth, "reauth", false, "force a fresh device-authorization login")
	return c
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
