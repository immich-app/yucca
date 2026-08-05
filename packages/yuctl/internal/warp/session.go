// Package warp deploys and drives a MinIO warp S3 load-test fleet on the
// region's K8s cluster against its Ceph RGW fleet; all topology is resolved at
// runtime from discovery + live cluster, nothing region-specific hardcoded.
// Proven shape (father, 2026-07-22, ~250Gbps combined): hostNetwork runners
// (2/worker), 16MiB objects, 167 PUT / 17 GET per pod, requests round-robined
// over an explicit RGW IP list — DNS round-robin alone pins one gateway per process.
package warp

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"os"
	"sort"
	"strings"
	"text/template"

	"github.com/rs/zerolog/log"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"

	"yuctl/internal/op"
	"yuctl/internal/state"
)

// fieldManager identifies this tool's server-side applies.
const fieldManager = "yuctl-warp"

//go:embed manifests/*.yaml
var manifestFS embed.FS

var manifestTmpl = template.Must(template.New("").
	Funcs(template.FuncMap{"json": func(s string) (string, error) {
		b, err := json.Marshal(s)
		return string(b), err
	}}).
	ParseFS(manifestFS, "manifests/*.yaml"))

// renderManifest renders one embedded manifest template to YAML bytes.
func renderManifest(name string, data any) ([]byte, error) {
	var buf bytes.Buffer
	if err := manifestTmpl.ExecuteTemplate(&buf, name, data); err != nil {
		return nil, fmt.Errorf("render %s: %w", name, err)
	}
	return buf.Bytes(), nil
}

// Session holds the resolved cluster access for one warp command invocation.
type Session struct {
	Namespace string
	K8s       state.Kubernetes
	Ceph      state.CephCluster

	cfg    *rest.Config
	client kubernetes.Interface
}

// NewSession builds a client from the region's kubeconfig — resolved in-memory
// from 1Password (kubeconfig_ref) or read from an explicit path.
func NewSession(ctx context.Context, k8s state.Kubernetes, ceph state.CephCluster, namespace, kubeconfigPath string) (*Session, error) {
	var raw []byte
	switch {
	case kubeconfigPath != "":
		b, err := os.ReadFile(kubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("read kubeconfig: %w", err)
		}
		raw = b
	case k8s.KubeconfigRef != "":
		log.Info().Str("cluster", k8s.ClusterName).Msg("reading kubeconfig from 1Password (may prompt to unlock)")
		v, err := op.Read(ctx, k8s.KubeconfigRef)
		if err != nil {
			return nil, fmt.Errorf("resolve kubeconfig: %w", err)
		}
		raw = []byte(v)
	default:
		return nil, fmt.Errorf("kubernetes discovery payload has no kubeconfig_ref; pass --kubeconfig")
	}
	cfg, err := clientcmd.RESTConfigFromKubeConfig(raw)
	if err != nil {
		return nil, fmt.Errorf("parse kubeconfig: %w", err)
	}
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("build k8s client: %w", err)
	}
	return &Session{Namespace: namespace, K8s: k8s, Ceph: ceph, cfg: cfg, client: client}, nil
}

// podExec runs a shell script inside a runner pod over the exec subresource,
// returning combined stdout (stderr folded into the error on failure).
func (s *Session) podExec(ctx context.Context, pod, script string) (string, error) {
	req := s.client.CoreV1().RESTClient().Post().
		Resource("pods").Namespace(s.Namespace).Name(pod).SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Command: []string{"sh", "-c", script},
			Stdout:  true,
			Stderr:  true,
		}, scheme.ParameterCodec)
	exec, err := remotecommand.NewSPDYExecutor(s.cfg, "POST", req.URL())
	if err != nil {
		return "", fmt.Errorf("exec setup for %s: %w", pod, err)
	}
	var out, errb bytes.Buffer
	if err := exec.StreamWithContext(ctx, remotecommand.StreamOptions{Stdout: &out, Stderr: &errb}); err != nil {
		return out.String(), fmt.Errorf("exec in %s: %w\n%s", pod, err, strings.TrimSpace(errb.String()))
	}
	return out.String(), nil
}

// Worker is one schedulable (non-control-plane) node.
type Worker struct {
	Name     string
	CPUCores int
}

// Workers lists the cluster's Ready, schedulable, non-control-plane nodes with
// their allocatable CPU. This is the fleet the runners spread across.
func (s *Session) Workers(ctx context.Context) ([]Worker, error) {
	nodes, err := s.client.CoreV1().Nodes().List(ctx, listAll)
	if err != nil {
		return nil, fmt.Errorf("list nodes: %w", err)
	}
	var workers []Worker
	for _, n := range nodes.Items {
		if _, cp := n.Labels["node-role.kubernetes.io/control-plane"]; cp {
			continue
		}
		if n.Spec.Unschedulable {
			continue
		}
		ready := false
		for _, c := range n.Status.Conditions {
			if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
				ready = true
			}
		}
		if !ready {
			continue
		}
		cpu := n.Status.Allocatable[corev1.ResourceCPU]
		workers = append(workers, Worker{Name: n.Name, CPUCores: int(cpu.Value())})
	}
	sort.Slice(workers, func(i, j int) bool { return workers[i].Name < workers[j].Name })
	if len(workers) == 0 {
		return nil, fmt.Errorf("cluster has no Ready schedulable worker nodes")
	}
	return workers, nil
}

