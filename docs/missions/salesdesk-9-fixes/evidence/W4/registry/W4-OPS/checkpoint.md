# W4-OPS
- state: done
- started: 2026-09-22T05:20:23.9858414+05:00
- finished: 2026-09-22T05:28:00+05:00
- expected_HEAD: 0c6eeb08
- deployed_HEAD: 0c6eeb086893973783ead3116b4bb039198ce7bf
- APP_GIT_SHA: 0c6eeb08
- health: healthy
- HTTP: 200
- compose_safety: PASS
- playwright: PASS (salesdesk-9-fixes-w1-smoke)
- migrations_572_575: present (verify only; not re-applied)
- evidence_commits: 425962fc (main), 7ec41a61 (push log)
- note: container APP_GIT_SHA stays 0c6eeb08 (product tip); branch tip advanced with docs-only evidence

## Evidence
- `compose-base.yml`
- `compose-resolved.yml`
- `compose-safety.txt`
- `migration-verify-w4.txt`
- `docker-up-web.txt`
- `post-deploy-verify.txt`
- `playwright-install.txt`
- `playwright-smoke.txt`
- `deploy-summary.txt`
