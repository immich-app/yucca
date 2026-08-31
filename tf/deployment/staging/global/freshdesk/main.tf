# The webhook contract, TF-owned end to end: this stack mints the capability-
# URL path segment and the x-freshdesk-secret header, mirrors them into 1P,
# and points the Freshdesk automation rule at them — no human ever handles
# the values, and the talos stack consumes them back via op:// refs (bot
# Secret + cluster-secrets). See docs/discord-support.md.

locals {
  # yucca-manual-secrets placeholders read back literally as REPLACE_ME —
  # never let that masquerade as config.
  url           = var.yucca_freshdesk_url == "REPLACE_ME" ? "" : var.yucca_freshdesk_url
  admin_api_key = var.yucca_freshdesk_admin_api_key == "REPLACE_ME" ? "" : var.yucca_freshdesk_admin_api_key
  enabled       = local.url != "" && local.admin_api_key != ""
}

# Fallbacks keep the provider configurable while the manual items are
# unfilled — never contacted, the freshdesk resources are count-gated.
provider "freshdesk" {
  domain  = coalesce(local.url, "https://freshdesk.invalid")
  api_key = coalesce(local.admin_api_key, "unset")
}

provider "onepassword" {}

data "onepassword_vault" "partition" {
  name = "yucca_tf_${var.partition}"
}

# Generated unconditionally (no Freshdesk dependency) so the talos stack's
# op:// refs can be uncommented right after this stack's first apply.
resource "random_password" "webhook_secret" {
  length  = 48
  special = false
}

resource "onepassword_item" "webhook_secret" {
  vault    = data.onepassword_vault.partition.uuid
  title    = "YUCCA_FRESHDESK_WEBHOOK_SECRET"
  category = "password"

  password = random_password.webhook_secret.result
}

resource "random_password" "webhook_path" {
  length  = 32
  special = false
}

resource "onepassword_item" "webhook_path" {
  vault    = data.onepassword_vault.partition.uuid
  title    = "YUCCA_FRESHDESK_WEBHOOK_PATH"
  category = "password"

  password = random_password.webhook_path.result
}

# Bot-created tickets land here; the id reaches the bot Secret through the
# 1P item below.
resource "freshdesk_group" "support" {
  count       = local.enabled ? 1 : 0
  name        = "FUTO Cloud (Staging)"
  description = "FUTO Backups support tickets from staging, managed by yucca tf"
}

resource "onepassword_item" "group_id" {
  count    = local.enabled ? 1 : 0
  vault    = data.onepassword_vault.partition.uuid
  title    = "YUCCA_FRESHDESK_GROUP_ID"
  category = "password"

  password = tostring(freshdesk_group.support[0].id)
}

# rule_type 4 = observer (ticket updates); performer type 1 = agent. events/
# actions are raw Automations-API JSON (the provider passes them through),
# mirroring a rule read back via GET /api/v2/automations/4/rules — NB
# content_type is required, content_layout is a string, and content is a JSON
# object whose string values carry the placeholders. Scoping to yucca tickets
# happens bot-side, so the rule has no conditions.
resource "freshdesk_automation_rule" "ticket_sync" {
  count     = local.enabled ? 1 : 0
  name      = "yucca staging ticket sync"
  rule_type = 4
  active    = true
  performer = jsonencode({ type = 1 })
  events = jsonencode([
    { field_name = "reply_sent" },
    { field_name = "note_type", value = "public" },
    { field_name = "status", from = "--", to = "--" },
  ])
  actions = jsonencode([{
    field_name     = "trigger_webhook"
    request_type   = "POST"
    content_type   = "JSON"
    content_layout = "2"
    url            = "https://${var.yucca_app_domain}/hooks/${random_password.webhook_path.result}"
    content        = { ticket_id = "{{ticket.id}}" }
    custom_headers = { "x-freshdesk-secret" = random_password.webhook_secret.result }
  }])
}
