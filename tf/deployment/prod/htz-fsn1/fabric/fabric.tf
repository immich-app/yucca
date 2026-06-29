# Switch fabric: the shared spine core + each cluster's leaf pair, plus login
# (users/keys/rights) on every VC. Add a cluster by adding its leaf provider
# (providers.tf), a cluster-fabric + login module here, and its serials in tfvars.
#
# Login is driven by the central identity registry (shared/modules/identity):
# members of fabric-mapped groups (e.g. `fabric-admins` -> super-user) become
# login users on every VC. Manage people/groups there, not here.

module "identity" {
  source = "../../../../shared/modules/identity"
}

module "core" {
  source    = "../../../../shared/modules/core-fabric"
  providers = { junos = junos.spine }

  public_vlan_id  = module.addr_cls1.public_vlan_id
  private_vlan_id = module.addr_cls1.private_vlan_id
  api_vlan_id     = module.addr_site.api_vlan_id
  mgmt_vlan_id    = module.addr_site.mgmt_vlan_id

  vc_member_serials = var.spine_vc_serials

  # Upstream IP-transit. Today: one transit (Core-Backbone), primary/default
  # (prepend 0). Add a second entry with prepend>0 + a lower local_pref to
  # multi-home (the prepended one is the backup; see core-fabric/transit.tf —
  # prepend/local_pref need a provider regen to apply).
  local_as = 402421
  transits = {
    core-backbone = {
      interface = "et-0/0/27"
      local_v4  = "5.56.17.225/31"
      local_v6  = "2a01:4a0:1338:226::2/64"
      peer_v4   = "5.56.17.224"
      peer_v6   = "2a01:4a0:1338:226::1"
      peer_as   = 33891
      advertise = "69.48.224.0/24"
      loopback  = "69.48.224.254/32"
    }
  }
}

module "cluster_cls1" {
  source    = "../../../../shared/modules/cluster-fabric"
  providers = { junos = junos.leaf_cls1 }

  public_cidr     = module.addr_cls1.public_cidr
  private_cidr    = module.addr_cls1.private_cidr
  public_gateway  = module.addr_cls1.public_gateway
  private_gateway = module.addr_cls1.private_gateway
  public_vlan_id  = module.addr_cls1.public_vlan_id
  private_vlan_id = module.addr_cls1.private_vlan_id
  api_vlan_id     = module.addr_site.api_vlan_id
  mgmt_vlan_id    = module.addr_site.mgmt_vlan_id
  prefixlen       = module.addr_cls1.prefixlen

  vc_member_serials = var.cls1_leaf_serials

  # TEMP: admin-down all 25G server legs (no carrier) so the SX295 nodes PXE into
  # rescue over their 1G WAN. The set comes from the module's own LAG membership,
  # not a port range. Remove this line to bring the fabric ports back.
  disable_all_server_ports = true
}

# Default DNS resolvers (Cloudflare + Quad9, dual-stack). Set here, not on core,
# so a single resource owns the whole `system` container per switch.
locals {
  fabric_name_servers = ["1.1.1.1", "9.9.9.9", "2606:4700:4700::1111", "2620:fe::fe"]
}

module "login_spine" {
  source    = "../../../../shared/modules/fabric-login"
  providers = { junos = junos.spine }

  users        = module.identity.fabric_login.users
  classes      = module.identity.fabric_login.classes
  name_servers = local.fabric_name_servers
}

module "login_leaf_cls1" {
  source    = "../../../../shared/modules/fabric-login"
  providers = { junos = junos.leaf_cls1 }

  users        = module.identity.fabric_login.users
  classes      = module.identity.fabric_login.classes
  name_servers = local.fabric_name_servers
}
