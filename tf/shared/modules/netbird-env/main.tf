# Per-environment NetBird (Cloud) objects. One NetBird Cloud account backs every
# env/site; objects are namespaced "<NAME_PREFIX>_<KEY>" (UPPER_SNAKE) so they
# coexist. Groups are created first; setup keys, policies, and networks resolve
# their logical group keys to NetBird-assigned group IDs.
#
# The netbird + onepassword providers are configured by the calling stack (this
# module only declares the dependency in versions.tf).

locals {
  # DERIVED names are normalized to UPPER_SNAKE: uppercased, hyphens → underscores.
  # e.g. name_prefix "yucca_prod_htz-fsn1" + key "mgmt" → "YUCCA_PROD_HTZ_FSN1_MGMT".
  # An explicit `name` override is taken VERBATIM (not uppercased) — the NetBird
  # provider (v0.0.9) can't update a group that has network resources tagged into
  # it (it crashes converting the API's resource objects), so a shared tag group
  # like "yucca_resource" must keep the exact name it was created with; renaming
  # it is impossible in-place. Network display names are likewise verbatim.
  group_names = {
    for k, g in var.groups : k => coalesce(g.name, upper(replace("${var.name_prefix}_${k}", "-", "_")))
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
        name        = upper(replace(coalesce(r.name, "${nk}_${rk}"), "-", "_"))
      }
    }
  ]...)
}

resource "netbird_group" "this" {
  for_each = var.groups
  name     = local.group_names[each.key]
}

# Device auth keys. `key` (plaintext) is sensitive and lands in 1Password below.
resource "netbird_setup_key" "this" {
  for_each = var.setup_keys

  name                   = upper(replace("${var.name_prefix}_${each.key}", "-", "_"))
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

  name        = upper(replace("${var.name_prefix}_${each.key}", "-", "_"))
  description = each.value.description
  enabled     = each.value.enabled

  dynamic "rule" {
    for_each = each.value.rules
    content {
      name          = upper(replace(rule.value.name, "-", "_"))
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

# ─── Networks (routed access into a site's underlying subnets) ───────────
# A Network groups one or more resources (subnets/hosts) reachable through a set
# of routing peers (router.peer_groups — e.g. a site's mgmt nodes). resources[*]
# .groups controls which peers may reach that subnet. The Network's display name
# is the map key (or `name` override), uppercased but NOT underscore-normalized —
# so human labels like "HTZ-FSN1" survive (hyphen kept).
resource "netbird_network" "this" {
  for_each    = var.networks
  name        = coalesce(each.value.name, each.key)
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
  # Title derived from the (already UPPER_SNAKE) setup-key name so multiple sites
  # writing to the SAME vault (prod: global + every site → yucca_tf_prod) never
  # collide, e.g. "YUCCA_PROD_HTZ_FSN1_MGMT" → NETBIRD_YUCCA_PROD_HTZ_FSN1_MGMT_SETUP_KEY.
  title    = "NETBIRD_${netbird_setup_key.this[each.key].name}_SETUP_KEY"
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
