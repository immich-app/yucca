package allowlist

import (
	"fmt"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/adminapi"
	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "allowlist",
		Short: "Manage the beta email allowlist and invites",
	}
	cmd.AddCommand(
		newListCmd(f),
		newAddCmd(f),
		newRemoveCmd(f),
		newInviteCmd(f),
		newInviteBatchCmd(f),
	)
	return cmd
}

func printEntries(f *cmdutil.Factory, entries []adminapi.AllowlistEntry) {
	w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
	fmt.Fprintln(w, "EMAIL\tCODE\tINVITED\tUSED\tUSED AT\tCREATED")
	for _, e := range entries {
		usedAt := ""
		if e.InviteUsedAt != nil {
			usedAt = *e.InviteUsedAt
		}
		fmt.Fprintf(w, "%s\t%s\t%t\t%t\t%s\t%s\n", e.Email, e.InviteCode, e.Invited, e.InviteUsed, usedAt, e.CreatedAt)
	}
	w.Flush()
}

func newListCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var limitFlag string
	c := &cobra.Command{
		Use:   "list",
		Short: "List allowlist entries",
		RunE: func(cmd *cobra.Command, args []string) error {
			limit, err := adminapi.ParseLimit(limitFlag)
			if err != nil {
				return err
			}
			client, partition, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			entries, err := client.ListAllowlist(cmd.Context(), limit)
			if err != nil {
				return err
			}
			printEntries(f, entries)
			fmt.Fprintf(f.IO.Err, "\n%d entries in partition %s\n", len(entries), partition)
			return nil
		},
	}
	c.Flags().StringVar(&limitFlag, "limit", "", "page size for the admin-api (default: server default)")
	admin.Register(c)
	return c
}

func newAddCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var staged bool
	c := &cobra.Command{
		Use:   "add <email>",
		Short: "Allow an email to sign up (--staged to waitlist it instead)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			entry, err := client.AddAllowlistEntry(cmd.Context(), args[0], staged)
			if err != nil {
				return err
			}
			printEntries(f, []adminapi.AllowlistEntry{*entry})
			return nil
		},
	}
	c.Flags().BoolVar(&staged, "staged", false, "stage the email without allowing login yet")
	admin.Register(c)
	return c
}

func newRemoveCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "remove <email>",
		Short: "Remove an email from the allowlist",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			if err := client.RemoveAllowlistEntry(cmd.Context(), args[0]); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Err, "removed %s\n", args[0])
			return nil
		},
	}
	admin.Register(c)
	return c
}

func newInviteCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "invite <email>[,<email>...]",
		Short: "Invite emails: allow them to sign up, creating entries as needed",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var emails []string
			for _, arg := range args {
				for email := range strings.SplitSeq(arg, ",") {
					if email = strings.TrimSpace(email); email != "" {
						emails = append(emails, email)
					}
				}
			}
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			entries, err := client.InviteEmails(cmd.Context(), emails)
			if err != nil {
				return err
			}
			printEntries(f, entries)
			return nil
		},
	}
	admin.Register(c)
	return c
}

func newInviteBatchCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "invite-batch <count>",
		Short: "Invite the oldest <count> staged (waitlisted) emails",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			count, err := strconv.Atoi(args[0])
			if err != nil || count < 1 {
				return fmt.Errorf("count must be a positive integer")
			}
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			entries, err := client.InviteBatch(cmd.Context(), count)
			if err != nil {
				return err
			}
			printEntries(f, entries)
			fmt.Fprintf(f.IO.Err, "\ninvited %d entries\n", len(entries))
			return nil
		},
	}
	admin.Register(c)
	return c
}
