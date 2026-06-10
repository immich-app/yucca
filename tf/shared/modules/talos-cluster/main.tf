# Talos cluster module orchestrator. Two sub-modules:
#
#   - inventory-renderer: writes the Ansible inventory.ini +
#     secrets.yml.tpl (gated by render_secrets_template) consumed by
#     ansible/talos/.
#   - talos-bootstrap: siderolabs/talos provider — machine secrets,
#     configuration_apply per node, bootstrap once, kubeconfig output.
#     Drives the whole talosctl sequence so operators don't run it by hand.

module "inventory_renderer" {
  source = "./modules/inventory-renderer"

  cluster_name     = var.cluster_name
  domain           = var.domain
  role_in_hostname = var.role_in_hostname
  ansible_ssh_user = var.ansible_ssh_user
  ansible_ssh_key  = var.ansible_ssh_key
  hypervisors      = var.hypervisors
  nodes            = var.nodes

  inventory_path          = var.ansible_inventory_path
  secrets_template_path   = var.ansible_secrets_template_path
  render_secrets_template = var.render_secrets_template
}

module "talos_bootstrap" {
  source = "./modules/talos-bootstrap"

  cluster_name       = var.cluster_name
  cluster_endpoint   = coalesce(var.cluster_endpoint, "https://${var.cp_vip}:6443")
  cp_vip             = var.cp_vip
  talos_version      = var.talos_version
  talos_schematic_id = var.talos_schematic_id
  kubernetes_version = var.kubernetes_version
  install_disk       = var.install_disk
  config_patches     = var.config_patches
  profile            = var.profile
  vlans              = var.vlans
  nodes              = var.nodes

  # The Ansible inventory must exist before operators can run Ansible
  # against the hypervisors; talos-bootstrap targets VMs that Ansible
  # provisions. depends_on here is informational (TF doesn't actually
  # gate on operator action) — the real ordering is:
  #   1. tf:apply renders inventory + bakes machine_secrets (idempotent)
  #   2. operator runs Ansible plays from ansible/talos/ to bring up VMs
  #   3. tf:apply again → talos-bootstrap reaches VMs over VLAN 50 +
  #      applies machine config + bootstraps cluster + outputs kubeconfig
  depends_on = [module.inventory_renderer]
}
