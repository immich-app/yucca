// Package cli wires the yuctl command tree (spf13/cobra). cobra is a documented
// divergence from michael's stdlib-only style, justified by yuctl's nested
// subcommand surface. Logging matches michael (rs/zerolog).
package cli

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	cephcmd "yuctl/cli/ceph"
	columbocmd "yuctl/cli/columbo"
	configcmd "yuctl/cli/config"
	featurescmd "yuctl/cli/features"
	infracmd "yuctl/cli/infra"
	invitescmd "yuctl/cli/invites"
	toolscmd "yuctl/cli/tools"
	userscmd "yuctl/cli/users"
	"yuctl/cmdutil"
	"yuctl/ctxstore"
	"yuctl/discovery"
	"yuctl/ui"
)

var (
	flagLogLevel         string
	flagLogFormat        string
	flagRefreshDiscovery bool
)

func NewRootCmd() *cobra.Command {
	f := newFactory()

	root := &cobra.Command{
		Use:   "yuctl",
		Short: "yucca operations CLI",
		Long: "yuctl resolves the yucca partition/region/ceph topology from Terraform\n" +
			"discovery outputs (read directly from S3 state) and drives day-2 ops:\n" +
			"selecting a context, checking Ceph health, upgrading Talos, and listing users.",
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			return setupLogging()
		},
	}

	root.PersistentFlags().StringVar(&flagLogLevel, "log-level", "info", "log level (trace, debug, info, warn, error)")
	root.PersistentFlags().StringVar(&flagLogFormat, "log-format", "pretty", "log format (pretty|json)")
	root.PersistentFlags().BoolVar(&flagRefreshDiscovery, "refresh-discovery", false,
		"bypass the cached topology and re-read Terraform state from S3")

	root.AddCommand(
		newSelectCmd(f),
		newLoginCmd(f),
		cephcmd.New(f),
		infracmd.New(f),
		userscmd.New(f),
		invitescmd.New(f),
		columbocmd.New(f),
		configcmd.New(f),
		featurescmd.New(f),
		toolscmd.New(f),
	)
	return root
}

// Topology is memoized: several layers of one command may need it (host
// resolution, admin URL derivation) but state is read at most once.
func newFactory() *cmdutil.Factory {
	f := &cmdutil.Factory{IO: ui.System()}

	f.Context = func() (*ctxstore.Context, error) {
		c, err := ctxstore.Load()
		if err != nil {
			return nil, err
		}
		if !c.Selected() {
			return nil, fmt.Errorf("no context selected; run `yuctl select <partition>@<region>` first")
		}
		return c, nil
	}

	var topo *discovery.Topology
	f.Topology = func(ctx context.Context) (*discovery.Topology, error) {
		if topo != nil {
			return topo, nil
		}
		var err error
		topo, err = resolveTopology(ctx)
		return topo, err
	}
	return f
}

func setupLogging() error {
	zerolog.TimeFieldFormat = time.RFC3339
	level, err := zerolog.ParseLevel(flagLogLevel)
	if err != nil {
		return fmt.Errorf("invalid --log-level %q", flagLogLevel)
	}
	zerolog.SetGlobalLevel(level)

	switch flagLogFormat {
	case "json":
		log.Logger = zerolog.New(os.Stderr).With().Timestamp().Logger()
	case "pretty":
		log.Logger = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}).
			With().Timestamp().Logger()
	default:
		return fmt.Errorf("invalid --log-format %q (want pretty|json)", flagLogFormat)
	}
	return nil
}

// resolveTopology returns the cached topology when fresh (see
// discovery.LoadCachedTopology; TTL 1h, YUCTL_DISCOVERY_TTL to override,
// --refresh-discovery to bypass), otherwise builds the discovery client,
// resolves live from S3 state, and refreshes the cache.
func resolveTopology(ctx context.Context) (*discovery.Topology, error) {
	if !flagRefreshDiscovery {
		if topo, ok := discovery.LoadCachedTopology(log.Logger); ok {
			return topo, nil
		}
	}
	client, err := discovery.NewClient(ctx, log.Logger)
	if err != nil {
		return nil, err
	}
	topo, err := client.Resolve(ctx)
	if err != nil {
		return nil, err
	}
	discovery.SaveCachedTopology(topo, log.Logger)
	return topo, nil
}
