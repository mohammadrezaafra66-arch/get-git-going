═══════════════════════════════════════════════════════════════════════════════
ASAN ACCOUNTING BRIDGE + IMPORT/EXPORT + THREE DEFERRED INVESTIGATIONS
AfraKala · Research-then-build · Never build in parallel with what exists
═══════════════════════════════════════════════════════════════════════════════

READ FIRST, IN THIS ORDER:
  PROGRESS.md
  CLAUDE.md · AGENTS.md
  docs/research/audit-220-226.md   (sections D3, D5, D6, D8, D9)
  docs/execution/p1-d8-progress.md (HANDOFF STATE — know where the other mission is)

RELATIONSHIP TO THE OTHER MISSION:
docs/execution/EXECUTION_P1_D8.md is a separate, in-flight mission (P1 security + D8 phases).
This document does NOT replace it. If both are open, finish the phase you are
inside, then pick up whichever the owner asks for. Do not interleave migrations
from the two documents inside a single transaction.

═══════════════════════════════════════════════════════════════════════════════
THE OWNER'S GOAL, IN ONE PARAGRAPH
═══════════════════════════════════════════════════════════════════════════════

The company already runs the "Asan" (آسان) accounting software. The accountant
currently retypes into Asan what the assistant already knows. The goal is to stop
the retyping in BOTH directions:

  INTO the assistant  — import people and products from Asan's Excel export, so
                        the existing 488 accounts and 7,256 products do not have
                        to be entered by hand.
  OUT OF the assistant — produce Excel files in Asan's exact import layout for
                        purchase invoices, sales invoices, double-entry
                        receipt/payment vouchers, bank receipts, and bank
                        payments, so the accountant imports instead of retypes.

The bridge only works if the IDENTIFIERS MATCH. Asan's person code and product
code must be the same numbers on both sides. That is the spine of this whole
mission — everything else is formatting.

═══════════════════════════════════════════════════════════════════════════════
GROUND TRUTH — VERIFIED FROM THE OWNER'S ACTUAL FILES
═══════════════════════════════════════════════════════════════════════════════

Two real Asan exports are in the project root:
  اشخاص.xlsx  — 489 rows (488 accounts), 29 columns
  کالا.xlsx   — 7,257 rows (7,256 products), 23 columns

⚠️ These sheets are RIGHT-TO-LEFT. Column A is the RIGHTMOST column visually and
the LAST field logically. Do not assume A is the first meaningful field — it is
not. Read by HEADER TEXT, never by position.

PERSONS (اشخاص.xlsx) — verified header row and sample values:

  Column  Header            Meaning                    Sample
  ──────  ────────────────  ─────────────────────────  ─────────────────────────
  AB      کد حساب           THE ASAN PERSON CODE       1848 · 602031 · 102012
  Z       نام حساب          account name               کریم خان محمدی(شاهرود)
  AC      ردیف              row number (ignore)        1, 2, 3…
  E       کد ملی            national ID                (mostly empty)
  I       موبایل            mobile                     9123740712  ← NO LEADING 0
  Y       تلفن              landline                   2332228025  ← NO LEADING 0
  X      آدرس              address                    شاهرود خ شهدا…
  F       کداقتصادی         economic code              (mostly empty)
  G       کدپستی            postal code                (mostly empty)
  C       گروه حساب         account group              (mostly empty)
  A,B,D,H,J–W   balances, credit, turnover, dates — NOT identity, ignore for import

  ⚠️ CRITICAL: mobile and phone arrive as NUMBERS with the leading zero stripped
  (9123740712, not 09123740712). Normalisation must restore it. The project
  already has normalize_identifier() in plpgsql (migration 245-era) — USE IT, do
  not write a second normaliser.

