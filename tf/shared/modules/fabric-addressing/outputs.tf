output "site_supernet" {
  value       = local.site_supernet
  description = "10.<site_id>.0.0/16"
}

output "mgmt_cidr" {
  value       = local.mgmt_cidr
  description = "OOB / vme management network for the site (10.<site_id>.5.0/24)."
}

output "spine_mgmt_ip" {
  value       = local.spine_mgmt_ip
  description = "Site core spine vme IP (10.<site_id>.5.115)."
}

output "cluster_supernet" {
  value       = local.cluster_supernet
  description = "10.<site_id>.<cluster_id*16>.0/20 (null if no cluster_id)."
}

output "public_cidr" {
  value       = local.public_cidr
  description = "Cluster public network (e.g. cls1 -> 10.40.20.0/23)."
}

output "private_cidr" {
  value       = local.private_cidr
  description = "Cluster private network (e.g. cls1 -> 10.40.22.0/23)."
}

output "public_vlan_id" {
  value       = local.public_vlan_id
  description = "Public VLAN id = cluster_id*100 + 20 (cls1 -> 120). Name = vlan<id>."
}

output "private_vlan_id" {
  value       = local.private_vlan_id
  description = "Private VLAN id = cluster_id*100 + 22 (cls1 -> 122). Name = vlan<id>."
}

output "public_gateway" {
  value       = local.public_gateway
  description = "IRB gateway (.1) for the public network."
}

output "private_gateway" {
  value       = local.private_gateway
  description = "IRB gateway (.1) for the private network."
}

output "prefixlen" {
  value       = local.has_cluster ? tonumber(split("/", local.public_cidr)[1]) : null
  description = "Prefix length of the public/private networks (23)."
}

output "leaf_mgmt_ip" {
  value       = local.leaf_mgmt_ip
  description = "Cluster leaf vme IP (cls1 -> 10.40.5.125, cls2 -> .135)."
}
