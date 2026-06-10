output "inventory_path" {
  value = local_file.inventory.filename
}

output "secrets_template_path" {
  description = "Path to the rendered secrets.yml.tpl, or null when render_secrets_template = false."
  value       = length(local_file.secrets_template) > 0 ? local_file.secrets_template[0].filename : null
}
