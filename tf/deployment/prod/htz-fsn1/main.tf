# htz-fsn1 (site 40) — production switch fabric.
#   spine (corenetsw) = shared site core.
#   cls1  (cls1netsw) = ceph cluster 1's leaf pair.
#
# Stack layout:
#   addressing.tf — IP plan (fabric-addressing: site/cluster IDs -> CIDRs/VLANs)
#   fabric.tf     — switch config: spine core + cluster leaves + login
#   netbox.tf     — NetBox IPAM mirrored from the addressing
#   providers.tf  — per-VC junos-qfx providers (+ netbox)
#   versions.tf / variables.tf / terraform.auto.tfvars / terragrunt.hcl
#
# Add a cluster: a leaf provider in providers.tf, addr_clsN in addressing.tf,
# cluster-fabric + login modules in fabric.tf, a clusters entry in netbox.tf,
# and its serials in terraform.auto.tfvars.
