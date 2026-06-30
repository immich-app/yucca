# Cluster access recorded in 1Password (yucca_tf_prod), so operators fetch creds
# with `op read` instead of pulling TF state. Titles match the discovery refs.
data "onepassword_vault" "prod" {
  name = "yucca_tf_${coalesce(var.partition, "prod")}"
}

resource "onepassword_item" "kubeconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = upper("YUCCA_${coalesce(var.partition, "PROD")}_KUBECONFIG")
  category = "password"
  password = talos_cluster_kubeconfig.this.kubeconfig_raw
}

resource "onepassword_item" "talosconfig" {
  vault    = data.onepassword_vault.prod.uuid
  title    = upper("YUCCA_${coalesce(var.partition, "PROD")}_TALOSCONFIG")
  category = "password"
  password = data.talos_client_configuration.this.talos_config
}
