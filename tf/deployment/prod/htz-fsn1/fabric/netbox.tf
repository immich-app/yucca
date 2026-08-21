# NetBox — creates the whole fabric representation: the site, manufacturers/roles/
# device-types, the switch chassis (spine pair + each cluster's leaf pair, with vme
# mgmt IPs), VLANs, prefixes, and gateway IPs — all from the addressing module.
module "netbox" {
  source = "../../../../shared/modules/fabric-netbox"

  site = {
    name = var.netbox_site_name
    slug = var.netbox_site_slug
    code = var.site_code
  }

  site_supernet = module.addr_site.site_supernet

  # Site-global VLANs (present on every cluster).
  global_vlans = {
    MGMT      = { vid = module.addr_site.mgmt_vlan_id, prefix = module.addr_site.mgmt_cidr }
    KUBE      = { vid = module.addr_site.kube_vlan_id, prefix = module.addr_site.kube_cidr }
    "KUBE-CP" = { vid = module.addr_site.kube_cp_vlan_id, prefix = module.addr_site.kube_cp_cidr }
  }

  clusters = {
    "1" = {
      cluster_supernet  = module.addr_cls1.cluster_supernet
      public_cidr       = module.addr_cls1.public_cidr
      private_cidr      = module.addr_cls1.private_cidr
      host_mgmt_cidr    = module.addr_cls1.host_mgmt_cidr
      public_vlan_id    = module.addr_cls1.public_vlan_id
      private_vlan_id   = module.addr_cls1.private_vlan_id
      host_mgmt_vlan_id = module.addr_cls1.host_mgmt_vlan_id
      public_gateway    = module.addr_cls1.public_gateway
      private_gateway   = module.addr_cls1.private_gateway
      host_mgmt_gateway = module.addr_cls1.host_mgmt_gateway
    }
  }

  # Everything that is NOT a fabric VLAN but is real, routed address space.
  # Pod/service CIDRs mirror the talos stack (talos.tf locals); the public carves
  # mirror the Cilium LB pools + node-egress + transit config in this stack.
  extra_prefixes = {
    lb_internal = { prefix = module.addr_site.lb_internal_cidr, description = "father internal (NetBird-only) LoadBalancer VIPs — Cilium lb-internal pool, iBGP /32s to the spine" }
    pods        = { prefix = "10.250.0.0/17", description = "father pod CIDR (Cilium, geneve over the kube VLAN)", status = "container" }
    services    = { prefix = "10.250.128.0/17", description = "father service CIDR (ClusterIPs; kube-dns at .128.10)", status = "container" }
    netbird     = { prefix = "10.254.0.0/15", description = "NetBird mesh peer range (node plane CP<->worker, operators)", status = "container" }

    public           = { prefix = "69.48.224.0/24", description = "FUTO PI space announced from the spine (AS402421 via Core-Backbone + Colt)", status = "container" }
    lb_public_a      = { prefix = "69.48.224.0/26", description = "Cilium LoadBalancer pool lb-public-a (father)" }
    lb_public_b      = { prefix = "69.48.224.64/26", description = "Cilium LoadBalancer pool lb-public-b (father)" }
    worker_egress    = { prefix = "69.48.224.240/29", description = "father worker fabric-egress SNAT IPs (.241 jeanne, .242 sheron, .243 dianna)" }
    spine_loopback   = { prefix = "69.48.224.254/32", description = "spine lo0 (sFlow agent-id, LG source)" }
    transit_p2p      = { prefix = "5.56.17.224/31", description = "Core-Backbone transit /31 (spine et-0/0/27)" }
    transit_p2p_colt = { prefix = "62.67.19.108/30", description = "Colt transit /30 (spine et-1/0/27, 100GBASE-LR4, v4-only; .109 Colt, .110 us)" }
  }

  devices = {
    # Spine VC (shared site core) — member 0 carries the vme.
    "${var.netbox_site_slug}-corenetsw-1" = {
      role   = "spine", manufacturer = "Juniper Networks", model = "QFX5200-32C-32Q"
      serial = var.spine_vc_serials[0], mgmt_ip = module.addr_site.spine_mgmt_ip
    }
    "${var.netbox_site_slug}-corenetsw-2" = {
      role   = "spine", manufacturer = "Juniper Networks", model = "QFX5200-32C-32Q"
      serial = var.spine_vc_serials[1]
    }
    # cls1 leaf VC — member 0 carries the vme.
    "${var.netbox_site_slug}-cls1netsw-1" = {
      role   = "leaf", manufacturer = "Juniper Networks", model = "QFX5120-48Y-8C"
      serial = var.cls1_leaf_serials[0], mgmt_ip = module.addr_cls1.leaf_mgmt_ip
    }
    "${var.netbox_site_slug}-cls1netsw-2" = {
      role   = "leaf", manufacturer = "Juniper Networks", model = "QFX5120-48Y-8C"
      serial = var.cls1_leaf_serials[1]
    }
  }
}
