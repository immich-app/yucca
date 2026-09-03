# yucca/tf/pages

Cloudflare Pages sites, the way [static-pages](https://github.com/immich-app/static-pages)
deploys the immich.app sites: a shared Pages project per environment, a custom
domain (plus DNS) per stage, and a `wrangler pages deploy` of the prerendered
build. Kept outside `tf/deployment` because the infra workflow discovers and
applies everything under there; these stacks are applied by each site's own
workflow instead.

| Stack | State key | Creates |
|---|---|---|
| `docs/project` | `yucca/pages/docs/project/<env>/` | The `docs-futo-cloud-<env>` Pages project (+ web analytics site). Shared by every stage of the env. |
| `docs/site` | `yucca/pages/docs/site/<env>/<stage>/` | The custom domain and CNAME for one stage: `docs.futo.cloud` (prod, stage `main`) or `docs.pr-<n>.dev.futo.cloud` (dev preview). |

`ENVIRONMENT` (→ `TF_VAR_env`) is `prod` on main and `dev` for pull-request
previews; `TF_VAR_stage` is empty on main and `pr-<n>` for a preview.

## Workflows

- `.github/workflows/docs.yml` — on every push to main and every pull request
  that touches the docs surface: builds `packages/docs`, applies both stacks,
  uploads the build, and (on a PR) posts a sticky comment with the preview URL.
- `.github/workflows/docs-destroy.yml` — when a PR closes: destroys that PR's
  `docs/site` stage (custom domain + CNAME). The Pages project and the uploaded
  preview deployment itself are left in place.

Both run `mise run docs:deploy` / `mise run docs:destroy`, so an operator can
do the same locally.

## Prerequisites

Everything comes from 1Password items that other terraform publishes; nothing
is created by hand:

- `shared_tf/FUTO_CLOUD_PAGES_CLOUDFLARE_API_TOKEN` — minted by core-infra-tf's
  `cloudflare/futo-account-api-keys` unit (`futo_cloud_pages`): Pages Write and
  Account Settings Write on the FUTO account (projects, custom domains, the
  project's web analytics site), Zone Read and DNS Write on futo.cloud only.
- `shared_tf/CLOUDFLARE_ACCOUNT_ID` — the FUTO account id (shared manual item).
- `yucca_tf/TF_STATE_S3_*` — the state bucket credentials, as for tf/deployment.

CI uses the existing `OP_TF_YUCCA_PROD_ENV` (main) and `OP_TF_YUCCA_STAGING_ENV`
(previews) service accounts.

## Running locally

```bash
mise docs:build
ENVIRONMENT=dev TF_VAR_stage=pr-0 mise docs:deploy    # https://docs.pr-0.dev.futo.cloud
ENVIRONMENT=dev TF_VAR_stage=pr-0 mise docs:destroy

OP_ENV_FILE=tf/pages/.env ENVIRONMENT=prod tf/op-run.sh terragrunt run --all plan --working-dir tf/pages/docs
```
