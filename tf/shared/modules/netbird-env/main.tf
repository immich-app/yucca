# Per-environment NetBird (Cloud) objects. One NetBird Cloud account backs every
# env/site; objects are namespaced "<NAME_PREFIX>_<KEY>" (UPPER_SNAKE) so they
# coexist. Groups are created first; setup keys, policies, and networks resolve
# their logical group keys to NetBird-assigned group IDs.
#
# The netbird + onepassword providers are configured by the calling stack (this
# module only declares the dependency in versions.tf).

locals {
  # DERIVED NetBird object names are normalized to lowercase-kebab: lowercased,
  # underscores → hyphens. e.g. name_prefix "yucca_prod_htz-fsn1" + key "mgmt" →
  # "yucca-prod-htz-fsn1-mgmt"; key "k8s_operator" → "yucca-prod-htz-fsn1-k8s-operator".
  # An explicit `name` override is taken VERBATIM, for objects that must keep an
  # exact pre-existing name (e.g. one created outside this module).
  # NB: the 1Password setup-key item TITLES are deliberately NOT kebab — they stay
  # UPPER_SNAKE (see setup_key_op_titles below) because CI / ansible / the talos
  # stack read them by string via op:// refs.
  group_names = {
    for k, g in var.groups : k => coalesce(g.name, lower(replace("${var.name_prefix}_${k}", "_", "-")))
  }

  # UPPER_SNAKE 1Password item titles for the minted setup keys, kept stable
  # (decoupled from the now-kebab NetBird object name) so external op:// consumers
  # keep resolving. e.g. key "mgmt" → "NETBIRD_YUCCA_PROD_HTZ_FSN1_MGMT_SETUP_KEY".
  setup_key_op_titles = {
    for k, s in var.setup_keys : k => "NETBIRD_${upper(replace("${var.name_prefix}_${k}", "-", "_"))}_SETUP_KEY"
  }

  # Logical key → NetBird group ID, covering both the groups this layer owns and
  # any external_groups handed in from another layer (e.g. prod global → site).
  group_ids = merge(
    { for k, g in netbird_group.this : k => g.id },
    var.external_groups,
  )

  # Flatten networks → resources as "<network_key>/<resource_key>" so each routed
  # subnet/host is its own netbird_network_resource instance.
  network_resources = merge([
    for nk, n in var.networks : {
      for rk, r in n.resources : "${nk}/${rk}" => {
        network_key = nk
        address     = r.address
        description = r.description
        groups      = r.groups
        enabled     = r.enabled
        name        = lower(replace(coalesce(r.name, "${nk}_${rk}"), "_", "-"))
      }
    }
  ]...)

  # Groups this layer owns that are flagged `resource = true` ("yucca tags"): the
  # destinations of the auto-generated yucca→resources policy. `resource = true`
  # means yucca-reachable — a peer/node group (its peers) or a network-resource
  # tag (its routed resources). Flagged groups are picked up here automatically.
  resource_group_keys = [for k, g in var.groups : k if g.resource]
  resource_group_ids  = [for k in local.resource_group_keys : netbird_group.this[k].id]

  # Manage the yucca→resources policy only when this layer owns ≥1 resource group
  # and a users group is configured (var.yucca_users_group != null).
  manage_resource_policy = var.yucca_users_group != null && length(local.resource_group_keys) > 0
}

resource "netbird_group" "this" {
  for_each = var.groups
  name     = local.group_names[each.key]
}

# Device auth keys. `key` (plaintext) is sensitive and lands in 1Password below.
resource "netbird_setup_key" "this" {
  for_each = var.setup_keys

  name                   = lower(replace("${var.name_prefix}_${each.key}", "_", "-"))
  type                   = each.value.type
  expiry_seconds         = each.value.expiry_seconds
  usage_limit            = each.value.usage_limit
  ephemeral              = each.value.ephemeral
  revoked                = each.value.revoked
  allow_extra_dns_labels = each.value.allow_extra_dns_labels
  auto_groups            = [for g in each.value.auto_groups : local.group_ids[g]]
}

