# W3-OPS

## Attempt 2 — redeploy after C2 zod — 2026-09-21T23:30Z

| Check | Result |
|-------|--------|
| Worktree HEAD | `42392d3f` (contains `c4bcafe9`) |
| Compose safety | **PASS** — only `web` differs |
| `APP_GIT_SHA` | `42392d3f` (match) |
| Health | `healthy` |
| HTTP `http://192.168.170.8:3100/` | **200** (6891 bytes) |
| Playwright smoke | **PASS** — میز فروش |

## Evidence (a2)
- `compose-base-a2.yml`, `compose-resolved-a2.yml`, `compose-safety-a2.txt`
- `deploy-up-a2.txt`, `rest-restart-a2.txt`
- `app-git-sha-a2.txt`, `web-health-a2.txt`, `http-probe-a2.txt`
- `playwright-smoke-a2.txt`
