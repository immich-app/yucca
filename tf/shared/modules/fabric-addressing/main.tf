locals {
  # Site-level supernets + fixed management hosts.
  site_supernet = "10.${var.site_id}.0.0/16"     # 10.40.0.0/16
  mgmt_cidr     = "10.${var.site_id}.5.0/24"     # OOB / vme management net
  spine_mgmt_ip = cidrhost(local.mgmt_cidr, 115) # site core spine vme (10.40.5.115)

  # Site-global infra VLANs (present on every cluster). VLAN id == third octet:
  #   management  10.<site>.5.0/24             -> vlan 5
  #   kube        10.<site>.<kube_octet>.0/24  -> vlan <kube_octet> (default .10 -> vlan 10)
  mgmt_vlan_id = tonumber(split(".", local.mgmt_cidr)[2]) # 5
  kube_cidr    = "10.${var.site_id}.${var.kube_octet}.0/24"
  kube_vlan_id = var.kube_octet

  # Site-global Kubernetes control-plane subnet ("kube-cp"). NOT a Juniper fabric
  # VLAN — it's a small, isolated Hetzner Cloud private subnet holding ONLY the
  # cloud control-plane VMs (for etcd CP↔CP) + the Kubernetes API LB's private IP.
  # The workers do NOT join it: CP↔worker control + worker→API ride the NetBird
  # WireGuard mesh (node IPs are NetBird addresses), and worker↔worker east-west
  # rides the `kube` fabric net at 50G. Carved from the site supernet only for
  # collision-free IPAM; it is NEVER configured on the Junos switches.
  #   kube-cp  10.<site>.<kube_cp_octet>.0/24  (Hetzner Cloud subnet, gw .1)
  kube_cp_cidr    = "10.${var.site_id}.${var.kube_cp_octet}.0/24"
  kube_cp_gateway = cidrhost(local.kube_cp_cidr, 1) # .1 — Hetzner Cloud Gateway

  # Internal (NetBird-only) Kubernetes LoadBalancer VIP range. Like kube-cp it is
  # NEVER a switch VLAN: Cilium assigns VIPs from it and the workers advertise the
  # /32s to the spine over iBGP; NetBird peers reach them via the mgmt route peers
  # (routed resource) -> spine -> worker. Carved from the site supernet for
  # collision-free IPAM only.
  #   lb-internal  10.<site>.12.0/24
  lb_internal_cidr = "10.${var.site_id}.12.0/24"

  has_cluster = var.cluster_id != null

  # Cluster /20: net base = ordinal * 16 (cls1 -> 16 -> 10.40.16.0/20).
  net_base         = local.has_cluster ? var.cluster_id * 16 : null
  cluster_supernet = local.has_cluster ? "10.${var.site_id}.${local.net_base}.0/20" : null

  # Within the cluster /20, public/private are /23s (3 new bits -> 8 blocks):
  #   idx 0 base+0/23  idx 1 base+2/23  idx 2 base+4/23 (public)  idx 3 base+6/23 (private)
  public_cidr  = local.has_cluster ? cidrsubnet(local.cluster_supernet, 3, 2) : null
  private_cidr = local.has_cluster ? cidrsubnet(local.cluster_supernet, 3, 3) : null

  # VLAN ids encode the cluster so they're unique on the shared spine:
  #   cluster_id*100 + role (20 = public, 22 = private). cls1 -> 120/122, cls2 -> 220/222.
  # Names follow as "vlan<id>" (built by the fabric modules).
  public_vlan_id  = local.has_cluster ? var.cluster_id * 100 + 20 : null
  private_vlan_id = local.has_cluster ? var.cluster_id * 100 + 22 : null

  # Host-management network: a /24 within the cluster /20 at block idx 8 (octet
  # base+8 -> 10.40.24.0/24 for cls1). Dedicated SSH/management plane for the
  # cluster's hosts + the mgmt nodes, isolated from the public/private data nets.
  #   vlan id = cluster_id*100 + 24 (cls1 -> 124); octet 24 == role suffix.
  host_mgmt_cidr    = local.has_cluster ? cidrsubnet(local.cluster_supernet, 4, 8) : null
  host_mgmt_vlan_id = local.has_cluster ? var.cluster_id * 100 + 24 : null

  # First usable host (.1) is the IRB gateway, which lives on the cluster leaf.
  public_gateway    = local.has_cluster ? cidrhost(local.public_cidr, 1) : null
  private_gateway   = local.has_cluster ? cidrhost(local.private_cidr, 1) : null
  host_mgmt_gateway = local.has_cluster ? cidrhost(local.host_mgmt_cidr, 1) : null

  # Leaf vme: 125 for cluster 1, +10 per subsequent cluster.
  leaf_mgmt_host = local.has_cluster ? 125 + (var.cluster_id - 1) * 10 : null
  leaf_mgmt_ip   = local.has_cluster ? cidrhost(local.mgmt_cidr, local.leaf_mgmt_host) : null
}
