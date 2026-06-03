# Testing Strategy

## Scope

This strategy applies to Phase 0 automation foundation only.

## Test levels

1. Documentation review.
2. Contract/schema validation.
3. Dummy worker dry run.
4. Dummy job lifecycle test.
5. Safe end-to-end dummy flow.

## Phase 0 rules

- Tests must not call real external platforms.
- Tests must not send real messages.
- Tests must not scrape real production sources.
- Tests must not use real credentials.
- Tests must not require production secrets.

## Required checks

- Scope label is correct.
- No real bot code exists.
- No forbidden integration exists.
- Dummy job can move through lifecycle states.
- Heartbeat/progress/log/checkpoint behavior is testable.
- Failure and retry paths are documented.

## Reporting

Every test result must include:

- test case ID
- date
- tester
- result
- notes
- linked PR or task packet
