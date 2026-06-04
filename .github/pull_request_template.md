# Pull Request Checklist

## Summary

<!-- Briefly describe what changed and why. Keep this short and factual. -->

## Phase / Scope

- [ ] This PR is labeled or described as `PHASE-0`, `PHASE-1`, `FUTURE`, or `BASELINE`.
- [ ] This PR matches the approved scope for the selected phase.
- [ ] I checked `README.md`, `AGENTS.md`, `docs/REPO_STATE_INVENTORY.md`, and `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` before making changes.
- [ ] I did not rebuild, duplicate, rename, or bypass an existing module, route, table, service, API, or panel.

## Phase 0 Safety Gate

For Phase 0 / automation-preparation PRs:

- [ ] Docs-only / structure-only change, unless a later approved task explicitly allows otherwise.
- [ ] No runtime bot implementation was added.
- [ ] No real Divar crawler was added.
- [ ] No real WhatsApp sender or messaging automation was added.
- [ ] No real Instagram extractor was added.
- [ ] No real Torob scraper was added.
- [ ] No OCR/STT pipeline was added.
- [ ] No AI/LLM pipeline was added.
- [ ] No browser automation was added.
- [ ] No proxy/account automation was added.
- [ ] No production scraping or production sending was added.
- [ ] No Laravel core was added.
- [ ] No parallel database, API layer, admin panel, or control plane was added.

## Self-host / Infrastructure Safety

- [ ] The project remains self-hostable on Linux + Docker + Supabase Self-host.
- [ ] No critical dependency on CDN, online fonts, external APIs, or non-self-hostable cloud services was introduced.
- [ ] Any external integration mentioned is optional, feature-flagged, server-side secret safe, and has a manual fallback.
- [ ] Production/self-host paths under `deploy/` were not changed unless explicitly required and reviewed.
- [ ] The change does not make backup, restore, migration, or rollback harder.

## Security / Secrets

- [ ] No real secrets, tokens, passwords, cookies, certificates, private keys, service role keys, JWT secrets, backups, dumps, or `.env` files are committed.
- [ ] No server secret uses a `VITE_` prefix.
- [ ] No service role key or server-only credential is exposed to frontend/client code.
- [ ] Logs, examples, docs, and screenshots do not contain private operational data.
- [ ] Any `.env.example` values are empty, fake, or clearly non-sensitive placeholders.

## RLS / RBAC / Audit

- [ ] No database migration is included, or the migration impact is explicitly documented below.
- [ ] Any new sensitive table design requires RLS/RBAC before implementation.
- [ ] Any sensitive action design includes an audit-log plan before implementation.
- [ ] Frontend-only authorization is not used as the only protection for any sensitive capability.
- [ ] Existing RBAC/RLS boundaries were not weakened.

## Database / Migration Impact

- [ ] No migration is included.
- [ ] Migration included and reviewed against `docs/MIGRATION_SAFETY_POLICY.md`.
- [ ] Not applicable.

Notes:

<!-- If migration is included, explain affected tables, RLS/RBAC impact, rollback plan, and staging/backup requirement. -->

## Files Inspected

- [ ] `README.md`
- [ ] `AGENTS.md`
- [ ] `docs/REPO_STATE_INVENTORY.md`
- [ ] `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- [ ] Target files changed by this PR

## Verification

- [ ] Docs/structure-only change; no runtime verification required.
- [ ] `npm run build` executed.
- [ ] `npm run lint` executed.
- [ ] Typecheck executed, if an independent script exists.
- [ ] Relevant tests executed, if applicable.
- [ ] Manual test path documented, if UI changed.

Results / Notes:

<!-- Paste concise verification results. If a command was not run, say why. Do not claim a check passed if it was not run. -->

## Delivery Report

- Files changed:
- Why each file changed:
- Migration impact:
- RLS/RBAC impact:
- Audit log impact:
- Build/lint/typecheck/test results:
- Manual test path:
- Self-host acceptance check:
- Remaining risks:
