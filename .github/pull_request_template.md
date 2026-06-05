## Summary

<!-- What does this PR change and why? Keep scope small and incremental. -->

## Baseline / ADR alignment

- [ ] This PR does **not** introduce a parallel backend, database, or control plane.
- [ ] This PR does **not** implement Divar, Torob, WhatsApp, Instagram, OCR, STT, or AI bots.
- [ ] Supabase/PostgreSQL remains the source of truth for persistent state.
- [ ] Lovable/React/TanStack changes are UI-only (no frontend-only authorization).
- [ ] External integrations (if any) are optional, feature-flagged, and server-side secret safe.

## Change type

- [ ] Feature
- [ ] Bug fix
- [ ] Docs / baseline / ADR
- [ ] Automation contract (OpenAPI / JSON Schema)
- [ ] Migration / RLS / RBAC
- [ ] Deploy / ops

## Migration impact

<!-- None, or link to `supabase/migrations/<timestamp>_*.sql` -->

## RLS / RBAC impact

<!-- None, or describe policy / permission changes -->

## Audit log impact

<!-- None, or describe new audited actions -->

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
