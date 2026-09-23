# W2-OPS checkpoint

- job_id: W2-OPS
- result: **DONE**
- worktree_HEAD: `8a8b61e3f021c6ccad8a50aa3e6717ab803e4662`
- short_SHA / APP_GIT_SHA: `8a8b61e3` (match)
- finished: 2026-09-22T00:46:30 (local)

## Safety
- base vs resolved: all non-web services IDENTICAL
- web only: `context: D:\AfraKalaTest\app` → `D:\AfraKalaTest\wt-salesdesk-9-fixes`
- verdict: **SAFE** → `evidence/W2/compose-safety.txt`

## Deploy
- `up -d --build --no-deps web` exit 0
- `docker restart afrakala-lan-rest` exit 0
- `printenv APP_GIT_SHA` → `8a8b61e3`
- log: `evidence/W2/deploy-web.txt`

## HTTP smoke
- GET `http://192.168.170.8:3100/` → **200** (6891 bytes)
- log: `evidence/W2/http-smoke.txt`

## Playwright
- W1 config exists (`evidence/W1/playwright.w1-smoke.config.ts`)
- **deferred** (optional; not required for OPS gate speed)
