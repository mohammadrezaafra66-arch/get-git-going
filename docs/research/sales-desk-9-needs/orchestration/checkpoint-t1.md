# Checkpoint T1 — sales-desk-9 e2e

| Field | Value |
|-------|-------|
| Agent | dev-test-engineer |
| Branch | `feature/sales-desk` |
| HEAD start | `b5ee0dc64a75335657936f45f8850ae1e78b1b5a` |
| Started | 2026-09-16T03:00+05:00 |
| Deadline | 2026-09-16T06:45:00+05:00 |
| Status | **COMPLETE** (spec green on branch Vite; LAN :3100 lacks F1 routes) |

## Heartbeat
- 03:00 — patterns + sales-desk selectors; HEAD b5ee0dc6
- 03:04 — E4 fail on LAN `:3100` (sales-desk HTTP 404; UI title missing)
- 03:05 — Vite-dev `127.0.0.1:8080` from branch source (F1 routes present)
- 03:08 — nav accordion «عملیات داخلی» required before sidebar links
- 03:11 — person picker via `searchPersons` serverFn empty on Vite; RPC-through-page create
- 03:12 — **7 passed / EXIT=0**

## Spec
- Path: `e2e/business-flows/sales-desk-9.spec.ts`
- Covers: fixture customer+person · source nav · sidebar nav · create request (RPC-through-page + desk chrome) · set follow-up RPC · dossier note + outcome won · call-activity link

## Run command (pass) [E3]

```
E2E_BASE_URL=http://127.0.0.1:8080
cmd /c "node_modules\.bin\playwright.cmd test e2e/business-flows/sales-desk-9.spec.ts --workers=1 --reporter=line"
```

Resolved launcher: `D:\AfraKalaTest\app\node_modules\.bin\playwright.cmd` [H-1]

### Output (key)

```
Running 7 tests using 1 worker
…
[1/7] … 0 · seed fixture customer+person
[2/7] … 0b · source nav registry carries میز فروش + فعالیت تلفنی
[3/7] … 1 · nav entries: میز فروش + فعالیت تلفنی under فروش
[4/7] … 2 · create request interaction via sales-desk UI / RPC-through-page
[5/7] … 3 · set follow-up via RPC through page
[6/7] … 4 · open dossier + write note + outcome won
[7/7] … 5 · call-activity link from sales-desk header
  7 passed (28.3s)
EXIT=0
```

Full capture: `docs/research/sales-desk-9-needs/orchestration/_t1_pass_run.out`

## Fail-first [E4 / G-1]

### Against LAN without F1 routes (feature absent on :3100)

```
Invoke-WebRequest http://192.168.170.8:3100/operations/sales-desk → 404
Invoke-WebRequest http://192.168.170.8:3100/sales/customers/<id>/dossier → 404
```

Playwright against default `E2E_BASE_URL=http://192.168.170.8:3100`:

```
Error: expect(locator).toBeVisible() failed
Locator: getByText('میز فروش').first()
Timeout: 60000ms
1 failed · EXIT=1
```

Capture: `docs/research/sales-desk-9-needs/orchestration/_t1_fail_probe.out`

### Against Vite with feature present → pass (above)

## Gaps for frontend / ops

1. **LAN redeploy**: `afrakala-lan-web` image does not include F1 routes (`/operations/sales-desk`, dossier). Spec defaults to LAN URL but must set `E2E_BASE_URL=http://127.0.0.1:8080` until image rebuild.
2. **Person picker**: `QuickRequestForm` → `searchPersons` serverFn returned «نتیجه‌ای یافت نشد» on Vite while PostgREST `search_visible_persons` with same admin JWT returned the fixture. Prefer client `supabase.rpc('search_visible_persons')` or fix serverFn auth on vite-dev. No `data-testid` on desk forms — used `#sd-person-q`, `#sd-req-body`, Persian roles/text.
3. **Suggested testids** (optional): `sales-desk-page`, `sales-desk-quick-request`, `sales-desk-person-result`, `dossier-note-form`, `interaction-outcome-won`.

## Auth [E-1]
`storageStateForRole('admin', …)` minted JWT — no password mutation.

## Foreign dirty left alone [D-1]
Many unrelated modified/untracked files in worktree (persons merge, PROGRESS, etc.) — not committed.

## Commits
(see git after this checkpoint)
