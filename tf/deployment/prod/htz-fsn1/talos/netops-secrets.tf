# Creds for kubernetes/apps/prod/htz-fsn1/netops/, never in git. Hand-created
# versions died with the cluster on the 2026-07 rebuild; TF now provisions from
# 1P so rebuilds restore them. TF owns namespace + Secrets (the namespace carries
# the VM hostPath PVC and must survive flux prunes); Flux owns the workloads.

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
      # Belt-and-braces: flux GC honors this if it ever re-tracks the object.
      "kustomize.toolkit.fluxcd.io/prune" = "disabled"
    }
  }
}

# Mounted by junos-exporter + oxidized; they log in as `netops`.
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
# key-auth via hyperglass config), hence a Secret.
resource "kubernetes_secret_v1" "hyperglass_devices" {
  metadata {
    name      = "hyperglass-devices"
    namespace = kubernetes_namespace_v1.netops.metadata[0].name
  }
  # Spine only: hyperglass juniper directives need source4 AND source6, and only
  # the spine has both (lo0 + transit v6).
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
