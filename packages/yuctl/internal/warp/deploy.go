package warp

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/wait"
)

const (
	deploymentName = "warp-runner"
	credsSecret    = "warp-s3-creds"
	runConfigMap   = "warp-run"
)

var (
	listAll   = metav1.ListOptions{}
	forceSSA  = true
	applyOpts = metav1.PatchOptions{FieldManager: fieldManager, Force: &forceSSA}
)

func listByApp(app string) metav1.ListOptions {
	return metav1.ListOptions{LabelSelector: "app=" + app}
}

func isNotFound(err error) bool { return apierrors.IsNotFound(err) }

// DeployOptions shape the runner fleet. Zero values mean "derive from
// topology" (replicas, CPU) or the package default.
type DeployOptions struct {
	Image        string // warp image (default minio/warp:latest)
	PodsPerNode  int    // default 2 — the proven father shape
	WorkerCount  int    // use only the first N workers (0 = all); pins pods via node affinity
	CPURequest   int    // cores per pod; 0 = allocatable/(podsPerNode+1), clamped [2,16]
	SourceNS     string // namespace of the S3 creds source secret (default yucca)
	SourceSecret string // secret holding RGW creds (default yucca-michael)
	AccessKeyKey string // key in the source secret (default S3_ACCESS_KEY_ID)
	SecretKeyKey string // key in the source secret (default S3_SECRET_ACCESS_KEY)
}

func (o *DeployOptions) defaults() {
	if o.Image == "" {
		o.Image = "minio/warp:latest"
	}
	if o.PodsPerNode <= 0 {
		o.PodsPerNode = 2
	}
	if o.SourceNS == "" {
		o.SourceNS = "yucca"
	}
	if o.SourceSecret == "" {
		o.SourceSecret = "yucca-michael"
	}
	if o.AccessKeyKey == "" {
		o.AccessKeyKey = "S3_ACCESS_KEY_ID"
	}
	if o.SecretKeyKey == "" {
		o.SecretKeyKey = "S3_SECRET_ACCESS_KEY"
	}
}

// Deploy converges the loadtest namespace, creds secret (copied from the
// product's RGW credentials), and hostNetwork runner Deployment sized from
// discovered workers. Idempotent: server-side apply, then rollout awaited.
func (s *Session) Deploy(ctx context.Context, opts DeployOptions) error {
	opts.defaults()

	workers, err := s.Workers(ctx)
	if err != nil {
		return err
	}
	var nodeNames []string
	if opts.WorkerCount > 0 && opts.WorkerCount < len(workers) {
		workers = workers[:opts.WorkerCount]
		for _, w := range workers {
			nodeNames = append(nodeNames, w.Name)
		}
	}
	replicas := opts.PodsPerNode * len(workers)
	cpu := opts.CPURequest
	if cpu <= 0 {
		minAlloc := workers[0].CPUCores
		for _, w := range workers {
			minAlloc = min(minAlloc, w.CPUCores)
		}
		cpu = minAlloc / (opts.PodsPerNode + 1)
		cpu = max(2, min(16, cpu))
	}
	log.Info().Int("workers", len(workers)).Int("replicas", replicas).Int("cpu_per_pod", cpu).
		Str("image", opts.Image).Msg("deploying warp runners")

	log.Info().Str("secret", opts.SourceNS+"/"+opts.SourceSecret).Msg("reading RGW credentials")
	access, secret, err := s.readSourceCreds(ctx, opts)
	if err != nil {
		return err
	}

	log.Info().Str("namespace", s.Namespace).Msg("applying namespace, creds secret, and runner deployment")
	ns, err := renderManifest("namespace.yaml", map[string]any{"Namespace": s.Namespace})
	if err != nil {
		return err
	}
	if _, err := s.client.CoreV1().Namespaces().
		Patch(ctx, s.Namespace, types.ApplyPatchType, ns, applyOpts); err != nil {
		return fmt.Errorf("apply namespace: %w", err)
	}

	sec, err := renderManifest("secret.yaml", map[string]any{
		"Name":         credsSecret,
		"Namespace":    s.Namespace,
		"AccessKeyB64": base64.StdEncoding.EncodeToString([]byte(access)),
		"SecretKeyB64": base64.StdEncoding.EncodeToString([]byte(secret)),
	})
	if err != nil {
		return err
	}
	if _, err := s.client.CoreV1().Secrets(s.Namespace).
		Patch(ctx, credsSecret, types.ApplyPatchType, sec, applyOpts); err != nil {
		return fmt.Errorf("apply creds secret: %w", err)
	}

	dep, err := renderManifest("deployment.yaml", map[string]any{
		"Name":       deploymentName,
		"Namespace":  s.Namespace,
		"Image":      opts.Image,
		"Replicas":   replicas,
		"CPU":        cpu,
		"SecretName": credsSecret,
		"NodeNames":  nodeNames,
	})
	if err != nil {
		return err
	}
	if _, err := s.client.AppsV1().Deployments(s.Namespace).
		Patch(ctx, deploymentName, types.ApplyPatchType, dep, applyOpts); err != nil {
		return fmt.Errorf("apply deployment: %w", err)
	}

	if err := s.waitRollout(ctx, int32(replicas)); err != nil {
		return err
	}
	if err := s.rebalance(ctx, workers, opts.PodsPerNode, int32(replicas)); err != nil {
		return err
	}
	log.Info().Msg("warp runners deployed and ready")
	return nil
}