resource "netbird_policy" "this" {
  for_each = var.policies

  name        = lower(replace("${var.name_prefix}_${each.key}", "_", "-"))
  description = each.value.description
  enabled     = each.value.enabled

  dynamic "rule" {
    for_each = each.value.rules
    content {
      name          = lower(replace(rule.value.name, "_", "-"))
      action        = rule.value.action
      protocol      = rule.value.protocol
      bidirectional = rule.value.bidirectional
      enabled       = rule.value.enabled
      description   = rule.value.description
      sources       = [for g in rule.value.sources : local.group_ids[g]]
      destinations  = [for g in rule.value.destinations : local.group_ids[g]]
      ports         = rule.value.ports
    }
  }
}

# ─── yucca users → every yucca-tagged group (auto-derived) ───────────────
# Members of the account-wide `yucca` users group reach every group flagged
# `resource = true` in this layer — its peers (e.g. SSH to the mgmt/talos nodes)
# AND any network resources tagged into it. Destinations are derived from those
# groups (local.resource_group_ids), so flagging a new group covers it without
# touching a policy. bidirectional = false → yucca users only INITIATE the
# connection (this policy never makes the tagged groups a source). The users
# group is looked up by name (it lives outside this stack).
data "netbird_group" "yucca_users" {
  count = local.manage_resource_policy ? 1 : 0
  name  = var.yucca_users_group
}

resource "netbird_policy" "yucca_to_resources" {
  count = local.manage_resource_policy ? 1 : 0

  name        = lower(replace("${var.name_prefix}_yucca_to_resources", "_", "-"))
  description = "${var.yucca_users_group} users → every yucca-tagged (resource=true) group in this layer: peers + tagged resources (auto-derived)."
  enabled     = true

  rule {
    name          = upper(replace("${var.name_prefix}_yucca_to_resources", "-", "_"))
    action        = "accept"
    protocol      = "all"
    bidirectional = false
    enabled       = true
    sources       = [data.netbird_group.yucca_users[0].id]
    destinations  = local.resource_group_ids
  }
}

# ─── Networks (routed access into a site's underlying subnets) ───────────
# A Network groups one or more resources (subnets/hosts) reachable through a set
# of routing peers (router.peer_groups — e.g. a site's mgmt nodes). resources[*]
# .groups controls which peers may reach that subnet. The Network's display name
# is the lowercase-kebab map key (or `name` override) — e.g. key "HTZ-FSN1" →
# "htz-fsn1". The map key itself is unchanged (resources address by network_id).
resource "netbird_network" "this" {
  for_each    = var.networks
  name        = coalesce(each.value.name, lower(replace(each.key, "_", "-")))
  description = each.value.description
}

resource "netbird_network_router" "this" {
  for_each = var.networks

  network_id  = netbird_network.this[each.key].id
  peer_groups = [for g in each.value.router.peer_groups : local.group_ids[g]]
  masquerade  = each.value.router.masquerade
  metric      = each.value.router.metric
  enabled     = each.value.router.enabled
}

resource "netbird_network_resource" "this" {
  for_each = local.network_resources

  network_id  = netbird_network.this[each.value.network_key].id
  name        = each.value.name
  address     = each.value.address
  description = each.value.description
  groups      = [for g in each.value.groups : local.group_ids[g]]
  enabled     = each.value.enabled
}

# ─── Setup keys → 1Password (source of truth for the plaintext key) ──────
# Operators retrieve a key with `op read`/the desktop app instead of digging
# through TF state. Per-env vault: dev → yucca_tf_dev, etc.
data "onepassword_vault" "env" {
  name = var.vault
}

resource "onepassword_item" "setup_key" {
  for_each = var.setup_keys

  vault = data.onepassword_vault.env.uuid
  # Title stays UPPER_SNAKE (decoupled from the now-kebab NetBird setup-key name)
  # so external op:// consumers (CI, ansible, talos) keep resolving, and so multiple
  # sites writing to the SAME vault (prod: global + every site → yucca_tf_prod)
  # never collide. e.g. key "mgmt" → NETBIRD_YUCCA_PROD_HTZ_FSN1_MGMT_SETUP_KEY.
  title    = local.setup_key_op_titles[each.key]
  category = "password"
  password = netbird_setup_key.this[each.key].key

  section {
    label = "netbird"
    field {
      label = "setup_key_id"
      type  = "STRING"
      value = netbird_setup_key.this[each.key].id
    }
    field {
      label = "name"
      type  = "STRING"
      value = netbird_setup_key.this[each.key].name
    }
    field {
      label = "type"
      type  = "STRING"
      value = each.value.type
    }
  }
}
