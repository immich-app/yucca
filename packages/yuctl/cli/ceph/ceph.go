// Package ceph implements `yuctl ceph`: Ceph cluster operations within the
// selected region.
package ceph

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"yuctl/cephhealth"
	"yuctl/cmdutil"
	"yuctl/ctxstore"
	"yuctl/ui"
)

func New(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ceph",
		Short: "Ceph cluster operations within the selected region",
	}
	cmd.AddCommand(newSelectCmd(f), newGetCmd(f))
	return cmd
}

func newSelectCmd(f *cmdutil.Factory) *cobra.Command {
	return &cobra.Command{
		Use:   "select <name>",
		Short: "Select a Ceph cluster within the active region",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]

			c, err := f.Context()
			if err != nil {
				return err
			}
			topo, err := f.Topology(cmd.Context())
			if err != nil {
				return err
			}
			if _, ok := topo.CephClusters(c.Partition, c.Region)[name]; !ok {
				return fmt.Errorf("unknown ceph cluster %q in %s@%s; known: %s",
					name, c.Partition, c.Region, strings.Join(topo.CephClusterNames(c.Partition, c.Region), ", "))
			}

			c.CephCluster = name
			if err := ctxstore.Save(c); err != nil {
				return err
			}
			fmt.Fprintf(f.IO.Out, "selected ceph cluster %q in %s@%s\n", name, c.Partition, c.Region)
			return nil
		},
	}
}

func newGetCmd(f *cmdutil.Factory) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get",
		Short: "Read Ceph cluster state",
	}
	cmd.AddCommand(newGetHealthCmd(f))
	return cmd
}

func newGetHealthCmd(f *cmdutil.Factory) *cobra.Command {
	var insecure bool
	c := &cobra.Command{
		Use:   "health",
		Short: "Probe the selected Ceph cluster's RGW/dashboard health",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			cc, err := f.Context()
			if err != nil {
				return err
			}
			if cc.CephCluster == "" {
				return fmt.Errorf("no ceph cluster selected; run `yuctl ceph select <name>` first")
			}
			topo, err := f.Topology(ctx)
			if err != nil {
				return err
			}
			cluster, ok := topo.CephClusters(cc.Partition, cc.Region)[cc.CephCluster]
			if !ok {
				return fmt.Errorf("ceph cluster %q no longer present in %s@%s", cc.CephCluster, cc.Partition, cc.Region)
			}

			res, err := cephhealth.CheckHealth(ctx, cluster, insecure)
			if err != nil {
				return err
			}
			status := "HEALTHY"
			if !res.Healthy {
				status = "UNHEALTHY"
			}
			out := f.IO.Out
			fmt.Fprintf(out, "ceph cluster: %s (%s@%s)\n", cc.CephCluster, cc.Partition, cc.Region)
			fmt.Fprintf(out, "endpoint:     %s\n", res.Endpoint)
			fmt.Fprintf(out, "status:       %s (http %d)\n", status, res.StatusCode)
			if res.Detail != "" {
				fmt.Fprintf(out, "detail:       %s\n", ui.Truncate(res.Detail, 200))
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
