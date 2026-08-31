terraform {
  required_version = "~> 1.11"
  required_providers {
    # Drives the whole Talos bring-up (machine secrets/config/bootstrap/health).
    talos = {
      source  = "siderolabs/talos"
      version = "~> 0.11"
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
    # App JWT keypair generation (secrets.tf).
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    # Internal-API shared secret generation (secrets.tf).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # TRANSITIONAL: no freshdesk resources remain in config — the declaration
    # only lets tofu destroy the state-held group/rule from the pre-
    # global/freshdesk layout. Remove together with the provider block and
    # yucca_freshdesk_admin_api_key after one apply.
    freshdesk = {
      source  = "registry.terraform.io/slop-place/freshdesk"
      version = "~> 0.1"
    }
  }
}
