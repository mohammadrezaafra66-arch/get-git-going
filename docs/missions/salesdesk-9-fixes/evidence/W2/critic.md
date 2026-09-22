# W2 Critic — independent review (dev-code-critic)

Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
Branch: `feature/salesdesk-9-fixes`  
HEAD at review start: `264276e08cc9f350ca4800c80cd4f28a2f9c5e1f`  
HEAD at review end: `dcf18a3ad185bca73b9842bbf67c652c1481aa1f` (docs-only; another agent — **not this critic**; `git diff d9734cb8..HEAD -- src/` empty)  
Product of interest: `8a8b61e3` (feat commit `d9734cb8`)  
Date: 2026-09-22

Builder claims were **not** used as evidence. Criteria taken from action plan B1–B5 only.

## Criteria (from action plan, pre-builder)

| ID | Must hold |
|----|-----------|
| B1 | One UI card per call; group linkedid → uniqueid → phone+minute; list extensions; storage still one-row-per-extension |
| B2 | BroadcastChannel cross-tab open/dismiss; no duplicate sound |
| B3 | display_seconds default 15, range 5–120; only_my_extension; only_my_customers; exact Persian labels; keep existing options |
| B4 | Draft per call keyed by B1 key; localStorage 24h; clear on save; switching cards never discards form; active-call switcher |
| B5 | «افزودن معامله» in call-note → deal form prefilled with caller person; note draft survives; link via sales_interactions.deal_id |
| X | Extend existing Caller ID stack only; typecheck ≤74; no touch `D:\AfraKalaTest\app`; no prod SSH |

## Per-row judgment

| Row | Verdict | Evidence |
|-----|---------|----------|
| **B1** | **CONFIRM** | E1/E2: `call-card-key.ts:86–97` priority; `groupCallsByCardKey` extensions `136–142`; wired in `CallerInboundPopup.tsx:254`. Storage: `recent-calls.ts` still maps one `ring:` row per event (`82–102`); grouping is app-layer only. E3: unit suite 16 pass / 0 fail (`critic-unit.txt`, exit 0). |
| **B2** | **CONFIRM** (with medium finding) | E1/E2: channel `afrakala-caller-id`, open/dismiss/claim in `caller-broadcast.ts` + `CallerInboundPopup.tsx:209–227,353–381`. No `Audio`/`play` in popup (grep) — duplicate *sound* N/A. E3 race probe: two tabs both pass `shouldPresentCallCard` before local mark → `bothClaimBeforeMark:true` (`critic-bc-race-probe.txt`). Claim reduces but does not eliminate dual presentation. |
| **B3** | **CONFIRM** | E1/E2: defaults `caller-id-settings.ts:23–31`; clamp `40–48`; UI labels match CONTRACTS (`_app.settings.caller-id.tsx:138–176`); existing enabled/show_* kept. Migration `563` DEFAULT 15 + CHECK 5–120. E3: filter unit tests pass (`critic-unit.txt`). |
| **B4** | **REJECT** | E1/E2: drafts keyed by B1 key (`call-drafts.ts`, TTL 24h); clear on save `CallNoteForm.tsx:160`; switcher `CallerInboundPopup.tsx:508–530`. **Bug:** `CallNoteForm` has **no** `key={draftKey}` remount (`CallerInboundPopup.tsx:634–666`); reload+persist effects (`CallNoteForm.tsx:86–132`) run same commit with stale body under new key. E3 probe: `{"afterB":"BODY-A","corrupted":true}` / `PROBE_DRAFT_SWITCH_CORRUPT=CONFIRMED` (`critic-draft-switch-probe.txt`, exit 0). Switching active cards can **overwrite** the target draft — violates “never discards form”. |
| **B5** | **REJECT** | E1/E2: button «افزودن معامله» `CallNoteForm.tsx:235–238`; deal form prefilled `CallerInboundPopup.tsx:598–603`; draft keeps `dealId` `605–614`. Link path: `createSalesInteraction` → `linkSalesInteractionDeal` (`interactions.ts:62–89`). **Bug:** soft-fail `/deal_id\|column/i` also matches FK errors → silent unlink. E3: `FK_ERROR_SOFT_HIDDEN=YES` (`critic-dealid-softfail-probe.txt`). User sees toast success while `deal_id` may be null. |
| **X typecheck** | **CONFIRM** | E3: `npx tsc --noEmit` → exit 2, **74** `error TS` lines (`critic-tsc.txt` footer `ERROR_LINES=74`) — ≤74. |
| **X parallel stack** | **CONFIRM** | Single `CallerInboundPopup` / `CallerInboundListener` in `AppShell`; helpers under `src/lib/calls/*` are not a second UI stack. |

## Falsification attempts

| Attempt | Result |
|---------|--------|
| Two ring rows same linkedid → one group | Unit pass (B1) |
| Filter defaults break inbound | Unit: defaults keep inbound+own outbound |
| Draft switch with content on both keys | **Corruption confirmed** (B4) |
| soft-fail only for missing column | **Also hides FK** (B5) |
| Concurrent shouldPresent before mark | **Both true** (B2 race) |
| Sound duplicate | No sound implementation to exercise |
| Parallel Caller ID component | Not found |

## Execution (E3)

```
npx tsx --test src/lib/calls/call-card-key.test.ts src/lib/calls/filter-calls-for-caller-id.test.ts
→ exit 0; tests 16; pass 16; fail 0
(see critic-unit.txt)

npx tsc --noEmit
→ exit 2; ERROR_LINES=74
(see critic-tsc.txt)

tsx critic-draft-switch-probe.mjs → exit 0; PROBE_DRAFT_SWITCH_CORRUPT=CONFIRMED
node soft-fail probe → FK_ERROR_SOFT_HIDDEN=YES
tsx shouldPresent race → bothClaimBeforeMark:true
```

## Findings (acceptance blockers)

1. **High — B4 draft overwrite on card switch** — `CallNoteForm.tsx:86–132` + missing remount `key` at popup `:634`. Failure: draft for call B replaced by in-memory text from call A.
2. **High — B5 deal_id soft-fail too broad** — `interactions.ts:84`. Failure: invalid/foreign `dealId` or constraint errors swallowed; note saved without link; UI still success.
3. **Medium — B2 claim TOCTOU** — two tabs can both present before BC message arrives (`shouldPresentCallCard` probe).

## Out of scope / not verified here

- Live AMI two-extension browser card (unit+grouping only; no cold browser session this review).
- Migration 563/564 applied on any live DB (SQL files reviewed; no SSH).
- Did not touch `D:\AfraKalaTest\app`.

## Overall: **REJECT**

B1 and B3 hold under measurement. B4 and B5 fail acceptance criteria with reproduced probes. Fix B4 remount/`key` (or persist-before-switch / skip persist when draftKey just changed) and narrow B5 soft-fail to missing-column only before re-review.
