# Bot Products API 500 fix — Node 20 WebSocket workaround (Option B)

Date: 2026-05-24 09:24
Scope: GET /api/public/bot/products (and all server code using `supabaseAdmin`)

## Problem

On Local (Linux + Docker + Supabase self-host) the endpoint returned:

```
HTTP/1.1 500 Internal Server Error
{"status":500,"unhandled":true,"message":"HTTPError"}
```

Even with an invalid or missing `x-bot-api-key` header — i.e. the route
crashed before key validation. Server log showed:

```
Node.js 20 detected without native WebSocket support.
Suggested solution: For Node.js < 22, install "ws" package …
  at createSupabaseAdminClient
  at SupabaseClient._initRealtimeClient
  at createClient
  at supabaseAdmin
  at authenticateBot
  at GET /api/public/bot/products
```

## Root cause

`@supabase/supabase-js@^2.104.1` constructs a `RealtimeClient` inside its
own `SupabaseClient` constructor. `RealtimeClient._initializeOptions` calls
`WebSocketFactory.getWebSocketConstructor()`, which on Node.js < 22 with no
global `WebSocket` and no `transport` option throws
`"Node.js 20 detected without native WebSocket support"`. The throw aborts
`createClient(...)` itself, so the very first `supabaseAdmin.<anything>`
access crashes — in this case from `authenticateBot` → `supabaseAdmin.rpc`.

The Lovable runner image is `node:20-alpine` (no native WebSocket).

## Fix (Option B from the approved diagnosis)

Modified ONLY `src/integrations/supabase/client.server.ts`:

1. Added a tiny inert `NoopRealtimeTransport` class.
2. Passed it as `realtime.transport` to `createClient(...)`.

Supplying any `transport` makes realtime-js skip its
native-WebSocket / Node-version detection. Because nothing on the server
ever calls `.channel()` or `.connect()` on the admin client, the stub is
never instantiated as a real socket. The stub's constructor throws if
anyone accidentally tries to open a realtime connection through the
admin client — server-side realtime usage will fail loudly instead of
silently no-op'ing.

The lazy `Proxy` wrapping `supabaseAdmin` is preserved unchanged.
The service-role key continues to be read from `process.env` only.
Browser realtime (used by the UI) keeps using the regular frontend
client in `src/integrations/supabase/client.ts`, which runs where a
native `WebSocket` exists.

## What changed

- Files inspected:
  - `src/integrations/supabase/client.server.ts`
  - `src/server/bot-api.ts`
  - `src/routes/api.public.bot.products.ts`
  - `package.json`, `package-lock.json`, `bun.lock`
  - `Dockerfile`
  - `node_modules/@supabase/supabase-js/dist/index.cjs` (read-only verification)
  - `node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js`
  - `node_modules/@supabase/realtime-js/dist/main/lib/websocket-factory.js`
- Files changed:
  - `src/integrations/supabase/client.server.ts` — added stub transport + extensive comment
- New files:
  - `docs/lovable-change-reports/2026-05-24-0924-bot-products-api-node20-websocket.md` (this report)

## Diff summary

`src/integrations/supabase/client.server.ts`: +~40 lines / -1 line.
No behavior change other than disabling the eager Node-WebSocket check on
the admin client.

## Sensitivity flags

| Concern | Changed? |
|---|---|
| Endpoint paths | No |
| `x-bot-api-key` behavior | No |
| Frontend Supabase client | No |
| Service-role key exposure | No (still server-only) |
| Auth / register | No |
| Sale lists | No |
| Pricing UI | No |
| Dashboard / sidebar | No |
| DB schema / migrations / RLS / policies / functions / triggers | No |
| Storage | No |
| Env / Dockerfile / docker-compose / ports | No |
| `package.json` / `package-lock.json` / `bun.lock` | No |

## Verification

- `npm run build`: handled by the Lovable harness (auto-run after edits).
  No claim made here; check the Lovable build output.
