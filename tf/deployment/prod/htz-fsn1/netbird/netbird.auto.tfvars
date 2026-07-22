# htz-fsn1 site NetBird objects (rendered UPPER_SNAKE, auto-prefixed
# "YUCCA_PROD_HTZ_FSN1_"). Setup-key plaintext → the yucca_tf_prod vault. NetBird
# is default-deny: a peer gets only the access its groups' policies grant.

# Every group is a "yucca tag" (`resource = true`): the netbird-env module makes
# yucca users able to reach each one — its peers (SSH to the nodes) and any network
# resources tagged into it — via the auto-generated
# YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES policy. (`resource = true` means
# yucca-reachable here, not strictly a network-resource tag.) `resources` is the
# routed-subnet tag the site Network resources (netbird.tf) are tagged into;
# it replaced the retired shared "yucca_resource" tag.
# NB: no k8s_operator group/key here — the in-cluster netbird operator isn't
# deployed on father, and the half-wired group+setup-key invited use before the
# service user/token existed. Mirror the staging pattern (staging/global/netbird
# mints the service user; the talos stack lands netbird-mgmt-api-key) when the
# operator actually deploys.
groups = {
  ci    = { resource = true } # ephemeral CI runners → yucca-prod-htz-fsn1-ci
  mgmt  = { resource = true } # management nodes (ansible); also the route peers
  talos = { resource = true } # Talos cluster nodes → yucca-prod-htz-fsn1-talos
  # Ceph cluster nodes (spice) as first-class peers → yucca-prod-htz-fsn1-ceph.
  # resource = true: yucca users SSH them over the overlay via the auto policy.
  # Deliberately NO ceph-mesh policy and NO router role, and the group must stay
  # out of every network's distribution groups: ceph nodes receive zero overlay
  # routes, so nothing can shadow their fabric paths (replication stays on the
  # 25G bond). Node-side enrollment is the ansible netbird role (separate PR);
  # the node firewall already trusts wt0 (#285).
  ceph      = { resource = true }
  resources = { resource = true } # routed-subnet tag → yucca-prod-htz-fsn1-resources (Network resources tag in)
  # cls1 (ceph) nets only — split from `resources` so talos-to-resources does NOT
  # grant them: the workers reach the RGW frontend over the FABRIC (spine-routed),
  # and a NetBird client route would shadow that path. yucca users still get
  # access via resource = true.
  ceph_nets = { resource = true }
  # CP-only subset of `talos` — the ROUTER peer group for the kube-cp network. Only
  # the CPs sit on the kube-cp VLAN, so only they can route it; if the router were
  # the whole `talos` group the bare-metal WORKERS (also `talos`) would be
  # treated as routers and never install the client route to kube-cp. resource = false:
  # it's a routing peer group, not a yucca-reachable tag (the CPs are already reachable
  # via `talos`). CPs join via the talos_cp setup key below (auto_groups tags them
  # into both talos + talos_cp).
  talos_cp = { resource = false }
}

setup_keys = {
  ci       = { type = "reusable", ephemeral = true, auto_groups = ["ci"] }
  mgmt     = { type = "reusable", auto_groups = ["mgmt"] }
  talos    = { type = "reusable", auto_groups = ["talos"] }             # WORKERS
  talos_cp = { type = "reusable", auto_groups = ["talos", "talos_cp"] } # CONTROL PLANES (also the kube-cp router group)
  ceph     = { type = "reusable", auto_groups = ["ceph"] }              # spice ceph nodes
}

policies = {
  # CI reaches everything at this site (deploy/manage access to every node group).
  ci-to-all = {
    description = "CI → all htz-fsn1 node groups."
    rules = [{
      name         = "ci-to-all"
      protocol     = "all"
      sources      = ["ci"]
      destinations = ["mgmt", "talos"]
    }]
  }

  # CI also reaches the routed site subnets (switch vme 10.40.5.0/24 + kube +
  # cluster nets), so the fabric jobs can NETCONF the switches over the overlay
  # (the switches are routed resources behind the mgmt peers, not peers
  # themselves). `resources` is this site's resource group — every routed
  # resource is tagged into it (see the groups block + netbird.tf).
  ci-to-resources = {
    description = "CI → routed site subnets (resources)."
    rules = [{
      name          = "ci-to-resources"
      protocol      = "all"
      bidirectional = false
      sources       = ["ci"]
      destinations  = ["resources"]
    }]
  }

  # Cluster nodes talk to each other over the mesh (CP↔CP control; any node-level
  # peer-to-peer). NetBird is default-deny, so without this talos peers can't reach
  # one another even though they share the group.
  talos-mesh = {
    description = "Talos cluster nodes ↔ each other over the NetBird mesh."
    rules = [{
      name         = "talos-mesh"
      protocol     = "all"
      sources      = ["talos"]
      destinations = ["talos"]
    }]
  }

  # CI converges the ceph nodes over the overlay: SSH only, nothing broader.
  # Kept out of ci-to-all so the grant is auditable on its own; the ceph group
  # is never a source anywhere (nodes initiate nothing on the mesh).
  ci-to-ceph = {
    description = "CI → spice ceph nodes, SSH only."
    rules = [{
      name          = "ci-to-ceph"
      protocol      = "tcp"
      bidirectional = false
      sources       = ["ci"]
      destinations  = ["ceph"]
      ports         = ["22"]
    }]
  }

  # Talos nodes → o11y's prod mesh gateway (external group, resolved in
  # netbird.tf): vmagent + victoria-logs-collector remote-write to the
  # UNAUTHENTICATED mesh vmauth (vmauth.o11y.futo.network:443) — this ACL is
  # the only gate. Mirrors o11y's own bootstrap-egress precedent.
  talos-to-o11y-gateway = {
    description = "Talos nodes → o11y prod mesh gateway (unauth vmauth remote-write)."
    rules = [{
      name          = "talos-to-o11y-gateway"
      protocol      = "tcp"
      bidirectional = false
      sources       = ["talos"]
      destinations  = ["o11y_k8s_gateway"]
      ports         = ["443"]
    }]
  }

  # Talos nodes reach the routed site subnets (esp. the kube fabric net 10.40.10/24)
  # via the mgmt route peers — this is how the cloud CPs' apiserver reaches the
  # bare-metal worker kubelets.
  talos-to-resources = {
    description = "Talos nodes → routed site subnets (kube fabric etc.)."
    rules = [{
      name          = "talos-to-resources"
      protocol      = "all"
      bidirectional = false
      sources       = ["talos"]
      destinations  = ["resources"]
    }]
  }
}

# Site identifier (mirrors prod/htz-fsn1's site_id). Feeds the fabric-addressing
# plan in addressing.tf; the routed-network CIDRs derive from it.
#
# The "HTZ-FSN1" Network (built in netbird.tf) routes the site subnets — CIDRs
# propagated from the fabric-addressing plan — and tags every resource into this
# site's "resources" group, so access is governed by the module-generated
# YUCCA_PROD_HTZ_FSN1_YUCCA_TO_RESOURCES policy. Nothing to declare here per subnet.
site_id = 40
