# Shared name inventory: explicit override per slot, else deterministic wordlist
# pick (shuffle seeded by cluster_name; explicit names excluded from the pool).
# Position-indexed — appending slots at the tail is stable, inserting is not.
terraform {
  required_version = ">= 1.6"
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "cluster_name" {
  type        = string
  description = "Seeds the shuffle so each cluster gets its own permutation."
}

variable "name_seed" {
  type        = string
  default     = "v1"
  description = "Bump to re-roll a cluster's auto-names. Do NOT change once nodes are deployed (renames every auto-named node)."
}

variable "names" {
  type        = list(string)
  description = "Per-slot name: an explicit string to reserve, or null to auto-pick. Resolved positionally in `resolved`."
}

locals {
  wordlist        = compact(split("\n", file("${path.module}/wordlist.txt")))
  explicit_names  = [for n in var.names : n if n != null]
  available_words = tolist(setsubtract(toset(local.wordlist), toset(local.explicit_names)))
}

resource "random_shuffle" "names" {
  input        = local.available_words
  result_count = length(local.available_words)
  keepers = {
    cluster_name = var.cluster_name
    name_seed    = var.name_seed
  }
}

output "resolved" {
  description = "The resolved name per input slot (explicit where given, else auto-picked), in order."
  value       = [for i, n in var.names : n != null ? n : random_shuffle.names.result[i]]
}
