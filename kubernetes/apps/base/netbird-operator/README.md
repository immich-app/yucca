# netbird-operator

The [NetBird Kubernetes operator](https://docs.netbird.io/how-to/kubernetes-operator)
running in the `netbird` namespace. Deployed via Flux (HelmRelease →
`oci://ghcr.io/netbirdio/helm-charts/netbird-operator`), gated behind
`cert-manager` (it provisions its admission-webhook certs through cert-manager).

## Auth

The operator authenticates to the NetBird Management API with the
`netbird-mgmt-api-key` Secret (key `NB_API_KEY`). That token is minted as a
service-user PAT by the `tf/deployment/staging/netbird` stack (service user
`yucca-staging-k8s-operator`), stored in the `yucca_tf_staging` 1Password vault,
and bootstrapped into the `netbird` namespace by the `tf/deployment/staging/talos`
stack (`secrets.tf`). The operator mints its own per-workload setup keys via the
API, so no setup key needs to be pre-provisioned.

## Usage (not applied by Flux — copy into an app overlay)

Inject a NetBird sidecar into a workload's pods so they get an overlay IP. The
operator creates the setup key in NetBird from the `SetupKey` resource:

```yaml
---
apiVersion: netbird.io/v1alpha1
kind: SetupKey
metadata:
  name: my-app
  namespace: my-app
spec:
  name: my-app
  ephemeral: true
---
apiVersion: netbird.io/v1alpha1
kind: SidecarProfile
metadata:
  name: my-app
  namespace: my-app
spec:
  setupKeyRef:
    name: my-app
  podSelector:
    matchLabels:
      app: my-app
```

To instead expose an in-cluster Service as a routed NetBird network resource, use
`NetworkResource` / `NetworkRouter` (see the upstream
[examples](https://github.com/netbirdio/kubernetes-operator/tree/main/examples)).
