package cli

import (
	"context"
	"fmt"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newReposCmd builds the `repos` subtree: repository administration.
func newReposCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "repos",
		Short: "Repository administration via yucca-admin-api",
	}
	cmd.AddCommand(newReposListCmd())
	cmd.AddCommand(newReposCreateCmd())
	cmd.AddCommand(newReposURLCmd())
	return cmd
}

// resolveUserID turns an --user email into a user id via the admin-api.
func resolveUserID(ctx context.Context, client *adminapi.Client, email string) (string, error) {
	users, err := client.ListUsers(ctx, 0)
	if err != nil {
		return "", err
	}
	for _, u := range users {
		if strings.EqualFold(u.Email, email) {
			return u.ID, nil
		}
	}
	return "", fmt.Errorf("no user with email %q", email)
}

func newReposListCmd() *cobra.Command {
	flags := &adminFlags{}
	var email string
	c := &cobra.Command{
		Use:   "list",
		Short: "List repositories, optionally for one user",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, partition, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}

			userID := ""
			if email != "" {
				if userID, err = resolveUserID(ctx, client, email); err != nil {
					return err
				}
			}

			repos, err := client.ListRepositories(ctx, userID, 0)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tNAME\tWORM\tCONNECTION\tOWNER")
			for _, r := range repos {
				fmt.Fprintf(w, "%s\t%s\t%t\t%s\t%s\n", r.ID, r.Name, r.Worm, r.ConnectionType, r.User.Email)
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d repositories in partition %s\n", len(repos), partition)
			return nil
		},
	}
	c.Flags().StringVar(&email, "user", "", "only this user's repositories (email)")
	flags.register(c)
	return c
}

func newReposCreateCmd() *cobra.Command {
	flags := &adminFlags{}
	var email, connectionType, name string
	var worm bool
	c := &cobra.Command{
		Use:   "create",
		Short: "Create a repository (admin service user, or --user <email>)",
		Long: "Create a repository. Without --user it belongs to the admin service user\n" +
			"(like bench repos). With --user it is provisioned onto that account, attached\n" +
			"to a connection of --connection-type (default restic, i.e. manual restic use).",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}

			opts := adminapi.CreateRepositoryOptions{ConnectionType: connectionType}
			if email != "" {
				if opts.UserID, err = resolveUserID(ctx, client, email); err != nil {
					return err
				}
			} else if connectionType != "" {
				return fmt.Errorf("--connection-type requires --user")
			}

			if name == "" {
				name = "admin-created"
			}
			repo, err := client.CreateRepository(ctx, name, worm, opts)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tNAME\tWORM\tCONNECTION\tOWNER")
			fmt.Fprintf(w, "%s\t%s\t%t\t%s\t%s\n", repo.ID, repo.Name, repo.Worm, repo.ConnectionType, repo.User.Email)
			w.Flush()
			return nil
		},
	}
	c.Flags().StringVar(&email, "user", "", "owner email (default: the admin service user)")
	c.Flags().StringVar(&connectionType, "connection-type", "", "connection type for --user repos (immich|restic; default restic)")
	c.Flags().StringVar(&name, "name", "", "repository name (default: admin-created)")
	c.Flags().BoolVar(&worm, "worm", false, "write-once repository")
	flags.register(c)
	return c
}

func newReposURLCmd() *cobra.Command {
	flags := &adminFlags{}
	var ttl, label string
	c := &cobra.Command{
		Use:   "url <repository-id>",
		Short: "Mint a restic rest: URL for a repository",
		Long: "Mint a restic rest: URL with an embedded repository token. --ttl requests a\n" +
			"custom lifetime (revocable types only, e.g. restic; capped server-side, default\n" +
			"cap 90d). restic-connection jtis can be revoked at any time with\n" +
			"`yuctl tokens revoke <jti>`; immich tokens are unrevocable and stay short-lived.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}

			minted, err := client.RepositoryURL(ctx, args[0], adminapi.URLOptions{ExpiresIn: ttl, Label: label})
			if err != nil {
				return err
			}

			// URL on stdout (pipeable into RESTIC_REPOSITORY); metadata on stderr.
			fmt.Fprintln(cmd.OutOrStdout(), minted.URL)
			fmt.Fprintf(cmd.ErrOrStderr(), "jti:     %s\nexpires: %s\n", minted.Jti, minted.ExpiresAt)
			return nil
		},
	}
	c.Flags().StringVar(&ttl, "ttl", "", "token lifetime, e.g. 30d (default: server default, capped)")
	c.Flags().StringVar(&label, "label", "", "audit label stored on the token")
	flags.register(c)
	return c
}
