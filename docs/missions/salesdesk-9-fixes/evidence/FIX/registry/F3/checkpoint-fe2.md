# F3 FE2 checkpoint — C9 deal→quote link via RPC (attempt 2)

- started_at: 2026-09-22T13:48+05:00
- deadline_at: 2026-09-22T16:15:00+05:00
- HEAD_start: 3673d7eb9f81725eebd5fc0c5c83e05bd1fa8c22
- branch: feature/salesdesk-9-fixes
- phase: done
- status: FIXED
- approach: A — `p_interaction_id` on `create_sales_quote_with_items`
- migration: `supabase/migrations/20260922050500_577_create_sales_quote_link_deal.sql`
- revert: `docs/missions/salesdesk-9-fixes/revert/577_create_sales_quote_link_deal.sql`
- APPLIED_LAN: yes (md5 match + ledger `20260922050500` + `afrakala-lan-rest` restart)
- probe: before `MISSING_P_INTERACTION_ID`; after `PROBE_OK=1` match SP/IX/draft (ROLLBACK)
- HEAD_end: d2697b626abf1615f77d97dbe29a8fbcba64c7ab
- PRODUCT_COMMIT: d2697b626abf1615f77d97dbe29a8fbcba64c7ab
- typecheck: ERROR_COUNT=74 (≤74) — `f3-c9-tsc-after-fe2.txt` / baseline also 74
- FE: pass `p_interaction_id`; removed client UPDATE on `sales_quotes`
- product_price prefill (attempt 1): left intact
- unrelated dirty F1 / other evidence: left untouched
- live Playwright C9: deferred to orch after web deploy
