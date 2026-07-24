package bench

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"

	"github.com/rs/zerolog/log"
)

const remoteDir = ".cache/yuctl-bench/bin"

// RunOpts drives one remote benchmark run from the dev machine.
type RunOpts struct {
	Host        string // ssh destination for the management host
	SSHIdentity string // ssh private key file ("" = ssh defaults/agent)
	AgentBin    string // local linux/amd64 bench-agent; "" = use the embedded one
	Config      Config
	Out         string // local results path ("" = don't save)
}

// Run pushes the agent + pinned restic to the host, streams the run, and
// returns the collected result.
func Run(ctx context.Context, opts RunOpts) (*RunResult, error) {
	agentBin, cleanup, err := agentBinary(opts.AgentBin)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	resticBin, err := EnsureResticLinux(ctx)
	if err != nil {
		return nil, err
	}

	log.Info().Str("host", opts.Host).Msg("pushing agent + restic " + ResticVersion)
	if err := push(ctx, opts.SSHIdentity, opts.Host, agentBin, resticBin); err != nil {
		return nil, err
	}

	log.Info().Str("host", opts.Host).Ints("connections", opts.Config.Connections).
		Str("size", FormatBytes(opts.Config.Size)).Msg("starting remote benchmark")
	result, err := drive(ctx, opts.SSHIdentity, opts.Host, opts.Config)
	if err != nil {
		return nil, err
	}
	return finish(result, opts.Out)
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
	return finish(sink.result, opts.Out)
}

func finish(result *RunResult, out string) (*RunResult, error) {
	if out != "" {
		if err := SaveResult(out, result); err != nil {
			return nil, err
		}
		log.Info().Str("path", out).Msg("results saved")
	}
	RenderSummary(os.Stdout, result)
	return result, nil
}

// sshOpts builds the common ssh/scp options. accept-new (TOFU) keeps first
// contact with a discovery-resolved IP from failing BatchMode.
func sshOpts(identity string) []string {
	args := []string{
		"-o", "BatchMode=yes",
		"-o", "StrictHostKeyChecking=accept-new",
		"-o", "ServerAliveInterval=30",
		"-o", "ServerAliveCountMax=8",
	}
	if identity != "" {
		args = append(args, "-i", identity, "-o", "IdentitiesOnly=yes")
	}
	return args
}

func sshBase(identity, host string) []string {
	return append(sshOpts(identity), host)
}

func run(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s %v: %w: %s", name, args, err, tail(out.String(), 1000))
	}
	return nil
}

// agentBinary resolves the local agent to push: an explicit path, or the
// embedded one materialized into a temp file.
func agentBinary(explicit string) (string, func(), error) {
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

func push(ctx context.Context, identity, host, agentBin, resticBin string) error {
	if err := run(ctx, "ssh", append(sshBase(identity, host), "mkdir -p "+remoteDir)...); err != nil {
		return err
	}
	scp := append([]string{"-q"}, sshOpts(identity)...)
	if err := run(ctx, "scp", append(scp, agentBin, host+":"+remoteDir+"/bench-agent")...); err != nil {
		return err
	}
	if err := run(ctx, "scp", append(scp, resticBin, host+":"+remoteDir+"/restic")...); err != nil {
		return err
	}
	return run(ctx, "ssh", append(sshBase(identity, host), "chmod +x "+remoteDir+"/bench-agent "+remoteDir+"/restic")...)
}

// drive runs the remote agent, feeding Config over stdin and consuming the
// event stream from stdout. The agent's stderr passes straight through.
func drive(ctx context.Context, identity, host string, cfg Config) (*RunResult, error) {
	cmd := exec.CommandContext(ctx, "ssh", append(sshBase(identity, host), remoteDir+"/bench-agent")...)
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
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1<<20), 8<<20)
	for sc.Scan() {
		var ev Event
		if err := json.Unmarshal(sc.Bytes(), &ev); err != nil {
			continue
		}
		sink.handle(ev)
	}
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
