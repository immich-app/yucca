# fabric-addressing — derives the fabric IP plan from a site ID (+ optional
# cluster ordinal). One place owns "site/cluster ID -> addressing" so the switch
# fabric and NetBox stay in lockstep.
#
# Scheme (htz-fsn1 = site 40):
#   site supernet      10.<site_id>.0.0/16                  -> 10.40.0.0/16
#   management         10.<site_id>.5.0/24                  -> 10.40.5.0/24  (vme)
#   spine vme          10.<site_id>.5.115                   -> 10.40.5.115   (site core)
#   cluster <n> /20    10.<site_id>.<n*16>.0/20             -> n=1: 10.40.16.0/20, n=2: 10.40.32.0/20
#   leaf vme           10.<site_id>.5.(125 + (n-1)*10)      -> n=1: .125, n=2: .135
#   public  (vlan)     cidrsubnet(cluster /20, /23 idx 2)   -> n=1: 10.40.20.0/23
#   private (vlan)     cidrsubnet(cluster /20, /23 idx 3)   -> n=1: 10.40.22.0/23
#   gateway = .1 (IRB on the leaf).
#   VLAN id  = cluster_id*100 + {20 public, 22 private} -> n=1: 120/122 (unique
#             per cluster on the shared spine); VLAN name = "vlan<id>".

variable "site_id" {
  type        = number
  description = "Site identifier; second octet of the site supernet 10.<site_id>.0.0/16. htz-fsn1 = 40."
  validation {
    condition     = var.site_id >= 1 && var.site_id <= 254
    error_message = "site_id must be between 1 and 254."
  }
}

variable "cluster_id" {
  type        = number
  default     = null
  description = <<-EOT
    Ceph cluster ordinal within the site (1-based; cls1 = 1). Derives the cluster
    /20 (net base = cluster_id * 16, e.g. 1 -> 10.40.16.0/20, 2 -> 10.40.32.0/20)
    and the leaf vme (125 + (cluster_id-1)*10, e.g. 1 -> .125, 2 -> .135).
    null for site-level (core/spine) addressing with no cluster.
  EOT
  validation {
    condition     = var.cluster_id == null || (var.cluster_id >= 1 && var.cluster_id <= 15)
    error_message = "cluster_id must be between 1 and 15 (cluster /20s occupy net bases 16..240)."
  }
}
