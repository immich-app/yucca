# Freshdesk-side webhook wiring, TF-owned end to end (slop-place/freshdesk
# provider): the ticket-update automation rule and the per-env agent group.
# The rule's two secret ingredients — the capability-URL path segment and the
# x-freshdesk-secret header — are the random_password resources in
# secrets.tf, so no human ever handles the values and CI plans mask them.
# performer/events/actions are raw Automations-API JSON (the provider passes
# them through); Freshdesk 400s with field-level errors if the shape drifts.
# Scoping to discord tickets happens bot-side, so the rule has no conditions.

locals {
  # yucca-manual-secrets placeholders read back literally as REPLACE_ME —
  # never let that masquerade as config.
  freshdesk_url           = var.yucca_freshdesk_url == "REPLACE_ME" ? "" : var.yucca_freshdesk_url
  freshdesk_api_key       = var.yucca_freshdesk_api_key == "REPLACE_ME" ? "" : var.yucca_freshdesk_api_key
  freshdesk_admin_api_key = var.yucca_freshdesk_admin_api_key == "REPLACE_ME" ? "" : var.yucca_freshdesk_admin_api_key
  freshdesk_rules_enabled = local.freshdesk_url != "" && local.freshdesk_admin_api_key != ""
}

# Bot-created tickets land here (FRESHDESK_GROUP_ID in the bot Secret).
resource "freshdesk_group" "discord" {
  count       = local.freshdesk_rules_enabled ? 1 : 0
  name        = "FUTO Cloud (Staging)"
  description = "FUTO Backups Discord tickets from staging, managed by yucca tf"
}

# rule_type 4 = observer (ticket updates); performer type 1 = agent.
resource "freshdesk_automation_rule" "discord_webhook" {
  count     = local.freshdesk_rules_enabled ? 1 : 0
  name      = "yucca staging discord ticket sync"
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
    url            = "https://${var.yucca_app_domain}/hooks/${random_password.yucca_freshdesk_webhook_path[0].result}"
    content_layout = 2
    content        = "{\"ticket_id\": {{ticket.id}}}"
    custom_headers = { "x-freshdesk-secret" = random_password.yucca_freshdesk_webhook_secret[0].result }
  }])
}
