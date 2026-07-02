terraform {
  required_version = "~> 1.11"
  required_providers {
    # Drives the whole Talos bring-up (machine secrets/config/bootstrap/health).
    talos = {
      source  = "siderolabs/talos"
      version = "~> 0.11"
    }
    # Hetzner Cloud — the 3 control-plane VMs, their private subnet (etcd), and the
    # public API load balancer. Token via HCLOUD_TOKEN (op run --env-file).
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.51"
    }
    # Hostname picks for the talos nodes (node-names module → random_shuffle).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # Cilium install (CNI) post-bootstrap, in the same apply.
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1"
    }
    # Cilium BGP CRs + any bootstrap manifests applied to the live cluster.
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    # Persists the generated kube/talosconfig into 1Password (yucca_tf_prod) as the
    # source-of-truth records. Auth via OP_SERVICE_ACCOUNT_TOKEN (op run).
    onepassword = {
      source  = "1Password/onepassword"
      version = "~> 2.1"
    }
    # Worker NetBird peer lookups — the mesh addresses the CP apiserver dials for
    # worker kubelets (see cp_extras_patch). Auth via NB_PAT (op run).
    netbird = {
      source  = "registry.terraform.io/futo-org/netbird"
      version = "1.0.2"
    }
  }
}
