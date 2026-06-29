# Cloudflare-managed DNS for infrastructure names under futo.cloud.
# The provider reads CLOUDFLARE_API_TOKEN from the environment (injected
# from 1P via tf/.env by the mise tf:* tasks); no provider arguments.
provider "cloudflare" {}

locals {
  # One resource instance per (name, value) pair. The for_each key carries
  # the value so adding or removing a node IP touches only that instance,
  # never its siblings under the same name.
  record_instances = merge([
    for name, r in var.records : {
      for v in r.values : "${name}/${r.type}/${v}" => {
        name    = name
        type    = r.type
        content = v
        ttl     = r.ttl
        proxied = r.proxied
        comment = r.comment
      }
    }
  ]...)
}

resource "cloudflare_dns_record" "this" {
  for_each = local.record_instances

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.content
  ttl     = each.value.ttl
  proxied = each.value.proxied
  comment = each.value.comment
}

output "records" {
  description = "Managed records as name => sorted values, for quick inspection after apply."
  value = {
    for name, r in var.records :
    name => sort([for k, inst in local.record_instances : inst.content if inst.name == name])
  }
}
