include "root" {
  path = find_in_parent_folders("terragrunt.hcl")
}

# _meta layer -- repo-level GitHub config managed as code, NOT part of the fleet
# topology (partition/region model). The `_meta` path segment is deliberately
# outside {prod,staging,dev}, so the CI discover job's active-partition filter
# (.github/workflows/infra.yml) never emits it into the plan/apply matrix. This
# stack is BOOTSTRAP-APPLIED OUT-OF-BAND (like the netbird bootstrap), e.g.:
#
#   GITHUB_TOKEN=<repo-admin / Environments:write PAT or App token> \
#     OP_ENV_FILE=tf/.env.prod tf/op-run.sh \
#     terragrunt --working-dir tf/deployment/_meta/github apply
#
# It defines the CI approval-gate Environments (staging-austin, staging-global,
# prod-global, prod-htz-fsn1) WITH required reviewers, so the gate can never
# auto-create unprotected (fail open). State key: yucca/_meta/github/terraform.tfstate.
