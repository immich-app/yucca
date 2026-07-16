# ─── netops namespace + fabric-credential Secrets ────────────────────────────
# The netops stack (kubernetes/apps/prod/htz-fsn1/netops/) mounts fabric
# credentials that must NEVER be in git: the read-only `netops` Junos login's
# SSH key + password (fabric stack, fabric.tf netops_users) and the Grafana
# admin password. Historically these were hand-created (`kubectl create secret`)
# and DIED WITH THE CLUSTER on the 2026-07 rebuild — now they're provisioned
# here from the same 1Password items, so a rebuild restores them with the stack.
# Flux owns the workloads around them; TF owns the namespace + these Secrets
# (the namespace also carries the VictoriaMetrics hostPath PVC, so it must
# survive flux prunes — TF ownership replaces the old prune-disabled manifest).

data "onepassword_item" "netops_ssh_key" {
  vault = data.onepassword_vault.prod.uuid
  title = "NETOPS_FABRIC_SSH_PRIVATE_KEY" # DOCUMENT item; file id_ed25519
}

data "onepassword_item" "netops_fabric_password" {
  vault = data.onepassword_vault.prod.uuid
  title = "NETOPS_FABRIC_PASSWORD"
}

data "onepassword_item" "grafana_admin" {
  vault = data.onepassword_vault.prod.uuid
  title = "FATHER_GRAFANA_ADMIN"
}

resource "kubernetes_namespace_v1" "netops" {
  metadata {
    name = "netops"
    labels = {
      # VictoriaMetrics persists to a hostPath (/var/mnt); baseline forbids it.
      "pod-security.kubernetes.io/enforce" = "privileged"
    }
    annotations = {
      # Belt-and-braces from the flux-owned era (the namespace manifest is gone
      # from the tree, but flux's GC honors this if it ever re-tracks the object).
      "kustomize.toolkit.fluxcd.io/prune" = "disabled"
    }
  }
}

# SSH key for junos-exporter (NETCONF scrape) + oxidized (config backup) — both
# mount key `id_ed25519` and log in as the `netops` Junos user.
resource "kubernetes_secret_v1" "netops_ssh" {
  metadata {
    name      = "netops-ssh"
    namespace = kubernetes_namespace_v1.netops.metadata[0].name
  }
  data = {
    id_ed25519 = one([for f in data.onepassword_item.netops_ssh_key.file : f.content if f.name == "id_ed25519"])
  }
}

resource "kubernetes_secret_v1" "grafana_admin" {
  metadata {
    name      = "grafana-admin"
    namespace = kubernetes_namespace_v1.netops.metadata[0].name
  }
  data = {
    password = data.onepassword_item.grafana_admin.password
  }
}

# hyperglass device inventory — embeds the netops PASSWORD (netmiko can't
# key-auth through hyperglass config), hence a Secret and not the configmap.
resource "kubernetes_secret_v1" "hyperglass_devices" {
  metadata {
    name      = "hyperglass-devices"
    namespace = kubernetes_namespace_v1.netops.metadata[0].name
  }
  # Spine only: hyperglass's juniper directives require source4 AND source6 per
  # device, and only the spine has both (lo0 + the transit v6) — the leaf has no
  # public/v6 presence, so LG queries from it would be meaningless anyway.
  data = {
    "devices.yaml" = yamlencode({
      devices = [
        {
          name        = "corenetsw"
          description = "spine VC (QFX5200-32C x2)"
          address     = module.addr_site.spine_mgmt_ip
          platform    = "juniper"
          attrs = {
            source4 = "69.48.224.254"        # lo0 (fabric stack, transits.loopback)
            source6 = "2a01:4a0:1338:226::2" # transit /64 local (fabric stack, transits.local_v6)
          }
          credential = { username = "netops", password = data.onepassword_item.netops_fabric_password.password }
        },
      ]
    })
  }
}