PRODUCTS (کالا.xlsx) — verified header row and sample values:

  Column  Header            Meaning                    Sample
  ──────  ────────────────  ─────────────────────────  ─────────────────────────
  V       کد کالا           THE ASAN PRODUCT CODE      2799 · 3746 · 826
  S       شرح کالا          product description        55nano90(2021)الجی
  U       سریال کـالا       serial (equals V in all sampled rows — verify)
  T       بارکدکـالا        barcode                    (empty in sample)
  Q       واحد 1            unit                       عـــدد
  W       ردیف              row number (ignore)
  A–P, R  quantities, prices, averages — not identity

  ⚠️ Product descriptions are MANGLED by RTL storage. Real examples:
       ')LIFETT(W)لباسشویی دووسفید('
       ')بوش (28فرتوکاربوش مدل534سیلو'
  Parentheses and digit groups are displaced. Do NOT try to "fix" these strings
  algorithmically — you will corrupt them further. Import the description
  verbatim, store it, and let a human correct names later. Report this clearly.
  Some rows have a NUMBER as the description (e.g. row 9: شرح = 341). Handle it.

ALREADY KNOWN AND CONFIRMED BY THE AUDIT:
  customers.accounting_code IS the Asan person code. The audit proved it via the
  export column labelled «کد مشتری آسان». Sample: خان محمدی = 102012, and the
  Asan file shows exactly 102012 for کریم خان محمدی(شاهرود). The bridge for
  PEOPLE already half exists.

═══════════════════════════════════════════════════════════════════════════════
PART 1 — RESEARCH (read-only). ANSWER BEFORE BUILDING ANYTHING.
═══════════════════════════════════════════════════════════════════════════════

Write findings to docs/research/asan-bridge-research.md as you go. Every claim
needs file:line, a table name, or a query result. No guessing.

── R1. Product coding: how does the assistant code products today? ───────────

  a) When a product is created, who assigns the code — the system or the user?
     Find the exact mechanism (sequence, trigger, function, client-side).
  b) What is the format? The audit mentioned SKUs like AFK-2026-00052. Confirm
     the generator and where it lives.
  c) Is there ALREADY a field for an external/Asan product code? Search for:
     accounting_code, external_code, asan_code, legacy_code, erp_code, sku,
     product_code, code. Report every candidate column on products with its
     type, nullability, uniqueness, and how full it is:
       SELECT count(*), count(<col>) FROM products;
  d) If no such field exists, can one be added safely? Check what would break:
     unique constraints, triggers, views, code references.
  e) products vs customers asymmetry: customers has accounting_code. Does
     products have an equivalent? If not, that is the gap — say so plainly.

── R2. Person coding ────────────────────────────────────────────────────────

  a) Confirm customers.accounting_code is the Asan code (query real rows and
     match them against اشخاص.xlsx — e.g. 102012).
  b) Is it unique? Is it mandatory at creation? Which forms enforce it?
  c) persons was unified in Phases 1–8. Does the Asan code live on customers,
     on persons, or on person_identifiers? Report the truth, not the intent.
  d) If a person can exist without an Asan code, how many currently do?

── R3. Existing import machinery ────────────────────────────────────────────

  a) /persons/import and person_import_batch — read them fully. What columns do
     they expect? Could they consume اشخاص.xlsx as-is, or does the mapping differ?
  b) CustomerImportForm and PersonImportForm — the audit says both now funnel
     through person_import_batch. Verify.
  c) PRODUCT import: the audit found NO product import route at all. Verify this
     — search routes, API, server functions, and any admin tool. If something
     partial exists, find it before proposing anything new.
  d) Duplicate handling: what does the existing import do on a duplicate today?
     The owner's rule is: block duplicates by ASAN CODE (person code / product
     code), and surface them for a manual decision — never silently overwrite.

