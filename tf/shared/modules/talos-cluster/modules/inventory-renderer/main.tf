# Renders the Ansible inventory for the talos subtree.
#
# Inputs: hypervisor hosts (name + bond_ip).
# Outputs: inventory.ini under ansible/talos/inventories/<cluster>-talos.<env>.<dc>.<provider>/
#
# These files are TF-generated — they're in ansible/talos/.gitignore so
# operators don't commit a stale copy. Re-run `TF_STACK_DIR=tf/deployment/dev/talos
# mise run tf:apply` after changing the cluster spec.

terraform {
  required_version = ">= 1.6"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

locals {
  # Per-host FQDN: hypervisors keep their existing ceph role-in-hostname
  # (these are still the Ceph storage hosts; they just also host VMs now).
  # VMs themselves use <cluster>-talos-<vm-name>; rendered into machine
  # config by the talos-bootstrap sub-module.
  hypervisors_computed = [
    for h in var.hypervisors : {
      name           = h.name
      bond_ip        = h.bond_ip
      hostname_short = "${var.cluster_name}-ceph-${h.name}"
      fqdn           = "${var.cluster_name}-ceph-${h.name}.${var.domain}"
    }
  ]
}

resource "local_file" "inventory" {
  filename        = var.inventory_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/inventory.ini.tftpl", {
    cluster_name     = var.cluster_name
    domain           = var.domain
    role_in_hostname = var.role_in_hostname
    hypervisors      = local.hypervisors_computed
    ansible_ssh_user = var.ansible_ssh_user
    ansible_ssh_key  = var.ansible_ssh_key
  })
}

# Per-host talos_vms (host_vars) rendered from var.nodes — makes nodes[] the
# single source of truth for topology (placement, IPs, sizing). Role defaults
# fill sizing when a node omits it.
locals {
  vm_size_defaults = {
    "control-plane" = { ram_mib = 4096, vcpus = 2, disk_gib = 50 }
    "worker"        = { ram_mib = 8192, vcpus = 4, disk_gib = 100 }
  }

  talos_vms_by_hypervisor = {
    for h in var.hypervisors : h.name => [
      for n in var.nodes : {
        name      = n.name
        role      = n.role
        static_ip = n.static_ip
        profiles  = coalesce(n.profiles, ["full", "smoke"])
        ram_mib   = coalesce(n.ram_mib, local.vm_size_defaults[n.role].ram_mib)
        vcpus     = coalesce(n.vcpus, local.vm_size_defaults[n.role].vcpus)
        disk_gib  = coalesce(n.disk_gib, local.vm_size_defaults[n.role].disk_gib)
      } if n.hypervisor == h.name
    ]
  }
}

resource "local_file" "host_vars" {
  for_each        = local.talos_vms_by_hypervisor
  filename        = "${dirname(var.inventory_path)}/host_vars/${var.cluster_name}-ceph-${each.key}.yml"
  file_permission = "0644"
  content = join("\n", [
    "---",
    "# TF-GENERATED — do not edit. Source: tf/deployment/<env>/talos/clusters.auto.tfvars (nodes[]).",
    "# Re-render: TF_STACK_DIR=tf/deployment/dev/talos mise run tf:apply",
    yamlencode({ talos_vms = each.value }),
  ])
}

# Conditional render: count=1 only when the caller signals real secrets
# exist. scripts/ansible-play.sh skips op inject when this file is absent,
# so the no-secrets path gives zero 1P prompts per play.
resource "local_file" "secrets_template" {
  count           = var.render_secrets_template ? 1 : 0
  filename        = var.secrets_template_path
  file_permission = "0644"
  content = templatefile("${path.module}/templates/secrets.yml.tpl.tftpl", {
    cluster_name = var.cluster_name
  })
}
