package warp

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// StartOptions shape the load. Zero values reproduce the proven per-pod shape
// (167 PUT / 17 GET streams of 16MiB), so totals scale with the topology: on a
// 3-worker × 2-pod cluster that is exactly the 1002/102 ~250Gbps config.
type StartOptions struct {
	TotalPutStreams int    // 0 = 167 per pod
	TotalGetStreams int    // 0 = 17 per pod, -1 = none
	PutPerPod       int    // per-pod PUT concurrency; overrides TotalPutStreams
	GetPerPod       int    // per-pod GET concurrency; overrides TotalGetStreams
	PutObjSize      string // default 16MiB
	GetObjSize      string // default 16MiB (small sizes are latency-bound under write load)
	GetObjects      int    // GET corpus per pod per cycle (default 1000)
	Duration        string // non-empty = single bounded run; empty = non-stop
	CycleDuration   string // warp run length inside the non-stop loop (default 6h)
	BucketPrefix    string // default yuctl-warp-
	Insecure        bool   // --insecure for self-signed RGW certs
	S3Override      string // override the discovery RGW endpoint
}

func (o *StartOptions) defaults() {
	if o.PutObjSize == "" {
		o.PutObjSize = "16MiB"
	}
	if o.GetObjSize == "" {
		o.GetObjSize = "16MiB"
	}
	if o.GetObjects <= 0 {
		o.GetObjects = 1000
	}
	if o.CycleDuration == "" {
		o.CycleDuration = "6h"
	}
	if o.BucketPrefix == "" {
		o.BucketPrefix = "yuctl-warp-"
	}
}

// killScript terminates the loop wrappers first so they cannot respawn warp,
// then the warp processes. The [b]racket trick keeps each pattern from
// matching the `sh -c` process running this very script (whose command line
// contains the pattern text) — a self-match SIGTERMs the exec and fails it
// with exit 143. Trailing `true` absorbs pkill's exit 1 on no-match.
const killScript = `pkill -f 'warp-[p]ut-loop' 2>/dev/null; pkill -f 'warp-[g]et-loop' 2>/dev/null; sleep 1; ` +
	`pkill -f '/warp [p]ut' 2>/dev/null; pkill -f '/warp [g]et' 2>/dev/null; true`

// Start launches (or gracefully relaunches) the load on every runner pod. Any
// warp processes already running are killed first, so start is idempotent and
// doubles as "restart with new parameters".
func (s *Session) Start(ctx context.Context, opts StartOptions) error {
	opts.defaults()

	pods, err := s.RunnerPods(ctx)
	if err != nil {
		return err
	}
	if len(pods) == 0 {
		return fmt.Errorf("no runner pods in namespace %q; run `yuctl tools warp deploy` first", s.Namespace)
	}

	target, err := s.ResolveS3(ctx, opts.S3Override)
	if err != nil {
		return err
	}
	ips := s.ProbeIPs(ctx, pods[0].Name, target)
	hosts := make([]string, len(ips))
	for i, ip := range ips {
		hosts[i] = ip + ":" + target.Port
	}
	hostList := strings.Join(hosts, ",")

	totalPut := opts.TotalPutStreams
	if opts.PutPerPod > 0 {
		totalPut = opts.PutPerPod * len(pods)
	} else if totalPut <= 0 {
		totalPut = 167 * len(pods)
	}
	totalGet := opts.TotalGetStreams
	if opts.GetPerPod > 0 {
		totalGet = opts.GetPerPod * len(pods)
	} else if totalGet < 0 {
		totalGet = 0
	} else if totalGet == 0 {
		totalGet = 17 * len(pods)
	}

	tlsFlags := ""
	if strings.HasPrefix(target.Endpoint, "https://") {
		tlsFlags = " --tls"
		if opts.Insecure {
			tlsFlags += " --insecure"
		}
	}

	nonstop := opts.Duration == ""
	runDuration := opts.Duration
	if nonstop {
		runDuration = opts.CycleDuration
	}

	log.Info().Int("pods", len(pods)).Int("put_streams", totalPut).Int("get_streams", totalGet).
		Str("obj_size", opts.PutObjSize).Int("rgw_endpoints", len(ips)).Bool("nonstop", nonstop).
		Msg("starting warp load")

	for i, pod := range pods {
		put := share(totalPut, len(pods), i)
		get := share(totalGet, len(pods), i)

		putCmd := fmt.Sprintf(`/warp put --host=%s --host-select=roundrobin%s --bucket=%sput-%s `+
			`--obj.size=%s --duration=%s --concurrent=%d --noclear --no-color >> /tmp/warp-put.log 2>&1`,
			hostList, tlsFlags, opts.BucketPrefix, pod.Name, opts.PutObjSize, runDuration, put)
		getCmd := fmt.Sprintf(`/warp get --host=%s --host-select=roundrobin%s --bucket=%sget-%s `+
			`--objects=%d --obj.size=%s --duration=%s --concurrent=%d --noclear --no-color >> /tmp/warp-get.log 2>&1`,
			hostList, tlsFlags, opts.BucketPrefix, pod.Name, opts.GetObjects, opts.GetObjSize, runDuration, get)

		// Kill and launch are separate execs: the launch script's literal
		// "/warp put ..." text would otherwise match the kill patterns in the
		// same command line and SIGTERM the script itself.
		if _, err := s.podExec(ctx, pod.Name, killScript); err != nil {
			return fmt.Errorf("stop previous load on %s: %w", pod.Name, err)
		}
		var script strings.Builder
		if put > 0 {
			script.WriteString(launchLine("put", putCmd, nonstop))
		}
		if get > 0 {
			script.WriteString(launchLine("get", getCmd, nonstop))
		}
		script.WriteString("true\n")
		if _, err := s.podExec(ctx, pod.Name, script.String()); err != nil {
			return fmt.Errorf("start load on %s: %w", pod.Name, err)
		}
		log.Info().Str("pod", pod.Name).Str("node", pod.Node).Int("put", put).Int("get", get).Msg("load launched")
	}

	return s.saveRunConfig(ctx, map[string]string{
		"started_at":    time.Now().UTC().Format(time.RFC3339),
		"mode":          map[bool]string{true: "nonstop", false: "duration=" + opts.Duration}[nonstop],
		"put_streams":   strconv.Itoa(totalPut),
		"get_streams":   strconv.Itoa(totalGet),
		"put_obj_size":  opts.PutObjSize,
		"get_obj_size":  opts.GetObjSize,
		"rgw_endpoints": strconv.Itoa(len(ips)),
		"bucket_prefix": opts.BucketPrefix,
		"endpoint":      target.Endpoint,
	})
}

