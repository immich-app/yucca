# Feeds sflow-rt (father, internal LB VIP via Cilium iBGP /32); junos_exporter
# stays for device health. Raw set-config: `protocols sflow` has no typed
# jeremmfr resource.
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
