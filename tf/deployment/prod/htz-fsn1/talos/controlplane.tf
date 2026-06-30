# Spread placement group — forces the 3 CPs onto DISTINCT physical hosts, so no
# single host failure can take out >1 etcd member / break quorum. (hcloud caps a
# spread group at 10 servers; 3 is fine.)
resource "hcloud_placement_group" "control_plane" {
  name   = "yucca-${var.region_code}-${var.cluster.name}-cp"
  type   = "spread"
  labels = { cluster = var.cluster.name, role = "control-plane" }
}

# ── Cloud control-plane VMs ──────────────────────────────────────────────────
# 3× CCX23 booted from the Talos snapshot, configured via user_data (the per-CP
# machine config from talos.tf). Public IPv4 = NetBird NAT traversal + the TF
# runner's bootstrap path; private IP (eth1, kube-cp subnet) = etcd. Talos ignores
# SSH, so no ssh_keys. ignore_changes keeps re-applies from recycling live nodes.
resource "hcloud_server" "control_plane" {
  count              = var.cluster.cp_count
  name               = local.cp_hostnames[count.index]
  image              = data.hcloud_image.talos.id
  server_type        = var.cluster.cp_server_type
  location           = var.cluster.cp_location
  placement_group_id = hcloud_placement_group.control_plane.id

  user_data = data.talos_machine_configuration.cp[count.index].machine_configuration

  public_net {
    ipv4_enabled = true
    ipv6_enabled = false
  }

  network {
    network_id = hcloud_network.kube_cp.id
    ip         = local.cp_private_ips[count.index]
  }

  labels = { cluster = var.cluster.name, role = "control-plane" }

  depends_on = [hcloud_network_subnet.kube_cp]

  lifecycle {
    ignore_changes = [user_data, image]
  }
}

# ── API load balancer ────────────────────────────────────────────────────────
# Fronts the 3 CPs on 6443. Private IP (kube-cp) is the in-cluster target; the
# public frontend (lb_public) is what operators + workers dial via api_dns_name.
# certSANs (talos.tf) already include api_dns_name + the private LB IP.
resource "hcloud_load_balancer" "kube_api" {
  name               = "yucca-${var.region_code}-${var.cluster.name}-kube-api"
  load_balancer_type = var.cluster.lb_type
  location           = var.cluster.cp_location
  labels             = { cluster = var.cluster.name }
}

resource "hcloud_load_balancer_network" "kube_api" {
  load_balancer_id        = hcloud_load_balancer.kube_api.id
  network_id              = hcloud_network.kube_cp.id
  ip                      = local.lb_private_ip
  enable_public_interface = var.cluster.lb_public
  depends_on              = [hcloud_network_subnet.kube_cp]
}

resource "hcloud_load_balancer_service" "kube_api" {
  load_balancer_id = hcloud_load_balancer.kube_api.id
  protocol         = "tcp"
  listen_port      = 6443
  destination_port = 6443

  health_check {
    protocol = "tcp"
    port     = 6443
    interval = 10
    timeout  = 5
    retries  = 3
  }
}

# Target the CPs over their PRIVATE IPs (LB is attached to the same network).
resource "hcloud_load_balancer_target" "kube_api" {
  count            = var.cluster.cp_count
  type             = "server"
  load_balancer_id = hcloud_load_balancer.kube_api.id
  server_id        = hcloud_server.control_plane[count.index].id
  use_private_ip   = true
  depends_on       = [hcloud_load_balancer_network.kube_api]
}