- `npm run lint`, typecheck, tests: not run manually in the sandbox to
  honor the "do not run builds/typecheck manually" rule. Not claimed.
- Local curl + log validation: cannot be executed from the Lovable
  sandbox (no network access to `192.168.170.8`). Operator must run the
  validation commands below on the LAN host after pulling and rebuilding.

## Self-host acceptance check

- No new dependency. No Docker / Node-version change. No CDN / external
  service. No secret reshuffling. Service-role key remains server-only.
  Change is reversible by a single `git revert`. Compatible with
  Linux + Docker + Supabase self-host.

## Expected HTTP responses after deploy

| Scenario | Status | Body |
|---|---|---|
| Missing `x-bot-api-key` (or Authorization) | 401 | `{ "error": "missing_key", "message": "..." }` |
| Invalid key | 401 | `{ "error": "invalid_key", ... }` |
| Disabled / expired key | 401 | `{ "error": "inactive_key" \| "expired_key", ... }` |
| Key without any label permission | 403 | `{ "error": "forbidden_no_labels", ... }` |
| Valid key | 200 | `{ "products": [...], "pagination": {...} }` |
| Unexpected DB failure | 500 | `{ "error": "server_error", "message": "خطای داخلی سرور." }` (via `mapBotError`, not the bare `{"unhandled":true,"message":"HTTPError"}`) |

## Local validation (operator must run on the LAN host)

Project path: `F:\AfraKala AI Assistant\09-local-test-from-github-main`
Compose path: `deploy\lan`
Env file: `deploy\lan\.env.lan`

```powershell
cd "F:\AfraKala AI Assistant\09-local-test-from-github-main"
git pull --ff-only origin main

cd deploy\lan
docker compose --env-file .env.lan pull web
docker compose --env-file .env.lan up -d web
```

Then:

```bash
# 1) Web health
curl -i http://192.168.170.8:3000/api/healthz
#   expect: 200 {"ok":true}

# 2) Supabase/Kong health (unchanged baseline)
curl -i http://192.168.170.8:8000/auth/v1/health
#   expect: 200

# 3) Missing key -> 401 JSON (not 500)
curl -i "http://192.168.170.8:3000/api/public/bot/products?page=1&page_size=2"

# 4) Bogus key -> 401 JSON (not 500)
curl -i -H "x-bot-api-key: YOUR_KEY_HERE" \
  "http://192.168.170.8:3000/api/public/bot/products?page=1&page_size=2"

# 5) Real key -> 200 JSON products, or clear 403 if label permission missing
curl -i -H "x-bot-api-key: bk_..." \
  "http://192.168.170.8:3000/api/public/bot/products?page=1&page_size=2"

# 6) Logs must NOT contain the WebSocket warning anymore
docker compose --env-file .env.lan logs --tail=120 web | \
  grep -i "Node.js 20 detected without native WebSocket" || \
  echo "OK: no Node20 WebSocket error"
```

Note: the bot API uses `Authorization: Bearer <key>` per `extractBearer`
in `src/server/bot-api.ts`. The `x-bot-api-key` header used in the
probes above is only forwarded if your reverse proxy / client maps it
into `Authorization`. If a real key returns 401 with `missing_key`,
retry with `-H "Authorization: Bearer bk_..."` to confirm — that is a
client-side header naming issue, NOT a regression from this fix.

## Rollback

```bash
git revert <commit-sha-of-this-change>
# Redeploy. No DB, env, infra, or dependency state to undo.
```

## Remaining risks

- If a future change deliberately needs realtime subscriptions on the
  server-side admin client, `NoopRealtimeTransport` will throw the moment
  `.channel().subscribe()` is called. That is intentional — the correct
  remediation at that point is to install `ws` and pass it as
  `realtime.transport`, not to silently re-enable a broken default.
- Behavior is tied to `@supabase/supabase-js`'s current option shape
  (`realtime.transport`). Upgrades that rename this option could
  re-introduce the eager Node-version throw; covered by the same fix
  pattern, just renamed.