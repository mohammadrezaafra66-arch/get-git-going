# Release Checklist

Before merging Phase 0 automation work to `main`, check all items below.

## Scope

- Change belongs to `PHASE-0`.
- No real bot is added.
- No real scraping is added.
- No real sending is added.
- No OCR/STT or AI pipeline is added.
- No Laravel core is added.
- No parallel database, API or panel is added.

## Security

- No API key, password, token, cookie, service key, role key or real secret is committed.
- No production `.env` file is committed.
- No service role logic is exposed to browser code.

## Database

- No migration is added without approved design and rollback.
- RLS/RBAC impact is documented.
- Audit/logging impact is documented.

## Testing

- Relevant test cases are listed.
- Dummy flow remains dummy-only.
- Build/lint status is reported when code changes exist.

## Review

- PR has owner review.
- Sensitive areas are reviewed before merge.
- Remaining risks are documented.
