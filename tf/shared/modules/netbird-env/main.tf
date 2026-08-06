# One NetBird (Cloud) account backs every env/site — names are namespaced by name_prefix.

locals {
  # Derived names normalize to lowercase-kebab; explicit `name` override is taken
  # VERBATIM (pre-existing objects). 1P setup-key TITLES stay UPPER_SNAKE
  # (setup_key_op_titles) — CI/ansible/talos read them via op:// refs.
  group_names = {
    for k, g in var.groups : k => coalesce(g.name, lower(replace("${var.name_prefix}_${k}", "_", "-")))
  }

  # UPPER_SNAKE 1P titles, stable and decoupled from the kebab NetBird name so
  # op:// consumers keep resolving. e.g. "mgmt" → NETBIRD_YUCCA_PROD_HTZ_FSN1_MGMT_SETUP_KEY.
  setup_key_op_titles = {
    for k, s in var.setup_keys : k => "NETBIRD_${upper(replace("${var.name_prefix}_${k}", "-", "_"))}_SETUP_KEY"
  }

  group_ids = merge(
    { for k, g in netbird_group.this : k => g.id },
    var.external_groups,
  )

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

  # `resource = true` = yucca-reachable (peer group or network-resource tag);
  # these become destinations of the auto-generated yucca→resources policy.
  resource_group_keys = [for k, g in var.groups : k if g.resource]
  resource_group_ids  = [for k in local.resource_group_keys : netbird_group.this[k].id]

  manage_resource_policy = var.yucca_users_group != null && length(local.resource_group_keys) > 0
}

resource "netbird_group" "this" {
  for_each = var.groups
  name     = local.group_names[each.key]
}

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

# bidirectional=false: users only INITIATE. The users group lives outside this stack.
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

# Operators read the plaintext key with `op read`, not TF state.
data "onepassword_vault" "env" {
  name = var.vault
}

resource "onepassword_item" "setup_key" {
  for_each = var.setup_keys

  vault = data.onepassword_vault.env.uuid
  # UPPER_SNAKE title: op:// consumers keep resolving, and multiple sites writing
  # the SAME vault (prod: global + every site → yucca_tf_prod) never collide.
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
