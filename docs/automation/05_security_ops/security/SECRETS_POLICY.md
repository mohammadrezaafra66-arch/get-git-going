# Secrets Policy

## Hard rule

Real secrets must never be committed to GitHub.

## Forbidden in repository

- API keys
- service role keys
- passwords
- JWT secrets
- cookies
- session files
- private certificates
- database dumps
- backups
- production `.env` files
- storage exports

## Allowed

- `.env.example` with empty values only.
- Documentation that references secret names without real values.
- Local development placeholders.

## Phase 0 note

Dummy Worker may use placeholder environment variables only. No real platform credentials are allowed in Phase 0 commits.
