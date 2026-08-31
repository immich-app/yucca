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

## Channels and the customer role

The FUTO Backups category is private (Team/FUTO/Yucca/Contributor/Support
Crew see it; flipping it public later is the rollout switch). `#general` is
open chat for everyone who sees the category plus customers. The
**`/claim-backups-role`** command (also offered by a daily bot prompt in
`#general`, skipped when the channel is quiet) runs the same link flow as
support and then grants the plain **FUTO Backups** role — linked customers get it instantly,
unlinked ones link first. The role unlocks `#customer` (customer chat, also visible to
Admin/Team/Yucca/FUTO). `#support` is restricted to the same audience plus
the customer role — Discord derives thread permissions from the parent channel,
so a customer needs view on `#support` to reach their own ticket thread.
Granting `@everyone` view there is the rollout switch that opens self-serve
support to the whole server.

## Closed-beta invites

Staff (`DISCORD_STAFF_ROLE_ID`) hand out beta access from Discord with
**`/beta-invite`** — either `user:<user>` (the bot DMs a personal
link; if DMs are closed the invoker gets it ephemerally to pass on) or
`channel:<channel> limit:<n>` (the bot posts a **Claim your invite** button;
each click hands out one invite until the limit, then the button flips to a
disabled *All invites claimed*). An optional `mention:<role>` prefixes the
channel post with a role ping.

An invite is a `userAllowlist` row minted without an email (`email` is
nullable; `discordUserId` unique ties the claim to the Discord account —
one claim ever per account, and already-linked accounts are refused). Batches
live in `discordInviteBatches` (`maxClaims`, counted transactionally under
the same advisory-lock pattern as linking, so concurrent clicks cannot
overshoot). The raw `inviteCode` is never shown; the claimer gets
`https://<web>/login/invite?token=<nonce>` where the nonce is a 10-minute
single-use `discordLinkRequests` row pointing at the claim (`allowlistId`).
Re-clicking re-issues a fresh nonce for the *same* claim. Redeeming rides the
OIDC signup path (`discord_invite` cookie next to the classic invite-code
cookie) and — the anti-forwarding binding — **auto-creates the Discord link
to the claimer's Discord account**, so a forwarded link burns the claimer's
only claim and ties the new account to their Discord identity.

- Bot: **`POST /internal/discord/invites`** `{discordUserId,
  discordUsername, batchId?}` → `{code, expiresAt, remaining}` (409
  `ALREADY_LINKED` / `INVITE_USED` / `BATCH_EXHAUSTED`),
  **`POST /internal/discord/invite-batches`**, and a `PATCH .../message` to
  record the posted message id.
- Web: `/login/invite?token=` validates via the public
  **`GET /api/discord/invites/:code`** and offers *Join the beta*; an expired
  token points back at the Discord button.
- Ops: **`yuctl invites list | batches | revoke | cancel`** (admin-api
  `/discord-invites*`). `batches` shows claimed/redeemed counts; `cancel`
  soft-cancels a drop (`cancelledAt` — further claims get *This drop has
  ended*), eagerly disables the posted button via the bot's
  `POST /internal/drops/close` (admin-api → bot, same shared secret; lazy
  fallback on the next click if the bot is unreachable), and with
  `--revoke-unused` also deletes the drop's unredeemed claims. `revoke`
  deletes one unredeemed claim; redeemed claims are refused — manage the
  account instead.

## Tickets: Discord is the source of truth

A ticket is a **private thread** under the support channel; closed =
**locked + archived** (locked distinguishes a real close from Discord's
auto-archive on idle), and Discord's own `archiveTimestamp` drives retention.
The only ticket state in postgres is the Freshdesk mapping row
(`discordTickets`, below) — the conversation itself lives in Discord.

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
  support channel; the user cannot. For linked users the bot also
  fires-and-forgets an investigation request to columbo, which may post an
  AI-generated telemetry brief into the staff thread (see `docs/columbo.md`).
  Up to `TICKET_USER_LIMIT`
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

## Freshdesk sync

Every ticket thread is mirrored **live and bidirectionally** into a Freshdesk
ticket, so agents can work from either side. The mapping (thread id ↔ FD
ticket id, plus the mirror cursors) is the `discordTickets` table in yucca-api
(`/internal/discord/tickets*`); the bot holds no state across restarts and
self-heals by re-reading messages after the stored cursors. Dormant unless
`FRESHDESK_URL` + `FRESHDESK_API_KEY` are set.

- **Open**: the bot creates the FD ticket (tags `discord` + `FRESHDESK_TAGS`,
  e.g. `staging`; assigned to the per-env TF-managed group when
  `FRESHDESK_GROUP_ID` is set) with the requester set to a **non-deliverable dummy**
  `<discordUserId>@no.futo.org` — nothing emails the user while the
  conversation lives in Discord. The staff-thread context (Grafana link,
  account summary) lands as a private note with a link back to the thread.
- **Discord → FD**: customer messages mirror immediately as incoming public
  notes; staff messages are **debounced** (`TICKET_MIRROR_DEBOUNCE_SECONDS`,
  quiet-period, capped by `TICKET_MIRROR_MAX_WAIT_SECONDS`) and coalesce into
  one public reply per burst — one burst = at most one email to a subscribed
  requester. Staff-thread messages mirror as private notes. Attachments are
  re-uploaded (Discord CDN URLs expire); oversized ones degrade to an
  omission note.
