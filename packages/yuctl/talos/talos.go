// Package talos wraps Talos node operations (talosctl) for a region's K8s cluster,
// resolving the talosconfig from 1Password to a 0600 temp file and driving
// `talosctl upgrade` against the control-plane node IPs from discovery.
package talos

import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/rs/zerolog"

	"yuctl/op"
	"yuctl/state"
)

// UpgradeOptions controls a talos upgrade run.
type UpgradeOptions struct {
	// Image, when set, is passed as `--image` (the target installer image).
	Image string
	// DryRun prints the talosctl commands instead of executing them.
	DryRun bool
	// Nodes overrides the control-plane node IPs from discovery (optional).
	Nodes []string
}

// TalosUpgrade resolves the talosconfig referenced by the kubernetes payload and
// runs `talosctl upgrade` against each control-plane node. The temp talosconfig
// is removed on return. With DryRun the commands are only logged.
func Upgrade(ctx context.Context, k state.Kubernetes, opts UpgradeOptions, logger zerolog.Logger) error {
	nodes := opts.Nodes
	if len(nodes) == 0 {
		nodes = k.CPNodeIPs
	}
	if len(nodes) == 0 {
		return fmt.Errorf("no control-plane node IPs in discovery and none provided")
	}
	if k.TalosconfigRef == "" {
		return fmt.Errorf("kubernetes discovery payload has no talosconfig_ref")
	}

	cfgPath, err := op.ReadToTempFile(ctx, k.TalosconfigRef, "yuctl-talosconfig-*.yaml")
	if err != nil {
		return fmt.Errorf("materialize talosconfig: %w", err)
	}
	defer os.Remove(cfgPath)

	for _, node := range nodes {
		args := []string{"--talosconfig", cfgPath, "--nodes", node}
		if k.APIEndpoint != "" {
			args = append(args, "--endpoints", endpointHost(k.APIEndpoint))
		}
		args = append(args, "upgrade")
		if opts.Image != "" {
			args = append(args, "--image", opts.Image)
		}

		if opts.DryRun {
			logger.Info().Str("node", node).Strs("argv", append([]string{"talosctl"}, args...)).Msg("[dry-run] talosctl upgrade")
			continue
		}

		logger.Info().Str("node", node).Msg("talosctl upgrade")
		cmd := exec.CommandContext(ctx, "talosctl", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("talosctl upgrade node %s: %w", node, err)
		}
	}
	return nil
}

// endpointHost strips a scheme/port from an api_endpoint so it can be used as a
// talosctl --endpoints host. talosctl wants the host, not a URL.
func endpointHost(endpoint string) string {
	host := endpoint
	for _, p := range []string{"https://", "http://"} {
		if len(host) > len(p) && host[:len(p)] == p {
			host = host[len(p):]
		}
	}
	// drop any path
	if i := indexByte(host, '/'); i >= 0 {
		host = host[:i]
	}
	// drop any port
	if i := indexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	return host
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}
