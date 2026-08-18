// Package cmdutil sits between cli and the domain packages: command packages
// receive a *Factory instead of re-deriving shared dependencies per command,
// and domain packages must never import it.
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

// Factory's closures are lazy — a command that never touches topology never
// reads Terraform state — and memoized per invocation where resolution is
// expensive.
type Factory struct {
	IO *ui.IOStreams

	// Context errors when nothing is selected (`yuctl select` first).
	Context func() (*ctxstore.Context, error)

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
