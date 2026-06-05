# WPC-0-002 — OpenAPI Canonical Cleanup

Phase Label: PHASE-0  
Owner: Platform maintainers  
Reviewer: محمدرضا افرا  
Status: In Progress

## Goal

Eliminate duplicate Phase-0 automation OpenAPI authority. Enforce ADR-0007 canonical path without deleting legacy links.

## Related ADR / docs

- ADR-0001 (control plane = this repo)
- ADR-0005 (Phase-0 scope — contracts only)
- ADR-0007 (canonical: `automation/openapi/automation-v1.yaml`)
- [OPENAPI_BASELINE_AUDIT.md](../OPENAPI_BASELINE_AUDIT.md)

## Allowed files

- `openapi/automation-v1.yaml` (deprecated stub only)
- `openapi/README.md`
- `docs/automation/OPENAPI_BASELINE_AUDIT.md`
- `docs/automation/OPENAPI_CANONICAL_RESOLUTION.md`
- `docs/automation/task-packets/WPC-0-002-openapi-canonical-cleanup.md`
- `docs/process/PHASE0_OPEN_QUESTIONS_G01_G08.md` (G-06 path fix)
- `docs/automation/task-packets/WPC-0-001-worker-dummy.md` (allowed path fix)

## Forbidden

- Changes to `automation/openapi/automation-v1.yaml` (canonical body)
- `src/**`, Worker runtime, UI routes
- Supabase migrations
- Real bots (Divar, Torob, WhatsApp, Instagram, OCR/STT, AI)
- Redis/RabbitMQ, Laravel, parallel backend
- Executable API endpoints

## Expected output

1. Baseline audit document
2. Root OpenAPI deprecated stub + README pointer
3. Canonical resolution note
4. G-06 and WPC-0-001 references corrected

## Test plan

| # | Check | Pass |
|---|-------|------|
| T1 | `automation/openapi/automation-v1.yaml` unchanged vs `main` | diff empty |
| T2 | `openapi/automation-v1.yaml` has `paths: {}` and `x-deprecated: true` | manual |
| T3 | `openapi/README.md` links to canonical | manual |
| T4 | G-06 references `automation/openapi/automation-v1.yaml` | grep |
| T5 | No marketplace paths in canonical OpenAPI | grep divar/whatsapp/instagram |
| T6 | `npm run build` / `lint` — report if env missing | optional |

## Stop conditions

- Canonical OpenAPI would need breaking edits → stop; file separate `automation-contract` PR
- Team requests merge of `/commands/*` into canonical → requires ADR amendment first

## Acceptance

- [ ] Single authoritative OpenAPI path documented and enforced
- [ ] Legacy root path retained as non-implementable stub
- [ ] No real bot, no migration, no runtime code in PR diff
