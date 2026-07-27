package cli

import (
	"fmt"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newTokensCmd builds the `tokens` subtree: minted restic-token auditing and
// revocation.
func newTokensCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "tokens",
		Short: "Audit and revoke minted restic tokens",
	}
	cmd.AddCommand(newTokensListCmd())
	cmd.AddCommand(newTokensRevokeCmd())
	return cmd
}

func newTokensListCmd() *cobra.Command {
	flags := &adminFlags{}
	var email, repositoryID string
	var active bool
	c := &cobra.Command{
		Use:   "list",
		Short: "List minted restic tokens",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, partition, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}

			filters := adminapi.TokenFilters{RepositoryID: repositoryID, Active: active}
			if email != "" {
				if filters.UserID, err = resolveUserID(ctx, client, email); err != nil {
					return err
				}
			}

			tokens, err := client.ListTokens(ctx, filters, 0)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "JTI\tREPOSITORY\tMINTED BY\tLABEL\tEXPIRES\tREVOKED")
			for _, t := range tokens {
				label, revoked := "", ""
				if t.Label != nil {
					label = *t.Label
				}
				if t.RevokedAt != nil {
					revoked = *t.RevokedAt
					if t.RevokedBy != nil {
						revoked += " by " + *t.RevokedBy
					}
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\t%s\n", t.Jti, t.RepositoryID, t.MintedBy, label, t.ExpiresAt, revoked)
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d token(s) in partition %s\n", len(tokens), partition)
			return nil
		},
	}
	c.Flags().StringVar(&email, "user", "", "only this user's tokens (email)")
	c.Flags().StringVar(&repositoryID, "repository", "", "only this repository's tokens (id)")
	c.Flags().BoolVar(&active, "active", false, "only unexpired, unrevoked tokens")
	flags.register(c)
	return c
}

func newTokensRevokeCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "revoke <jti>",
		Short: "Revoke a minted restic token",
		Long: "Revoke a minted restic token by jti. michael rejects it within its check\n" +
			"cache TTL (seconds); the DB row is the durable record and the reconcile cron\n" +
			"re-seeds Redis if it was unreachable at revoke time.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			if err := client.RevokeToken(cmd.Context(), args[0]); err != nil {
				return err
			}
			fmt.Fprintf(cmd.ErrOrStderr(), "revoked %s\n", args[0])
			return nil
		},
	}
	flags.register(c)
	return c
}
