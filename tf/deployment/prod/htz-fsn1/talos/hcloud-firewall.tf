# hcloud firewall for the control-plane VMs — enforces "no public access to the
# cluster" at the cloud edge. Only NetBird's WireGuard is allowed inbound from the
# internet; apiserver (6443) + apid (50000) + everything else is dropped. The
# cluster is reached ONLY over NetBird (WireGuard tunnel, arrives on 51820/udp) or
# the private kube-cp network — neither of which this filters (hcloud firewalls
# apply to the public interface; private-net + in-tunnel traffic is untouched).
#
# Egress is unrestricted (hcloud default) — image pulls, NetBird signal/relay, etc.
#
# NB: a future re-bootstrap dials apid (50000) on a CP public IP — temporarily add
# an operator-source rule for 50000, or bootstrap from a NetBird-reachable path.
resource "hcloud_firewall" "control_plane" {
  name   = "yucca-${var.region_code}-${var.cluster.name}-cp"
  labels = { cluster = var.cluster.name, role = "control-plane" }

  rule {
    direction   = "in"
    protocol    = "udp"
    port        = "51820"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "NetBird WireGuard (P2P)"
  }
}

# Attach to the CPs without recreating them.
resource "hcloud_firewall_attachment" "control_plane" {
  firewall_id = hcloud_firewall.control_plane.id
  server_ids  = hcloud_server.control_plane[*].id
}
