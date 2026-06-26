output "group_ids" {
  description = "Logical group key → NetBird group ID."
  value       = { for k, g in netbird_group.this : k => g.id }
}

output "policy_ids" {
  description = "Logical policy key → NetBird policy ID."
  value       = { for k, p in netbird_policy.this : k => p.id }
}

output "setup_key_items" {
  description = "Logical setup-key key → 1Password item title (in var.vault) holding the plaintext key. The key itself is never output."
  value       = { for k, i in onepassword_item.setup_key : k => i.title }
}

output "network_ids" {
  description = "Logical network key → NetBird network ID."
  value       = { for k, n in netbird_network.this : k => n.id }
}