// launchLine renders one nohup'd load process: a respawning loop wrapper for
// non-stop mode, a single bounded warp run otherwise.
func launchLine(kind, warpCmd string, nonstop bool) string {
	if !nonstop {
		return fmt.Sprintf("nohup sh -c '%s' >/dev/null 2>&1 &\n", warpCmd)
	}
	loop := fmt.Sprintf("/tmp/warp-%s-loop.sh", kind)
	return fmt.Sprintf("printf '%%s\\n' 'while :; do' %q 'done' > %s\nnohup sh %s >/dev/null 2>&1 &\n",
		warpCmd, loop, loop)
}

// share splits total across n pods, front-loading the remainder.
func share(total, n, i int) int {
	base, extra := total/n, total%n
	if i < extra {
		return base + 1
	}
	return base
}

func (s *Session) saveRunConfig(ctx context.Context, kv map[string]string) error {
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: runConfigMap, Namespace: s.Namespace},
		Data:       kv,
	}
	_, err := s.client.CoreV1().ConfigMaps(s.Namespace).Update(ctx, cm, metav1.UpdateOptions{})
	if isNotFound(err) {
		_, err = s.client.CoreV1().ConfigMaps(s.Namespace).Create(ctx, cm, metav1.CreateOptions{})
	}
	return err
}

// Stop kills the load everywhere but leaves the runner pods deployed, so the
// next start is instant.
func (s *Session) Stop(ctx context.Context) error {
	pods, err := s.RunnerPods(ctx)
	if err != nil {
		return err
	}
	if len(pods) == 0 {
		log.Info().Msg("nothing deployed; nothing to stop")
		return nil
	}
	for _, pod := range pods {
		if _, err := s.podExec(ctx, pod.Name, killScript); err != nil {
			return fmt.Errorf("stop load on %s: %w", pod.Name, err)
		}
	}
	if running, err := s.anyLoadRunning(ctx); err == nil && running {
		return fmt.Errorf("some warp processes survived the kill; check pods manually")
	}
	_ = s.client.CoreV1().ConfigMaps(s.Namespace).Delete(ctx, runConfigMap, metav1.DeleteOptions{})
	log.Info().Int("pods", len(pods)).Msg("load stopped; runners left deployed")
	return nil
}

func (s *Session) anyLoadRunning(ctx context.Context) (bool, error) {
	pods, err := s.RunnerPods(ctx)
	if err != nil {
		return false, err
	}
	for _, pod := range pods {
		out, err := s.podExec(ctx, pod.Name, `pgrep -f '/warp ([p]ut|[g]et)' 2>/dev/null | wc -l`)
		if err != nil {
			return false, err
		}
		if n, _ := strconv.Atoi(strings.TrimSpace(out)); n > 0 {
			return true, nil
		}
	}
	return false, nil
}

// StatusReport is the full picture status renders from.
type StatusReport struct {
	Config map[string]string // run metadata; nil when no run is recorded
	Pods   []PodStatus
	Nodes  []NodeThroughput
}

// PodStatus is one runner's process and log state.
type PodStatus struct {
	Name, Node           string
	PutProcs, GetProcs   int
	PutErrors, GetErrors int
	LastPut              string
}

// NodeThroughput is one worker's NIC rate over the sample window, taken from
// the busiest physical interface (hostNetwork pods see the host's NICs).
type NodeThroughput struct {
	Node, Iface  string
	TxBps, RxBps float64
}

