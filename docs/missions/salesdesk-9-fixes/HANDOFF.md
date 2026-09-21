# HANDOFF — salesdesk-9-fixes

Updated: 2026-09-22T≈06:40:00Z · Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes` · Base: `feature/sales-desk` @ `c1ea61a1`  
Current: **Wave 3 DONE** · Wave 4 next · 3100 runs: `APP_GIT_SHA=42392d3f` (healthy) · product FE `bc10ec3f` + C2 zod `c4bcafe9`

## چه چیزی تغییر کرد

مستندات بستن موج ۳ (C1–C9): به‌روزرسانی این HANDOFF، اسکریپت پذیرش مالک `evidence/W3/ACCEPTANCE.md`، خودآزمایی `verify/W3-selfcheck.md`، و checkpoint `evidence/W3/registry/W3-DOC/checkpoint.md`. کد محصول در این commit تغییر نکرد (فقط docs زیر `docs/missions/salesdesk-9-fixes/`).

## چرا

`EXECUTION-PROMPT.md` §8/§9 و بریف W3-DOC: پس از CONFIRM critic و redeploy با SHA `42392d3f`، موج ۳ باید با HANDOFF/ACCEPTANCE/self-check بسته شود و اقدام بعدی Wave 4 D2 باشد.

## فایل‌ها و خطوط تغییریافته

- `docs/missions/salesdesk-9-fixes/HANDOFF.md` — این فایل (وضعیت Wave 3 DONE)
- `docs/missions/salesdesk-9-fixes/evidence/W3/ACCEPTANCE.md` — جدید
- `docs/missions/salesdesk-9-fixes/verify/W3-selfcheck.md` — جدید
- `docs/missions/salesdesk-9-fixes/evidence/W3/registry/W3-DOC/checkpoint.md` — جدید
- `CONTRACTS.md` — کلیدهای ماژول `sales-deals-for-others` / `deal-lost-reasons` / `deal-lost-report` از قبل موجود بودند (جدول Routes؛ reason Wave 3 C5/C8) — تغییری لازم نبود

## Rows

| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1–A6 | Wave 1 | — | DONE | `evidence/W1/ACCEPTANCE.md`; migrations 560–562 |
| B1–B5 | Wave 2 | — | DONE | `evidence/W2/ACCEPTANCE.md`; `verify/W2-selfcheck.md`; fix `b1cc9a88` |
| C1 | term | EXTEND | DONE | `c1-strings.md`; critic CONFIRM — `evidence/W3/critic.md`; self-check PASS — `verify/W3-selfcheck.md` |
| C2 | N7 | FIX | DONE (پس از zod) | mig 565; backfill YES `W0/backfill-condition-0.6.md` + 3 ids `c2-backfill-ids.txt`; critic REJECT→CONFIRM — `critic.md` + `critic-c2-rereview.md`; commit `c4bcafe9` |
| C3 | N8 | EXTEND | DONE | form readOnly — `QuickRequestForm.tsx:289-290`; critic CONFIRM |
| C4 | N9 | EXTEND | DONE | تب «کارهای من»; mig 570; `critic-db-probe.txt` title_pos=781; critic CONFIRM |
| C5 | N10 | BUILD | DONE | `deals-for-others.tsx` Tehran day; mig 571; module `sales-deals-for-others`; critic CONFIRM |
| C6 | N11–12 | CONNECT+BUILD | DONE | `RequestedProductsBlock`; mig 568; `c6-product-287.txt`; critic CONFIRM |
| C7 | N13 | EXTEND | DONE | `OutcomeButtons`; mig 566; CHECK unchanged — `critic-db-probe.txt`; critic CONFIRM |
| C8 | N14 | BUILD+CONNECT | DONE | `LostReasonDialog`; mig 567; `LOST_REASON_REQUIRED`; modules deal-lost-*; critic CONFIRM |
| C9 | N15 | CONNECT | DONE | «ایجاد پیش‌فاکتور»; mig 569; draft default — `critic-c6-c9-probe2.txt`; critic CONFIRM |
| D2… | Wave 4 | — | TODO | Next: D2 `sales_activity_types` |

## شواهد در دست با سطحشان

| ادعا | سطح E | دستور یا مسیر |
|------|--------|----------------|
| Branch `feature/salesdesk-9-fixes` | E3 | `git branch --show-current` → `feature/salesdesk-9-fixes` |
| Live `APP_GIT_SHA=42392d3f` | E3 | `docker exec afrakala-lan-web printenv APP_GIT_SHA` → `42392d3f` exit 0; also `evidence/W3/app-git-sha-a2.txt` |
| Container healthy | E3 | `docker inspect -f "{{.State.Health.Status}}" afrakala-lan-web` → `healthy` |
| Product FE commit `bc10ec3f` ancestor of HEAD | E3 | `git merge-base --is-ancestor bc10ec3f HEAD` exit 0; `git log --oneline bc10ec3f -1` |
| C2 zod fix `c4bcafe9` ancestor of HEAD | E3 | `git merge-base --is-ancestor c4bcafe9 HEAD` exit 0 |
| Typecheck ≤74 | E3 | DOC count `error TS` in `tsc-ops.txt` = 74 and `critic-tsc.txt` = 74 |
| Critic C1,C3–C9 CONFIRM; C2 REJECT then CONFIRM | E2 | `evidence/W3/critic.md`; `evidence/W3/critic-c2-rereview.md` (read on disk) |
| Backfill YES + 3 ids | E1 | `evidence/W0/backfill-condition-0.6.md`; `evidence/W3/c2-backfill-ids.txt` |
| Migrations 565–571 present in repo | E1 | `supabase/migrations/20260922040000_565_…` … `20260922040600_571_…` |
| Migrations 565–571 applied on LAN DB | E3 | `evidence/W3/critic-db-probe.txt` seven versions |
| Reverts 565–571 exist | E1 | `docs/missions/salesdesk-9-fixes/revert/565_…` … `571_…` |
| Redeploy after zod | E3 | `evidence/W3/deploy-summary-a2.txt` SHA 42392d3f healthy |
| Owner ACCEPTANCE script written | E1 | `evidence/W3/ACCEPTANCE.md` quotes EXECUTION §9 Wave 3 verbatim |
| Self-check C1–C9 PASS | E1/E3 | `verify/W3-selfcheck.md` |

## Confirmed facts

- Product Wave 3 UI landed in `bc10ec3fd8da5b7cddaf46353eabb8b48f10d874` (`feat(sales-desk): موج ۳ UI — C1 تا C9 میز فروش`) — E3 `git log`.
- C2 zod landed in `c4bcafe9` (`fix(sales-desk): C2 — zod اجباری برای مسئول معامله`) — E3; critic re-review CONFIRM — `critic-c2-rereview.md`.
- Docs tip that matches live SHA includes `42392d3f` (`docs(missions): بستن attempt2 W3-FE — C2 zod`) and OPS a2 redeploy evidence — E3 `deploy-summary-a2.txt`.
- Typecheck budget held at 74 — `tsc-ops.txt` / `critic-tsc.txt` — E3.
- Step 0.6 backfill condition was YES — `evidence/W0/backfill-condition-0.6.md`; three backfilled ids listed in `c2-backfill-ids.txt` — E1.
- Module keys for C5/C8 already recorded in `CONTRACTS.md` Routes table with Wave 3 reasons — E1.
- Owner script: `evidence/W3/ACCEPTANCE.md`. Self-check: `verify/W3-selfcheck.md`.

## Migrations applied (in order)

- `20260921220000_560_work_item_events.sql` — Wave 1
- `20260921220100_561_purchases_require_supplier.sql` — Wave 1
- `20260921220200_562_work_items_completed_at_closed.sql` — Wave 1
- `20260921230000_563_user_caller_id_settings_display.sql` — Wave 2 — revert: `revert/563_user_caller_id_settings_display.sql`
- `20260921230100_564_sales_interactions_deal_id.sql` — Wave 2 — revert: `revert/564_sales_interactions_deal_id.sql`
- `20260922040000_565_sales_interactions_responsible_required.sql` — C2 responsible — revert: `revert/565_sales_interactions_responsible_required.sql`
- `20260922040100_566_sales_interactions_won_lost_at.sql` — C7 won_lost_at — revert: `revert/566_sales_interactions_won_lost_at.sql`
- `20260922040200_567_deal_lost_reasons.sql` — C8 deal_lost_reasons — revert: `revert/567_deal_lost_reasons.sql`
- `20260922040300_568_sales_interaction_items.sql` — C6 items — revert: `revert/568_sales_interaction_items.sql`
- `20260922040400_569_sales_quotes_interaction_id.sql` — C9 quotes.interaction_id — revert: `revert/569_sales_quotes_interaction_id.sql`
- `20260922040500_570_sales_interaction_assigned_title.sql` — C4 notify title — revert: `revert/570_sales_interaction_assigned_title.sql`
- `20260922040600_571_role_permissions_salesdesk_w3.sql` — C5/C8 role_permissions — revert: `revert/571_role_permissions_salesdesk_w3.sql`

## Decisions taken without the owner

- (prior waves retained) Cherry-pick aa63de1c keep HEAD; history.ts `assignee_id`→مسئول; W2 B2 medium TOCTOU residual.
- Wave 3 C2: after critic REJECT for missing zod, FE added `createDealInteractionSchema` (`c4bcafe9`) rather than owner waiver — matches EXECUTION §5 C2 UI+zod+trigger — `critic-c2-rereview.md`.
- Wave 3 OPS used existing W1 playwright smoke on redeploy (`playwright-smoke-a2.txt`); full §9 Wave 3 browser script left to owner `ACCEPTANCE.md` — same pattern as W2-OPS.
- Wave 4 D1 (573): keep `deal_id` from 564 (no new FK). Map call/note → `activity_type_id` without changing `kind`; leave request NULL. Copy legacy `next_follow_up_at` → `due_at`/`original_due_at` with `due_has_time=true` when due was null — evidence `evidence/W4/d1-verify.txt`.

## Blockers

- None for Wave 3 close.
- Residual (non-blocking): B2 medium TOCTOU from Wave 2; critic note that e2e `sales-desk-9.spec.ts` still expects old «ثبت درخواست» / null salesperson (`critic.md` یافته‌ها); owner cold-browser ACCEPTANCE not yet run; some W3 critic probe files were untracked in worktree at DOC time ([D-1] — not committed by W3-DOC).

## چه چیزی تأیید نشد

- اجرای دستی کامل اسکریپت §9 توسط مالک روی UI سرد.
- اعلان واقعی در زنگوله UI (رشته عنوان در تعریف تابع DB تأیید شد — `critic.md` / `critic-db-probe.txt`).
- RPC `search_product_ids('287')` با `auth.uid()` واقعی (سرویس‌نقش unauthenticated؛ استنتاج از ILIKE + ردیف محصول — `critic.md`).
- Commit شدن همهٔ artifactهای untracked منتقد توسط W3-CRITIC (در زمان نوشتن این HANDOFF در `git status` به‌صورت `??` بودند).

## ریسک‌های باقی‌مانده

- E2E کهنه ممکن است CI را برای رشته‌های C1/C2 بشکند اگر suite اجرا شود — `critic.md`.
- C9: لینک quote در UPDATE دوم پس از create — اگر patch شکست بخورد draft بدون `interaction_id` می‌ماند — `critic.md` Low.
- فایل‌های شواهد critic اگر untracked بمانند، clone تازه به حکم critic دسترسی ندارد تا W3-CRITIC آن‌ها را commit کند.

## دقیقاً چه چیزی باید بازبینی شود

1. `verify/W3-selfcheck.md` — آیا هر ردیف C1–C9 یک check + refutation با مسیر دارد؟
2. `evidence/W3/ACCEPTANCE.md` — آیا متن §9 عیناً آمده و چک‌لیست مالک کامل است؟
3. جدول Migrations این HANDOFF تا 571 و اشارهٔ revertها.
4. تطبیق `APP_GIT_SHA` زنده با `42392d3f`.
5. اقدام بعدی: فقط Wave 4 **D2** (نه شروع موازی سایر Dها مگر orchestrator بگوید).

## Next action

- Wave 4 **D2** — `sales_activity_types` seeded with Didar’s 17 types plus «یادداشت ساده» (§6), round-trip verified (`EXECUTION-PROMPT.md` §5 Wave 4 D2).