── R4. Existing export machinery ────────────────────────────────────────────

  a) Which exports exist today, at which routes, producing which files?
  b) Is the output a real XLSX or a CSV named .xlsx? Prove it.
  c) Is there any date-range picker, column picker, or row-selection UI already
     built anywhere in the project that can be REUSED rather than rebuilt?
     (Search for existing table components with checkbox selection and
     pagination-size controls — the owner wants exactly that pattern.)
  d) Invoice numbering: what number does a sales quote / purchase carry today?
     Is there a per-document sequential number, and does it start at 1?

── R5. Bank accounts ────────────────────────────────────────────────────────

  The owner requires an Asan bank code, mandatory when a bank account is created.
  a) What is the bank_accounts table's current shape?
  b) Is there any code/accounting_code column on it?
  c) The audit's earlier note mentioned a receiver bank account with
     accounting_code = 'TEMP-CHANGE-ME'. Is that still there? Report it.

── R6. VIDEO UPLOAD — do NOT build in parallel ──────────────────────────────

  The owner explicitly says: research first, and if something exists, extend it.
  Establish exactly what exists for the "product video" workflow:
    - invoices.product_video_required — who writes it, who reads it?
    - DeliveryReceiptUploadForm — what does it do end to end?
    - the delivery-receipts bucket (migration 263 gave it video support)
    - documents / attachments tables — is there a polymorphic attachment model?
    - the messenger/collaboration module — can a task or thread carry a file?
    - tasks (the audit says: complete system, ZERO rows, never wired up)
  Then answer ONE question directly: to deliver "TV sold → video required →
  task for the warehouse → upload → salesperson notified → sent to customer →
  recorded", how much already exists and what is the SMALLEST addition that
  completes the chain? Name the tables and components to extend. Propose no new
  module unless you can prove all five anti-parallel tests from audit D5.

── R7. OUT-OF-CATALOGUE PRODUCT MATCHING — do NOT build in parallel ─────────

  Same discipline. The audit found market_product_matches already exists.
    - Read that table and everything that writes or reads it.
    - What does the WhatsApp bridge already store for an unmatched mention?
    - Is there any similarity/fuzzy machinery already in the project?
      (pg_trgm is installed — migration 228 used it for person aliases.)
    - Is there any AI/embedding capability already wired that could rank
      candidates? (The project has Ollama configured.)
  Then answer: what is the smallest addition that gives «suggest catalogue
  matches → show candidates with a score → user confirms → link is recorded and
  reversible»? Name what to extend.

