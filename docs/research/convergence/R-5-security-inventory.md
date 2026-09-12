# R-5 — Security-3 inventory (measure, do not fix)

**Agent:** `dev-security-critic`, code-only pass at `staging` @ `d60232f5`. No database access (S-2
deferred by instruction). Persisted by the orchestrator because the agent has no Write tool.

---

**VERDICT — S-1: NO.** No single-mechanism fix closes ≥ 60 routes in one place. The largest
available layout-gate lever, `_app.gamification.tsx`, closes **11 of 75** genuinely uncovered
routes; the rest need one `staticData.gate` line each. **Per OG-K this sends S-1 to the dedicated
Security-3 mission — E-6b does not happen in this mission.**

**VERDICT — S-4: the static permission table NO LONGER EXISTS.** It was removed in wave 6 (X-3,
migration 485). Zero consumers remain. **Its blast radius is zero and there is nothing to delete
— E-6's S-4 task is void.**

---

## S-1 · SSR fail-open on protected routes

### a) The mechanism

`requirePermission` / `requireAdmin` / `requireAnyRole` in `src/lib/rbac/route-guards.ts` run
inside TanStack Start's `beforeLoad`, which executes **on the server** for a cold or direct
navigation. `resolveAuthWithRetry()` (`route-guards.ts:14-22`) checks
`typeof window === "undefined"` and returns `null` on the server, because `ensureAuthReady()`
reads the session out of browser `localStorage` — data a server process does not have
(`src/components/layout/RouteRoleGate.tsx:31-36`). Each guard then returns
`{ user: null, roles: [] }` **without throwing** (`route-guards.ts:114`, `:151`, `:185`), so SSR
renders the full page HTML before any redirect can happen.

`RouteRoleGate`, mounted once at `src/routes/_app.tsx:215-217`, is the client-side backstop: it
reads `staticData.gate` off every matched route via `useMatches()` (`RouteRoleGate.tsx:157-159`)
and blocks rendering until roles settle — **but only for routes, or an ancestor, that actually
carry a `gate`.** Routes without one render unconditionally.

### b) Current counts — the brief's numbers were stale

```bash
$ grep -rlE "requireAnyRole\(|requirePermission\(|requireAdmin\(" src/routes/ --include="*.tsx" | wc -l
154
$ node find_gated.mjs      # multiline-aware scan for `staticData:` … `gate:` within 300 chars
68
$ comm -23 <(sort guarded.txt) <(sort gated.txt) | wc -l
86                         # own guard, no own gate
$ node analyze3.mjs gated.txt uncovered.txt
edges found: 213
SUMMARY: covered=11 trulyUncovered=75 unresolved=0 total=86
```

> **A correction to the brief and to any prior count.** A single-line
> `grep -rl "staticData:\s*{\s*gate"` **undercounts by 8** — it misses the very common form where
> `staticData: {` and `gate: {…}` sit on separate lines (e.g. `_app.persons.tsx:117-118`). The
> real gated count is **68, not 63**. The parent chain was then resolved from
> `routeTree.gen.ts` (`getParentRoute: () => X`, 213 edges) because `RouteRoleGate` checks the
> whole match chain, not just the leaf: **11 of the 86 are already protected by an ancestor**
> (`_app.bot-api-keys.tsx` covers 4 children, `_app.sales.tsx` covers 7). **75 are genuinely
> uncovered.**

| module | count | files |
|---|---|---|
| pricing | 18 | `_app.pricing.{amin-hozoor-board,calculator,change-reasons,currencies,currency-sources,index,live-price-list,owner-attention,price-alerts,product-recommendations,quick-price,rules,sale-lists,sale-lists_.$listId,sale-lists_.new,sale-price-types,settlement-types,shipping-rules}.tsx` |
| gamification | 12 | 11 children of `_app.gamification.tsx` + `_app.gamification_.admin_.manual-metrics_.guide.tsx` (escapes the layout) |
| products | 7 | `_app.products.{$id,attributes,brands,categories,index,labels,new}.tsx` |
| admin (flat) | 6 | `_app.admin.{automation,purchase,sales-reminders,validation-rules,visitors,workflow-settings}.tsx` |
| academy | 5 | `_app.academy.tsx` + 4 escaped `academy_.*` |
| warehouses / knowledge / feedback / data-tables | 3 each | as listed in the agent's table |
| purchases | 3 | `_app.purchase.tsx`, `purchases.tsx`, `purchases_.create.tsx` |
| suppliers / sales_customers guides / messages | 2 each | |
| updates, dashboard, collaboration, documents, delivery-receipts | 5 | one each |

`18+12+7+6+5+3+3+3+3+2+3+2+2+5 = 75` ✓

### c) The layout lever — prior art, and a correction to the brief's attribution

`src/routes/_app.sales.tsx:5-11`:

```
// Layout route: this one line gates the whole /sales subtree.
staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] } },
```

