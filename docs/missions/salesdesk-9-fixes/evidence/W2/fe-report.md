# W2-FE report — Caller ID B1–B5

**Agent:** frontend-engineer  
**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**Branch:** `feature/salesdesk-9-fixes`  
**Baseline HEAD:** `00e4a6c027caf3b840eb6b9e43139540242782d0`  
**Typecheck:** 74 → 74 (≤74 baseline held) — E3

---

## چه تغییر کرد

### B1 — one card per call (DONE, E4 unit)
- NEW `src/lib/calls/call-card-key.ts` — `getCallCardKey` / `groupCallsByCardKey` (linkedid → uniqueid → phone+minute).
- `recent-calls.ts` selects `linkedid, uniqueid` and mirrors into `metadata`.
- `CallerInboundPopup.tsx` groups filtered rows; card shows `داخلی: …`.

**E2 probe expectation (unit):** two ring rows same `linkedid` → one group with extensions `["401","412"]` — see `call-card-key.test.ts`.

**Live hook (manual):** POST AMI ring twice with same `linkedid`, different extension → one toast (was two before).

### B2 — BroadcastChannel (DONE, E1)
- NEW `src/lib/calls/caller-broadcast.ts` — channel `afrakala-caller-id`.
- Popup claims/shows/dismisses/opens across tabs; follower tabs skip toast for claimed keys.

### B3 — settings (DONE, E1/E2)
- `caller-id-settings.ts`: `display_seconds` (default 15, clamp 5–120), `only_my_extension`, `only_my_customers`; soft-fallback if migration 563 missing.
- Settings page Persian labels exact:
  - «مدت زمان نمایش پنجره تماس (ثانیه)»
  - «فقط تماس‌های داخلی خودم»
  - «فقط تماس‌های مربوط به خودم»
- TTL: `callerIdCardTtlMs(settings)` replaces hardcoded `CARD_TTL_MS = 5000`.
- Filter: `only_my_extension` + `passesOnlyMyCustomers` after resolve.

### B4 — draft per call (DONE, E1)
- NEW `src/lib/calls/call-drafts.ts` — localStorage key `afrakala-call-note-drafts-v1`, 24h TTL, clear on save.
- Popup keeps `openCalls` map + switcher; switching cards does not discard drafts.
- `CallNoteForm` accepts `draftKey` and persists while typing.

### B5 — افزودن معامله (DONE, E1; deal_id write PARTIAL until 564)
- Call-note path button «افزودن معامله» embeds `QuickRequestForm` (person prefilled); note draft survives.
- On deal create success, `dealId` stored in draft + context.
- `createSalesInteraction({ dealId })` → `linkSalesInteractionDeal` UPDATE after RPC create.
- Soft-no-op if `deal_id` column absent (W2-M owns migration 564).
- Global «ثبت درخواست» label unchanged (Wave 3 C1).

---

## الگوی موجود

Extended existing `CallerInboundPopup` / filter / settings / CallNoteForm / QuickRequestForm — no parallel Caller ID stack.

## شکل داده

- Ring: `call_ring_events.linkedid` / `uniqueid` (E1: `ingest-ami-ring.server.ts` insert row).
- Settings: `user_caller_id_settings` + new cols (CONTRACTS § user_caller_id_settings).
- Link: `sales_interactions.deal_id` self-FK (CONTRACTS).

## baseline قبل

```
git rev-parse HEAD → 00e4a6c027caf3b840eb6b9e43139540242782d0
git status --porcelain → untracked evidence/W1 + W2 only (not ours to stage as product)
tsc error_count=74 (fe-tsc-baseline.txt) EXIT=2
```

## نتیجه‌ی build بعد (E3)

```
tsc error_count=74 (fe-tsc-after.txt) EXIT=2
unit: 16 pass, 0 fail (fe-unit-tests.txt) EXIT=0
```

## اثبات رفتار جدید (E4)

**Before (code):** card key = `call.id` (`ring:uuid`) → duplicate per extension; `CARD_TTL_MS = 5000`.  
**After (unit):** `groupCallsByCardKey` two rows `linkedid=AMI-LINK-99` → `groups.length === 1`.

## حالت‌های پوشش‌داده‌شده

| Surface | loading | empty | error | success |
|---------|---------|-------|-------|---------|
| Settings | query loading text | defaults | toast on save error | upsert |
| Popup cards | poll gated on settings | no cards | resolve catch silent | toast + sheet |
| Call note | — | empty body blocks | toast | clear draft |

## چه چیزی تأیید نشد

- Live two-extension AMI hook on staging/prod (no ssh/prod; unit instead).
- End-to-end `deal_id` column write until W2-M applies 564.
- Cross-tab BroadcastChannel manual browser check.

## توصیه‌های خارج از دامنه

- Sound play still absent (B2 elects primary for future sound).
- Consider Realtime instead of 1s poll (existing N1 research).

## حکم

**COMPLETE** for FE rows B1–B5 code+unit; **PARTIAL** live deal_id / AMI probe pending migrations + ops.
