package cli

import (
	"encoding/json"
	"fmt"
	"maps"
	"strconv"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
)

// newConfigCmd builds the `config` subtree: scoped mutable config (global/site/
// cluster overrides of restic_pack_size_mib, connections_math, …) stored by
// yucca-admin-api, served via GET /api/meta.
func newConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Manage scoped config overrides (global / site / cluster) via yucca-admin-api",
	}
	cmd.AddCommand(newConfigListCmd())
	cmd.AddCommand(newConfigGetCmd())
	cmd.AddCommand(newConfigSetCmd())
	cmd.AddCommand(newConfigUnsetCmd())
	return cmd
}

// scopeFlags resolves --site/--cluster into a settings scope string.
type scopeFlags struct {
	site    string
	cluster string
}

func (s *scopeFlags) register(c *cobra.Command) {
	c.Flags().StringVar(&s.site, "site", "", "scope to a site (region_code), e.g. --site htz-fsn1")
	c.Flags().StringVar(&s.cluster, "cluster", "", "scope to a storage cluster, e.g. --cluster spice")
	c.MarkFlagsMutuallyExclusive("site", "cluster")
}

func (s *scopeFlags) scope() string {
	switch {
	case s.site != "":
		return "site:" + s.site
	case s.cluster != "":
		return "cluster:" + s.cluster
	default:
		return "global"
	}
}

func newConfigListCmd() *cobra.Command {
	flags := &adminFlags{}
	c := &cobra.Command{
		Use:   "list",
		Short: "List every settings scope and its overrides",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, partition, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entries, err := client.ListSettings(cmd.Context())
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "SCOPE\tVALUE\tUPDATED")
			for _, e := range entries {
				value, err := json.Marshal(e.Value)
				if err != nil {
					return err
				}
				fmt.Fprintf(w, "%s\t%s\t%s\n", e.Scope, value, e.UpdatedAt)
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d scope(s) in partition %s\n", len(entries), partition)
			return nil
		},
	}
	flags.register(c)
	return c
}

func newConfigGetCmd() *cobra.Command {
	flags := &adminFlags{}
	scope := &scopeFlags{}
	c := &cobra.Command{
		Use:   "get",
		Short: "Print the overrides stored for a scope",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			entries, err := client.ListSettings(cmd.Context())
			if err != nil {
				return err
			}
			value := map[string]any{}
			for _, e := range entries {
				if e.Scope == scope.scope() {
					value = e.Value
					break
				}
			}
			out, err := json.MarshalIndent(value, "", "  ")
			if err != nil {
				return err
			}
			fmt.Fprintln(cmd.OutOrStdout(), string(out))
			return nil
		},
	}
	scope.register(c)
	flags.register(c)
	return c
}

func newConfigSetCmd() *cobra.Command {
	flags := &adminFlags{}
	scope := &scopeFlags{}
	c := &cobra.Command{
		Use:   "set key=value [key=value ...]",
		Short: "Set override keys on a scope (read-modify-write; other keys are kept)",
		Long: "Merge the given key=value pairs into the scope's stored overrides and PUT the\n" +
			"result. Values are parsed as int/bool when they look like one, else kept as\n" +
			"strings — e.g.:\n" +
			"  yuctl config set restic_pack_size_mib=32\n" +
			"  yuctl config set --site htz-fsn1 connections_math='min(16, cores * 2)'",
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			updates := map[string]any{}
			for _, arg := range args {
				key, raw, ok := strings.Cut(arg, "=")
				if !ok || key == "" {
					return fmt.Errorf("expected key=value, got %q", arg)
				}
				updates[key] = parseValue(raw)
			}

			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()

			value, err := currentValue(cmd, client, scope.scope())
			if err != nil {
				return err
			}
			maps.Copy(value, updates)

			entry, err := client.SetSettings(ctx, scope.scope(), value)
			if err != nil {
				return err
			}
			out, err := json.Marshal(entry.Value)
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s = %s\n", entry.Scope, out)
			return nil
		},
	}
	scope.register(c)
	flags.register(c)
	return c
}

func newConfigUnsetCmd() *cobra.Command {
	flags := &adminFlags{}
	scope := &scopeFlags{}
	var all bool
	c := &cobra.Command{
		Use:   "unset [key ...]",
		Short: "Remove override keys from a scope (--all clears the whole scope)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if all == (len(args) > 0) {
				return fmt.Errorf("pass either keys to unset or --all")
			}

			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()

			if all {
				if err := client.DeleteSettings(ctx, scope.scope()); err != nil {
					return err
				}
				fmt.Fprintf(cmd.OutOrStdout(), "%s cleared\n", scope.scope())
				return nil
			}

			value, err := currentValue(cmd, client, scope.scope())
			if err != nil {
				return err
			}
			for _, key := range args {
				delete(value, key)
			}

			if len(value) == 0 {
				if err := client.DeleteSettings(ctx, scope.scope()); err != nil {
					return err
				}
				fmt.Fprintf(cmd.OutOrStdout(), "%s cleared\n", scope.scope())
				return nil
			}

			entry, err := client.SetSettings(ctx, scope.scope(), value)
			if err != nil {
				return err
			}
			out, err := json.Marshal(entry.Value)
			if err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "%s = %s\n", entry.Scope, out)
			return nil
		},
	}
	c.Flags().BoolVar(&all, "all", false, "delete the whole scope instead of individual keys")
	scope.register(c)
	flags.register(c)
	return c
}

func currentValue(cmd *cobra.Command, client *adminapi.Client, scope string) (map[string]any, error) {
	entries, err := client.ListSettings(cmd.Context())
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if e.Scope == scope {
			if e.Value == nil {
				return map[string]any{}, nil
			}
			return e.Value, nil
		}
	}
	return map[string]any{}, nil
}

// parseValue keeps the CLI ergonomic: ints and bools become JSON numbers and
// booleans, everything else stays a string (the admin-api validates types).
func parseValue(raw string) any {
	if n, err := strconv.Atoi(raw); err == nil {
		return n
	}
	if b, err := strconv.ParseBool(raw); err == nil {
		return b
	}
	return raw
}