// Status samples every runner pod (processes, log error counts) and one pod per
// node for NIC throughput, in parallel.
func (s *Session) Status(ctx context.Context, sampleSeconds int) (*StatusReport, error) {
	if sampleSeconds <= 0 {
		sampleSeconds = 5
	}
	pods, err := s.RunnerPods(ctx)
	if err != nil {
		return nil, err
	}
	report := &StatusReport{}

	if cm, err := s.client.CoreV1().ConfigMaps(s.Namespace).Get(ctx, runConfigMap, metav1.GetOptions{}); err == nil {
		report.Config = cm.Data
	}

	var mu sync.Mutex
	var wg sync.WaitGroup

	report.Pods = make([]PodStatus, len(pods))
	for i, pod := range pods {
		wg.Add(1)
		go func(i int, pod RunnerPod) {
			defer wg.Done()
			ps := PodStatus{Name: pod.Name, Node: pod.Node}
			out, err := s.podExec(ctx, pod.Name,
				`echo "$(pgrep -f '/warp [p]ut' 2>/dev/null | wc -l) `+
					`$(pgrep -f '/warp [g]et' 2>/dev/null | wc -l) `+
					`$(grep -ci error /tmp/warp-put.log 2>/dev/null || echo 0) `+
					`$(grep -ci error /tmp/warp-get.log 2>/dev/null || echo 0)"; `+
					`tail -c 4096 /tmp/warp-put.log 2>/dev/null | tail -n 1`)
			if err == nil {
				lines := strings.SplitN(strings.TrimSpace(out), "\n", 2)
				f := strings.Fields(lines[0])
				if len(f) == 4 {
					ps.PutProcs, _ = strconv.Atoi(f[0])
					ps.GetProcs, _ = strconv.Atoi(f[1])
					ps.PutErrors, _ = strconv.Atoi(f[2])
					ps.GetErrors, _ = strconv.Atoi(f[3])
				}
				if len(lines) == 2 {
					ps.LastPut = strings.TrimSpace(lines[1])
				}
			}
			mu.Lock()
			report.Pods[i] = ps
			mu.Unlock()
		}(i, pod)
	}

	seen := map[string]bool{}
	for _, pod := range pods {
		if seen[pod.Node] {
			continue
		}
		seen[pod.Node] = true
		wg.Add(1)
		go func(pod RunnerPod) {
			defer wg.Done()
			nt, err := s.sampleNode(ctx, pod, sampleSeconds)
			if err != nil {
				log.Warn().Err(err).Str("node", pod.Node).Msg("throughput sample failed")
				return
			}
			mu.Lock()
			report.Nodes = append(report.Nodes, *nt)
			mu.Unlock()
		}(pod)
	}
	wg.Wait()
	return report, nil
}

// sampleNode reads /proc/net/dev twice and returns the busiest physical
// interface's rates. Virtual interfaces (CNI veth/lxc/cilium, loopback,
// tunnels) are excluded so the number reflects the host NIC / bond.
func (s *Session) sampleNode(ctx context.Context, pod RunnerPod, seconds int) (*NodeThroughput, error) {
	out, err := s.podExec(ctx, pod.Name,
		fmt.Sprintf(`cat /proc/net/dev; sleep %d; echo ---SAMPLE---; cat /proc/net/dev`, seconds))
	if err != nil {
		return nil, err
	}
	parts := strings.SplitN(out, "---SAMPLE---", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("unexpected sample output")
	}
	before, after := parseNetDev(parts[0]), parseNetDev(parts[1])
	best := NodeThroughput{Node: pod.Node}
	var bestDelta float64
	for iface, b := range before {
		a, ok := after[iface]
		if !ok || virtualIface(iface) {
			continue
		}
		tx := float64(a.tx-b.tx) * 8 / float64(seconds)
		rx := float64(a.rx-b.rx) * 8 / float64(seconds)
		if tx+rx > bestDelta {
			bestDelta = tx + rx
			best = NodeThroughput{Node: pod.Node, Iface: iface, TxBps: tx, RxBps: rx}
		}
	}
	if best.Iface == "" {
		return nil, fmt.Errorf("no physical interface with traffic found")
	}
	return &best, nil
}

type netDevCounters struct{ rx, tx uint64 }

func parseNetDev(text string) map[string]netDevCounters {
	res := map[string]netDevCounters{}
	for _, line := range strings.Split(text, "\n") {
		name, rest, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		f := strings.Fields(rest)
		if len(f) < 9 {
			continue
		}
		rx, err1 := strconv.ParseUint(f[0], 10, 64)
		tx, err2 := strconv.ParseUint(f[8], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		res[strings.TrimSpace(name)] = netDevCounters{rx: rx, tx: tx}
	}
	return res
}

func virtualIface(name string) bool {
	for _, p := range []string{"lo", "veth", "lxc", "cilium", "cni", "flannel", "kube", "dummy", "tunl", "docker", "vxlan", "geneve", "wg", "wt", "nb"} {
		if name == p || strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}
