// Package invites manages Discord closed-beta invite claims and drops via the
// partition's yucca-admin-api.
package invites

import (
	"fmt"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/cmdutil"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "invites",
		Short: "Discord closed-beta invite administration via yucca-admin-api",
	}
	cmd.AddCommand(
		newListCmd(f),
		newBatchesCmd(f),
		newRevokeCmd(f),
		newCancelCmd(f),
	)
	return cmd
}

func newListCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "list",
		Short: "List Discord beta-invite claims",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, partition, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			claims, err := client.ListInviteClaims(ctx)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "DISCORD ID\tUSERNAME\tBATCH\tREDEEMED\tCLAIMED AT")
			for _, claim := range claims {
				username := ""
				if claim.DiscordUsername != nil {
					username = *claim.DiscordUsername
				}
				batch := ""
				if claim.BatchID != nil {
					batch = *claim.BatchID
				}
				redeemed := "no"
				if claim.InviteUsed {
					redeemed = "yes"
					if claim.InviteUsedAt != nil {
						redeemed = *claim.InviteUsedAt
					}
				}
				fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", claim.DiscordUserID, username, batch, redeemed, claim.CreatedAt)
			}
			w.Flush()
			fmt.Fprintf(f.IO.Err, "\n%d claim(s) in partition %s\n", len(claims), partition)
			return nil
		},
	}
	admin.Register(c)
	return c
}

func newBatchesCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	c := &cobra.Command{
		Use:   "batches",
		Short: "List invite drops with their claim counts",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			client, partition, err := admin.Client(ctx, f)
			if err != nil {
				return err
			}
			batches, err := client.ListInviteBatches(ctx)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(f.IO.Out, 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "ID\tCHANNEL\tCLAIMED\tREDEEMED\tCREATED BY\tCREATED AT\tCANCELLED")
			for _, batch := range batches {
				cancelled := ""
				if batch.CancelledAt != nil {
					cancelled = *batch.CancelledAt
				}
				fmt.Fprintf(w, "%s\t%s\t%d/%d\t%d\t%s\t%s\t%s\n",
					batch.ID, batch.ChannelID, batch.Claimed, batch.MaxClaims, batch.Used,
					batch.CreatedByDiscordUserID, batch.CreatedAt, cancelled)
			}
			w.Flush()
			fmt.Fprintf(f.IO.Err, "\n%d batch(es) in partition %s\n", len(batches), partition)
			return nil
		},
	}
	admin.Register(c)
	return c
}

func newRevokeCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var discordID string
	c := &cobra.Command{
		Use:   "revoke",
		Short: "Revoke an unredeemed beta-invite claim",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			if err := client.RevokeInviteClaim(cmd.Context(), discordID); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "revoked the invite claim of discord user %s\n", discordID)
			return nil
		},
	}
	c.Flags().StringVar(&discordID, "discord-id", "", "discord user id (snowflake)")
	_ = c.MarkFlagRequired("discord-id")
	admin.Register(c)
	return c
}

func newCancelCmd(f *cmdutil.Factory) *cobra.Command {
	admin := &cmdutil.AdminFlags{}
	var revokeUnused bool
	c := &cobra.Command{
		Use:   "cancel <batch-id>",
		Short: "Cancel an invite drop (stops further claims and disables its button)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			client, _, err := admin.Client(cmd.Context(), f)
			if err != nil {
				return err
			}
			result, err := client.CancelInviteBatch(cmd.Context(), args[0], revokeUnused)
			if err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "cancelled batch %s (%d/%d claimed, %d redeemed)\n",
				result.Batch.ID, result.Batch.Claimed, result.Batch.MaxClaims, result.Batch.Used)
			if revokeUnused {
				fmt.Fprintf(f.IO.Out, "revoked %d unredeemed claim(s)\n", result.RevokedClaims)
			}
			return nil
		},
	}
	c.Flags().BoolVar(&revokeUnused, "revoke-unused", false, "also delete the batch's unredeemed claims")
	admin.Register(c)
	return c
}
