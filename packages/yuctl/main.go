// Command yuctl is the yucca operations CLI. It resolves the
// partition/region/ceph topology from Terraform "discovery" outputs (read
// directly from S3 state) and drives day-2 operations. See internal/cli for the
// command tree and packages/yuctl/README.md for usage.
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/rs/zerolog/log"

	"yuctl/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := cli.NewRootCmd().ExecuteContext(ctx); err != nil {
		log.Error().Err(err).Msg("yuctl failed")
		os.Exit(1)
	}
}
