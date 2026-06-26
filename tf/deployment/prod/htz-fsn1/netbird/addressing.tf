# Site/cluster IP plan — derived from the SAME fabric-addressing module the
# htz-fsn1 fabric stack uses (tf/deployment/prod/htz-fsn1/addressing.tf), the
# single source of truth for the site's CIDRs. Nothing is hardcoded here: the
# HTZ-FSN1 routed network's resource addresses come from these outputs. site_id
# and the cluster ordinals mirror the fabric stack (a pure, stateless module, so
# re-instantiating it is free and deterministic — no cross-stack state coupling).
module "addr_site" {
  source  = "../../../../shared/modules/fabric-addressing"
  site_id = var.site_id
}

module "addr_cls1" {
  source     = "../../../../shared/modules/fabric-addressing"
  site_id    = var.site_id
  cluster_id = 1
}
