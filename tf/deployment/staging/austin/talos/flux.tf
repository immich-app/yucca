# Flux bootstrap (mirrors yucca-o11y): flux-operator + flux-instance via Helm,
# then Flux reconciles kubernetes/clusters/staging. Lands after cluster + CNI.
# Sync tracks refs/heads/main — applying before merge installs controllers with
# nothing to reconcile yet.

resource "helm_release" "flux_operator" {
  count = local.cluster_spec.cni == "cilium" ? 1 : 0

  name             = "flux-operator"
  namespace        = "flux-system"
  repository       = "oci://ghcr.io/controlplaneio-fluxcd/charts"
  chart            = "flux-operator"
  version          = var.flux_operator_version
  create_namespace = true
  cleanup_on_fail  = true
  wait             = true
  wait_for_jobs    = true

  depends_on = [helm_release.cilium]
}

# GitHub App creds for notification-controller's commit-status Provider (no
# PAT; installation tokens auto-rotate). TEMPORARY: shared push-o-matic app
# (op://shared_tf/GITHUB_APP_IMMICH_PUSH_O_MATIC); repoint tf/.env to the
# least-privilege "yucca-flux" app once created. No git-sync/GHCR secret —
# public repo + images.
resource "kubernetes_secret_v1" "github_app" {
  count = local.cluster_spec.cni == "cilium" ? 1 : 0

  metadata {
    name      = "github-app"
    namespace = "flux-system"
  }
  data = {
    githubAppID             = var.flux_github_app_id
    githubAppInstallationID = var.flux_github_app_installation_id
    githubAppPrivateKey     = var.flux_github_app_private_key
  }
  depends_on = [helm_release.flux_operator]

  lifecycle {
    # "" default keeps validate clean; an env-less apply would silently rewrite
    # the live secret to an empty key. Fail loudly.
    precondition {
      condition     = length(var.flux_github_app_private_key) > 0
      error_message = "flux_github_app_private_key is empty — run applies through tf/op-run.sh (op run env missing or op:// ref resolved empty)."
    }
  }
}

resource "helm_release" "flux_instance" {
  count = local.cluster_spec.cni == "cilium" ? 1 : 0

  name            = "flux-instance"
  namespace       = "flux-system"
  repository      = "oci://ghcr.io/controlplaneio-fluxcd/charts"
  chart           = "flux-instance"
  version         = var.flux_operator_version
  values          = [templatefile("${path.module}/flux-values.yaml.tftpl", { env = "staging", git_ref = "main" })]
  cleanup_on_fail = true
  wait_for_jobs   = true

  depends_on = [helm_release.flux_operator]
}
