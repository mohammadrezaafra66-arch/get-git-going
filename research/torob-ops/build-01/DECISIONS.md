# DECISIONS — Torob Eye build-01

Recorded: 2026-09-26 19:14 +0330

Owner reply (verbatim):

> Q2–Q9: defaults. Add these three binding requirements to the plan, then continue without asking:
>
> A. Our-price FIX (new action-table row, Stage 1): find why product_computed_prices_public returns 0 rows to the service role while 321 active products have cash_price. Save pg_get_viewdef / pg_get_functiondef, policies and grants first. Fix access or the view's source without changing any pricing math or any existing price value. Prove with row counts before/after that the scan's our-price step now returns prices for the Q6 products. In PRODUCTION-NOTES.md, state whether the same cause exists in the code and migrations headed to production.
>
> B. Q6 selection: choose the 15 products only among those that return a non-empty our-price from the exact source the scan uses after fix A.
>
> C. Real submission BUILD (Stage 4): Path A never performs a real Torob report, so build the real submission in the torob-eye worker (Playwright, account session from the pool, template, own-shop guard, kill switch, hourly cap, repeat window). TOROB_OPS_SIMULATE_SUBMIT must switch off only the final submit action; every step before it runs for real. On 3100 prove the full path up to the final submit against a recorded/stubbed Torob report page, with a unit test seen failing before the code existed. In REPORT.md, state plainly that live submission to Torob is unverified until production.

## Applied answers

| ID | Decision |
|---|---|
| Q1 | Dropped in Stage 0. Deploy from worktree compose override; `app` untouched. |
| Q2 | Default: one page at a time, 30–60 s randomized, cycle every 4 h from 08:00–22:00 Tehran. |
| Q3 | Default: back-off 15 min doubling to 2 h; alert after 3 continuous hours blocked; notify on recovery. |
| Q4 | Default: never overwrite an existing `torob_url`. |
| Q5 | Default: below threshold → leave empty, record candidate, never write a guess. |
| Q6 | Default: up to 15 active products, **restricted by binding B**. |
| Q7 | Default: `TOROB_OPS_SIMULATE_SUBMIT` on for 3100; zero real Torob complaints from this box. Binding C: simulate switches off **only** the final click; prior steps run for real against a stub/recorded page. |
| Q8 | Default: leave Phase-2 code, deprecate in docs, point to the new worker. |
| Q9 | Default: no new accounts required for Stages 1–3; Stage 4 uses simulate + existing pool as needed. |
| A | Binding. Stage 1 FIX. New action-table row. |
| B | Binding. Q6 subset of scan our-price after A. |
| C | Binding. Stage 4 BUILD real submit in torob-eye. |
