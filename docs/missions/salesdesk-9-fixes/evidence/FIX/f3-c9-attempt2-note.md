# F3-C9 attempt 2 — deal→quote link without client UPDATE

## Root cause (after attempt-1 product_price prefill worked)
FE post-create `UPDATE sales_quotes SET interaction_id, salesperson_id` failed:
`permission denied for table sales_quotes` (UPDATE revoked SF-1.c4 / 20260617052612).
Evidence: `f3-c9.txt`, `f3-rerun.txt`. Wave3 critic already flagged two-step UPDATE risk.

## Approach A
Extend `create_sales_quote_with_items` with optional `p_interaction_id`.
When set (SECURITY DEFINER): load deal, require salesperson_id, INSERT with
`interaction_id` + `salesperson_id = deal.salesperson_id`. Status remains DEFAULT draft.
FE passes `p_interaction_id` and no longer UPDATEs.

## Live vs repo before replace
- Pre: `create_sales_quote_with_items-live-pre577.txt` identical to mig 421 body (minus trailing `;`).
- `MISSING_P_INTERACTION_ID` — `f3-c9-probe-577-before.txt`

## Apply LAN
- File: `supabase/migrations/20260922050500_577_create_sales_quote_link_deal.sql`
- md5 + apply + ledger + rest restart: `f3-c9-apply-577.txt`
- Ledger version: `20260922050500`

## E4 probe (sales JWT claim, ROLLBACK)
- Before: `MISSING_P_INTERACTION_ID`
- After: `HAS_P_INTERACTION_ID`; `PROBE_MATCH_SP=t` `PROBE_MATCH_IX=t` `PROBE_IS_DRAFT=t` `PROBE_OK=1`
  — `f3-c9-probe-577-after.txt` (exit 0)
- Live Playwright C9: orch after web deploy (FE must ship `p_interaction_id`).

## Revert
`docs/missions/salesdesk-9-fixes/revert/577_create_sales_quote_link_deal.sql`