── R8. AfraPayam refresh scheduling — is it worth it? ───────────────────────

  The owner asked whether the tiered schedule (live 10–16, 30 min 16–19, 4 h
  19–07, 1 h 07–10 Tehran) is actually worth building.
  Measure, do not opine:
    a) What is the refresh interval today, and what does one refresh cost —
       response size, upstream latency, rows?
    b) With the P0 change the card now pulls up to 1000 rows every 30 s per open
       page. How many concurrent viewers are realistic, and what load is that on
       AfraPayam?
    c) What would the tiered schedule actually save, in requests per day?
    d) What would it cost to build correctly — timezone (Asia/Tehran, NOT the
       server's), DST, locking, idempotency, missed runs, overlap?
  Then give a straight recommendation: build it, simplify it, or leave it.
  A defensible "not worth it" is a valid answer if the numbers say so.

STOP AFTER PART 1. Report all findings and wait for the owner's go-ahead before
Part 2. R6, R7 and R8 may change what gets built at all.

═══════════════════════════════════════════════════════════════════════════════
PART 2 — BUILD (only after the owner approves Part 1's findings)
═══════════════════════════════════════════════════════════════════════════════

Standard rules apply throughout: dry-run every migration inside BEGIN…ROLLBACK
first; ship a down script in docs/verification/; Persian SQL via docker cp;
snapshot any function before rebuilding it; typecheck stays at the 70 baseline;
commit before any build because compose builds from the working tree; never
touch production 192.168.170.10.

── B1. Asan code fields ─────────────────────────────────────────────────────

  Based on R1/R2/R5, ensure three code fields exist, are unique, and are visible
  in the UI:
    - person / customer  → Asan account code (کد حساب)   — likely already exists
    - product            → Asan product code (کد کالا)   — likely MISSING
    - bank account       → Asan bank code                — likely MISSING

  For each: nullable at first, backfilled where possible, then made mandatory at
  creation ONLY after the owner confirms the backfill result. Do not make a
  column NOT NULL in the same migration that creates it.

  UI: the code must be enterable and visible on the product form, the person
  form, and the bank-account form, in Persian, with clear validation.

── B2. Person import from Asan Excel ────────────────────────────────────────

  Extend the EXISTING import (person_import_batch / PersonImportForm). Do not
  build a second engine.
    - Accept the real اشخاص.xlsx layout, mapped BY HEADER TEXT not position.
    - Required mapping: کد حساب → Asan code, نام حساب → display name.
      Optional: کد ملی, موبایل, تلفن, آدرس, کداقتصادی, کدپستی.
    - Restore stripped leading zeros on mobile/phone before normalising, then
      normalise with the existing normalize_identifier().
    - Ignore all balance/turnover columns — they are Asan's business.
    - Duplicate rule: match on ASAN CODE. If it already exists → do NOT create,
      do NOT silently overwrite. Surface it in a review list with both versions
      side by side and let the user decide per row.
    - Preview before commit: show what will be created, what will be skipped,
      what needs a decision. Nothing writes until the user confirms.
    - Report at the end: created / linked / skipped / needs-decision counts.

  Test with the REAL file: all 488 rows. Report exactly what happens, including
  every row that fails and why.

── B3. Product import from Asan Excel ───────────────────────────────────────

  Per R3c this route does not exist. Build it on the SAME import engine shape as
  persons — same preview, same duplicate discipline, same review UI. If the
  engine is person-specific, extend it generically rather than cloning it, and
  explain the choice.
    - کد کالا → Asan product code (the dedupe key)
    - شرح کالا → product name, stored VERBATIM (see the RTL warning above)
    - بارکد, سریال, واحد → optional fields where the schema supports them
    - Duplicate rule: match on Asan product code, same review flow.
    - The assistant's own SKU generator keeps working; the Asan code is an
      ADDITIONAL identifier, not a replacement. Both coexist.

  Test with the REAL file: 7,256 rows. This is a volume test as much as a
  correctness test — report timing and whether it needs batching.
  ⚠️ Report honestly how many descriptions are mangled or numeric, and what a
  human would need to clean up afterwards. Do not hide it behind a success count.

── B4. Shared export UI (build once, use five times) ────────────────────────

  The owner specified this precisely. All five exports share it:
    1. Date range picker (Jalali) — the user chooses from-date and to-date.
    2. A preview table of the rows the system proposes to export.
    3. A checkbox on each row, ALL TICKED BY DEFAULT; the user unticks what they
       do not want.
    4. A select-all / deselect-all for the current page.
    5. A user-settable page size (how many rows per page).
    6. Only ticked rows go into the file.

  Reuse an existing table component if R4c found one. Persian, RTL, mobile-aware.

── B5. The five Asan export formats ─────────────────────────────────────────

  ⚠️ Column ORDER and header TEXT must match Asan exactly. The screenshots the
  owner provided are the specification. Reproduce them literally; if a column is
  not applicable, emit it EMPTY rather than omitting it — Asan reads by position.

  E1 — SALES invoices («فروش» tab):
    A شماره فاکتور · B تاریخ · C کدشخص · D کد کالا · E نام کالا · F تعداد ·
    G مبلغ فی · H مبلغ کل · I دریافت نقد · J واریز به بانک · K (blank) ·
    L تخفیف · M عوارض · N نام حساب · O گروه حساب/کد2 · P سریال کد کالا ·
    Q بارکد کالا · R تلفن/کد3

  E2 — PURCHASE invoices («خرید» tab): same columns A–H, then
    I پرداخت نقد · J پرداخت از بانک · K پرداخت چک · L تخفیف · M عوارض ·
    N نام حساب · O گروه حساب/کد2 · P سریال کد کالا · Q بارکد کالا · R تلفن/کد3

  E3 — DOUBLE-ENTRY voucher (سند حسابداری → ورود اطلاعات از Excel):
    A کد حساب · B کد کالا · C شرح · D تعداد · E بدهکار · F بستانکار
    - کد حساب comes from the person's Asan code.
    - شرح comes from the description textarea on
      /accounting/receipts/create (the owner named the exact field).
    - MONEY DIRECTION, owner's words: money WE PAID goes in بدهکار;
      money WE RECEIVED goes in بستانکار. Get this right — it is the one thing
      an accountant will notice immediately if it is reversed.

  E4 — BANK RECEIPTS (into our own bank accounts)
  E5 — BANK PAYMENTS (out of our own bank accounts)
    - The Asan bank code must appear in its correct column.
    - Owner's rule: for a PAYMENT document, put a minus sign next to the amount.
    - The second screenshot (ورود اطلاعات از Excel with the radio buttons) shows
      the bank layout: Date · Code_M · Name_Moshtari · Shomare_P · Mablagh ·
      Bank_cod. Verify against the live Asan dialog before finalising, and say
      in the report which layout you implemented and from which screenshot.

  INVOICE NUMBERING — the owner's requirement:
    Asan is being started fresh from 1, so the assistant's exported invoice
    numbers must also start at 1 and increase.
    ⚠️ Read R4d first. If documents already carry numbers, do NOT renumber real
    records — that would rewrite history. The correct shape is a separate
    EXPORT SEQUENCE: a per-export-type counter that assigns 1, 2, 3… to rows as
    they are exported, recorded so the same document always exports with the
    same number and the next export continues the sequence. Explain the design
    you chose and why, and get the owner's confirmation before writing data.

── B6. Round trip test ──────────────────────────────────────────────────────

  The only test that matters: produce one file of each of the five types from
  real data, and have the OWNER import them into Asan. Everything else is a
  proxy. Provide the five files, a short Persian note on what each contains, and
  a checklist of what to verify inside Asan.
  State plainly that this step needs the owner — you cannot verify it yourself.

═══════════════════════════════════════════════════════════════════════════════
PART 3 — HOUSEKEEPING (do these regardless, they are small)
═══════════════════════════════════════════════════════════════════════════════

  H1. Delete the two unrelated files from the repo root:
        homemarkett-checklist.xlsx
        homemarkett_audit_dashboard.html
      They belong to a different project. Confirm with `git log --all -- <file>`
      that they were never committed and carry no history worth keeping. Report
      before deleting.

  H2. Rename docs/research/exec-prompt-194-209.md to something accurate. Read it
      first to confirm it is the 194–209 execution prompt, then name it
      docs/research/exec-prompt-194-209.md (or better, based on its content).
      Use `git mv` so history follows.

  H3. .claude/ — leave it, but confirm it is gitignored. If it is not, add it.

═══════════════════════════════════════════════════════════════════════════════
FINAL REPORT
═══════════════════════════════════════════════════════════════════════════════

  | Item | Status | Evidence | Owner action needed |

  Answer directly:
    - Does the assistant now hold the Asan code for people, products AND banks?
    - Can both Excel files be imported end to end, with duplicates blocked by
      Asan code? Give real counts from the real files.
    - Do all five exports match Asan's layout, and how did you verify?
    - For video (R6) and product matching (R7): what already exists, and what is
      the minimum addition? Did you avoid building anything parallel?
    - For AfraPayam scheduling (R8): what do the numbers say?
    - What still needs the owner — the Asan round-trip test, and what else?

Keep HANDOFF STATE current in docs/research/asan-bridge-research.md so this can
resume across sessions.

START WITH PART 1. Do not build anything until the owner has seen the findings.
