// Package fleet holds what the load-test fleets (fleet/warp on K8s pods,
// fleet/fleetbench on cloud VMs) and their dashboards share: the live watch
// loop, the throughput history behind the sparkline, and small lifecycle
// helpers. Transport-specific logic stays in the subpackages.
package fleet

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// History keeps the rolling combined-throughput samples a dashboard's
// sparkline is drawn from.
type History struct {
	vals []float64
}

func (h *History) Push(v float64) {
	h.vals = append(h.vals, v)
	if len(h.vals) > 60 {
		h.vals = h.vals[len(h.vals)-60:]
	}
}

func (h *History) Values() []float64 { return h.vals }

// Footer renders the shared dashboard footer line.
func Footer(sampleSec int, sampledAt time.Time, watching bool) string {
	footer := fmt.Sprintf("sampled %ds window at %s", sampleSec, sampledAt.Format("15:04:05"))
	if watching {
		footer += " · ctrl-c to quit"
	}
	return footer
}

// Watch drives a live dashboard on the alternate screen until interrupted:
// frame is called in a loop and its result replaces the display; errors are
// shown and retried after a short pause rather than ending the watch.
func Watch(ctx context.Context, out io.Writer, label string, sample int, frame func(context.Context) (string, error)) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	fmt.Fprint(out, "\x1b[?1049h\x1b[?25l")
	defer fmt.Fprint(out, "\x1b[?25h\x1b[?1049l")
	fmt.Fprintf(out, "%s connecting · sampling %ds window…\n", label, sample)

	for {
		s, err := frame(ctx)
		if ctx.Err() != nil {
			return nil
		}
		fmt.Fprint(out, "\x1b[H\x1b[2J")
		if err != nil {
			fmt.Fprintf(out, "status error (retrying): %v\n", err)
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(3 * time.Second):
			}
			continue
		}
		fmt.Fprintln(out, s)
	}
}

// Each runs fn for every index concurrently and returns the first error.
func Each(n int, fn func(int) error) error {
	var wg sync.WaitGroup
	errs := make([]error, n)
	for i := range n {
		wg.Go(func() { errs[i] = fn(i) })
	}
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}
