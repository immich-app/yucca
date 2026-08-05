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

  # kube-cp fabric VLAN: CP nodes (etcd + apiserver) + the API VIP. Workers do
  # NOT join it — the spine routes kube↔kube-cp via its IRBs.
  #   kube-cp  10.<site>.<kube_cp_octet>.0/24  -> vlan <kube_cp_octet> (gw .1 = spine IRB)
  kube_cp_cidr    = "10.${var.site_id}.${var.kube_cp_octet}.0/24"
  kube_cp_vlan_id = var.kube_cp_octet
  kube_cp_gateway = cidrhost(local.kube_cp_cidr, 1) # .1 — spine IRB

  # Internal (NetBird-only) LB VIP range — NEVER a switch VLAN: Cilium assigns
  # VIPs, workers advertise /32s via iBGP; peers reach them mgmt route → spine →
  # worker. Carved from the supernet for collision-free IPAM only.
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

  # Host-mgmt /24 at block idx 8 (base+8 -> 10.40.24.0/24 for cls1): SSH/mgmt
  # plane, isolated from the data nets. vlan id = cluster_id*100 + 24 (cls1 -> 124).
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
