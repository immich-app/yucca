# htz-fsn1 (site 40) prod switch fabric: spine (corenetsw) = shared site core,
# cls1 (cls1netsw) = ceph cluster 1's leaf pair. addressing.tf = IP plan,
# fabric.tf = switch config, netbox.tf = IPAM mirror, providers.tf = per-VC junos.
# Add a cluster: leaf provider (providers.tf), addr_clsN (addressing.tf),
# cluster-fabric + login modules (fabric.tf), clusters entry (netbox.tf),
# serials (terraform.auto.tfvars).
