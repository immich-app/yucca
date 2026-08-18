// Package cmdutil holds what every command package needs but no domain
// package should know about: the Factory carrying lazily-resolved shared
// dependencies (selected context, topology, admin-api session), the shared
// admin-api flag set, and small operator-interaction helpers. Command
// packages receive a *Factory instead of re-deriving these per command.
package cmdutil

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strings"

	"yuctl/ctxstore"
	"yuctl/discovery"
	"yuctl/ui"
)

// Factory is built once in cli.NewRootCmd and threaded through every command
// constructor. The closures are lazy — a command that never touches topology
// never reads Terraform state — and memoized per invocation where resolution
// is expensive.
type Factory struct {
	IO *ui.IOStreams

	// Context returns the persisted selection, erroring when none is
	// selected (`yuctl select` first).
	Context func() (*ctxstore.Context, error)

	// Topology resolves the fleet topology from Terraform state (or the
	// on-disk cache), memoized for the invocation.
	Topology func(ctx context.Context) (*discovery.Topology, error)
}

// Confirm prompts the operator for a yes/no answer, defaulting to no.
func Confirm(io *ui.IOStreams, prompt string) bool {
	fmt.Fprintf(io.Err, "%s [y/N]: ", prompt)
	line, err := bufio.NewReader(io.In).ReadString('\n')
	if err != nil {
		return false
	}
	answer := strings.ToLower(strings.TrimSpace(line))
	return answer == "y" || answer == "yes"
}

// OpenBrowser opens url in the OS default browser, best-effort.
func OpenBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
