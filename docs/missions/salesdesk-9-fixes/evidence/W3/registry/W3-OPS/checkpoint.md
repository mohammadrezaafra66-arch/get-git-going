# W3-OPS

## Deploy gate §8.8 — 2026-09-21T23:16Z

| Check | Result |
|-------|--------|
| Worktree HEAD | `bc10ec3f` |
| Compose safety | **PASS** — only `web` differs (context → worktree) |
| `APP_GIT_SHA` | `bc10ec3f` (match) |
| Health | `healthy` |
| HTTP `http://192.168.170.8:3100/` | **200** (6891 bytes) |
| Playwright smoke | **PASS** — `salesdesk-9-fixes-w1-smoke.spec.ts` (میز فروش) |
| `tsc --noEmit` ERROR_LINES | **74** (≤74) |

## Evidence paths
- `evidence/W3/compose-base.yml`, `compose-resolved.yml`, `compose-safety.txt`
- `evidence/W3/deploy-up.txt`, `rest-restart.txt`
- `evidence/W3/app-git-sha.txt`, `web-health.txt`, `http-probe.txt`
- `evidence/W3/playwright-smoke.txt`, `tsc-ops.txt`
