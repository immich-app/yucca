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
    # Storage-credential key generation (secrets.tf).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # App JWT keypair generation (secrets.tf).
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}