- **FD → Discord**: automation rules POST `{"ticket_id": {{ticket.id}}}` to
  the capability URL `https://<web>/hooks/<YUCCA_FRESHDESK_WEBHOOK_PATH>`
  (a TF-generated path segment, substituted into the HTTPRoute from the
  cluster-secrets Secret and rewritten to the bot's fixed `/hooks/freshdesk`
  mount — read it from 1P, it is never in git) with the `x-freshdesk-secret`
  header; the
  bot treats the payload as a hint and re-reads the conversation via the API
  (so forged payloads are inert), posting agent replies into the thread as
  embeds. A 5-minute `updated_since` poll catches anything the hand-configured
  rules miss and doubles as the crash-recovery sweep.
- **`/email-updates`** (ticket owner, per ticket): swaps the FD requester to
  the account's real email so native agent replies email them too; running it
  again swaps back. FD-native reply emails are 1:1 per deliberate agent reply.
- **Close**: either side wins. The Discord Close button resolves the FD
  ticket; resolving/closing in FD posts a closing note and locks + archives
  the threads. Both paths then swap the requester to the real email
  (resolve-first ordering, so no close-time email goes out) — purely so the
  closed ticket sits on the real customer's FD contact for cross-channel
  history. The retention sweep is unchanged: by deletion time FD already
  holds the full conversation.
- **`/handoff`** (staff, in a ticket thread): moves the ticket to email
  support. The Discord side closes (with a "we'll follow up by email" note to
  the user) but the FD ticket **stays open** with the requester swapped to
  the real email and a private note naming the handing-off staffer — a
  Freshdesk agent takes it from there. Requires a linked account (no email,
  no handoff).

**Freshdesk-side setup**: the ticket-update **automation rule** (reply /
public note / status change, performed by agent → webhook to the capability
URL with the `x-freshdesk-secret` header), the per-env **agent group**, and
the webhook credentials themselves are owned by the partition-wide
**`tf/deployment/<partition>/global/freshdesk` stack** (`slop-place/freshdesk`
provider); the talos stack consumes the minted values back through 1P
(`YUCCA_FRESHDESK_WEBHOOK_{PATH,SECRET}`, `YUCCA_FRESHDESK_GROUP_ID`) into
the bot Secret and cluster-secrets. The rule's events/actions JSON is
validated by Freshdesk itself on first apply. What stays
manual, once per account: create a dedicated **bot agent** and put its API
key in the `YUCCA_FRESHDESK_API_KEY` item (with `YUCCA_FRESHDESK_URL` beside
it), and put an **admin** agent's key in `YUCCA_FRESHDESK_ADMIN_API_KEY` —
used only by TF for rule/group CRUD, never shipped to the cluster. Staging
shares the account; its tickets carry the `staging` tag and its own group.

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
| `DISCORD_GUILD_ID`, `DISCORD_STAFF_ROLE_ID`, `DISCORD_SUPPORT_CHANNEL_ID`, `DISCORD_GENERAL_CHANNEL_ID`, `DISCORD_CHAT_CHANNEL_ID`, `DISCORD_CUSTOMER_ROLE_ID` | Secret ← `YUCCA_DISCORD_SUPPORT_IDS` (written by core-infra-tf's discord apply) |
| `INTERNAL_SECRET` | Secret ← TF-generated (`random_password`, shared with yucca-api) |
| `TRANSCRIPT_S3_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY` | Secret ← ceph-stack-minted `*_CEPH_S3_SVC_YUCCA_TRANSCRIPTS_*` |
| `TRANSCRIPT_S3_ENDPOINT`, `TRANSCRIPT_S3_BUCKET` | cluster-settings |
| `FRESHDESK_URL`, `FRESHDESK_API_KEY` | Secret ← `YUCCA_FRESHDESK_{URL,API_KEY}` (manual items) |
| `FRESHDESK_GROUP_ID` | Secret ← TF (restapi-created per-env group) |
| `FRESHDESK_WEBHOOK_SECRET` | Secret ← TF-generated (mirrored to 1P) |
| webhook URL path segment | TF-generated → flux-system `cluster-secrets` Secret → HTTPRoute (`YUCCA_FRESHDESK_WEBHOOK_PATH` in 1P; never in git) |
| `FRESHDESK_TAGS` | Secret (TF literal; `staging` on luke, empty on prod) |
| `TICKET_MIRROR_DEBOUNCE_SECONDS` / `TICKET_MIRROR_MAX_WAIT_SECONDS` | staff-mirror coalescing window (120 / 600) |
| `GRAFANA_URL` | defaults to grafana.futostatus.com; cluster-settings override |
| `YUCCA_API_URL`, `WEB_URL` | HelmRelease env |
| `TICKET_RETENTION_DAYS` | archive retention before transcript + delete (14) |

## Where things live

| Concern | Location |
|---|---|
| Bot (gateway client, tickets, sweep, freshdesk sync) | `packages/futo-backups-bot/` |
| Schema (`discordLinks`, `discordLinkRequests`, `discordTickets`) | `packages/yucca-api/src/schema/` |
| Link endpoints (internal + public) | `packages/yucca-api/src/{controllers,services}/` |
| Confirm page | `packages/web/src/routes/link/discord/` |
| Chart / Flux wiring | `charts/apps/futo-backups-bot/`, `kubernetes/apps/`, `kubernetes/components/apps/` |
| Bot token secret | `tf/deployment/prod/htz-fsn1/talos/secrets.tf` |
