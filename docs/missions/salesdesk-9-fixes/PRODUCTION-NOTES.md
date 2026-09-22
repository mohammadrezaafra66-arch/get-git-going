# PRODUCTION-NOTES — salesdesk-9-fixes

How the **owner** ships after testing.  
This document is instructions only. **Do not** merge, deploy production, or apply prod migrations from the agent session that wrote this file (`EXECUTION-PROMPT.md` §12; W4-DOC brief).

Worktree branch to merge: `feature/salesdesk-9-fixes`  
Target branch: `feature/sales-desk`  
LAN verification tip on 3100: `APP_GIT_SHA=0c6eeb08` (healthy) — `evidence/W4/deploy-summary.txt`.  
Owner scripts: `evidence/W1/ACCEPTANCE.md` … `evidence/W4/ACCEPTANCE.md`.

## 1. Before any production change

1. Run the four Persian ACCEPTANCE scripts on the LAN build (`0c6eeb08` or a later rebuild of the same branch tip you intend to ship).
2. Confirm critic residual is acceptable: Wave 4 D3 owner-only is UI/TS, not an RLS trigger — `evidence/W4/critic.md` FINDING Medium.
3. Confirm you will **not** deploy code before migrations 560–575 are on the production database (order below).

## 2. Merge (owner only)

```text
# After ACCEPTANCE pass — owner machine / review process
git fetch origin
git checkout feature/sales-desk
git merge --no-ff feature/salesdesk-9-fixes
# resolve conflicts if any; push feature/sales-desk when ready
```

Do **not** force-push. Do **not** merge from the agent.

## 3. Apply migrations on production DB **before** code deploy

Apply **in order**, versions `560` through `575` (timestamps listed in `HANDOFF.md` / `REPORT.md`).  
Persian-safe method: follow `AGENTS.md` — **never** pipe Persian SQL through PowerShell; deliver bytes via stdin/`docker exec -i` Buffer path (see `AGENTS.md` «Persian SQL must never go through a PowerShell pipe» and stdin delivery). Use `-U supabase_admin -d afrakala` (or prod equivalent) with password from the env file, never echoed.

Suggested order (repo paths under the shipped tree):

1. `supabase/migrations/20260921220000_560_work_item_events.sql`
2. `…561_purchases_require_supplier.sql`
3. `…562_work_items_completed_at_closed.sql`
4. `…563_user_caller_id_settings_display.sql`
5. `…564_sales_interactions_deal_id.sql`
6. `…565_sales_interactions_responsible_required.sql`
7. `…566_sales_interactions_won_lost_at.sql`
8. `…567_deal_lost_reasons.sql`
9. `…568_sales_interaction_items.sql`
10. `…569_sales_quotes_interaction_id.sql`
11. `…570_sales_interaction_assigned_title.sql`
12. `…571_role_permissions_salesdesk_w3.sql`
13. `…572_sales_activity_types.sql` — verify Persian titles via hex round-trip (§8.5 / LAN pattern in `orch-d2-reverify.txt`)
14. `…573_sales_interactions_activity_fields.sql`
15. `…574_role_permissions_sales_activities.sql`
16. `…575_activity_reminder_fields.sql`

After each (or after the batch, per your ops standard): restart PostgREST/API so new columns/RPCs are visible (LAN used `docker restart afrakala-lan-rest` — `EXECUTION-PROMPT.md` §8.4).

Revert scripts (if a migration must be undone on a non-prod copy first):  
`docs/missions/salesdesk-9-fixes/revert/563_…` through `revert/575_…` (and Wave 1 revert set for 560–562). Prefer testing reverts on a copy, not on live prod.

## 4. Then deploy application code

Deploy the web (and related) image/build that contains `feature/salesdesk-9-fixes` **after** migrations 560–575 succeed.  
Deploying UI before 572–575 will break activities pages/RPCs (`count_open_activities_due_today_or_overdue`, `materialize_due_activity_reminders`).

## 5. Smoke pages after deploy

| Area | Path / action | Labels to spot-check (§6) |
|------|---------------|---------------------------|
| Sales desk | `/operations/sales-desk` | «افزودن معامله», «کارهای من» |
| My work + lights | tab «کارهای من» | traffic lights; «معاملاتی که فعالیتی روی آن‌ها نیست»; «فعالیت‌های امروز و عقب‌افتاده» |
| Activities | `/operations/sales-desk/activities` | «فعالیت‌ها»; buckets «گذشته تا امروز»…; filters «انجام نشده\|انجام شده\|همه فعالیت ها»; red menu badge |
| Deal detail | `/operations/sales-desk/deals/$dealId` | «محصولات درخواستی»; «موفق شد»/«ناموفق شد»; «ایجاد پیش‌فاکتور» |
| Deals for others | `/operations/sales-desk/deals-for-others` | «معاملات ثبت‌شده برای دیگران» |
| Lost reasons settings | `/settings/deal-lost-reasons` | «دلایل شکست معامله» |
| Caller settings | existing caller-ID settings | «مدت زمان نمایش پنجره تماس (ثانیه)»; «فقط تماس‌های داخلی خودم» |
| Purchases | purchase form + `/accounting/purchase-payments` | «تأمین‌کننده الزامی است»; «بدون تأمین‌کننده» |
| Tickets | ticket detail + board | «ایجاد کننده»; «مسئول»; «بستن»/«بازگشایی»; «سابقه» |
| Reminder | activity with time + bell | «افزودن یادآور برای فعالیت»; postpone «به تعویق انداختن» |

## 6. Out of scope for this ship

- N28 Google Sheet integration — deferred §3.12.
- N31 pricing-queue worker/cron — deferred §3.12.
- Hardening D3 owner-only into a DB trigger — optional follow-up (`critic.md` recommendation).

## 7. Evidence pointers

- Mission close: `REPORT.md`, `HANDOFF.md`
- Wave gates: `evidence/W4/deploy-summary.txt`, `evidence/W4/critic.md`
- Contracts: `CONTRACTS.md` (module `sales-activities`; reminder columns on `sales_interactions`)
