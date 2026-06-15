
## Task ID

MKT-2-write-security-review-plan

## Classification

READ-ONLY REVIEW + PLAN ONLY — no file edits, no migrations, no DB changes.

## Goal

Identify all marketing-area browser → DB write paths, assess their security/audit reliability, and define a phased, minimal serverFn migration with the smallest safe first slice.

## Current state — marketing write paths

Three direct browser → DB write paths exist; no marketing serverFn layer yet.

### 1. `src/routes/_app.admin.marketing-channels.tsx` — `marketing_channels` CRUD
- `supabase.from("marketing_channels").insert/update(...)` from the browser.
- Followed by `supabase.from("audit_logs").insert({...})` from the browser (best-effort, awaited but not transactional with the write).
- Role check is client-side only: `roles.includes("admin") || roles.includes("accountant")`.
- RLS (migration `20260430105647`): `mc_select_authed` (any authed) + `mc_write_admin_accountant` (admin/accountant) — DB enforces role. ✅
- CHECK constraints on `weight`, `daily_quota` ≥ 0 exist (migration `20260608074437`). ✅
- Audit reliability: ⚠️ weak. If the CRUD succeeds and the audit insert fails (RLS, network, tab close), the change is silently un-audited. There is no DB trigger writing audit_logs.

### 2. `src/routes/_app.marketing.suggestions.tsx` — "mark as used" → `audit_logs` insert
- Browser inserts directly into `audit_logs` with `action='promotion_suggestion_used'`, `actor_id=user.id`, free-form `diff` JSON.
- RLS (migration `20260424144837`): insert allowed when `auth.uid() = actor_id`; only admins can read. ✅ insert is gated to "self-acted".
- ⚠️ Risks:
  - Any authed user can fabricate any `entity_type`/`entity_id`/`action` as themselves, polluting the audit table (no server-side action allow-list).
  - `diff` payload is fully client-supplied; the suggestions reporting in `_app.marketing.suggestions-history.tsx` and the `daily_quota` "used_today" counter (view in `20260608074437`) read those values — a malicious client can skew quotas/reports.
  - No de-dup: rapid double-click can create multiple "used" rows for the same `(product_id, channel_id, day)`.
  - Daily quota enforcement is advisory (UI-disables button); a crafted client request can bypass it.

### 3. `src/lib/analytics/product-interactions.ts` — `product_interaction_events` insert
- Fire-and-forget browser insert, in-memory 30s dedup.
- RLS (migration `20260430185634`): `pie_insert_authed` allows any authenticated insert; `pie_select_privileged` restricts reads. ✅
- Used purely for analytics; low business impact, but values are 100% client-supplied (`event_type`, `source`, `product_id`).

## Scope (MKT-2 overall)

Move marketing write paths behind authenticated serverFns with server-side role check, input validation (zod), and reliable audit logging — incrementally, one path per slice.

## Out of scope

