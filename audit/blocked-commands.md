# Blocked commands

| Command | Reason |
|---|---|
| npm install / bun install | mutates node_modules |
| eslint --fix / prettier --write (`npm run format`) | mutates files |
| git commit / push | mutation |
| docker compose up/build/restart | mutates containers |
| Any INSERT/UPDATE/DELETE/DDL via psql | mutation |
| `tick_inquiries` / `start_league_season` RPC execute | would write seasons/documents/penalties |
| Playwright `test` / `playwright.auth.config.ts` | PROGRESS.md: save-admin-session can wipe storageState; tests may write DB |
| Opening `deploy/lan/.env.lan` in logs | secret leak risk |
| knip / ts-prune / madge / depcheck | not installed; installing forbidden |

## Allowed and used

- `docker ps`
- `docker exec ... psql` with SELECT-only SQL from `audit/inventory/readonly-xray*.sql`
- `npm run typecheck` (`tsc --noEmit`)
- `npx eslint .` hung; killed. Used `npx eslint src` instead (read-only). Summary in `audit/inventory/eslint-summary.txt`.
- git status/log (read-only)
