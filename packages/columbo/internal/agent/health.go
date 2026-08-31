package agent

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// healthProbes is the complete set of fleet-wide queries the model can run.
// The model only ever picks a name from this list — probe queries are the one
// path that reaches the o11y backends without per-user scoping, so free-form
// query text must never be added here. Every query must stay free of series
// that carry per-customer labels (customerId, asn, repository ids).
type healthProbe struct {
	name        string
	description string
	query       string
}

var healthProbes = []healthProbe{
	{
		"michael_requests_by_status",
		"michael (restic backend) request rate by HTTP status",
		`sum by (cluster, status) (rate({__name__="http.server.request.count"}[5m]))`,
	},
	{
		"michael_error_ratio",
		"michael server-error ratio (errors / all requests)",
		`sum by (cluster) (rate({__name__="http.server.request.errors"}[5m])) / sum by (cluster) (rate({__name__="http.server.request.count"}[5m]))`,
	},
	{
		"michael_latency_p99",
		"michael p99 request duration in seconds",
		`histogram_quantile(0.99, sum by (cluster, le) (rate({__name__="http.server.request.duration_bucket"}[5m])))`,
	},
	{
		"backend_health",
		"per-backend health as michael sees its storage backends (1 healthy, 0 unhealthy)",
		`max by (cluster, backend) ({__name__="s3.backend.healthy"})`,
	},
	{
		"backend_errors",
		"error rate of michael's requests to each storage backend",
		`sum by (cluster, backend) (rate({__name__="s3.backend.errors"}[5m]))`,
	},
	{
		"backend_retries",
		"michael's storage-backend retry rate by outcome (success/failure/denied)",
		`sum by (cluster, outcome) (rate({__name__="s3.pool.retries"}[5m]))`,
	},
	{
		"ceph_status",
		"Ceph cluster health per storage cluster (0 OK, 1 WARN, 2 ERR)",
		`ceph_health_status`,
	},
	{
		"ceph_pg_problems",
		"Ceph placement groups in degraded/undersized/inconsistent/backfilling/recovering/peering states",
		`sum by (cluster, __name__) ({__name__=~"ceph_pg_(degraded|undersized|inconsistent|backfilling|recovering|peering)"})`,
	},
	{
		"ceph_osds_down",
		"number of Ceph OSDs down per storage cluster",
		`count by (cluster) (ceph_osd_up) - sum by (cluster) (ceph_osd_up)`,
	},
	{
		"rgw_errors",
		"rate of failed requests at the Ceph RGW S3 gateways",
		`sum by (cluster) (rate(ceph_rgw_failed_req[5m]))`,
	},
	{
		"rgw_get_latency",
		"average object GET latency at the RGW gateways in seconds",
		`sum by (cluster) (rate(ceph_rgw_op_get_obj_lat_sum[5m])) / sum by (cluster) (rate(ceph_rgw_op_get_obj_lat_count[5m]))`,
	},
	{
		"rgw_put_latency",
		"average object PUT latency at the RGW gateways in seconds",
		`sum by (cluster) (rate(ceph_rgw_op_put_obj_lat_sum[5m])) / sum by (cluster) (rate(ceph_rgw_op_put_obj_lat_count[5m]))`,
	},
	{
		"rgw_queue",
		"RGW request queue length per gateway daemon",
		`sum by (cluster, ceph_daemon) (ceph_rgw_qlen)`,
	},
	{
		"pool_capacity",
		"Ceph pool fill percentage by pool name",
		`ceph_pool_percent_used * on (cluster, pool_id) group_left(name) ceph_pool_metadata`,
	},
}

func healthProbeByName(name string) (healthProbe, bool) {
	for _, p := range healthProbes {
		if p.name == name {
			return p, true
		}
	}
	return healthProbe{}, false
}

func healthDescription() string {
	var b strings.Builder
	b.WriteString("Check fleet-wide platform health (NOT user-specific). " +
		"You pick a probe by name and a time range; a fixed query runs — there is no free-form query on this tool. " +
		"Use it to test whether the user's symptoms coincide with a platform-side incident. Probes:")
	for _, p := range healthProbes {
		b.WriteString("\n- " + p.name + ": " + p.description)
	}
	return b.String()
}

type healthArgs struct {
	Probe string `json:"probe" jsonschema:"description=Probe name from the list in the tool description"`
	Start string `json:"start,omitempty" jsonschema:"description=Range start as RFC3339 or unix seconds; defaults to 24h ago, capped at 30 days back"`
	End   string `json:"end,omitempty" jsonschema:"description=Range end as RFC3339 or unix seconds; defaults to now"`
	Step  string `json:"step,omitempty" jsonschema:"description=Resolution step such as 5m; defaults to 5m, minimum 1m"`
}

func (t *toolbox) queryHealth(ctx context.Context, args healthArgs) (string, error) {
	probe, ok := healthProbeByName(args.Probe)
	if !ok {
		return "", fmt.Errorf("unknown probe %q — pick one from the tool description", args.Probe)
	}
	if err := t.spend("health: " + probe.name); err != nil {
		return "", err
	}
	start, end, err := resolveRange(args.Start, args.End, time.Now().UTC())
	if err != nil {
		return "", err
	}
	step, err := resolveStep(args.Step)
	if err != nil {
		return "", err
	}
	result, err := t.o11y.QueryFleetRange(ctx, probe.query, start, end, step)
	if err != nil {
		return "", err
	}
	return t.deliver(result), nil
}