- Campaign/ROI work
- MKT-3 work
- Changing RLS on `marketing_channels`, `audit_logs`, or `product_interaction_events` (current RLS is sound; we'll layer serverFns on top)
- Refactoring suggestions UI/UX
- Touching unrelated audit_logs call sites elsewhere in the repo
- External integrations

## Recommendation summary

| Write path | Move to serverFn? | When | Why |
|---|---|---|---|
| `audit_logs` insert for `promotion_suggestion_used` | **YES** — first slice | Phase 1 | Highest impact: skews quotas/reports; smallest blast radius (single call site, ~30 LOC change). |
| `marketing_channels` CRUD | YES | Phase 2 | Larger surface (insert/update/toggle, 3 call sites), but RLS already enforces role — defer until Phase 1 pattern is proven. |
| `product_interaction_events` fire-and-forget | **NO for now** | Defer (Phase 3 / optional) | High volume, low value, no business decisions read from it. ServerFn would add latency/cost without proportional security gain. Re-evaluate only if data is used for KPIs. |

## Phases

**Phase 1 (smallest safe slice — this PR):** Add `markPromotionSuggestionUsed` serverFn; replace the single browser audit insert in `_app.marketing.suggestions.tsx`. No DB changes. No RLS changes.

**Phase 2 (separate task MKT-2.2):** Add serverFns for `createMarketingChannel`, `updateMarketingChannel`, `toggleMarketingChannelActive`; replace the three call sites in `_app.admin.marketing-channels.tsx`. Keep audit insert co-located in the serverFn handler so CRUD + audit succeed/fail together.

**Phase 3 (separate task MKT-2.3, optional):** Decide whether `product_interaction_events` stays browser-side or moves to a batched serverFn. Out of scope for MKT-2 unless the data starts driving business decisions.

## Phase 1 — smallest safe first slice (detailed)

### Files likely to change (Phase 1 only)
- **Create:** `src/lib/marketing/promotion-suggestions.functions.ts` — single serverFn `markPromotionSuggestionUsed`.
- **Edit:** `src/routes/_app.marketing.suggestions.tsx` — replace `supabase.from("audit_logs").insert(...)` with `useServerFn(markPromotionSuggestionUsed)` call inside `markAsUsed`. Keep all UI behaviour identical (toast, busy state, invalidation).
- No other files.

### ServerFn contract (Phase 1)
- `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(zod).handler(...)`.
- Input (zod-validated): `product_id: uuid`, `channel_id: uuid`, `score`, `label_weight_sum`, `channel_weight`, `stock_factor`, `recency_factor`, `qty_90d` — all numeric, finite, bounded (e.g. `0 <= score <= 1e6`).
- Server reads `product_name`, `channel_name`, and current daily_quota on the server to avoid trusting client-supplied display strings (uses `context.supabase`, RLS applies as the user).
- Inserts into `audit_logs` via `context.supabase` (RLS `auth.uid()=actor_id` is satisfied because middleware injects the user's bearer).
- Enforces `daily_quota` server-side: if exhausted, returns `{ ok: false, reason: "quota_exhausted" }` (UI already disables the button; this is defense-in-depth).
- Returns `{ ok: true }` on success.

### Database / migration impact
- **None.** No schema, RLS, trigger, function, or grant changes.

### RLS / RBAC / audit impact
- RLS unchanged. Insert still passes existing `auth.uid() = actor_id` policy via the user-scoped server client.
- Audit reliability **improves**: payload is server-validated and server-shaped.
- RBAC: serverFn middleware enforces authenticated session; route-level role check (`admin|manager|accountant`) is duplicated server-side via `has_role` RPC to prevent any non-marketing user from minting `promotion_suggestion_used` rows.

### Security and self-host check
- No new dependency, no external service, no new secret.
- No `VITE_` server secret introduced.
- Self-host safe (TanStack Start serverFn — Linux/Docker compatible).
- `src/start.ts` must already register `attachSupabaseAuth` (used by other serverFns in `src/lib/...`); verify in implementation slice, do not modify if already wired.

### Performance impact
- One extra round-trip per "mark as used" click (rare action, low volume). Negligible.

### UI/UX impact
- No visible change. Persian copy, RTL, toasts, busy state preserved.

### Manual test path
1. Login as admin → `/marketing/suggestions` → click "ثبت به‌عنوان استفاده‌شده" on a row → toast success, row marks used, suggestion list invalidates.
2. Login as non-allowed role → button hidden (page redirects), serverFn rejects if called.
3. Click twice quickly → second click no-ops via existing `busyKey` + `used` state.
4. Force `quota_exhausted` by lowering `daily_quota` on a channel → server rejects with Persian error toast.
5. Check `audit_logs` row exists with expected `diff`.

### Commands to run (Phase 1)
- `npm run build`
- `npm run lint`
- typecheck via build (no standalone script)
- No tests for this surface — report NOT RUN.

### Acceptance criteria (Phase 1)
- No browser `supabase.from("audit_logs").insert(...)` remains in `_app.marketing.suggestions.tsx`.
- All "mark as used" writes go through `markPromotionSuggestionUsed` serverFn.
- Zod validates all inputs server-side.
- Role re-checked server-side.
- Existing RLS, schema, and UI behavior unchanged.
- Build + lint pass.

### Risks
- Forgetting to verify `attachSupabaseAuth` is registered → 401s on the new serverFn.
- Zod schema too strict and rejecting legitimate numbers (e.g. integer vs float) — mitigated by `z.coerce.number().finite()`.

### Stop conditions
- If `attachSupabaseAuth` is missing from `src/start.ts` → stop, raise as a separate setup task, do not edit `start.ts` in this slice without explicit approval.
- If `has_role` RPC is unavailable or behaves differently than expected → stop and plan a thin role-check helper separately.
- If implementation requires touching RLS, schemas, or any other route → stop, this slice is over scope.

## Self-host acceptance check (Phase 1)

- External critical dependency added? no
- CDN / Google Fonts / external scripts added? no
- Real secrets added? no
- New `VITE_` secret? no
- Client bundle secret-safe? yes
- Docker/Linux compatibility affected? no
- Supabase/RLS/RBAC affected? no (serverFn re-uses existing RLS)
- Audit log required? yes
- Audit handled? yes (server-side insert via user-scoped client)
- Database migration added? no
- Backup/restore affected? no
- Performance risk introduced? no
- Persian RTL UI preserved? yes
- Mobile usability preserved? yes

## Recommended SAFE AGENT CHANGE prompt (first slice only)

```
Use afrakala-master-guardrails.
Use afrakala-safe-code-agent.
Use afrakala-delivery-reporter.

SAFE AGENT CHANGE.
Task ID: MKT-2.1-promotion-suggestion-used-serverfn
Approved plan: MKT-2-write-security-review-plan (Phase 1 only)

Scope (do only this):
1. Create src/lib/marketing/promotion-suggestions.functions.ts exporting
   markPromotionSuggestionUsed as createServerFn({method:"POST"})
     .middleware([requireSupabaseAuth])
     .inputValidator using zod (product_id/channel_id uuid; numeric metrics
      finite and bounded)
     .handler:
       - server-side role check: has_role(userId,'admin'|'manager'|'accountant')
         via context.supabase.rpc; throw on fail
       - re-fetch product_name, channel_name from DB (do not trust client)
       - check daily_quota using same logic as v_promotion_suggestions; if
         exhausted return {ok:false, reason:"quota_exhausted"}
       - insert audit_logs row (entity_type='promotion_suggestion',
         entity_id=`${product_id}:${channel_id}`, action='promotion_suggestion_used',
         diff = server-built JSON)
       - return {ok:true}
2. Edit src/routes/_app.marketing.suggestions.tsx markAsUsed() to call the
   serverFn via useServerFn; preserve all existing toasts, busyKey, usedKeys,
   and queryClient.invalidateQueries behavior. Show Persian error toast when
   ok:false (e.g. "سهمیه روزانه این کانال تمام شده است").

Out of scope:
- No DB migration, no RLS change, no grants change.
- Do not touch marketing_channels CRUD, product_interaction_events,
  suggestions-history, or any other route.
- Do not modify src/start.ts unless attachSupabaseAuth is missing; if missing,
  STOP and report.

Verification:
- npm run build
- npm run lint
- Manual test path from the plan.

Stop conditions:
- attachSupabaseAuth not registered → stop.
- has_role RPC missing or different signature → stop.
- Any urge to edit RLS, schema, or other files → stop.

Produce a delivery report per afrakala-delivery-reporter.
```

## Next step

Approve this plan, then run the SAFE AGENT CHANGE prompt above for Phase 1 only. Phase 2 (`marketing_channels` CRUD) and Phase 3 (`product_interaction_events`) will be planned as separate tasks after Phase 1 ships and is verified on main.

Used afrakala-master-guardrails, afrakala-repo-inventory-reviewer, afrakala-change-planner.
