# FIX — Sales desk nine fixes: close the verifier's gaps · UNATTENDED

- Target: a **fresh** Cursor chat, Agent mode, Auto-review. **The owner is not present:** never ask questions, never wait for approval; stop only on a hard stop (`EXECUTION-PROMPT.md` §10).
- Work root: the worktree `D:\AfraKalaTest\wt-salesdesk-9-fixes`, branch `feature/salesdesk-9-fixes` (HEAD `983e47a3` when this was written; 3100 runs `0c6eeb08`, docs-only difference). Start every terminal command with `Set-Location D:\AfraKalaTest\wt-salesdesk-9-fixes`.
- Save this prompt verbatim to `docs/missions/salesdesk-9-fixes/FIX-PROMPT.md`. Progress: `docs/missions/salesdesk-9-fixes/FIX-HANDOFF.md`. Evidence: `docs/missions/salesdesk-9-fixes/evidence/FIX/`.
- **Resume rule:** if `FIX-HANDOFF.md` exists, read it and this prompt and continue from the first incomplete item.
- **Every rule of `docs/missions/salesdesk-9-fixes/EXECUTION-PROMPT.md` still applies** — read its §3, §4, §6, §7, §8 and §10 before starting. In particular: nothing on production, no `ssh`, nothing changed in `D:\AfraKalaTest\app`, push only this branch, deploy only per §8.8, Persian SQL per §8.5, business rules in triggers, typecheck never above 74.
- Inputs: `verify/W1-VERDICT.md` … `verify/W4-VERDICT.md`, `HANDOFF.md`, `REPORT.md`.
- Test data: every row you create is marked (`[TEST-9FIX]` in titles or names, phones `09000000xxx`, call ids starting `TEST9FIX-`) and deleted at the end with `DELETE … WHERE <marker>`; finish by showing zero marker rows. Settings you change for test accounts are restored.

## Items — in this order

**F1 · D3 · FIX — verifier: REFUTED.** «Only the owner records a result» must hold in the database, not only in the UI. RLS policy `sales_interactions_update_staff` lets the author, the responsible and admins/managers update the row, so today a non-owner author can set `done_at` / `result_note` through the API.
- Migration (next free number) + revert script: a BEFORE UPDATE trigger on `sales_interactions` that raises ASCII code `ACTIVITY_OWNER_ONLY` when `done_at` or `result_note` changes (`IS DISTINCT FROM`) and `auth.uid()` is not `OLD.salesperson_id`. System context without a user (`auth.uid() IS NULL`) is exempt. No exemption for admins or managers — they reassign the activity to themselves first.
- UI maps the code to «فقط مسئول انجام این فعالیت می‌تواند نتیجه را ثبت کند».
- Evidence: inside `BEGIN … ROLLBACK`, simulate a PostgREST request (`SET LOCAL ROLE authenticated` plus the JWT claim setting your `auth.uid()` reads) for: (a) author who is not the owner sets a result → rejected; (b) owner sets a result → succeeds; (c) owner reverts to «انجام نشده» → succeeds; (d) non-owner author reverts → rejected. Then one real PATCH through Kong with a test account's JWT (author ≠ owner) → rejected and the row unchanged (count it).

**F2 · B2, B4, B5 — verifier: INDETERMINATE (live paths never run).** Playwright on 3100 with synthetic calls posted through the real hook `/api/public/hooks/issabel-ami-ring` (token read from `D:\AfraKalaTest\app\deploy\lan\.env.lan`, never printed). Enable inbound display for the test account first; restore afterwards.
- **B2:** two pages of one browser context; opening or dismissing a call in one updates the other; exactly one notification or sound for the call. If the TOCTOU residual recorded by the builder produces a duplicate, fix it.
- **B4:** call A arrives and is opened → type a draft → call B arrives and is opened → switch back to A → draft intact → save A → A's draft cleared.
- **B5:** a call → call-note form → «افزودن معامله» → save the deal → SQL shows the call-note row's `deal_id` equals the new deal.

**F3 · C9 (+ C5) — verifier: INDETERMINATE (no quote was ever created from a deal).**
- **C9:** a marked deal with a marked customer and one item, responsible = a different test user → «ایجاد پیش‌فاکتور» in the UI → assert: quote `status = 'draft'`; `salesperson_id` = the responsible; `sales_quotes.interaction_id` = the deal; the quote appears in the deal's «پیش‌فاکتورها» tab and shows its deal; the KPI query and the score query return the same values before and after.
- **C5:** a marked deal created for another user today → the report «معاملات ثبت‌شده برای دیگران» for (author, Tehran today) rises by exactly 1 and equals the SQL aggregate.

**F4 · D4, D5, D6 — verified only statically.** Seed marked activities for a test user: one overdue, one due today, one future, plus one marked deal with no activity.
- **D5:** icons on «کارهای من» and «میز فروش» are red, green, grey and yellow respectively; the filter «معاملاتی که فعالیتی روی آن‌ها نیست» shows the deal with no activity.
- **D4:** the red menu count equals `count_open_activities_due_today_or_overdue` with N > 0.
- **D6:** an activity with a time 2 minutes ahead and a reminder → after it is due, the bell shows the reminder (read time) and it is marked fired; «به تعویق انداختن» in the UI keeps `original_due_at`.

**F5 · A2, A5 — click paths not run.** Close then reopen a marked ticket through the UI (sections, «تاریخ بسته شدن», «بازگشایی»); quick-create a marked supplier inside the purchase form and save a marked purchase with it.

**F6 · Docs.** Fix `REPORT.md` Wave 2 lettering to match `EXECUTION-PROMPT.md` §5 (B1 grouping, B2 `BroadcastChannel`, B3 `display_seconds`); commit the untracked W1–W3 evidence under `docs/missions/salesdesk-9-fixes/`; add a section «Verifier findings and fixes» to `REPORT.md` with each verdict and its resolution.

If an item fails, fix the product code within that row's scope (§10 row-level rules apply: fix attempts, then revert the row's change and mark it BLOCKED with evidence). Never weaken a test to make it pass.

## Finish

1. Typecheck ≤ 74; schema diff limited to F1's trigger and any row-level fix.
2. Commit (explicit paths) → deploy per §8.8 so `APP_GIT_SHA` equals HEAD → run all F1–F5 specs on 3100 → zero marker rows left.
3. Push the branch.
4. `FIX-HANDOFF.md`: item · status · evidence path.
5. `REPORT.md` last line: `MISSION COMPLETE` only if F1–F5 all pass; otherwise `MISSION PARTIAL — <items>`.
6. Final chat line: `FIX DONE — <n>/5 passed — see REPORT.md`, or `HARD STOP — see FIX-HANDOFF.md`.
