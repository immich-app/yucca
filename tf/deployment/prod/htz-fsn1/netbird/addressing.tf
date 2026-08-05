# Same fabric-addressing module as the fabric stack — the routed network's
# resource addresses derive from it, nothing hardcoded. Pure/stateless module:
# re-instantiating is deterministic, no cross-stack state coupling.
module "addr_site" {
  source  = "../../../../shared/modules/fabric-addressing"
  site_id = var.site_id
}

module "addr_cls1" {
  source     = "../../../../shared/modules/fabric-addressing"
  site_id    = var.site_id
  cluster_id = 1
}
