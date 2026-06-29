# Mgmt IPs of every switch VC this stack manages. Consumed by `infra:apply` to
# confirm the dangling `commit confirmed` jeremmfr leaves on each device after a
# successful apply (extend with each cluster leaf as clusters are added).
output "switch_mgmt_ips" {
  description = "Switch VC management IPs (spine + cluster leaves) to confirm post-apply."
  value       = [module.addr_site.spine_mgmt_ip, module.addr_cls1.leaf_mgmt_ip]
}
