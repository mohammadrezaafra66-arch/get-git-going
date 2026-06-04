# Phase 0 Pull Request Template

## Summary

<!-- Describe what changed and why. Keep it short, factual, and reviewable. -->

## Scope classification

Select one:

- [ ] `PHASE-0` — documentation, structure, contracts, or dummy-worker preparation only
- [ ] `PHASE-1` — approved later-phase MVP work
- [ ] `FUTURE` — documented for later, not built now
- [ ] `BASELINE` — repository inventory or current-state clarification

## Required pre-checks

- [ ] I read `README.md`.
- [ ] I read `AGENTS.md`.
- [ ] I read `docs/REPO_STATE_INVENTORY.md`.
- [ ] I read `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`.
- [ ] I inspected every target file before editing it.
- [ ] I confirmed this PR does not duplicate, replace, rename, or bypass an existing module, route, table, service, API, or panel.

## Phase 0 hard gate

For Phase 0 automation work, every item below must remain true:

- [ ] This PR is docs-only or structure-only, unless a later approved task explicitly allows otherwise.
- [ ] No runtime code was added.
- [ ] No real bot logic was added.
- [ ] No real Divar crawler was added.
- [ ] No real WhatsApp sender, reader, or messaging automation was added.
- [ ] No real Instagram extractor was added.
- [ ] No real Torob scraper was added.
- [ ] No OCR/STT pipeline was added.
- [ ] No AI/LLM pipeline was added.
- [ ] No browser automation was added.
- [ ] No proxy/account automation was added.
- [ ] No production scraping was added.
- [ ] No production message sending was added.
- [ ] No production integration was added.
- [ ] No Laravel core was added.
- [ ] No parallel database was added.
- [ ] No parallel API layer was added.
- [ ] No parallel admin panel or control plane was added.

## Database and migration gate

- [ ] No database migration is included.
- [ ] No migration SQL was added.
- [ ] No existing migration was edited.
- [ ] No RLS policy was weakened.
- [ ] No RBAC boundary was weakened.
- [ ] No audit-log requirement was removed.
- [ ] If this PR only documents future database design, it does not implement that design.

If any migration is included, stop and explain why this PR is not Phase 0 docs-only:

<!-- Migration explanation, if applicable. Otherwise write: Not applicable. -->

## Secrets and sensitive data gate

- [ ] No real `.env` file is committed.
- [ ] No API key is committed.
- [ ] No service role key is committed.
- [ ] No JWT secret is committed.
- [ ] No password is committed.
- [ ] No cookie or session token is committed.
- [ ] No private key or certificate is committed.
- [ ] No database dump, backup archive, or storage export is committed.
- [ ] No production endpoint or private infrastructure detail is exposed.
- [ ] Any `.env.example` values are empty, fake, or clearly placeholder-only.

## Self-host safety

- [ ] The project remains self-hostable on Linux + Docker + Supabase Self-host.
- [ ] No critical dependency on CDN, online fonts, external APIs, or non-self-hostable cloud services was introduced.
- [ ] No runtime dependency on Lovable Cloud was introduced.
- [ ] Backup, restore, rollback, and migration safety were not made harder.
- [ ] Existing `deploy/` behavior was not changed unless explicitly required and reviewed.

## Files changed

List every file changed and why:

| File | Why it changed | Risk level |
|---|---|---|
|  |  |  |

## Testing / verification notes

Select all that apply:

- [ ] Docs/structure-only change; no runtime test required.
- [ ] `npm run build` was run.
- [ ] `npm run lint` was run.
- [ ] Typecheck was run, if an independent script exists.
- [ ] Relevant tests were run, if applicable.
- [ ] Manual UI test path is documented, if UI changed.
- [ ] Not run; reason documented below.

Results / reason:

<!-- Paste concise verification results. If not run, state why. Do not claim a check passed if it was not run. -->

## Reviewer checklist

Reviewers must confirm:

- [ ] Scope matches the selected phase.
- [ ] Phase 0 boundaries are preserved.
- [ ] No real automation or runtime behavior was introduced.
- [ ] No migration, secret, production integration, or destructive change was introduced.
- [ ] Existing architecture remains the source of truth.
- [ ] Supabase/PostgreSQL remains the source of truth.
- [ ] React/TanStack/Lovable remains UI/operator layer only.
- [ ] Worker/runtime/plugin work remains dummy-only or documentation-only.
- [ ] Documentation is clear, operational, and non-sensitive.
- [ ] Remaining risks are honestly listed.

## Delivery report

- Files inspected:
- Files changed:
- Why each file changed:
- Migration impact:
- RLS/RBAC impact:
- Audit-log impact:
- Build/lint/typecheck/test results:
- Manual test path:
- Self-host acceptance check:
- Remaining risks:
