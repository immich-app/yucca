# Discord support (futo-backups-bot)

Support runs through Discord: a pinned message in the public support channel
carries a **Get support** button; clicking it links the Discord account to the
user's yucca account (once), then opens a **private ticket channel** with the
user and the staff role, seeded with the user's issue description and a
staff-only context thread.

```
click button ──> linked? ──no──> one-time web link ──> login + confirm ──> discordLinks row
                    │yes                                                        │
                    └──────────────> description modal <────── bot polls ───────┘
                                          │submit
                                          v
                     #ticket-<username>  (user + staff role)
                       └─ private "staff-notes" thread (Grafana link + account summary)
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

Linking is **required**: every ticket belongs to a known account.
Pre-signup questions stay in public channels.

## Tickets: Discord is the source of truth

No ticket table. State is which category the channel sits in; metadata
(linked `userId`, closedAt) lives in the channel topic. yucca-api's scope
stays pure account-linking.

- **Open**: the button (always, when linked) opens a **modal with a required
  description field**; the channel is only created on submit. The bot creates
  `ticket-<username>` under the Support category with permission overwrites
  (the user + `DISCORD_STAFF_ROLE_ID`), posts the description as the opening
  message, and creates a **private `staff-notes` thread** containing the
  user's Grafana dashboard link (`GRAFANA_USER_DASHBOARD_URL` template; the
  dashboard itself is o11y-owned) and an account summary from
  **`GET /internal/discord/users/:userId/summary`** (email, connections,
  repository count, last seen). Staff see the thread via a Manage Threads
  grant on the category; the user cannot. One open ticket per user; a second
  click jumps to the existing channel.
- **Close** (staff-only button/command): strips the user's overwrite and
  moves the channel to the Archived category, stamping closedAt in the topic.
- **Sweep** (daily): archived channels closed **> 14 days** ago are rendered
  to a plain-text transcript (timestamp / author / content, attachments as
  URLs), uploaded with a summary embed to the staff log channel, then
  deleted. History survives as the transcript; the 500-channel guild cap
  stays far away.

## Configuration

Deployment config (ops-owned): env via cluster-settings; the bot token is a
Terraform-provisioned secret (`op://` ref), dev uses the existing dev guild
through `.env`.

| Variable | What |
|---|---|
| `DISCORD_BOT_TOKEN` | secret |
| `DISCORD_GUILD_ID` | the guild |
| `DISCORD_STAFF_ROLE_ID` | role granted on every ticket |
| `DISCORD_SUPPORT_CHANNEL_ID` | public channel holding the pinned button |
| `DISCORD_TICKET_CATEGORY_ID` / `DISCORD_ARCHIVE_CATEGORY_ID` | open / closed tickets |
| `DISCORD_STAFF_LOG_CHANNEL_ID` | transcripts + summaries |
| `GRAFANA_USER_DASHBOARD_URL` | URL template, user id substituted |
| `YUCCA_API_URL`, `INTERNAL_SECRET` | internal API access |

## Where things live

| Concern | Location |
|---|---|
| Bot (gateway client, tickets, sweep) | `packages/futo-backups-bot/` |
| Schema (`discordLinks`, `discordLinkRequests`) | `packages/yucca-api/src/schema/` |
| Link endpoints (internal + public) | `packages/yucca-api/src/{controllers,services}/` |
| Confirm page | `packages/web/src/routes/link/discord/` |
| Chart / Flux wiring | `charts/apps/futo-backups-bot/`, `kubernetes/apps/`, `kubernetes/components/apps/` |
| Bot token secret | `tf/deployment/prod/htz-fsn1/talos/secrets.tf` |
