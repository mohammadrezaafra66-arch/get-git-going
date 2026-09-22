# W2-VERDICT — independent verify (disconfirm)

Ground truth / typecheck / workbench: see W1-VERDICT (shared). Deployed product SHA `0c6eeb08`; HEAD `983e47a3` docs-only ahead.

Scope: `call_ring_events` unique index still `(linkedid, extension, direction)` — one-row-per-extension storage intact (`sql-probes.txt`). No Issabel hook / scoring / pricing product diffs.

---

## B1 — one card per call
- **Verdict: CONFIRMED**
- Probe: `groupCallsByCardKey` unit tests pass (two rings same `linkedid` → one card) — TAP in `verify/raw/unit-tests.txt`. Storage uniqueness unchanged. Popup lists `extensions` (`CallerInboundPopup.tsx`).
- Refutation: DB collapsed to one row per call — failed (unique index still per extension).
- Would change: grouping returning two cards for same linkedid in unit/UI, or unique index changed.

## B2 — cross-tab BroadcastChannel
- **Verdict: INDETERMINATE**
- Probe: `src/lib/calls/caller-broadcast.ts` implements `BroadcastChannel`; imported by popup.
- Refutation attempt: two-tab dismiss sync — **not executed** in this verify session.
- Would change: live two-tab Playwright showing dismiss/open sync (or failure). Builder notes residual medium TOCTOU — not independently re-proved.

## B3 — display_seconds + filter options
- **Verdict: CONFIRMED**
- Probe: columns `display_seconds` default 15, CHECK 5–120; `only_my_extension` / `only_my_customers`; old toggles present (`sql-probes.txt`). `display_seconds=3` fails CHECK; `15` OK (`sql-probes-2`). Settings UI exact labels «مدت زمان نمایش پنجره تماس (ثانیه)», «فقط تماس‌های داخلی خودم», «فقط تماس‌های مربوط به خودم» (`ui-labels.txt`). Filter unit tests for only_my_* pass.
- Refutation: hardcoded 5s default / missing labels — failed.
- Would change: CHECK missing or label byte mismatch.

## B4 — draft per call + switcher
- **Verdict: INDETERMINATE**
- Probe: `call-drafts.ts` has `CALL_DRAFT_TTL_MS = 24h`, localStorage keying; popup comments/code for switcher and multi-context drafts.
- Refutation: live two-card switch discarding draft — **not run** on 3100.
- Would change: live draft-switch Playwright pass/fail.

## B5 — add deal from call note
- **Verdict: INDETERMINATE**
- Probe: Call note form contains «افزودن معامله»; `deal_id` column exists on `sales_interactions`. Desk uses «افزودن معامله» (not «ثبت درخواست»).
- Refutation: full call→deal→`deal_id` link via popup — **not run** (no live ring).
- Would change: synthetic ring + deal create with `deal_id` set.

---

## Scope findings
Hook contract / one-row-per-extension storage preserved. No scoring/pricing edits.

## Builder vs observed
- REPORT.md **mis-labels Wave 2 rows**: it attributes display_seconds labels to **B2** and grouping to **B3**; EXECUTION-PROMPT §5 assigns grouping→**B1**, BroadcastChannel→**B2**, display_seconds→**B3**. Implementation matches the prompt, not the REPORT lettering.
- Builder: all B1–B5 DONE. Observed: B1/B3 CONFIRMED; B2/B4/B5 INDETERMINATE (live UI/hook paths not re-executed).
- No BLOCKED/SKIPPED claimed.

## Could not check
- Real Issabel/hook multi-extension card on 3100; two-tab sync; draft switcher E2E; B5 deal link from live call.

VERDICT: INDETERMINATE — B2, B4, B5
