# Flux bootstrap — mirrors the staging stack: flux-operator + flux-instance via
# Helm (OCI charts), then Flux reconciles this repo's kubernetes/clusters/prod
# path on its own. Lands after the cluster + CNI (providers.tf helm/kubernetes).
#
# ⚠ TEMPORARY: the sync ref is feat/prod (var.flux_git_ref) so father can be
# GitOps-managed before the branch merges. Flip flux_git_ref to "main" (the
# default once this merges) — nothing else changes.

resource "helm_release" "flux_operator" {
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

# GitHub App credentials for notification-controller commit statuses — the
# SHARED push-o-matic app for now (same TEMPORARY caveat as staging; see
# kubernetes/apps/prod/htz-fsn1/flux-system/notifications.yaml).
resource "kubernetes_secret_v1" "github_app" {
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
}

resource "helm_release" "flux_instance" {
  name            = "flux-instance"
  namespace       = "flux-system"
  repository      = "oci://ghcr.io/controlplaneio-fluxcd/charts"
  chart           = "flux-instance"
  version         = var.flux_operator_version
  values          = [templatefile("${path.module}/flux-values.yaml.tftpl", { env = "prod", git_ref = var.flux_git_ref })]
  cleanup_on_fail = true
  wait_for_jobs   = true

  depends_on = [helm_release.flux_operator]
}
