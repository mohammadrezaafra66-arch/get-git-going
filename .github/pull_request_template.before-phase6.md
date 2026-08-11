## Summary

<!-- What does this PR change and why? Keep scope small and incremental. -->

## Task Packet

- Task ID:
- Phase Label: BASELINE / PHASE-0 / PHASE-1 / FUTURE
- Related ADR/docs:

## Baseline / ADR alignment

- [ ] This PR does **not** introduce a parallel backend, database, API, or control plane.
- [ ] This PR does **not** implement Divar, Torob real extraction, WhatsApp, Instagram, OCR, STT, or AI bots in Phase 0.
- [ ] Supabase/PostgreSQL remains the source of truth for persistent state.
- [ ] GitHub remains the source of truth for code/docs; Drive is mirror only.
- [ ] Lovable/React/TanStack changes are UI-only unless explicitly approved by ADR.
- [ ] Python Worker Runtime concerns are not implemented inside UI components.
- [ ] External integrations, if any, are optional, feature-flagged, and server-side secret safe.

## Change type

- [ ] Feature
- [ ] Bug fix
- [ ] Docs / baseline / ADR
- [ ] Automation contract (OpenAPI / JSON Schema)
- [ ] Migration / RLS / RBAC
- [ ] Deploy / ops

## Files intentionally changed

<!-- List changed files or directories and why each was changed. -->

## Migration impact

<!-- None, or link to `supabase/migrations/<timestamp>_*.sql` -->

## RLS / RBAC impact

<!-- None, or describe policy / permission changes -->

## Audit log impact

<!-- None, or describe new audited actions -->

## Secret / sensitive data impact

- [ ] No real secrets were added.
- [ ] No service role key is exposed to browser/client code.
- [ ] Sensitive data is not logged in raw form.

## Self-host acceptance check

- [ ] No critical dependency on CDN, online fonts, or non-self-hostable cloud APIs
- [ ] No `VITE_` server secrets
- [ ] Large queries use limit, pagination, indexes, and debounced search/filter (if applicable)
- [ ] UI remains Persian, RTL, mobile-first (if UI changed)

## Test plan

<!-- Manual steps and/or automated tests run -->

## Build / lint / typecheck

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] typecheck (if script exists)

## Remaining risks

<!-- Known gaps, follow-ups, or rollback notes -->
