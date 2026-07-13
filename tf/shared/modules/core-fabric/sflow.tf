# ── sFlow export (seconds-granularity traffic telemetry) ─────────────────────
# Hardware counter samples every polling_interval seconds + 1:sample_rate packet
# samples from every listed physical port, exported to the collector (sflow-rt in
# the father cluster, an internal LB VIP the spine reaches via the Cilium iBGP /32).
# This is the high-resolution bandwidth source — the junos_exporter/NETCONF path
# stays for device health (BGP, optics, temps) at its slower cadence.
# Raw set-config: `protocols sflow` has no typed jeremmfr resource.
resource "junos_null_load_config" "sflow" {
  count  = var.sflow == null ? 0 : 1
  action = "set"
  config = join("\n", concat([
    "set protocols sflow polling-interval ${var.sflow.polling_interval}",
    "set protocols sflow sample-rate ingress ${var.sflow.sample_rate}",
    "set protocols sflow sample-rate egress ${var.sflow.sample_rate}",
    "set protocols sflow agent-id ${var.sflow.agent_id}",
    "set protocols sflow collector ${var.sflow.collector} udp-port ${var.sflow.udp_port}",
    ],
    [for i in var.sflow.interfaces : "set protocols sflow interfaces ${i}"],
  ))
}
