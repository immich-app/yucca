include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# Freshdesk-side support wiring for the partition (docs/discord-support.md):
# webhook credentials, the agent group and the ticket-update automation rule.
# partition/region are injected by the root config (parsed from the path:
# deployment/<partition>/global/freshdesk).
