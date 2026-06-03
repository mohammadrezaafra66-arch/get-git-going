# Environment Matrix

## Purpose

This file defines Phase 0 environment boundaries for Afra Automation.

## Environments

| Environment | Meaning | Usage |
|---|---|---|
| local | Developer machine | documentation, contracts, dummy worker development, safe local tests |
| LAN | Internal network environment | future controlled worker testing after Phase 0 approval |
| production | live business environment | no Phase 0 real automation execution |

## Supabase location

Supabase/PostgreSQL is the source of truth.

For Phase 0, any database work must remain design-first. No automation migration is allowed before table design, RLS/RBAC and rollback approval.

## Worker location

Phase 0 Worker runs only as dummy worker in a safe development environment.

No real external platform access is allowed.

## Secrets location

Secrets must not be stored in GitHub.

Allowed in GitHub:

- `.env.example` with empty values
- secret names without real values
- documentation placeholders

Forbidden in GitHub:

- API keys
- passwords
- service keys
- role keys
- cookies
- tokens
- production env files