// S3Target is the resolved RGW entry point: signing host + the per-gateway IPs
// warp round-robins over.
type S3Target struct {
	Endpoint string // as in discovery, e.g. https://s3.<domain>
	Host     string
	Port     string
	IPs      []string
}

// ResolveS3 resolves the RGW endpoint to its full A-record set. DNS is public
// even where the IPs are fabric-internal, so resolve here; reachability is
// probed in-cluster.
func (s *Session) ResolveS3(ctx context.Context, override string) (*S3Target, error) {
	endpoint := s.Ceph.RGWS3Endpoint
	if override != "" {
		endpoint = override
	}
	if endpoint == "" {
		return nil, fmt.Errorf("ceph cluster %q has no rgw_s3_endpoint in discovery", s.Ceph.ClusterName)
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse rgw endpoint %q: %w", endpoint, err)
	}
	port := u.Port()
	if port == "" {
		if u.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	ips, err := net.DefaultResolver.LookupHost(ctx, u.Hostname())
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", u.Hostname(), err)
	}
	sort.Strings(ips)
	log.Debug().Str("host", u.Hostname()).Int("ips", len(ips)).Msg("resolved RGW roster")
	return &S3Target{Endpoint: endpoint, Host: u.Hostname(), Port: port, IPs: ips}, nil
}

// ProbeIPs filters to gateways accepting TCP connects, probed from inside a
// pod (the load's vantage). Degrades gracefully: no bash/nc in image → unprobed roster.
func (s *Session) ProbeIPs(ctx context.Context, pod string, t *S3Target) []string {
	log.Info().Int("endpoints", len(t.IPs)).Str("from", pod).Msg("probing RGW endpoints for liveness")
	tool, err := s.podExec(ctx, pod,
		`command -v bash >/dev/null 2>&1 && echo bash && exit; command -v nc >/dev/null 2>&1 && echo nc && exit; echo none`)
	if err != nil {
		log.Warn().Err(err).Msg("probe tool detection failed; using unprobed RGW roster")
		return t.IPs
	}
	var probe string
	switch strings.TrimSpace(tool) {
	case "bash":
		probe = fmt.Sprintf(
			`for ip in %s; do (timeout 3 bash -c "exec 3<>/dev/tcp/$ip/%s" 2>/dev/null && echo "$ip") & done; wait`,
			strings.Join(t.IPs, " "), t.Port)
	case "nc":
		probe = fmt.Sprintf(
			`for ip in %s; do (nc -z -w 3 "$ip" %s 2>/dev/null && echo "$ip") & done; wait`,
			strings.Join(t.IPs, " "), t.Port)
	default:
		log.Warn().Msg("no bash/nc in runner image; using unprobed RGW roster")
		return t.IPs
	}
	out, err := s.podExec(ctx, pod, probe)
	if err != nil {
		log.Warn().Err(err).Msg("RGW probe failed; using unprobed roster")
		return t.IPs
	}
	var healthy []string
	for _, line := range strings.Fields(out) {
		if net.ParseIP(line) != nil {
			healthy = append(healthy, line)
		}
	}
	sort.Strings(healthy)
	if len(healthy) == 0 {
		log.Warn().Msg("probe found no reachable RGWs; using unprobed roster")
		return t.IPs
	}
	if dead := len(t.IPs) - len(healthy); dead > 0 {
		log.Warn().Int("dead", dead).Int("healthy", len(healthy)).Msg("excluding unreachable RGW endpoints")
	} else {
		log.Info().Int("healthy", len(healthy)).Msg("all RGW endpoints reachable")
	}
	return healthy
}

// RunnerPods lists the runner pods (Running only), sorted by name, with the
// node each landed on.
func (s *Session) RunnerPods(ctx context.Context) ([]RunnerPod, error) {
	pods, err := s.client.CoreV1().Pods(s.Namespace).List(ctx, listByApp(deploymentName))
	if err != nil {
		if isNotFound(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("list runner pods: %w", err)
	}
	var out []RunnerPod
	for _, p := range pods.Items {
		// Terminating pods still report phase Running; exec'ing into one races
		// its container teardown.
		if p.Status.Phase != corev1.PodRunning || p.DeletionTimestamp != nil {
			continue
		}
		out = append(out, RunnerPod{Name: p.Name, Node: p.Spec.NodeName})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// RunnerPod is one running warp runner.
type RunnerPod struct {
	Name string
	Node string
}

// podGone reports whether a pod has been deleted or is terminating — used to
// downgrade exec failures against pods that died mid-operation.
func (s *Session) podGone(ctx context.Context, name string) bool {
	p, err := s.client.CoreV1().Pods(s.Namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return isNotFound(err)
	}
	return p.DeletionTimestamp != nil || p.Status.Phase != corev1.PodRunning
}