Confirmed structurally in `routeTree.gen.ts`: seven `_app.sales.*` children declare
`getParentRoute: () => AppSalesRoute`. **So yes — one gate on a pure layout route
(`component: () => <Outlet/>`) covers every structurally nested child.**

> **Attribution correction, reported rather than asserted:** the brief calls this "the wave-4
> lever". `git blame` on both known instances shows **"Wave 2 / B-1"** (`_app.sales.tsx`,
> commit `f8b091e7`) and **"M6/OG-24"** (`_app.bot-api-keys.tsx`, commit `33418e6f`), both dated
> 2026-09-06. No wave-4 origin for this technique was found.

Two unused levers exist: `_app.gamification.tsx` (has **no** `beforeLoad` and **no** gate today —
one edit closes 11) and `_app.messages.tsx` (closes 2).

### d) The decision

**Minimal set to close all 75: 2 layout gates (12 routes) + 63 individual per-route gates ≈ 65
edits.** **Nothing is structurally uncoverable** — every route can always take its own one-line
gate; the flat and escaped modules simply have no shared ancestor to hang one on. *(This also
corrects the brief's "73 structurally uncoverable".)*

**No combination of ≤ 3 placements reaches 60.** Each of the 65 edits needs its `allowed` role
list read from live `role_permissions`, which needs the DB — see S-2 deferral.

---

## S-3 · Non-`.tsx` route files — 23, not 21

```bash
$ find src/routes -name "*.ts" ! -name "*.tsx" | wc -l
23
```

> **The brief's "21, including four `api.public.bot.*`" is stale on both numbers: there are 23
> files and 8 bot routes.** An earlier `-maxdepth 1` search found only 14 — it missed the real
> subdirectory trees TanStack also serves from (`src/routes/api/…`, `[.mcp]/…`,
> `[.well-known]/…`), which hold 9 more.

Auth posture, summarised (full table in the agent's output):

| group | auth |
|---|---|
| `api.admin.automation.torob.enqueue.ts`, `api.admin.calls.import-issabel.ts` | Bearer → `authenticateUser` → `requireAdminOrManager`, `ALLOWED_ROLES = {admin, manager}` — **real enforcement** |
| all **8** `api.public.bot.*` | shared `authenticateBot()` (`src/server/bot-api.ts:277-296`) → `supabaseAdmin.rpc("bot_authenticate_key")` — **real DB-backed key check, not a stub** |
| 4 `api/public/hooks/*` | per-hook bearer secret compared to an env var — **fail-closed** (missing secret → 500) |
| `api.healthz.ts`, `api.version.ts`, `sitemap[.]xml.ts`, `[.well-known]/oauth-protected-resource.ts` | **none — intentional and correct** (public by design, no secrets) |
| `mcp.ts`, `[.mcp]/*` | OAuth issuer config in `src/lib/mcp/index.ts:16-18` |
| `api/public/products.ts` | none by design, RLS-gated; price publication held behind `const PUBLISH_PUBLIC_PRICES = false` pending OG-29 |
| `api/messenger/ai-chat.ts` | real `supabase.auth.getUser()` + `messenger_group_members` membership check |

### 🔴 One genuine finding in S-3

`api/public/hooks/ingest-market-rates.ts` **enforces correctly** (`:277-281`, secret compared,
fail-closed) — but its own top-of-file doc comment (`:1-15`) says
*"Public endpoint under /api/public/ — no auth required"* and *"(rev: flags-enabled 2026-05-11 —
public data, no auth)"*. **The comment is stale and contradicts the code 250 lines below it.** The
risk is not today's behaviour; it is a future editor trusting the comment and removing the check.

---

## S-4 · The static permission table — already gone

```bash
$ grep -rln "PERMISSIONS\s*[:=]\s*Record\|const PERMISSIONS" src/ --include="*.ts" --include="*.tsx"
(no output)
```

`src/lib/rbac/roles.ts:101-118` documents its own removal in place:

> *"The static PERMISSIONS matrix was REMOVED here in wave 6 (X-3, migration 485). It was a
> second permission table living beside the real one. It had diverged from live
> `role_permissions` in 13 modules… There is now exactly ONE permission source."*

Corroborated by `supabase/migrations/20260906182000_485_fill_role_permissions_gaps.sql` and by
`src/lib/rbac/dynamic-permissions.ts:85-98` (*"No static fallback… a missing row is a real
denial"*). **Consumers: zero.**

**Blast radius of the proposed deletion: nil — it is already the current state.**

> **The residual risk that IS still real, and is a different thing:** the **68 hand-copied
> `staticData.gate` `allowed` lists** were transcribed from the live table when each gate was
> written, and can drift from `role_permissions` if the table changes and the gate is not
> updated. That is gate-vs-live drift, not static-table-vs-live drift, and it applies
> individually to each of the 68 gated routes. Handed to the Security-3 mission.

---

## S-5 · Function bodies — all three claims CONFIRMED, with one important mitigation

### `delete_bot_api_key_secure`

Newest **definition** is `supabase/migrations/20260626145739_…sql:26-70` (migration 463 is newer
but only changes GRANT/REVOKE — verified by grep for `CREATE OR REPLACE FUNCTION`). Lines `:39-42`:

```sql
SELECT role::text INTO v_user_role
FROM public.user_roles
WHERE user_id = v_user_id
LIMIT 1;
```

No `ORDER BY` — for a multi-role user an **arbitrary** role is picked, and the check at `:52`
is evaluated against it rather than the full role set.

**FIX SPEC:** drop `v_user_role` and the `SELECT … LIMIT 1` entirely; authorize if **any** role
qualifies:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = v_user_id
    AND (role::text = 'admin' OR role::text = v_managed_role)
) THEN
  RAISE EXCEPTION 'UNAUTHORIZED: شما مجاز به حذف این کلید نیستید' USING ERRCODE = 'P0001';
END IF;
```

Same signature, so `CREATE OR REPLACE` with no `DROP FUNCTION`. Test with a simulated multi-role
user inside `BEGIN … ROLLBACK`.

### `admin_upsert_ai_provider` / `admin_delete_ai_provider`

Only defined in `supabase/migrations/20260724130000_153_ai_providers_and_key_vault.sql:155-303`.
Upsert audits at `:251-263` with only new values; the preceding
`UPDATE … RETURNING id, secret_id INTO …` (`:204-217`) never reads the pre-update row, so old
`name`/`kind`/`capabilities`/`is_active` are lost. Delete audits at `:299-301` recording only
`name`.

> **🟡 Mitigating context the brief did not have.** Migration **475**
> (`20260906130000_475_audit_ai_routing_changes.sql`) deliberately does *not* touch these RPCs and
> instead installs an `AFTER INSERT OR UPDATE OR DELETE` trigger on `ai_providers` that captures
> complete `diff->'old'` / `diff->'new'` for **every** write, including paths that bypass the RPC.
> Its own words: *"Removing their audit write is an application change and is out of this
> migration's scope."* **So the system-level gap — a write leaving no trace — is already
> closed.** What remains is that the RPC's own `entity_type = 'ai_provider'` (singular) rows are a
> weaker, new-value-only duplicate sitting beside the trigger's complete `'ai_providers'` (plural)
> record.

**FIX SPEC, two acceptable options:**
- **(A) self-contained** — `SELECT … INTO` the pre-update row before the `UPDATE`, add
  `'old', to_jsonb(<row>) - 'secret_id' - 'key_prefix'` to the diff (strip the same two
  credential-adjacent columns the trigger strips); in delete, `SELECT *` the full row first.
- **(B) lower risk, matches 475's reasoning** — leave the RPC audit as a redundant human-readable
  record and rely on the trigger for the authoritative before/after, **but document that at the
  RPC's audit INSERT site** so a future reader does not mistake it for the complete record.

Either way it is a **new** migration; `20260724130000_153…` is never edited (rule 6).

### `ai_providers` columns

From `…153_ai_providers_and_key_vault.sql:50-87`, with no later `ALTER TABLE` anywhere:

```
id, name, label, kind, base_url, is_active, priority, chat_model, embed_model,
vision_model, capabilities, secret_id, key_prefix, notes, created_at, updated_at, created_by
```

**`updated_by` does NOT exist** — confirmed independently by
`…475_audit_ai_routing_changes.sql:114-116`: *"`ai_providers` has NO `updated_by` — only
`created_by`."* Recording *who* changed a provider needs `ADD COLUMN updated_by`, or continued
reliance on `auth.uid()` captured as `actor_id`, which both RPCs already do.

---

## S-2 · DEFERRED — needs the database

Query for the orchestrator to run on the gate restore:

```sql
SELECT
  p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.permissive,
  EXISTS (
    SELECT 1 FROM pg_policies r
    WHERE r.schemaname = p.schemaname AND r.tablename = p.tablename
      AND r.permissive = 'RESTRICTIVE'
  ) AS has_restrictive_partner
FROM pg_policies p
WHERE p.qual = 'true'
ORDER BY p.schemaname, p.tablename, p.policyname;
```

---

## UNKNOWN

- The live `role_permissions` role sets needed to write each of the ~65 new gate `allowed` lists —
  needs the DB, same deferral as S-2.
- Exact UI call sites for `api.admin.automation.torob.enqueue.ts` and
  `api.admin.calls.import-issabel.ts` (auth model fully traced; callers not exhaustively grepped).
- Whether a non-`.example` cron entry exists for `ingest-market-rates.ts` on either machine —
  file-only inventory, no runtime state inspected.
- Whether `_app.messages.tsx`'s missing `<Outlet/>` breaks `/messages/inquiries` visually. Noted
  as a discovered oddity — a **rendering** bug, not an auth one, so out of this pass's scope.
