---
title: Email
description: The templates, the Postmark client and the invite flow, plus how email works in local dev
order: 3
---

Yucca sends transactional email through [Postmark](https://postmarkapp.com/). The first (and so
far only) sender is the invite flow in yucca-admin-api; anything that later needs to email a user
builds on the same three pieces.

## Architecture

| Piece | Where | Role |
|---|---|---|
| `@common/emails` | `packages/emails` | Svelte email templates (better-svelte-email, Tailwind 4) styled after the web UI's `@immich/ui` theme, prebuilt to plain JS. Exposes `render*Email(props) → { subject, htmlBody, textBody }`. |
| `EmailRepository` | `@common/server/email` | Postmark HTTP client over global `fetch` (`POST /email`, `POST /email/batch`, ≤500 per batch). Stamps `From`, the `outbound` message stream, and an optional `Tag`. |
| Callers | e.g. `AllowlistService` | Render a template, hand the result to `EmailRepository`, record the outcome. |

Services wire `EmailRepository` into their `providers` array like any other repository; templates
are imported as functions. The renderer never runs in the request path of the web app — emails are
rendered inside the NestJS process from the prebuilt `@common/emails` dist.

**Degraded mode:** without `POSTMARK_SERVER_TOKEN` the repository logs and skips every send.
Environments that don't care about email keep working; nothing crashes at boot.

## Invite flow

`POST /allowlist/invite` and `POST /allowlist/invite-batch` (yucca-admin-api, driven by yuctl)
email every affected entry whose `userAllowlist.inviteEmailSentAt` is still null, then stamp it on
success. Re-running an invite is therefore a safe retry that only reaches the not-yet-emailed
entries; a rejected address stays null and is retried next time. The email carries the invite code
and links to `/login/invite` under `WEB_BASE_URL`.

## Configuration

| Env var | Meaning | Default |
|---|---|---|
| `POSTMARK_SERVER_TOKEN` | Postmark server API token (secret) | unset → log-and-skip |
| `POSTMARK_API_URL` | Postmark endpoint; dev points it at the mock | `https://api.postmarkapp.com` |
| `EMAIL_FROM_ADDRESS` | `From` header | `FUTO Backups <noreply@backups.futo.cloud>` |
| `WEB_BASE_URL` | Base for links in emails (yucca-admin-api) | `http://localhost:5173` |

The boundary rule from [feature flags](/architecture/feature-flags) applies: these are deployment config
(env/Secret/cluster-settings), not feature flags. In staging/prod the token rides in the
TF-provisioned `yucca-admin-api` Secret; the from-address and `WEB_BASE_URL` come from the base
HelmRelease + cluster-settings.

## Local dev

Nothing leaves the machine. The app speaks the real Postmark wire protocol to an in-repo mock,
which delivers into a [Mailpit](https://mailpit.axllent.org/) inbox:

- **compose (`mise dev`)**: `mock-postmark-provider` on `localhost:8093`, Mailpit UI on
  `http://localhost:8025`. The yucca-admin-api dev env defaults point at the mock.
- **[k3d/Tilt](/development/kubernetes)**: `yucca-mock-postmark` + `yucca-mailpit` (dev-only HelmReleases under
  `kubernetes/apps/dev/local`), same ports via the Tilt port-forwards.
- **e2e/tests**: assert through Mailpit's REST API (`GET /api/v1/messages`, search, message body);
  unit/integration tests mock or override `EmailRepository` instead.

To send _real_ email from a dev machine, set `POSTMARK_API_URL` + `POSTMARK_SERVER_TOKEN` in
`.env` (see `.env.example`).

## Adding a template

1. Add `packages/emails/src/emails/<name>.svelte` (compose with `src/lib/layout.svelte` and
   `@better-svelte-email/components`; Tailwind classes only — the renderer inlines them).
2. Export a typed `render<Name>Email()` from `packages/emails/src/index.ts`.
3. Preview while iterating: `pnpm --filter @common/emails preview`.
4. Call it from a service and pass the result to `EmailRepository.send`/`sendBatch` with a `tag`.

Email HTML is its own dialect: no CSS variables, no `oklch()`, table-friendly markup — which is
why `src/theme.ts` mirrors the `@immich/ui` palette as literal hex and templates never import web
components directly.
