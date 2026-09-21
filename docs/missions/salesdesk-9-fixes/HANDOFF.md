# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T22:36:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ b7caf303 · Base: feature/sales-desk @ c1ea61a1
Current: Wave 2 done · 3100 runs: e7446bb2 (healthy)

## Rows
| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1–A6 | Wave 1 | — | DONE | `evidence/W1/ACCEPTANCE.md`; migrations 560–562 |
| B1 | N1, N2 | FIX | DONE | Hook probe E4 — `b1-hook-probe.md`, `b1-group-real.json`; critic CONFIRM — `critic.md` |
| B2 | N1 | EXTEND | DONE (CONFIRM; medium TOCTOU noted) | `critic.md` CONFIRM + `critic-bc-race-probe.txt` (`bothClaimBeforeMark:true`) |
| B3 | N3 | EXTEND | DONE | `critic.md` CONFIRM; `orch-db-verify.txt`; settings labels §6 |
| B4 | N4, N5 | FIX+BUILD | DONE after fix (critic CONFIRM) | Fix `b1cc9a88`; re-review `critic-rereview.md`; probe `critic-rereview-b4-probe.txt` `PROBE_B4_FIX=PASS` |
| B5 | N6 | CONNECT | DONE after fix (critic CONFIRM) | Fix `b1cc9a88`; `critic-rereview.md`; `critic-rereview-b5-probe.txt` `PROBE_B5_FIX=PASS` |
| C1–C… | Wave 3 | — | TODO | Next: start C1 |
| D… | Wave 4 | — | TODO | |

## Confirmed facts
- Branch is `feature/salesdesk-9-fixes`; worktree HEAD at docs close commit: see tip after push (`docs(missions): بستن موج ۲`) — product fix remains `b1cc9a88`; prior tip before this docs commit was `b2b1a42e` — E3.
- Product fix for B4/B5 is commit `b1cc9a884b1265ead48483979c2f3a9a53827889` (`git log`: `fix(sales-desk): رفع overwrite پیش‌نویس B4 و soft-fail پهن B5`) — E3.
- Deploy docs tip includes `e7446bb2` (`docs(missions): به‌روزرسانی run.json پس از fix B4/B5`) — E3.
- Container `afrakala-lan-web`: `APP_GIT_SHA=e7446bb2`, health `healthy` (DOC `docker exec` / `docker inspect` 2026-09-21T22:34:59Z) — E3.
- Base: `feature/sales-desk` @ `c1ea61a1` — E3 (`git log`).
- Typecheck budget held at 74 — `critic-tsc.txt` `ERROR_LINES=74`; FE baseline also 74 — E3.
- Migrations 563 (`20260921230000` caller settings) and 564 (`20260921230100` deal_id) applied — `applied-20260921230000_563.txt`, `applied-20260921230100_564.txt`, `orch-db-verify.txt` — E3.
- Revert scripts exist: `docs/missions/salesdesk-9-fixes/revert/563_user_caller_id_settings_display.sql`, `revert/564_sales_interactions_deal_id.sql` — E1.
- B1: two mapped extensions same `linkedid` → one card key — `b1-group-real.json` `"pass": true` (E4).
- B2: critic CONFIRM with medium TOCTOU (dual claim before mark) — `critic.md`; residual risk not a hard blocker per orchestrator close — E2.
- B4 after fix: draft switch `corrupted=false`, `PROBE_B4_FIX=PASS` — `critic-rereview-b4-probe.txt` / `orch-b4-reprobe.txt`; critic **CONFIRM** — `critic-rereview.md` — E3.
- B5 after fix: `FK_ERROR_SOFT_HIDDEN=NO`, `PROBE_B5_FIX=PASS` — `critic-rereview-b5-probe.txt` / `orch-b5-reprobe.txt`; critic **CONFIRM** — `critic-rereview.md` — E3.
- Owner script: `evidence/W2/ACCEPTANCE.md`. Self-check updated: `verify/W2-selfcheck.md`.

## Migrations applied (in order)
- `20260921220000_560_work_item_events.sql` — Wave 1
- `20260921220100_561_purchases_require_supplier.sql` — Wave 1
- `20260921220200_562_work_items_completed_at_closed.sql` — Wave 1
- `20260921230000_563_user_caller_id_settings_display.sql` — commit `f12bb8c8` — revert: `docs/missions/salesdesk-9-fixes/revert/563_user_caller_id_settings_display.sql`
- `20260921230100_564_sales_interactions_deal_id.sql` — commit `f12bb8c8` — revert: `docs/missions/salesdesk-9-fixes/revert/564_sales_interactions_deal_id.sql`

## Decisions taken without the owner
- Cherry-pick aa63de1c: on conflict keep HEAD (ours) — RTL hunks would regress PersianFollowUpFields / card popup. (prior HANDOFF)
- history.ts: map field `assignee_id` to مسئول (migration 560). (prior HANDOFF)
- W2-OPS deferred Playwright wave automation; owner `ACCEPTANCE.md` + unit/hook/critic probes used — `registry/W2-OPS/checkpoint.md`.
- Wave 2 closed with B2 medium TOCTOU residual (claim race) recorded, not blocking — orchestrator + `critic.md`.

## Blockers
- None for Wave 2 close. Residual: B2 medium TOCTOU (`bothClaimBeforeMark:true` in `critic-bc-race-probe.txt`); full cold-browser ACCEPTANCE still owner-run — `ACCEPTANCE.md`.

## Next action
- Wave 3 start C1 — rename UI «ثبت درخواست» → «افزودن معامله» across sales desk and popup; list every changed string before → after (`EXECUTION-PROMPT.md` §5 Wave 3 C1).
