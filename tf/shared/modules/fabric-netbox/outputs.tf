output "site_id" {
  value       = data.netbox_site.this.id
  description = "The created NetBox site id."
}

output "device_ids" {
  value       = { for k, d in netbox_device.this : k => d.id }
  description = "Created device ids keyed by name."
}
