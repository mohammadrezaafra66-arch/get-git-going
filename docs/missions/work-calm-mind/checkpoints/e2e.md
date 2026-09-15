# Checkpoint e2e — Calm Mind Task System

**Agent:** dev-test-engineer  
**Branch:** `feature/work-calm-mind`  
**Date:** 2026-09-16  
**Spec:** `e2e/business-flows/calm-mind-work.spec.ts`

## How to run

LAN web (`afrakala-lan-web`) is still at `APP_GIT_SHA=a935be0b` and returns SPA **404** for `/operations/work`. UI half needs a build that includes Calm Mind routes.

```powershell
# 1) Local Vite (routes from this branch) + LAN Supabase
$env:DISABLE_LOVABLE_MCP = "1"
$env:APP_SUPABASE_PUBLIC_URL = "http://192.168.170.8:9000"
$env:SUPABASE_PUBLISHABLE_KEY = "<from deploy/lan/.env.lan>"
$env:VITE_APP_ENV = "test"
$env:APP_PUBLIC_ENV = "test"
npx vite --host 127.0.0.1 --port 5199

# 2) Suite (minted admin JWT — committed admin.storage.json is expired)
$env:E2E_BASE_URL = "http://127.0.0.1:5199"
$env:E2E_SUPABASE_URL = "http://192.168.170.8:9000"
npx playwright test e2e/business-flows/calm-mind-work.spec.ts --reporter=list
```

Against undeployed LAN only (expected UI red):

```powershell
Remove-Item Env:E2E_BASE_URL -ErrorAction SilentlyContinue
npx playwright test e2e/business-flows/calm-mind-work.spec.ts -g "seeded work item" --reporter=list
```

## Results

| Run | Base URL | Command focus | Exit | Evidence |
| --- | --- | --- | --- | --- |
| Fail-first (LAN) | `http://192.168.170.8:3100` | `-g "seeded work item"` | **1** | `checkpoints/_e2e-fail-first.out.txt` — SPA 404 «صفحه یافت نشد», missing «دستیار کار» |
| Pass (local Vite) | `http://127.0.0.1:5199` | full file | **0** | `checkpoints/_e2e-pass.out.txt` + `_e2e-pass.exit.txt` — **8 passed (25.0s)** |

### Pass suite (E3)

```
ok 1 DB trigger refuses in_progress without claimed_due_at
ok 2 DB trigger allows in_progress when claimed_due_at is set
ok 3 seeded work item is visible on /operations/work
ok 4 morning summary strip shows Calm Mind counts
ok 5 decision queue can set today_do, waiting, and clear
ok 6 UI blocks in_progress without claimed_due_at
ok 7 create work item from UI appears on the board
ok 8 merge suggestion dismiss path removes pending card
8 passed (25.0s)
EXIT=0
```

### Fail-first (E4 / G-1)

Without the Calm Mind FE on the serving host, the board heading assertion fails (404). Same assertions pass when Vite serves this branch. DB trigger probe also fails closed if `claimed_due_at` guard is removed (`ok=false` + exception text).

## Coverage vs mission

1. Create — UI create via dialog + DB count; also seeded board visibility  
2. Morning summary — «خلاصهٔ صبحگاهی» + bucket labels + non-zero today_decide  
3. Decision bucket — today_do / waiting / clear («پاک کردن») + DB reads  
4. in_progress without due — UI validation text + DB trigger via `inRolledBackTx`  
5. Merge dismiss — seeded `work_merge_suggestions` → «رد پیشنهاد» → status=dismissed  

## Auth note [E-1][E-2]

Committed `e2e/auth/admin.storage.json` JWT is expired (~73h). Spec mints a GoTrue-shaped HS256 access token (email claim) into Playwright `storageState` for `BASE_URL`. No password reset; no gitignored session file written.

## Blockers / remaining manual

- **Redeploy `afrakala-lan-web`** from `feature/work-calm-mind` (or later) so default `E2E_BASE_URL=http://192.168.170.8:3100` passes without local Vite.  
- Refresh/regenerate role storage files for other suites (`generate-role-sessions`).  
- Product: after `work_create_item`, dialog can stay on saving while merge scan/enrich runs — create test asserts RPC+DB+board, not toast/dialog close.  
- Accept-merge path not exercised (dismiss only).  
- Cold-session RBAC [A-10] not in this file.

## حکم

**PARTIAL** for default LAN URL (web image stale) · **COMPLETE** for suite against local Vite + LAN DB (8/8 EXIT=0).
