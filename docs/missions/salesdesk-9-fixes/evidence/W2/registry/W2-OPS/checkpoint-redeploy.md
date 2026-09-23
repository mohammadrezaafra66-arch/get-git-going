# W2-OPS-REDEPLOY checkpoint

- job_id: W2-OPS-REDEPLOY
- result: **DONE**
- worktree_HEAD: `e7446bb2e8f94664c6210e94e132e1f31f1b1fad`
- short_SHA / APP_GIT_SHA: `e7446bb2` (match)
- finished: 2026-09-22T03:33:40 (local)
- reason: B4/B5 fix redeploy after `b1cc9a88` / `e7446bb2`

## Safety
- base vs resolved: all non-web services IDENTICAL
- web only: `context: D:\AfraKalaTest\app` → `D:\AfraKalaTest\wt-salesdesk-9-fixes`
- verdict: **SAFE** → `evidence/W2/compose-safety-redeploy.txt`

## Deploy
- `up -d --build --no-deps web` exit 0
- `docker restart afrakala-lan-rest` exit 0
- `printenv APP_GIT_SHA` → `e7446bb2`
- log: `evidence/W2/deploy-web-b4b5.txt`

## HTTP smoke
- GET `http://192.168.170.8:3100/` → **200** (6891 bytes)
