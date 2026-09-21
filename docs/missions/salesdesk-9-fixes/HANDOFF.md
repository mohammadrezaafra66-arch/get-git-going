# HANDOFF — salesdesk-9-fixes
Updated: 2026-09-21T21:59:00Z · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ dcf18a3ad185bca73b9842bbf67c652c1481aa1f · Base: feature/sales-desk @ c1ea61a1
Current: Wave 2 done · 3100 runs: 8a8b61e3 (healthy)

## Rows
| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1–A6 | Wave 1 | — | DONE | `evidence/W1/ACCEPTANCE.md`; HANDOFF prior; migrations 560–562 |
| B1 | N1, N2 | FIX | DONE | `b1-hook-probe.md`, `b1-group-real.json`, `orch-unit-tsx.txt`, `fe-report.md` |
| B2 | N1 | EXTEND | DONE (code; live 4-tab owner) | `caller-broadcast.ts`, `fe-report.md`; self-check live FAIL — `verify/W2-selfcheck.md` |
| B3 | N3 | EXTEND | DONE | `orch-db-verify.txt`, `_app.settings.caller-id.tsx:139-169`, `orch-unit-tsx.txt` |
| B4 | N4, N5 | FIX+BUILD | DONE (code; live draft owner) | `call-drafts.ts`, `CallerInboundPopup.tsx` openCalls; self-check live FAIL |
| B5 | N6 | CONNECT | DONE (schema+code; live deal link owner) | migration 564 + `interactions.ts` linkSalesInteractionDeal; `CallNoteForm.tsx:237` |
| C1–C… | Wave 3 | — | TODO | Next: start C1 |
| D… | Wave 4 | — | TODO | |

## Confirmed facts
- Worktree branch is `feature/salesdesk-9-fixes`; DOC commit HEAD is `dcf18a3ad185bca73b9842bbf67c652c1481aa1f` (`git rev-parse HEAD` at docs close) — E3.
- Base commit `feature/sales-desk` @ `c1ea61a1` appears in `git log` as parent of mission branch history — E3.
- Container `afrakala-lan-web`: `APP_GIT_SHA=8a8b61e3`, health `healthy`; `GET http://192.168.170.8:3100/` → HTTP 200 (DOC re-probe 2026-09-21T21:56:48Z) — E3.
- Compose safety: only `web` context differs; verdict SAFE — `evidence/W2/compose-safety.txt` — E2.
- Migrations 563 (`20260921230000`) and 564 (`20260921230100`) applied; columns+CHECK+FK verified — `applied-*.txt`, `orch-db-verify.txt` — E3.
- Unit Caller ID: 16 pass / 0 fail — `orch-unit-tsx.txt` / `fe-unit-tests.txt` — E3.
- B1 live hook: 2 ring rows → 1 card key with extensions 403+412 — `b1-group-real.json` `"pass": true` — E4.
- Persian settings labels match §6 exactly in UI source — `_app.settings.caller-id.tsx:139-169` — E2.
- Owner acceptance script written — `evidence/W2/ACCEPTANCE.md` (from §9 Wave 2 text).
- Fresh-eyes self-check written — `verify/W2-selfcheck.md` (PARTIAL overall).

## Migrations applied (in order)
- `20260921220000_560_work_item_events.sql` — Wave 1 — revert: (W1 paths under mission revert / prior HANDOFF)
- `20260921220100_561_purchases_require_supplier.sql` — Wave 1
- `20260921220200_562_work_items_completed_at_closed.sql` — Wave 1
- `20260921230000_563_user_caller_id_settings_display.sql` — commit `f12bb8c8` — revert: `docs/missions/salesdesk-9-fixes/revert/563_user_caller_id_settings_display.sql`
- `20260921230100_564_sales_interactions_deal_id.sql` — commit `f12bb8c8` — revert: `docs/missions/salesdesk-9-fixes/revert/564_sales_interactions_deal_id.sql`

## Decisions taken without the owner
- Cherry-pick aa63de1c: on conflict keep HEAD (ours) — RTL hunks would regress PersianFollowUpFields / card popup; non-conflict RTL files from that commit applied where clean. (carried from prior HANDOFF)
- history.ts: map field assignee_id to مسئول (migration 560 writes assignee_id). (carried from prior HANDOFF)
- W2-OPS deferred Playwright wave acceptance automation; owner script + unit/hook evidence used instead — `evidence/W2/registry/W2-OPS/checkpoint.md`.

## Blockers
- None hard-stopping Wave 2 deploy. Residual: no recorded browser proof for B2 four-tab, B4 draft round-trip, or B5 live `deal_id` write — see `verify/W2-selfcheck.md` FAIL rows; closed for wave progress with owner `ACCEPTANCE.md` remaining.

## Next action
- Wave 3 start C1 — rename UI «ثبت درخواست» → «افزودن معامله» across sales desk and popup; list every changed string before → after (`EXECUTION-PROMPT.md` §5 Wave 3 C1).
