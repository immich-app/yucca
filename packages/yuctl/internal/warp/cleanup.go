package warp

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"sigs.k8s.io/yaml"
)

// CleanupOptions control the bucket purge.
type CleanupOptions struct {
	Prefixes   []string // bucket-name prefixes to purge (default yuctl-warp-)
	Legacy     bool     // also purge the pre-yuctl soak prefixes (warp-lt-, warp-loadtest-)
	Image      string   // mc image (default minio/mc:latest)
	Insecure   bool
	S3Override string
	Force      bool // purge even while load is running
	Keep       bool // keep the finished Job around for inspection
	Timeout    time.Duration
}

// Cleanup purges warp buckets via a hostNetwork `mc` Job in-cluster — RGW IPs
// are fabric-internal, so deletes run from the worker vantage with the runners'
// creds secret. A mass delete is itself a load event (RGW GC churns after).
func (s *Session) Cleanup(ctx context.Context, opts CleanupOptions) error {
	if len(opts.Prefixes) == 0 {
		opts.Prefixes = []string{"yuctl-warp-"}
	}
	if opts.Legacy {
		opts.Prefixes = append(opts.Prefixes, "warp-lt-", "warp-loadtest-")
	}
	if opts.Image == "" {
		opts.Image = "minio/mc:latest"
	}
	if opts.Timeout <= 0 {
		opts.Timeout = 30 * time.Minute
	}

	if !opts.Force {
		log.Info().Msg("checking for running load")
		if running, err := s.anyLoadRunning(ctx); err != nil {
			log.Warn().Err(err).Msg("could not check for running load")
		} else if running {
			return fmt.Errorf("warp load is running; `yuctl tools warp stop` first (or --force)")
		}
	}

	target, err := s.ResolveS3(ctx, opts.S3Override)
	if err != nil {
		return err
	}

	mci := ""
	if opts.Insecure {
		mci = "--insecure"
	}
	patterns := make([]string, len(opts.Prefixes))
	for i, p := range opts.Prefixes {
		patterns[i] = p + "*"
	}
	script := fmt.Sprintf(`set -e
mc %[1]s alias set rgw %[2]s "$WARP_ACCESS_KEY" "$WARP_SECRET_KEY" >/dev/null
found=0
for b in $(mc %[1]s ls rgw | awk '{print $NF}' | tr -d '/'); do
  case "$b" in
    %[3]s)
      found=1
      echo "removing bucket $b"
      mc %[1]s rb --force "rgw/$b"
      ;;
  esac
done
[ "$found" = 1 ] || echo "no buckets matching: %[4]s"
echo cleanup done`, mci, target.Endpoint, strings.Join(patterns, "|"), strings.Join(opts.Prefixes, ", "))

	name := "warp-cleanup-" + time.Now().UTC().Format("20060102-150405")
	rendered, err := renderManifest("cleanup-job.yaml", map[string]any{
		"Name":       name,
		"Namespace":  s.Namespace,
		"Image":      opts.Image,
		"Script":     script,
		"SecretName": credsSecret,
	})
	if err != nil {
		return err
	}
	var job batchv1.Job
	if err := yaml.Unmarshal(rendered, &job); err != nil {
		return fmt.Errorf("decode cleanup job manifest: %w", err)
	}
	if _, err := s.client.BatchV1().Jobs(s.Namespace).Create(ctx, &job, metav1.CreateOptions{}); err != nil {
		return fmt.Errorf("create cleanup job: %w", err)
	}
	log.Info().Str("job", name).Strs("prefixes", opts.Prefixes).
		Msg("cleanup job launched; waiting (first run pulls the mc image)")

	start := time.Now()
	lastLog := time.Time{}
	waitErr := wait.PollUntilContextTimeout(ctx, 5*time.Second, opts.Timeout, true,
		func(ctx context.Context) (bool, error) {
			j, err := s.client.BatchV1().Jobs(s.Namespace).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				return false, err
			}
			if time.Since(lastLog) > 15*time.Second {
				lastLog = time.Now()
				log.Info().Str("elapsed", time.Since(start).Round(time.Second).String()).
					Int32("active", j.Status.Active).Msg("cleanup job running")
			}
			for _, c := range j.Status.Conditions {
				if c.Status != corev1.ConditionTrue {
					continue
				}
				switch c.Type {
				case batchv1.JobComplete:
					return true, nil
				case batchv1.JobFailed:
					return false, fmt.Errorf("cleanup job failed: %s", c.Message)
				}
			}
			return false, nil
		})

	if logs := s.jobLogs(ctx, name); logs != "" {
		fmt.Println(logs)
	}
	if waitErr != nil {
		return fmt.Errorf("cleanup job did not complete (kept for inspection): %w", waitErr)
	}
	if !opts.Keep {
		propagation := metav1.DeletePropagationBackground
		_ = s.client.BatchV1().Jobs(s.Namespace).Delete(ctx, name, metav1.DeleteOptions{PropagationPolicy: &propagation})
	}
	log.Info().Msg("cleanup complete")
	return nil
}

// jobLogs concatenates the logs of the job's pods (best effort).
func (s *Session) jobLogs(ctx context.Context, job string) string {
	pods, err := s.client.CoreV1().Pods(s.Namespace).List(ctx, metav1.ListOptions{LabelSelector: "job-name=" + job})
	if err != nil {
		return ""
	}
	var out []string
	for _, p := range pods.Items {
		stream, err := s.client.CoreV1().Pods(s.Namespace).GetLogs(p.Name, &corev1.PodLogOptions{}).Stream(ctx)
		if err != nil {
			continue
		}
		b, _ := io.ReadAll(stream)
		stream.Close()
		if t := strings.TrimSpace(string(b)); t != "" {
			out = append(out, t)
		}
	}
	return strings.Join(out, "\n")
}
