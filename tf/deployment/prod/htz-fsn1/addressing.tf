# Addressing — single source of truth for the IP plan (site 40 + cluster ordinals).
module "addr_site" {
  source  = "../../../shared/modules/fabric-addressing"
  site_id = var.site_id
}

module "addr_cls1" {
  source     = "../../../shared/modules/fabric-addressing"
  site_id    = var.site_id
  cluster_id = 1
}
