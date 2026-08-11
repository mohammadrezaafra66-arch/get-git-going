# M5 — PRODUCT VIDEO CHAIN AND FINAL REPORT

Read `docs/execution/ASAN_MISSION_CONTROL.md` first and obey every rule in it, including
section 1 on execution pace.

Read `docs/asan/research-asan-bridge.md`, section R6 especially — the design decisions here
come from that research, not from guesses.

---

## Phase 5.1 — Product video chain

### The flow I want
A TV is sold → a video is required → a task is created → someone records and uploads it →
the salesperson is informed → it is sent to the customer → the fact that it was sent is
recorded.

### Confirmed decisions
- Videos go to the existing **`delivery-receipts`** bucket. Do not create a new bucket.
- Migration 276 already built `mandatory_category_services` and attaches mandatory services
  to products in `categories.slug='tv'`. **Extend that model.** Do not build a parallel one.
- Tasks are ordinary rows in the existing `tasks` table. Migrations 277 and 278 built the
  generation and completion machinery. **Extend it.** Building a second task system is
  explicitly forbidden — that mistake has already been made on this project.

### Decisions delegated to you, guided by R6
- **Who uploads.** R6 measured which roles actually produce delivery receipts today. Use that
  evidence. Assign the task to the role that already owns the physical delivery step. If
  genuinely ambiguous, choose the delivery-receipt owner and record the reasoning.
- **Which categories.** R6 reports whether `mandatory_category_services` generalizes beyond
  `slug='tv'`. Prefer the design that will not need reopening: drive the requirement from the
  mandatory-service configuration rather than hardcoding the TV slug, so adding a second
  category later is a data change, not a code change.
- **Notification channel.** R6 enumerated the existing mechanisms. Pick one and reuse it. Do
  not add a fourth parallel notification system — the project already has
  `notification_queue`, `notification_events`, and `dashboard_ticker_events` competing.

### Chain integrity
The chain must be observable end to end. At any moment I should be able to ask "which sold
TVs are still waiting for a video?" and get an answer from one query. That means each stage
transition is **recorded**, not inferred.

Stages: required → task created → video uploaded → salesperson notified → sent to customer →
confirmed sent.

Per rule 2.5, enforce transitions in a **trigger**, not only in an RPC, because a direct
PostgREST `PATCH` bypasses RPC-only rules. Remember the double-tick bug fixed in migration
278: writing a status over itself is not a transition — guard with
`IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW`.

### Video upload specifics
- Confirm the `delivery-receipts` bucket accepts video MIME types. Migration 263 fixed a bug
  where videos were silently rejected; verify current state before relying on it.
- Reuse `src/lib/storage/upload-with-progress.ts` and `CameraCaptureButton` — both exist and
  handle progress, retry, compression, and EXIF rotation.
- Videos are large. Check the bucket's size limit and, if it is too small for a short phone
  video, raise it in a migration and say by how much and why.

### Phase test
- Create a sales quote containing a TV-category product; assert a video task appears in the
  correct queue for the correct role.
- A quote with no TV product creates no video task.
- Upload a video; the stage advances and the salesperson notification is emitted.
- A direct PostgREST `PATCH` that skips a stage is rejected by the trigger.
- Double-ticking a completed stage returns success without creating a duplicate event.
- The "waiting for video" query returns the expected set.
- Remove every test row and uploaded object (rule 2.10).

**Commit before continuing.**

---

## Phase 5.2 — Full program verification

Run the complete verification pass across everything M1 through M5 built. Take this slowly;
it is the last chance to catch anything.

1. `npm run typecheck` → exactly 70.
2. Full e2e suite. Compare to baseline 155 green / 6 red / 4 skip. Enumerate every red and
   classify it `documented baseline`, `known flaky`, or `new`. **Zero new reds is the gate.**
3. Confirm every new module has explicit `role_permissions` rows for every role. Walk the
   list and prove it with a query; do not assert from memory.
4. Run the RLS verification pass with real JWTs for `viewer`, `sales`, `accountant`, `admin`
   against every table this program created. **Count rows**; never trust status codes.
5. Confirm zero test data survives in the live database. Query for the fixtures each phase
   created and assert they are gone.
6. Confirm the working tree is clean and `APP_GIT_SHA` equals `HEAD` on the deployed
   container.
7. Re-run the corrupted-label scan from M1.1 and confirm buckets A and B are still empty —
   proving nothing this program wrote re-corrupted Persian text.
8. Export one document of each of the five types end to end and open each file with openpyxl,
   asserting the header rows still match `docs/asan/asan-layouts.md` exactly. This is the
   final proof that the deliverable actually works.

---

## Phase 5.3 — Final report

Write `docs/execution/asan-final-report.md`.

**1. What was delivered.** Per mission, per phase: what was built, the commit SHA, the
one-line verification result.

**2. Database changes.** Every migration number with its subject, and confirmation that each
has a matching down script in `docs/verification/`.

**3. Decisions I made autonomously.** For each: the decision, the alternatives rejected, and
why. This is the section I read most carefully — do not compress it.

**4. What needs my verification against live Asan.** The full contents of
`docs/asan/UNVERIFIED-LAYOUTS.md` restated here, with the exact screenshot or answer needed
for each. Also state which exports are already verified and safe to use today.

**5. What I must supply.** Everything blocked on my input:
- bucket C corrupted labels from `docs/asan/corrupted-labels-scan.md`
- the real Bank Mellat accounting code replacing `TEMP-CHANGE-ME`, and the real title for
  account "12"
- the two person matches from Phase 4 that I verify myself
- phone collisions in the review queue
- import conflicts in the review queue
- the currency unit, if R8 could not determine what Asan expects
- anything else

**6. Model gaps.** Anything the current data model cannot represent that the requirements
implied — particularly the third-party (دوبل) case from R5, if it turned out unrepresentable.

**7. Coverage numbers.** How many persons have an Asan code, how many products have one, how
many documents are exportable today versus blocked, and what is blocking them. Give me the
numbers that tell me how much manual data entry this actually eliminates.

**8. Baseline state.** Final typecheck count, final e2e totals, and the delta from the
starting baseline.

---

## MISSION GATE — END OF PROGRAM

1. All of Phase 5.2 passes.
2. `docs/execution/asan-final-report.md` is written.
3. Everything committed, tree clean, deployed, all three signals matching.
4. `docs/execution/asan-progress.md` shows every phase complete.
5. **Stop and show me the final report.** This is the one place in the entire program where
   you hand control back to me.
