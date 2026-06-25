# Switch fabric: the shared spine core + each cluster's leaf pair, plus login
# (users/keys/rights) on every VC. Add a cluster by adding its leaf provider
# (providers.tf), a cluster-fabric + login module here, and its serials in tfvars.

module "core" {
  source    = "../../../shared/modules/core-fabric"
  providers = { junos-qfx = junos-qfx.spine }

  public_vlan_id  = module.addr_cls1.public_vlan_id
  private_vlan_id = module.addr_cls1.private_vlan_id

  vc_member_serials = var.spine_vc_serials
}

module "cluster_cls1" {
  source    = "../../../shared/modules/cluster-fabric"
  providers = { junos-qfx = junos-qfx.leaf_cls1 }

  public_cidr     = module.addr_cls1.public_cidr
  private_cidr    = module.addr_cls1.private_cidr
  public_gateway  = module.addr_cls1.public_gateway
  private_gateway = module.addr_cls1.private_gateway
  public_vlan_id  = module.addr_cls1.public_vlan_id
  private_vlan_id = module.addr_cls1.private_vlan_id
  prefixlen       = module.addr_cls1.prefixlen

  vc_member_serials = var.cls1_leaf_serials
}

module "login_spine" {
  source    = "../../../shared/modules/fabric-login"
  providers = { junos-qfx = junos-qfx.spine }

  resource_name = "login"
  users         = var.fabric_users
  classes       = var.fabric_login_classes
}

module "login_leaf_cls1" {
  source    = "../../../shared/modules/fabric-login"
  providers = { junos-qfx = junos-qfx.leaf_cls1 }

  resource_name = "login"
  users         = var.fabric_users
  classes       = var.fabric_login_classes
}
