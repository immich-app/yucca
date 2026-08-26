# Discord support (futo-backups-bot)

Support runs through Discord: a pinned message in the public support channel
carries a **Get support** button; clicking it links the Discord account to the
user's yucca account (once), then opens a **private ticket thread** under the
support channel with the user, seeded with the user's issue description and
paired with a staff-only context thread.

```
click button ──> linked? ──no──> one-time web link ──> login + confirm ──> discordLinks row
                    │yes                                                        │
                    └──────────────> description modal <────── bot polls ───────┘
                                          │submit
                                          v
             private thread ticket-<user> (member: user; staff via Manage Threads)
               + private thread staff-<user> (Grafana link + account summary)
```

## The service

`packages/futo-backups-bot` is a NestJS service (metrics-worker template:
`@common/server` OTel/pino, Zod `env.ts`) running a **discord.js gateway
client**. Everything is outbound: no inbound HTTP, no ingress, no database.
All yucca state goes through **internal endpoints on yucca-api**,
authenticated with the shared-secret header convention (`X-Internal-Secret`;
same defence-in-depth as token introspection: gateway 404-shadows
`/api/internal/*`, NetworkPolicy admits pod-to-pod only, the secret is the
second wall). Primary region only, single replica (one gateway session).

## Account linking: postgres truth, one-time nonce

A user has at most one linked Discord account and vice versa
(`discordLinks`: `userId`, `discordUserId` unique, `discordUsername`).
Discord identity is **attested by the interaction** (Discord signs it); yucca
identity by the normal web session. The nonce marries the two:

- Bot: **`POST /internal/discord/link-requests`** `{discordUserId,
  discordUsername}` → `{code, expiresAt}` (10 min, single-use). The bot
  replies ephemerally with `https://<web>/link/discord?code=<code>`.
- Web `/link/discord` (SvelteKit, the `login/grant` consent-card design):
  redirects through OIDC login if needed, then
  **`GET /api/discord/link-requests/:code`** shows *"Link Discord account
  @name?"* and **`POST /api/discord/link-requests/:code/confirm`** consumes
  the nonce and writes the `discordLinks` row. Explicit confirm, so a pasted
  or leaked URL never links silently.
- Bot polls **`GET /internal/discord/links/by-discord-id/:discordUserId`**
  until the link exists (or the nonce expires), then edits the ephemeral
  reply to an **Open ticket** button (a modal needs a fresh interaction).

Linking is **required** for the self-serve button: every self-opened ticket
belongs to a known account. Staff can bypass it with **`/ticket user:<user>`**
(staff-only slash command) — the thread is opened for the target user directly,
and the staff note records whether a linked account exists. Pre-signup
questions stay in public channels or go through that override.

## Tickets: Discord is the source of truth

No ticket table. A ticket is a **private thread** under the support channel;
closed = **locked + archived** (locked distinguishes a real close from
Discord's auto-archive on idle), and Discord's own `archiveTimestamp` drives
retention. yucca-api's scope stays pure account-linking.

- **Open**: the button (always, when linked) opens a **modal with a required
  description field**; the thread is only created on submit. The bot creates
  private thread `ticket-<username>-<id suffix>`, adds the user as a member,
  and posts the description with a mention of the user and
  `DISCORD_STAFF_ROLE_ID` (mentioning the role adds staff to the thread). A
  sibling private thread `staff-<same suffix>` with **no members** carries the
  user's Grafana dashboard link (`GRAFANA_URL` base + the `yucca-per-user`
  dashboard, mirroring yuctl's view-dashboard; the dashboard itself is o11y-owned) and an account summary from
  **`GET /internal/discord/users/:userId/summary`** (email, connections,
  repository count, last seen) — staff see it via Manage Threads on the
  support channel; the user cannot. Up to `TICKET_USER_LIMIT`
  (3) open tickets per user (membership scan of active threads); at the limit
  a submit points at the existing threads.
- **Close** (staff-only button): locks + archives the ticket thread and its
  staff sibling. The user keeps read access to their own closed ticket but
  cannot post or reopen; staff can unarchive via Manage Threads.
- **Sweep** (daily): locked threads archived **> 14 days** ago
  (`TICKET_RETENTION_DAYS`) are rendered to a plain-text transcript
  (timestamp / author / content, attachments as URLs), uploaded to S3
  (`TRANSCRIPT_S3_*`, Ceph RGW in prod), then deleted. History survives as
  the transcript; threads never touch the guild's channel cap.

## Configuration

The Discord surface itself is Terraform in **core-infra-tf** (community
discord module): the FUTO Backups category with #general + #support, the
hidden archive category, and a per-env `YUCCA_DISCORD_SUPPORT_IDS` 1P item
carrying the ids (dev Immich server ↔ yucca staging, prod Immich ↔ yucca
prod). Yucca's talos stack reads everything secretish via `op://` refs into
the `futo-backups-bot` Secret; only the leftovers ride cluster-settings. Dev
uses the dev guild through `.env`.

| Variable | Source |
|---|---|
| `DISCORD_BOT_TOKEN` | Secret ← `YUCCA_DISCORD_BOT_TOKEN` (manual item) |
| `DISCORD_GUILD_ID`, `DISCORD_STAFF_ROLE_ID`, `DISCORD_SUPPORT_CHANNEL_ID` | Secret ← `YUCCA_DISCORD_SUPPORT_IDS` (written by core-infra-tf's discord apply) |
| `INTERNAL_SECRET` | Secret ← TF-generated (`random_password`, shared with yucca-api) |
| `TRANSCRIPT_S3_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | Secret ← ceph-stack-minted `*_CEPH_S3_SVC_YUCCA_TRANSCRIPTS_*` |
| `TRANSCRIPT_S3_ENDPOINT`, `TRANSCRIPT_S3_BUCKET` | cluster-settings |
| `GRAFANA_URL` | defaults to grafana.futostatus.com; cluster-settings override |
| `YUCCA_API_URL`, `WEB_URL` | HelmRelease env |
| `TICKET_RETENTION_DAYS` | archive retention before transcript + delete (14) |

## Where things live

| Concern | Location |
|---|---|
| Bot (gateway client, tickets, sweep) | `packages/futo-backups-bot/` |
| Schema (`discordLinks`, `discordLinkRequests`) | `packages/yucca-api/src/schema/` |
| Link endpoints (internal + public) | `packages/yucca-api/src/{controllers,services}/` |
| Confirm page | `packages/web/src/routes/link/discord/` |
| Chart / Flux wiring | `charts/apps/futo-backups-bot/`, `kubernetes/apps/`, `kubernetes/components/apps/` |
| Bot token secret | `tf/deployment/prod/htz-fsn1/talos/secrets.tf` |
