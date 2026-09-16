# Checkpoint B1 — wire import derive + sales-desk helpers

| Field | Value |
|-------|-------|
| Agent | dev-backend-engineer |
| Branch | `feature/sales-desk` |
| Started HEAD | `15e7ff3463a27018b4c08dcaa53cf9ed39405100` |
| Deadline | 2026-09-16T05:15:00+05:00 |
| Status | COMPLETE (code + smoke; live RPC derive on LAN not re-run here) |

## Scope done

1. **Need 3** — after successful Issabel insert (`inserted > 0`), call `derive_staff_call_metrics(_for_date)` via `supabaseAdmin` for each distinct Tehran calendar day in the batch. Recompute block preserved. Soft-fail: `derive_errors[]`; import still `ok: true`.
2. **Helpers** — `src/lib/sales-desk/{interactions,stats,recent-calls,dossier,index}.ts`
3. **No new public API routes** — staff actions use browser supabase + RPC; Issabel already has service_role hooks.

## Callers checked

| Caller | Path | Notes |
|--------|------|-------|
| Cron/public hook | `src/routes/api/public/hooks/import-issabel-calls.ts:76` | `importIssabelCalls({ workerMode: true })` — gets new derive fields in JSON |
| Admin import | `src/routes/api.admin.calls.import-issabel.ts:142` | same |

## Derive call site (E1/E2)

`src/lib/calls/import-issabel-calls.server.ts:436-438`:

```ts
const { data, error } = await untypedDb.rpc("derive_staff_call_metrics", {
  _for_date: day,
});
```

Days from `tehranCalendarDaysFromStartedAts` at `:426-428`.

## Baseline → after (E4)

| Probe | Before | After |
|-------|--------|-------|
| `rg derive_staff_call_metrics src/lib/calls/import-issabel-calls.server.ts` | exit 1, **0 hits** (HEAD 15e7ff34) | exit 0, **6 hits** |
| Smoke `tsx --test import-issabel-derive-days.test.ts` | n/a | **3 pass, exit 0** |

## Helper surface (UI)

```ts
import {
  createSalesInteraction,
  updateSalesInteractionStatus,
  setSalesInteractionFollowUp,
  fetchMyMonthStats,
  fetchRecentInboundForPopup,
  listExtensionsForUser,
  loadSalesDossier,
} from "@/lib/sales-desk";
```

- Interactions / stats: authenticated `supabase.rpc` (546).
- Recent calls: last 2 min inbound; `customer_id` null OR extension in user's `call_log_extensions`.
- Dossier: person, customers+responsible, quotes, interactions timeline, call_logs for person.

## Config missing note

File header documents: Issabel env missing → `config_missing` / empty import; UI still usable via `sales_interaction_create`.

## Commits

| SHA | Message |
|-----|---------|
| `0bf671992e80ef21fffeb5470ef6e81e22ffd9ce` | feat(sales-desk): اتصال derive_staff_call_metrics بعد از ایمپورت ایزابل |
| `dc75c52255ffaa5ca0b8624ef43450651c956c1c` | feat(sales-desk): هلپرهای سرور/کلاینت interactions و dossier و آمار |
| (this file) | docs(sales-desk): چک‌پوینت B1 |

End HEAD after docs commit: see `git rev-parse HEAD`.

## Not verified

- Live `derive_staff_call_metrics` against LAN after a real import (needs Issabel CDR + service_role).
- Full `tsc` / app suite (only scoped smoke).
- Frontend mount of helpers (F1 owns UI).

## Out of scope

- React routes, nav, e2e, migrations.
