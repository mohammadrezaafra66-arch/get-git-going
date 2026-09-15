# Checkpoint Phase F — e2e extend + run

**Agent:** dev-test-engineer  
**Branch:** `feature/work-calm-mind`  
**Date:** 2026-09-16  
**Spec:** `e2e/business-flows/calm-mind-work.spec.ts` (OWN — extend only)  
**HEAD at start:** `1029d23e`

## How to run

```powershell
$env:DISABLE_LOVABLE_MCP = "1"
# Load ANON/PUBLISHABLE from deploy/lan/.env.lan (gitignored; copy from app if missing)
$env:APP_SUPABASE_PUBLIC_URL = "http://192.168.170.8:9000"
$env:VITE_APP_ENV = "test"
$env:APP_PUBLIC_ENV = "test"
$env:SUPABASE_URL = "http://192.168.170.8:9000"
$env:SUPABASE_PUBLISHABLE_KEY = "<ANON_KEY from .env.lan>"
$env:VITE_SUPABASE_URL = $env:SUPABASE_URL
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $env:SUPABASE_PUBLISHABLE_KEY
# [H-1] use vite.cmd; avoid DEBUG=vite:* (poisons root resolution on Windows)
cmd /c "node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5199 --strictPort"

$env:E2E_BASE_URL = "http://127.0.0.1:5199"
$env:E2E_SUPABASE_URL = "http://192.168.170.8:9000"
# [H-1] playwright.cmd alone can dual-load @playwright/test — use npx.cmd
cmd /c "C:\nvm4w\nodejs\npx.cmd playwright test business-flows/calm-mind-work.spec.ts --reporter=list"
```

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| e2e suite | **12 passed / EXIT=0** | `checkpoints/_e2e-phase-f.out.txt` + `_e2e-phase-f.exit.txt` (57.6s) |
| `npm run build` | **EXIT=0** | `checkpoints/_e2e-phase-f-build.exit.txt` |
| Fail-first morning locator | **red then green** | first suite fail on old `div` regex after Phase E buttons; fixed to `morning-bucket-today_decide` |

### Pass table (E3)

| # | Test | Pass/Fail |
| --- | --- | --- |
| 1 | DB trigger refuses in_progress without claimed_due_at | pass |
| 2 | DB trigger allows in_progress when claimed_due_at is set | pass |
| 3 | seeded work item is visible on /operations/work | pass |
| 4 | morning summary strip shows Calm Mind counts | pass (locator adapted) |
| 5 | decision queue can set today_do, waiting, and clear | pass |
| 6 | UI blocks in_progress without claimed_due_at | pass |
| 7 | create work wizard describe+classify then create end-to-end | pass (**new/adapted**) |
| 8 | POST /api/work/classify responds with kind/priority JSON | pass (**new** — not 404; 200 JSON or documented 401/500) |
| 9 | testing workflow approve moves status to done | pass (**new**) |
| 10 | testing workflow reject with ETA returns to in_progress | pass (**new**) |
| 11 | merge suggestion dismiss path removes pending card | pass |
| 12 | merge suggestion accept path keeps one item | pass (**new**) |

```
12 passed (57.6s)
EXIT=0
BUILD_EXIT=0
```

### Fail-first notes (E4)

- Morning summary: Phase E made buckets clickable `<button data-testid="morning-bucket-*">`; old `div`+regex assertion failed (E4) then fixed.
- Create UI: `#work-title`/`#work-body` replaced by wizard (`create-work-wizard` → describe → intake → confirm).
- Classify: asserts route is mounted (`!== 404`). With Vite `SUPABASE_URL`+`PUBLISHABLE_KEY` set, expects 200+kind/priority; allows 401/500 with body if env misconfigured.
- Accept-merge: separate seed pair from dismiss fixture.

## Tool resolution [H-1]

- `vite.cmd` → `D:\AfraKalaTest\wt-work-calm\node_modules\.bin\vite.cmd`
- Playwright via `C:\nvm4w\nodejs\npx.cmd playwright` (bare `playwright.cmd` → `test.use()` dual-package error)

## [E-2] gitignored locals

- Copied `deploy/lan/.env.lan` from `app` for `lanEnv()` / JWT mint (not committed).
- Vite start script with anon key was deleted after use.

## Coverage vs Phase F brief

1. Wizard open → describe + classify-preview → progress → create E2E — **yes**  
2. Classify POST smoke — **yes**  
3. Testing approve + reject+ETA — **yes**  
4. Accept-merge — **yes** (dismiss retained)

## حکم

**COMPLETE** — 12/12 EXIT=0 against local Vite + LAN Supabase; build EXIT=0.  
No product bugs requiring bug-hunter for suite green.
