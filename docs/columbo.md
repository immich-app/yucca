# Columbo: automated ticket investigations

`packages/columbo` is a Go service that investigates freshly opened support
tickets against the o11y stack and posts its findings into the ticket's staff
thread. It is an LLM agent (OpenRouter, tool-calling loop via
[eino](https://github.com/cloudwego/eino)) built around one constraint:
**the model must never be able to touch a credential or another user's data,
and its only output channel is a staff note.**

## Flow

```
ticket opened (futo-backups-bot, linked users only)
  └─ void POST columbo /internal/investigations   ← X-Internal-Secret
       ├─ triage: cheap model call on the ticket text → investigate? (skip = silent)
       ├─ investigation: tool loop, every query scoped to the ticket's userId
       └─ POST bot /internal/staff-notes           ← X-Internal-Secret
            └─ bot validates the target IS a staff-<suffix> thread under the
               support channel, then posts an embed (never visible to the user)
```

Both hops use the partition's shared internal secret (the same
`YUCCA_INTERNAL_API_SECRET` the bot presents to yucca-api) with the
constant-time hashed compare, failing closed when unset. NetworkPolicies pin
columbo's ingress to the bot and yucca-admin-api pods, and the bot's `:3050`
admits columbo only for the staff-notes endpoint.

## Ad-hoc investigations (`yuctl columbo investigate`)

Staff can run an investigation without a ticket:

```
yuctl columbo investigate --user someone@example.com --prompt "backups slow since Tuesday?"
```

The flow is asynchronous because the admin gateway would kill a minutes-long
synchronous call: yuctl resolves the email to a user id, `POST
/api/columbo/investigations` on the admin-api starts the job (columbo
`POST /internal/investigations/adhoc`), and yuctl polls
`GET /api/columbo/investigations/:id` every 5s until it is `done`/`failed`,
then prints the note (stdout) and the executed queries (stderr). Ad-hoc runs
skip triage (staff asked explicitly), use the same scoped toolbox and
timeout, are bounded by the same worker count (busy ⇒ 503, retry), and their
results are held in columbo's memory for an hour — single replica, no
persistence, an ops convenience rather than a record.

## Trust model

The split is **harness vs. model**, not "the agent service is trusted":

- **Harness (trusted, holds the secrets)**: the Go process. It owns the
  OpenRouter key and the internal secret, executes every tool call itself,
  and posts the final note. The model only ever sees tool *results*.
- **Model (untrusted)**: fills the parameters of three typed tools —
  `query_metrics` (PromQL), `query_logs` (LogsQL), `jq` (in-process gojq over
  stored results, no shell, no subprocess). No tool takes a URL, header, or
  credential. There is no command execution and no filesystem access.

Per-user scoping is enforced by the harness on every request, regardless of
the query text: `extra_label=customerId=<userId>` for VictoriaMetrics
(server-side ANDed into every selector), and a parenthesized
`(user:="<userId>" or customerId:="<userId>") and (<filter>)` wrapper for
VictoriaLogs — michael logs the account id as `user`, the NestJS services as
`customerId`, mirroring the yucca-per-user dashboard's scoping. LogsQL pipes
cannot live inside parentheses, so the wrapper splits the query at its first
top-level pipe and wraps only the filter half — pipes transform the already
scoped rows and cannot widen them, except `join`/`union` (whose inner
queries would run unscoped), which are refused outright. This is
load-bearing, not defense-in-depth: the o11y vmauth endpoints are
unauthenticated from the cluster (the NetBird ACL is the gate), so this
filter is the only wall between the agent and other users' telemetry —
which is why it lives in `internal/o11y` with tests asserting a query that
names another user still comes back scoped.

Prompt injection is the main residual threat: ticket text and log lines are
user-influenceable model input. The blast radius is bounded structurally —
read-only user-scoped tools, output only to the staff thread, note stamped
as AI-generated with the executed queries listed — so the worst case is a
misleading note that staff are told to verify.

Hard limits per investigation: tool-call budget (`COLUMBO_MAX_TOOL_CALLS`,
16), wall clock (`COLUMBO_TIMEOUT_SECONDS`, 300), tool results truncated to
`COLUMBO_TOOL_RESULT_BYTES` with the full payload kept harness-side for jq,
bounded queue + workers, note capped to the embed limit. Model-supplied
query parameters are clamped in the harness before the backend sees them —
lookback capped at 30 days, step floored at 1m, log limit capped at 1000,
responses over 4 MiB rejected rather than silently truncated, and jq output
bounded during accumulation — so neither prompt injection nor model error
can turn a tool call into a resource-exhaustion vector.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `COLUMBO_PORT` | required | 3060 in the chart |
| `INTERNAL_SECRET` | empty (fails closed) | shared partition internal secret |
| `OPENROUTER_API_KEY` | empty | empty ⇒ columbo idles (accepts + drops requests), mirroring the bot's tokenless idle |
| `OPENROUTER_URL` | `https://openrouter.ai/api/v1` | |
| `COLUMBO_MODEL` / `COLUMBO_TRIAGE_MODEL` | `z-ai/glm-5.3-flash` / `deepseek/deepseek-v4-flash-0731` | overridable per cluster via cluster-settings |
| `O11Y_METRICS_URL` | `http://localhost:8428` | Prometheus-API root; prod: the o11y vmauth select endpoint |
| `O11Y_LOGS_URL` | `http://localhost:9428` | VictoriaLogs host root (`/select/logsql/query` appended) |
| `FUTO_BACKUPS_BOT_URL` | `http://localhost:3050` | staff-note delivery |

Deployment mirrors the bot: primary-region role, base HelmRelease +
TF-provisioned `columbo` Secret (OpenRouter key from the manual
`YUCCA_OPENROUTER_API_KEY` 1P item, REPLACE_ME-guarded). Staging points the
o11y URLs at its own tier and pins the mesh hostname via
`O11Y_VMAUTH_HOST_ALIASES` (its talos peers don't receive the NetBird DNS
zone); prod resolves the mesh name through coredns.

## Audit log

Every investigation — ticket-triggered or ad-hoc — gets an `investigationId`
and emits the complete trajectory as JSON log events under it (shipped to
VictoriaLogs with the rest of the service logs): the trigger and its
prompt/description, the triage response, every model message (visible
content, reasoning, tool calls, token usage — `audit=model_message`), every
tool call with its raw arguments and result (`audit=tool_call`), the exact
post-scoping request each backend received (`audit=backend_query`), and the
final note (`audit=note`). The staff note links its investigation id to the
`yucca-columbo` Grafana dashboard (`o11y/dashboards/yucca-columbo.json`),
which renders the whole trajectory for one id, so a note can always be
traced back to everything the model thought, said, and queried to produce
it. Tool failures (bad query syntax, exhausted budget)
are returned to the model as tool results rather than aborting the run;
`MaxStep` still bounds a model that never recovers.

The note (and the ad-hoc API response / yuctl output) also reports the
investigation's cost — tool calls, prompt/completion tokens, duration — and
the same numbers ship as fleet metrics over the normal OTLP route
(`columbo.investigations`, `columbo.tool_calls`, `columbo.tokens`,
`columbo.investigation.duration`, labelled by trigger/outcome only, never by
user), rendered in the dashboard's Fleet row.

## Known deviations / follow-ups

- The `user`/`customerId` filter keys must match what the o11y ingestion
  actually labels; if the log pipeline renames either field, columbo's log
  scoping silently drops that service's lines (fails closed, not open).
- Namespace egress is currently unrestricted (the netpol pass is
  ingress-only, see `kubernetes/components/apps/networkpolicies.yaml`); a
  CiliumNetworkPolicy limiting columbo's egress to OpenRouter + vmauth is the
  natural follow-up.
- The staff note stays Discord-only on purpose: bot-authored messages are
  excluded from the Freshdesk mirror, keeping AI-generated content out of
  the system of record.
