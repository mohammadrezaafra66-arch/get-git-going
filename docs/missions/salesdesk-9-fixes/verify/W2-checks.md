# Wave 2 checks — derived from EXECUTION-PROMPT §3, §4, §5, §6 (before reading builder reports)

## B1 — one card per call
- **Promised:** UI groups by `linkedid` (fallback `uniqueid`, then normalized phone + minute) across ring and CDR; card lists ringing extensions; per-extension rows in `call_ring_events` untouched.
- **Probe:** Inspect grouping code path; SQL: two ring rows same `linkedid` different extensions still two DB rows. Prefer synthetic hook if safe; else static analysis + existing multi-extension rings.
- **Refutation:** Two cards still appear for same `linkedid` in UI; OR unique index / storage changed to one-row-per-call (forbidden); OR Issabel hook contract changed.

## B2 — cross-tab sync
- **Promised:** `BroadcastChannel` syncs open/dismiss across tabs; no duplicate sound/notification.
- **Probe:** Code contains BroadcastChannel for caller popup; two-tab Playwright or manual: dismiss in tab A → gone in tab B.
- **Refutation:** No BroadcastChannel; OR dismiss in one tab leaves card in the other; OR two sounds on one ring.

## B3 — display_seconds and filter options
- **Promised:** `display_seconds` default 15, CHECK 5–120; labels «مدت زمان نمایش پنجره تماس (ثانیه)», «فقط تماس‌های داخلی خودم», «فقط تماس‌های مربوط به خودم»; old options preserved.
- **Probe:** Schema columns + CHECK; settings page exact Persian labels; rolled-back insert with `display_seconds=3` fails, `15` ok.
- **Refutation:** Default still 5 s hardcoded; label bytes wrong; CHECK missing; old toggles removed.

## B4 — draft per call + switcher
- **Promised:** Draft keyed by B1 call key in `localStorage`, 24h expiry, cleared on save; opening another card does not discard open form; active-call switcher.
- **Probe:** Code inspection for localStorage key/expiry; UI: two cards, edit A, switch to B, return to A — draft intact.
- **Refutation:** Switching cards clears form; OR no switcher; OR drafts share one key; OR no 24h expiry.

## B5 — add deal from call note
- **Promised:** «افزودن معامله» in call-note form opens deal form with caller person prefilled; note draft survives; note links via `sales_interactions.deal_id`.
- **Probe:** UI label exact bytes; create marked deal from call note; SQL join note→deal_id; draft still present.
- **Refutation:** Label still «ثبت درخواست»; person not prefilled; `deal_id` null after save; draft lost.

## Scope (Wave 2)
- Must not change Issabel hook contract or one-row-per-extension storage; no scoring/pricing edits.
