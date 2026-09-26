# R2 — 3100 deploy procedure (established)

Q1 is settled: **do not switch `D:\AfraKalaTest\app`**. Recent ships (didar-import, deal-pipeline, didar-parity PASS 3/3b) deploy from the feature worktree via a compose override. Latest live proof: `research/didar-parity/exec-deals-3b/REPORT.md` — deploy from `D:\AfraKalaTest\wt-parity-deals-3b`, `APP_GIT_SHA=4ec3b7ef`.

Older torob logs (`app/docs/research/_torob_3100_ready_deploy.out`) ran compose with `--env-file D:\AfraKalaTest\app\deploy\lan\.env.lan` from the `app` tree. That path is **not** used by the current worktree-only rule.

## Command sequence this run will use (after Stage 0)

Create `research/torob-ops/build-01/compose.worktree.override.yml` pointing `services.web.build.context` at `D:/AfraKalaTest/wt-torob-eye` (same shape as `research/didar-import/compose.worktree.override.yml`).

```
Set-Location D:\AfraKalaTest\app\deploy\lan
$env:DISABLE_LOVABLE_MCP="1"
$env:GIT_SHA = (git -C D:\AfraKalaTest\wt-torob-eye rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
$o = "D:\AfraKalaTest\research\torob-ops\build-01\compose.worktree.override.yml"
docker compose --env-file .env.lan -f docker-compose.yml -f $o up -d --build --no-deps web
docker restart afrakala-lan-rest
docker exec afrakala-lan-web printenv APP_GIT_SHA
```

`.env.lan` stays in `app\deploy\lan\` (gitignored). Never copy secrets into the worktree. Never `git add` the override if it is only a run-folder file.

For the new `torob-eye` service: add it to `deploy/lan/docker-compose.yml` **in the worktree** (or a second override) as `afrakala-lan-torob-eye`. That compose file is what 3100 already uses; the web override only swaps the web build context.
