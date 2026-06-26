# The onepassword provider reads its service-account token from
# OP_SERVICE_ACCOUNT_TOKEN in the environment (injected by tf/op-run.sh from
# tf/.env in CI, or exported by the operator locally). No inline config.
provider "onepassword" {}
