# The 74 migrations production is missing — apply order

Generated 2026-09-07T20:41:08Z from `staging` @ 9c113aac by the orchestrator.

**The audit says 62. That was correct as of migration 507.** Migrations 508–519 landed on
2026-09-07 (close-out mission, PRs #432 and #434), after the audit was written. The true gap
is **74**. Running only the 62 leaves production without 511 (credit-floor guard), 515/519
(system-health DEFINER guards) and 518 (that guard extended to INSERT).

**Apply order is filename-timestamp order, not number order** — the numbers interleave.

| # | order | file | in audit? |
|---|---|---|---|
