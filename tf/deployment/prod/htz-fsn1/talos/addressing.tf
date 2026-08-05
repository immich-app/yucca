# Site IP plan (same module the fabric + netbird stacks read); nothing hardcoded.
#   kube_cidr    10.40.10.0/24  VLAN 10, worker east-west (50G)
#   kube_cp_cidr 10.40.11.0/24  VLAN 11, CP etcd + API VIP
module "addr_site" {
  source  = "../../../../shared/modules/fabric-addressing"
  site_id = var.site_id
}

# Cluster-1 view — only for the leaf vme address (netops-secrets.tf hyperglass).
module "addr_cls1" {
  source     = "../../../../shared/modules/fabric-addressing"
  site_id    = var.site_id
  cluster_id = 1
}

locals {
  kube_cidr    = module.addr_site.kube_cidr              # 10.40.10.0/24 (fabric VLAN 10)
  kube_gateway = cidrhost(module.addr_site.kube_cidr, 1) # .1 IRB on the spine
  kube_cp_cidr = module.addr_site.kube_cp_cidr           # 10.40.11.0/24 (fabric VLAN 11)
  kube_cp_gw   = module.addr_site.kube_cp_gateway        # .1 IRB on the spine

  # cls1 public network (spice RGW frontend) — routed by the spine (fabric stack
  # public_routing); michael's S3 path.
  cls1_public_cidr = module.addr_cls1.public_cidr # 10.40.20.0/23 (fabric VLAN 120)
}
