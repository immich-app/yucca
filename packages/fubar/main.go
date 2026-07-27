package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"fubar/internal/cli"
	"fubar/internal/ui"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := cli.NewRootCmd().ExecuteContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, ui.Bad.Render("error: ")+err.Error())
		os.Exit(1)
	}
}
