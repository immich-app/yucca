package warp

import (
	"regexp"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/yaml"
)

func TestShare(t *testing.T) {
	cases := []struct {
		total, n int
		want     []int
	}{
		{1002, 6, []int{167, 167, 167, 167, 167, 167}},
		{102, 6, []int{17, 17, 17, 17, 17, 17}},
		{100, 6, []int{17, 17, 17, 17, 16, 16}},
		{5, 3, []int{2, 2, 1}},
	}
	for _, c := range cases {
		sum := 0
		for i, want := range c.want {
			got := share(c.total, c.n, i)
			if got != want {
				t.Errorf("share(%d,%d,%d) = %d, want %d", c.total, c.n, i, got, want)
			}
			sum += got
		}
		if sum != c.total {
			t.Errorf("share(%d,%d) sums to %d", c.total, c.n, sum)
		}
	}
}

func TestParseNetDev(t *testing.T) {
	sample := `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  1000     10    0    0    0     0          0         0     1000     10    0    0    0     0       0          0
 bond0: 500000   100    0    0    0     0          0         0   900000    200    0    0    0     0       0          0
`
	got := parseNetDev(sample)
	b, ok := got["bond0"]
	if !ok || b.rx != 500000 || b.tx != 900000 {
		t.Fatalf("bond0 = %+v, ok=%v", b, ok)
	}
	if _, ok := got["lo"]; !ok {
		t.Fatal("lo missing (filtering happens later, parsing should keep it)")
	}
}

func TestVirtualIface(t *testing.T) {
	for _, virt := range []string{"lo", "cilium_host", "lxc123", "veth0", "wt0", "nb-wt0"} {
		if !virtualIface(virt) {
			t.Errorf("%s should be virtual", virt)
		}
	}
	for _, phys := range []string{"bond0", "enp193s0f0", "eth0", "ens3"} {
		if virtualIface(phys) {
			t.Errorf("%s should be physical", phys)
		}
	}
}

func TestRenderDeploymentManifest(t *testing.T) {
	b, err := renderManifest("deployment.yaml", map[string]any{
		"Name": "warp-runner", "Namespace": "loadtest", "Image": "minio/warp:latest",
		"Replicas": 6, "CPU": 16, "SecretName": "warp-s3-creds",
	})
	if err != nil {
		t.Fatal(err)
	}
	var d appsv1.Deployment
	if err := yaml.UnmarshalStrict(b, &d); err != nil {
		t.Fatalf("deployment does not decode: %v\n%s", err, b)
	}
	if *d.Spec.Replicas != 6 || !d.Spec.Template.Spec.HostNetwork {
		t.Fatalf("unexpected deployment: replicas=%v hostNetwork=%v", *d.Spec.Replicas, d.Spec.Template.Spec.HostNetwork)
	}
	cpu := d.Spec.Template.Spec.Containers[0].Resources.Requests[corev1.ResourceCPU]
	if cpu.Value() != 16 {
		t.Fatalf("cpu request = %s", cpu.String())
	}
}

func TestRenderDeploymentManifestPinned(t *testing.T) {
	b, err := renderManifest("deployment.yaml", map[string]any{
		"Name": "warp-runner", "Namespace": "loadtest", "Image": "minio/warp:latest",
		"Replicas": 4, "CPU": 8, "SecretName": "warp-s3-creds",
		"NodeNames": []string{"jeanne", "sheron"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var d appsv1.Deployment
	if err := yaml.UnmarshalStrict(b, &d); err != nil {
		t.Fatalf("pinned deployment does not decode: %v\n%s", err, b)
	}
	terms := d.Spec.Template.Spec.Affinity.NodeAffinity.RequiredDuringSchedulingIgnoredDuringExecution.NodeSelectorTerms
	if len(terms) != 1 || len(terms[0].MatchExpressions[0].Values) != 2 {
		t.Fatalf("node affinity wrong: %+v", terms)
	}
}

func TestRenderCleanupJobManifest(t *testing.T) {
	script := "set -e\nmc alias set rgw \"https://s3\" \"$A\" \"$B\"\necho 'quoted \"stuff\"'"
	b, err := renderManifest("cleanup-job.yaml", map[string]any{
		"Name": "warp-cleanup-x", "Namespace": "loadtest", "Image": "minio/mc:latest",
		"Script": script, "SecretName": "warp-s3-creds",
	})
	if err != nil {
		t.Fatal(err)
	}
	var j batchv1.Job
	if err := yaml.UnmarshalStrict(b, &j); err != nil {
		t.Fatalf("job does not decode: %v\n%s", err, b)
	}
	cmd := j.Spec.Template.Spec.Containers[0].Command
	if len(cmd) != 3 || cmd[2] != script {
		t.Fatalf("script did not round-trip through the template: %q", cmd)
	}
	if !j.Spec.Template.Spec.HostNetwork {
		t.Fatal("cleanup job must be hostNetwork (fabric-internal RGW IPs)")
	}
}

func TestRenderSecretAndNamespace(t *testing.T) {
	b, err := renderManifest("secret.yaml", map[string]any{
		"Name": "warp-s3-creds", "Namespace": "loadtest",
		"AccessKeyB64": "QUtJQQ==", "SecretKeyB64": "U0VDUkVU",
	})
	if err != nil {
		t.Fatal(err)
	}
	var sec corev1.Secret
	if err := yaml.UnmarshalStrict(b, &sec); err != nil {
		t.Fatalf("secret does not decode: %v\n%s", err, b)
	}
	if string(sec.Data["WARP_ACCESS_KEY"]) != "AKIA" {
		t.Fatalf("access key = %q", sec.Data["WARP_ACCESS_KEY"])
	}

	b, err = renderManifest("namespace.yaml", map[string]any{"Namespace": "loadtest"})
	if err != nil {
		t.Fatal(err)
	}
	var ns corev1.Namespace
	if err := yaml.UnmarshalStrict(b, &ns); err != nil {
		t.Fatalf("namespace does not decode: %v", err)
	}
}

// The kill patterns must never match the `sh -c <killScript>` process itself
// (its command line contains the pattern text) — a self-match SIGTERMs the
// exec with code 143. This is why they use the [b]racket trick.
func TestKillScriptNoSelfMatch(t *testing.T) {
	patterns := regexp.MustCompile(`-f '([^']+)'`).FindAllStringSubmatch(killScript, -1)
	if len(patterns) != 4 {
		t.Fatalf("expected 4 pkill patterns in killScript, got %d", len(patterns))
	}
	for _, m := range patterns {
		re, err := regexp.Compile(m[1])
		if err != nil {
			t.Fatalf("pattern %q: %v", m[1], err)
		}
		if re.MatchString(killScript) {
			t.Errorf("pattern %q matches killScript itself — would SIGTERM the exec", m[1])
		}
	}
}

func TestLaunchLine(t *testing.T) {
	warpCmd := `/warp put --host=1.2.3.4:443 --concurrent=167 >> /tmp/warp-put.log 2>&1`
	single := launchLine("put", warpCmd, false)
	if !strings.Contains(single, "nohup sh -c") || strings.Contains(single, "while") {
		t.Fatalf("bounded launch wrong: %s", single)
	}
	loop := launchLine("put", warpCmd, true)
	if !strings.Contains(loop, "while :; do") || !strings.Contains(loop, "/tmp/warp-put-loop.sh") {
		t.Fatalf("nonstop launch wrong: %s", loop)
	}
}
