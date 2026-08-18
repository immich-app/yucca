package resticbench

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/rs/zerolog/log"

	"yuctl/sshx"
)

// RemoteBinDir is where the agent and restic land on a remote host, relative
// to $HOME. Shared with fleet-bench, which pushes the same binaries to its
// hosts.
const RemoteBinDir = ".cache/yuctl-bench/bin"

const remoteDir = RemoteBinDir

// RunOpts drives one remote benchmark run from the dev machine.
type RunOpts struct {
	Host        string // ssh destination for the management host
	SSHIdentity string // ssh private key file ("" = ssh defaults/agent)
	AgentBin    string // local linux/amd64 bench-agent; "" = use the embedded one
	Config      Config
	Out         string    // local results path ("" = don't save)
	Summary     io.Writer // summary destination (nil = stdout)
}

func (o *RunOpts) ssh() *sshx.Client {
	return &sshx.Client{IdentityFile: o.SSHIdentity, Retries: 2}
}

func (o *RunOpts) summary() io.Writer {
	if o.Summary != nil {
		return o.Summary
	}
	return os.Stdout
}

// Run pushes the agent + pinned restic to the host, streams the run, and
// returns the collected result.
func Run(ctx context.Context, opts RunOpts) (*RunResult, error) {
	agentBin, cleanup, err := AgentBinary(opts.AgentBin)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	resticBin, err := EnsureResticLinux(ctx)
	if err != nil {
		return nil, err
	}

	ssh := opts.ssh()
	log.Info().Str("host", opts.Host).Msg("pushing agent + restic " + ResticVersion)
	if err := ssh.Push(ctx, opts.Host, remoteDir, map[string]string{agentBin: "bench-agent", resticBin: "restic"}); err != nil {
		return nil, err
	}

	log.Info().Str("host", opts.Host).Ints("connections", opts.Config.Connections).
		Str("size", FormatBytes(opts.Config.Size)).Msg("starting remote benchmark")
	result, err := drive(ctx, ssh, opts.Host, opts.Config)
	if err != nil {
		return nil, err
	}
	return finish(result, opts.Out, opts.summary())
}

// RunHere executes the benchmark on the local machine — no ssh, the agent
// library runs in-process against a locally pinned restic.
func RunHere(ctx context.Context, opts RunOpts) (*RunResult, error) {
	resticBin, err := EnsureResticLocal(ctx)
	if err != nil {
		return nil, err
	}
	cfg := opts.Config
	cfg.ResticBin = resticBin

	log.Info().Ints("connections", cfg.Connections).Str("size", FormatBytes(cfg.Size)).
		Str("restic", ResticVersion).Msg("starting local benchmark")
	sink := &eventSink{}
	if err := RunAgent(ctx, cfg, sink.handle); err != nil {
		return nil, err
	}
	if sink.result == nil {
		return nil, fmt.Errorf("benchmark finished without a result")
	}
	return finish(sink.result, opts.Out, opts.summary())
}

func finish(result *RunResult, out string, summary io.Writer) (*RunResult, error) {
	if out != "" {
		if err := SaveResult(out, result); err != nil {
			return nil, err
		}
		log.Info().Str("path", out).Msg("results saved")
	}
	RenderSummary(summary, result)
	return result, nil
}

// AgentBinary resolves the local linux/amd64 agent to push: an explicit path,
// or the embedded one materialized into a temp file. The returned cleanup
// removes the materialized copy.
func AgentBinary(explicit string) (string, func(), error) {
	if explicit != "" {
		if _, err := os.Stat(explicit); err != nil {
			return "", nil, fmt.Errorf("agent binary %s: %w", explicit, err)
		}
		return explicit, func() {}, nil
	}
	raw, err := embeddedAgent()
	if err != nil {
		return "", nil, err
	}
	dir, err := os.MkdirTemp("", "yuctl-bench-agent")
	if err != nil {
		return "", nil, err
	}
	path := dir + "/bench-agent"
	if err := os.WriteFile(path, raw, 0o755); err != nil {
		os.RemoveAll(dir)
		return "", nil, err
	}
	return path, func() { os.RemoveAll(dir) }, nil
}

// drive runs the remote agent, feeding Config over stdin and consuming the
// event stream from stdout. The agent's stderr passes straight through.
func drive(ctx context.Context, ssh *sshx.Client, host string, cfg Config) (*RunResult, error) {
	cmd := ssh.Command(ctx, host, remoteDir+"/bench-agent")
	cmd.Stderr = os.Stderr

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	go func() {
		_ = json.NewEncoder(stdin).Encode(cfg)
		stdin.Close()
	}()

	sink := &eventSink{}
	_ = ScanEvents(stdout, sink.handle)
	waitErr := cmd.Wait()
	if sink.fatal != "" {
		return nil, fmt.Errorf("agent: %s", sink.fatal)
	}
	if waitErr != nil {
		return nil, fmt.Errorf("ssh agent session: %w", waitErr)
	}
	if sink.result == nil {
		return nil, fmt.Errorf("agent finished without a result event")
	}
	return sink.result, nil
}

// eventSink renders agent events as log lines and captures the terminal ones.
type eventSink struct {
	result *RunResult
	fatal  string
}

func (s *eventSink) handle(ev Event) {
	switch ev.Type {
	case "warning":
		log.Warn().Msg(ev.Message)
	case "phase_start":
		log.Info().Int("connections", ev.Connections).Msgf("%s: started", ev.Phase)
	case "progress":
		e := log.Info().Int("connections", ev.Connections).Str("done", FormatBytes(ev.Done)).Str("rate", FormatBPS(ev.BPS))
		if ev.Total > 0 {
			e = e.Str("progress", fmt.Sprintf("%.0f%%", float64(ev.Done)/float64(ev.Total)*100))
		}
		e.Msgf("%s: running", ev.Phase)
	case "phase_done":
		pr := ev.PhaseResult
		e := log.Info().Int("connections", ev.Connections).Str("duration", FormatDuration(pr.Seconds))
		if pr.Throughput > 0 {
			e = e.Str("throughput", FormatBPS(pr.Throughput))
		}
		e.Msgf("%s: done", ev.Phase)
	case "result":
		s.result = ev.Result
	case "fatal":
		s.fatal = ev.Message
	}
}

// EmitJSON is the agent-side event sink: one JSON object per stdout line.
func EmitJSON(w io.Writer) func(Event) {
	enc := json.NewEncoder(w)
	return func(ev Event) {
		_ = enc.Encode(ev)
	}
}
