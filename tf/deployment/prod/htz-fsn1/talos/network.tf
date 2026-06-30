# Isolated Hetzner Cloud network for the control plane. Holds ONLY the 3 CP VMs
# (etcd CP↔CP on private IPs) + the API LB's private IP. The workers do NOT join
# it — CP↔worker rides the NetBird mesh. Range = kube-cp (10.40.11.0/24), carved
# from the site supernet for collision-free IPAM (see fabric-addressing).
resource "hcloud_network" "kube_cp" {
  name     = "yucca-${var.region_code}-${var.cluster.name}-kube-cp"
  ip_range = local.kube_cp_cidr
  labels   = { cluster = var.cluster.name, plane = "control" }
}

# Single cloud subnet for the CP VMs + LB (no vSwitch subnet — workers aren't here).
resource "hcloud_network_subnet" "kube_cp" {
  network_id   = hcloud_network.kube_cp.id
  type         = "cloud"
  network_zone = "eu-central" # fsn1/nbg1/hel1
  ip_range     = local.kube_cp_cidr
}

locals {
  # Deterministic private IPs in the kube-cp subnet.
  cp_private_ips = [for i in range(var.cluster.cp_count) : cidrhost(local.kube_cp_cidr, var.cluster.cp_ip_offset + i)]
  lb_private_ip  = cidrhost(local.kube_cp_cidr, var.cluster.lb_ip_offset)
}