// rebalance heals a skewed spread: drains evict runners and nothing moves them
// back (the spread constraint acts only at scheduling time) — surplus pods on
// overloaded workers are deleted so the scheduler respreads them.
func (s *Session) rebalance(ctx context.Context, workers []Worker, podsPerNode int, replicas int32) error {
	pods, err := s.RunnerPods(ctx)
	if err != nil {
		return err
	}
	perNode := map[string][]RunnerPod{}
	for _, p := range pods {
		perNode[p.Node] = append(perNode[p.Node], p)
	}
	underloaded := false
	for _, w := range workers {
		if len(perNode[w.Name]) < podsPerNode {
			underloaded = true
		}
	}
	if !underloaded {
		return nil
	}
	deleted := 0
	for node, nodePods := range perNode {
		for _, p := range nodePods[podsPerNode:] {
			log.Warn().Str("pod", p.Name).Str("node", node).Msg("deleting surplus runner to respread")
			if err := s.client.CoreV1().Pods(s.Namespace).Delete(ctx, p.Name, metav1.DeleteOptions{}); err != nil && !isNotFound(err) {
				return fmt.Errorf("delete surplus pod %s: %w", p.Name, err)
			}
			deleted++
		}
	}
	if deleted == 0 {
		log.Warn().Msg("spread is uneven but no worker exceeds pods-per-node; leaving as is")
		return nil
	}
	log.Info().Int("deleted", deleted).Msg("waiting for respread; restart the load with `warp start` afterwards")
	return s.waitRollout(ctx, replicas)
}

// waitRollout polls until every replica is updated+ready, logging on
// ready-count change and periodically so long waits never look hung.
func (s *Session) waitRollout(ctx context.Context, replicas int32) error {
	start := time.Now()
	lastReady := int32(-1)
	lastLog := time.Time{}
	return wait.PollUntilContextTimeout(ctx, 3*time.Second, 5*time.Minute, true,
		func(ctx context.Context) (bool, error) {
			d, err := s.client.AppsV1().Deployments(s.Namespace).Get(ctx, deploymentName, metav1.GetOptions{})
			if err != nil {
				return false, err
			}
			done := d.Status.ObservedGeneration >= d.Generation &&
				d.Status.UpdatedReplicas == replicas &&
				d.Status.ReadyReplicas == replicas
			if !done && (d.Status.ReadyReplicas != lastReady || time.Since(lastLog) > 15*time.Second) {
				lastReady = d.Status.ReadyReplicas
				lastLog = time.Now()
				log.Info().Int32("ready", d.Status.ReadyReplicas).Int32("want", replicas).
					Str("elapsed", time.Since(start).Round(time.Second).String()).Msg("waiting for rollout")
			}
			return done, nil
		})
}

// readSourceCreds lifts the RGW access/secret keys from the product's secret
// (michael's, by default — the same svc user the real data path uses).
func (s *Session) readSourceCreds(ctx context.Context, opts DeployOptions) (string, string, error) {
	sec, err := s.client.CoreV1().Secrets(opts.SourceNS).Get(ctx, opts.SourceSecret, metav1.GetOptions{})
	if err != nil {
		return "", "", fmt.Errorf("read source creds secret %s/%s: %w", opts.SourceNS, opts.SourceSecret, err)
	}
	pick := func(key string) (string, error) {
		v, ok := sec.Data[key]
		if !ok {
			keys := make([]string, 0, len(sec.Data))
			for k := range sec.Data {
				keys = append(keys, k)
			}
			return "", fmt.Errorf("secret %s/%s has no key %q (has: %s)",
				opts.SourceNS, opts.SourceSecret, key, strings.Join(keys, ", "))
		}
		return string(v), nil
	}
	access, err := pick(opts.AccessKeyKey)
	if err != nil {
		return "", "", err
	}
	secret, err := pick(opts.SecretKeyKey)
	if err != nil {
		return "", "", err
	}
	return access, secret, nil
}

// Undeploy deletes the whole loadtest namespace and waits for it to go. Force
// skips the running-load check.
func (s *Session) Undeploy(ctx context.Context, force bool) error {
	if !force {
		log.Info().Msg("checking for running load")
		running, err := s.anyLoadRunning(ctx)
		if err != nil {
			log.Warn().Err(err).Msg("could not check for running load")
		} else if running {
			return fmt.Errorf("warp load is still running; `yuctl tools warp stop` first (or --force)")
		}
	}
	log.Info().Str("namespace", s.Namespace).Msg("deleting namespace and waiting for it to go")
	err := s.client.CoreV1().Namespaces().Delete(ctx, s.Namespace, metav1.DeleteOptions{})
	if isNotFound(err) {
		log.Info().Str("namespace", s.Namespace).Msg("nothing deployed")
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete namespace: %w", err)
	}
	err = wait.PollUntilContextTimeout(ctx, 2*time.Second, 2*time.Minute, true,
		func(ctx context.Context) (bool, error) {
			_, err := s.client.CoreV1().Namespaces().Get(ctx, s.Namespace, metav1.GetOptions{})
			if isNotFound(err) {
				return true, nil
			}
			return false, nil
		})
	if err != nil {
		log.Warn().Str("namespace", s.Namespace).Msg("namespace still terminating; not waiting further")
		return nil
	}
	log.Info().Str("namespace", s.Namespace).Msg("undeployed")
	return nil
}
