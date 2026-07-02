# Flux bootstrap — mirrors yucca-o11y's deployment/modules/kubernetes/helm:
# flux-operator + flux-instance via Helm (OCI charts), then Flux reconciles
# this repo's kubernetes/clusters/staging path on its own. Runs on the same
# helm/kubernetes providers as the Cilium install (providers.tf), so it lands
# after the cluster + CNI are up.
#
# NOTE: takes effect once these manifests are on the repo's main branch — the
# flux-instance sync tracks refs/heads/main. Applying before merge installs the
# controllers but finds nothing to reconcile at clusters/staging yet.

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

# GitHub App credentials for notification-controller's `github` Provider, which
# posts deploy results as commit statuses. App auth (no PAT): notification-
# controller mints short-lived installation tokens from these and auto-rotates.
#
# TEMPORARY: sources the SHARED `push-o-matic` app (op://shared_tf/
# GITHUB_APP_IMMICH_PUSH_O_MATIC, via TF_VARs in tf/.env) — the dedicated
# least-privilege "yucca-flux" app (only "Commit statuses: write") doesn't exist
# yet. push-o-matic is broader than we'd like but already provisioned; repoint
# the tf/.env refs to yucca-flux once it's created (nothing here changes).
#
# (No git-sync or GHCR pull secret: yucca is a public repo with public images,
# so Flux reads the repo and pulls images unauthenticated.)
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
