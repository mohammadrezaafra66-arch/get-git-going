# Security Baseline

## Phase 0 scope

This document defines the minimum security baseline for Phase 0 preparation.

## Rules

- No real secrets in GitHub.
- No service role key in browser code.
- No privileged operation from UI.
- No real external automation in Phase 0.
- No production scraping or sending in Phase 0.
- No migration without design, rollback, RLS/RBAC and approval.
- No bypass of existing auth/RBAC/RLS.

## Required controls before implementation

- Access control plan.
- Secret handling plan.
- Audit/logging plan.
- Rollback plan for database changes.
- Review before touching sensitive files.
