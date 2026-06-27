package cli

import (
	"fmt"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"yuctl/internal/ceph"
	yctx "yuctl/internal/context"
)

func newCephCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ceph",
		Short: "Ceph cluster operations within the selected region",
	}
	cmd.AddCommand(newCephSelectCmd(), newCephGetCmd())
	return cmd
}

func newCephSelectCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "select <name>",
		Short: "Select a Ceph cluster within the active region",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			name := args[0]

			c, err := requireContext()
			if err != nil {
				return err
			}
			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}
			clusters := topo.CephClusters(c.Partition, c.Region)
			if _, ok := clusters[name]; !ok {
				return fmt.Errorf("unknown ceph cluster %q in %s@%s; known: %s",
					name, c.Partition, c.Region, strings.Join(cephClusterNames(clusters), ", "))
			}

			c.CephCluster = name
			if err := yctx.Save(c); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "selected ceph cluster %q in %s@%s\n", name, c.Partition, c.Region)
			return nil
		},
	}
}

func newCephGetCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get",
		Short: "Read Ceph cluster state",
	}
	cmd.AddCommand(newCephGetHealthCmd())
	return cmd
}

func newCephGetHealthCmd() *cobra.Command {
	var insecure bool
	c := &cobra.Command{
		Use:   "health",
		Short: "Probe the selected Ceph cluster's RGW/dashboard health",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cc, err := requireContext()
			if err != nil {
				return err
			}
			if cc.CephCluster == "" {
				return fmt.Errorf("no ceph cluster selected; run `yuctl ceph select <name>` first")
			}
			topo, err := resolveTopology(ctx)
			if err != nil {
				return err
			}
			clusters := topo.CephClusters(cc.Partition, cc.Region)
			cluster, ok := clusters[cc.CephCluster]
			if !ok {
				return fmt.Errorf("ceph cluster %q no longer present in %s@%s", cc.CephCluster, cc.Partition, cc.Region)
			}

			res, err := ceph.CheckHealth(ctx, cluster, insecure)
			if err != nil {
				return err
			}
			status := "HEALTHY"
			if !res.Healthy {
				status = "UNHEALTHY"
			}
			out := cmd.OutOrStdout()
			fmt.Fprintf(out, "ceph cluster: %s (%s@%s)\n", cc.CephCluster, cc.Partition, cc.Region)
			fmt.Fprintf(out, "endpoint:     %s\n", res.Endpoint)
			fmt.Fprintf(out, "status:       %s (http %d)\n", status, res.StatusCode)
			if res.Detail != "" {
				fmt.Fprintf(out, "detail:       %s\n", truncate(res.Detail, 200))
			}
			if !res.Healthy {
				return fmt.Errorf("ceph health check failed")
			}
			return nil
		},
	}
	c.Flags().BoolVar(&insecure, "insecure-skip-tls-verify", false, "skip TLS verification (self-signed RGW/dashboard certs)")
	return c
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// sortedKeys of the ceph cluster map.
func cephClusterNames[T any](m map[string]T) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
