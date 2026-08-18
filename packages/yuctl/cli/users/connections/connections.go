package connections

import (
	"fmt"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "connections",
		Short: "A user's connection instances (immich/restic)",
	}
	cmd.AddCommand(newListCmd(f))
	return cmd
}

func newListCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "list <email>",
		Short: "List a user's connections",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			userID, err := client.ResolveUserID(ctx, args[0])
			if err != nil {
				return err
			}
			connections, err := client.GetUserConnections(ctx, userID)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tTYPE\tNAME\tCREATED\tLAST SEEN")
			for _, connection := range connections {
				lastSeen := ""
				if connection.LastSeenAt != nil {
					lastSeen = *connection.LastSeenAt
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", connection.ID, connection.Type, connection.Name, connection.CreatedAt, lastSeen)
			}
			w.Flush()
			return nil
		},
	}
	admin.Register(c)
	return c
}
