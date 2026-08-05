package cli

import (
	"testing"

	"github.com/spf13/cobra"
)

// Building the tree panics on a duplicate flag registration, which breaks every
// yuctl invocation rather than the one subcommand at fault.
func TestNewRootCmdBuildsEveryCommand(t *testing.T) {
	var count int
	var visit func(*cobra.Command)
	visit = func(c *cobra.Command) {
		count++
		c.InitDefaultHelpFlag()
		for _, sub := range c.Commands() {
			visit(sub)
		}
	}
	visit(NewRootCmd())

	if count < 10 {
		t.Fatalf("walked only %d commands; the tree did not build", count)
	}
}
