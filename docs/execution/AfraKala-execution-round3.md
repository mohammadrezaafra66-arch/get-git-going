# AfraKala — Execution round 3
## Accounting repair, dead-module triage, AI provider foundation

Run unattended. The user is not present and will not answer questions.
Phases 1–3 run to completion. **Phase 3 ends with a deliberate handoff** — the
user must supply an AI credential before Phases 4–6 can be verified.

---

## 0. RULES

### 0.1 Environment
```
Repo         : D:\AfraKalaTest\app
Branch       : feature/navigation-modernization
DB container : afrakala-lan-db
PostgREST    : afrakala-lan-rest
Web container: afrakala-lan-web, built from D:\AfraKalaTest\app\deploy\lan
LAN URL      : http://192.168.170.8:3100
Typecheck baseline: EXACTLY 70 errors in 6 files. Zero new allowed.
```

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
```
SQL containing Persian: `docker cp` then `psql -f`. Never pipe it — that
transcode destroyed ~460 config values on 2026-07-11. Pure-ASCII SQL may be
piped. Never print the password.

English only in terminal output — this terminal reverses Persian text when
copied. Persian is fine inside files you write.

### 0.2 Git
Stay on `feature/navigation-modernization`. One commit per phase, staging only
that phase's files. Never `git add -A`. Never commit the user's root-level
`*.md` working documents. Push after each phase.
Never `git reset --hard`, `git clean -fd`, `git push --force`.

**Never leave a migration applied-but-uncommitted.** Commit it in the same
session it is applied.

### 0.3 Execution engine
After each phase: validate → self-repair → commit → push → continue.

**STOP** for: any DB or permission error; a required object asserted here being
absent; a change that would weaken a route guard or broaden a permission; any
situation where money could be posted twice, posted to the wrong party, or
silently not posted; or a low context budget — in that case finish the current
phase cleanly, commit, push, write "RESUME AT PHASE N" into
`docs/execution-progress.md`, stop. That is success, not failure.

**REPAIR (max 3 attempts)** for typecheck/lint/build errors you introduced.
After 3 failures revert only your own edits, mark DEFERRED, continue.

**RECORD AND CONTINUE** past the 70 baseline errors.

Never claim validation passed when it did not. Never claim a screen was
visually inspected when only an HTTP request was made.

---

# PHASE 1 — Repair receipt posting (Model B)

## 1.1 The decision, already made — implement exactly this

**Model B is authoritative.** Path A (`post_receipt_journal`) is to be
neutralized, not repaired.

The evidence, so you understand the intent and do not drift from it:
- `journal_lines.account_kind` has a CHECK allowing only
  `customer_credit`, `bank`, `external_party`, `invoice_ar`, `clearing`,
  `other`. Path A writes `accounting_code`, which is **not** in that set — so
  Path A cannot post even after its cast bug is fixed. The schema's vocabulary
  is Model B's vocabulary.
- Only Path B calls `increase_credit`, which maintains
  `customer_credit_balance.available_credit` and `customer_credit_ledger` —
  read by `get_customer_credit`, `hold_credit`, `release_credit`,
  `list_trusted_credit_customers`, `get_customer_dynamic_credit`. Choosing
  Path A would leave available-credit permanently blind to payments.
- The ledger is a local mirror, not the statutory book of record — the external
  Asan software is. Only `_app.accounting.receipts.$receiptId.tsx` reads it.

Do not re-open this. If something you find contradicts the above, STOP and
report rather than choosing differently on your own.

## 1.2 Understand the collision before touching anything
The approve button does two things in one click:
1. `UPDATE payment_receipts SET status='approved'` → fires
   `trg_payment_receipts_post_journal` → Path A → **errors** → the UPDATE
   itself fails. This is why nothing has ever been approved.
2. then calls `post_receipt_accounting` (Path B) — never reached today.

Read both live definitions and the approve handler in
`src/routes/_app.accounting.receipts.$receiptId.tsx` before editing.

## 1.3 Fix Path B
- `journal_lines` inserts: `kind` → `account_kind`, `ref_id` → `account_ref_id`.
- Line 2 `account_kind`: `'customer'` → `'customer_credit'` (the CHECK-allowed
  term).
- The bank gap: `bank_accounts` has no `accounting_code`. Note from the research
  that this column only feeds the `journal_entries.receiver_accounting_code`
  **header**, not the lines — so the lines still post correctly without it.
  Therefore: make that read tolerant of a missing code (leave the header field
  null or blank) rather than adding a column on a guess. Report this choice.
  Do NOT add a column to `bank_accounts`.

## 1.4 Neutralize Path A — carefully
Do **not** drop the function or the trigger. Make it a genuine no-op with a
clear comment explaining that Model B is authoritative and this path is
retained only for history.

Prefer the least destructive mechanism that actually prevents it from firing or
erroring. Whatever you choose, the approve UPDATE must succeed afterward.

## 1.5 Verify — in a transaction you roll back
a) create a receipt, approve it
b) confirm **exactly one** journal entry exists for it — query the count, do
   not eyeball
c) confirm that entry balances: debits = credits
d) confirm `increase_credit` ran exactly once and
   `customer_credit_balance.available_credit` rose by the receipt amount
e) confirm one `customer_credit_ledger` row was written
f) approve again and confirm no second entry and no second credit increase

If (b) or (f) shows more than one, STOP — that is the double-post scenario.

Report the real numbers for each.

## 1.6 Then, outside a transaction
Run the same flow against the accepted quote `4850549b` (salesperson
`56014064`, customer `d05bbd0b`, final 100100000), using external party
`e9b29dd2` for the receiver path. Link the receipt to that quote and confirm
the score recompute fires.

Then delete the test receipt, its link, and any credit-ledger row it created,
recompute the affected scores, and confirm the system is back to its starting
state. Report row counts before and after — `journal_entries`,
`journal_lines`, `payment_receipts`, `payment_receipt_links`,
`customer_credit_ledger` — to prove it.

Commit `fix(accounting): repair receipt posting on the Model B ledger path`.

---

# PHASE 2 — Dead module triage

Six modules are imported by nothing, on any branch. They were built and never
wired. Decide the fate of each.

```
src/lib/sales/customer-credit-snapshot.ts
src/components/penalties/PenaltyBadge.tsx
src/components/pricing/PriceChangeIndicator.tsx
src/components/pricing/RateTypeBadge.tsx
src/lib/automation/enqueue-torob-readonly-job.functions.ts
src/components/management/market-intelligence/PlaceholderCard.tsx
```

## 2.1 For each, establish
- What it does, in one plain sentence a non-programmer understands.
- The commit that introduced it, and whether that commit also added a call site
  that was later removed — or whether it was never called from the start.
  `git log --all --oneline --diff-filter=A -- <path>` then inspect that commit.
- Whether the data it needs actually exists: the table, column, or RPC it
  reads, and whether that has rows.
- Whether an equivalent feature already exists elsewhere under a different
  name — this is the most important check. If the capability was rebuilt, the
  old module is genuinely dead.
- Whether it still compiles against the current code, or has drifted.

## 2.2 Classify each into exactly one bucket
- **SUPERSEDED** — the capability exists elsewhere now. Safe to delete.
- **VIABLE** — works, has data, fills a real gap, and wiring it is a small
  obvious change. Report where it would go; do not wire it yet.
- **BROKEN** — needs work or data that does not exist. Report what is missing.
- **UNCLEAR** — cannot determine intent. Leave it and say why.

## 2.3 Act only on SUPERSEDED
Delete only modules you can prove are superseded, naming the replacement.
Everything else stays. Deleting something the user wanted is worse than leaving
dead code in the tree.

`PlaceholderCard` is likely scaffolding rather than a feature — check whether
market intelligence renders its own placeholder now.

Commit `chore: remove superseded dead modules` — only if you deleted anything.

---

# PHASE 3 — AI provider foundation

## 3.1 Resolve a contradiction first
Two research passes disagreed about whether `LOVABLE_API_KEY` is set. Check the
`afrakala-lan-web` container, the host environment, and
`deploy/lan/.env.lan`, and report where each AI-related variable is or is not
present. Presence only — never print a value.

This determines whether anything AI-related works today.

## 3.2 Build the shared client — the core of this phase
No shared AI client exists. Five files each hardcode
`ai.gateway.lovable.dev` with their own fetch, model name, and error handling.

Create one client that all AI calls route through. It must handle three
distinct capabilities — **chat, embeddings, and vision** — because not every
provider or model serves all three. Keep that distinction explicit in the API.

Requirements:
- **Provider order:** self-hosted Ollama first if configured and reachable;
  otherwise the keyed provider. Fall back **only** on unavailability — a
  connection failure, a timeout, or a 5xx.
- **Never fall back on a bad answer.** If a provider responds successfully but
  the content is poor, that is not a fallback condition. Falling back there
  means paying twice and getting two different answers to one question.
- **Distinguish 429 from 402.** Rate-limited means retry shortly. Credit
  exhausted means the account needs topping up. They are different problems and
  must produce different Persian messages to the user.
- Record provider health somewhere an admin can see it — which provider was
  used, when it last failed, and why.
- If no provider is available at all, every caller degrades gracefully. Nothing
  throws to the user.

## 3.3 Key storage
An admin must be able to enter a provider key through the UI.

- `bot_api_keys` hashes its secrets because it only ever verifies them. A
  provider key must be **decryptable** to be sent outbound, so that pattern
  cannot be reused. `pgcrypto` is installed but unused today.
- `shop_settings` is plaintext key/value — unsuitable for a secret as-is.
- Decide where the encryption key itself lives, based on what this deployment
  actually supports. Report the choice and its trade-off honestly. Do not
  invent infrastructure that is not there.
- The key must never appear in logs, error messages, or API responses. Show
  only a short prefix for identification.

## 3.4 Admin page
A settings page, admin-only, where the user can:
- add, edit, or remove a provider (name, base URL, key)
- see each provider's current status: working, error, credit exhausted
- see which capabilities each provider can serve
- trigger a connection test

Place it where the project's conventions put such things —
`_app.admin.settings.tsx` is the natural candidate; confirm before choosing.

## 3.5 Model discovery — honestly
- Ollama exposes `/api/tags`. OpenAI-compatible gateways may expose
  `/v1/models` — verify rather than assume.
- **Pricing is not discoverable programmatically** from any provider currently
  in use. So "pick a cheap model" cannot be automatic in the strict sense. Do
  the honest version: a curated preference list per provider, with the admin
  able to override. Do not fabricate a pricing lookup.
- Capability detection (chat / embeddings / vision) has no reliable endpoint.
  Use a cheap probe per capability, or a static provider→capability map. Report
  which you chose and why.

## 3.6 Do NOT migrate the existing call sites yet
Build the client and prove it in isolation. Migrating five live features onto
an untested client, with no provider configured to test against, would break
working code to no benefit.

## 3.7 Validate what can be validated
Typecheck, lint, build. Confirm the admin page renders and its guard holds.
Confirm that with no provider configured, nothing throws.

Commit `feat(ai): add shared provider client and admin key management`.
Push.

---

# ===== HANDOFF — STOP HERE =====

After Phase 3, **stop and report.** Phases 4–6 below cannot be verified until
the user supplies a working AI credential: either an Ollama URL with pulled
models, or a provider API key entered through the new admin page.

Building an unverifiable RAG pipeline would produce something that looks
finished and has never answered a single question.

Write into `docs/execution-progress.md`: RESUME AT PHASE 4, plus exactly what
the user must provide.

---

# PHASE 4 — Migrate existing AI call sites *(after a credential exists)*

Move these onto the shared client, one at a time, verifying each still works:
```
src/routes/api/messenger/ai-chat.ts          chat
src/lib/messenger/embeddings.functions.ts    embeddings
src/lib/receipt-ocr.functions.ts             vision
src/lib/ai-tools/purchase-advisor.functions.ts  chat
src/lib/ai-tools/ad-copy.functions.ts        chat
```

Receipt OCR is the one the user most wants on the new arrangement. Preserve its
current safety property exactly: **OCR output is a suggestion the human
reviews — it must never write to a financial record unreviewed.** Verify this
still holds after migration.

Commit each migration separately so a regression is traceable.

# PHASE 5 — Knowledge RAG *(after a credential exists)*

Reuse, do not reinvent:
- `search_messenger_messages_semantic` is the retrieval template — SECURITY
  DEFINER, cosine `<=>`, access gate inside the WHERE, hard cap
  `LEAST(p_limit, 50)`.
- `message_embeddings` is the table shape and RLS template.
- `kd_role_can_view(uid(), access_level)` is the existing function enforcing
  document access. The chunk table's RLS must join to its parent document and
  reuse it — otherwise a finance-only document's chunks leak to a salesperson.

**The vector dimension trap — handle this deliberately.** `message_embeddings`
is `vector(1536)`, tied to `openai/text-embedding-3-small`. An Ollama embedding
model may be 768. pgvector enforces the column dimension, so a mismatch fails
outright and the HNSW index is dimension-fixed.

Therefore: store the **model name and dimension alongside each chunk**, so a
mismatch is detectable rather than silently wrong, and a re-index path exists.
Report how a future model change would be handled operationally.

Also build: a Persian-aware chunking utility (must handle ZWNJ and not split
mid-word — none exists today), a reindex action with a button in
`/knowledge/manage`, an ask endpoint, and the question box **inside
`/knowledge` itself**, not a separate route.

Answer rules: Persian only, grounded strictly in retrieved chunks, sources
shown, and exactly «در اسناد موجود پاسخی پیدا نکردم.» when the context does not
contain the answer. Never guess.

Skip any document whose text is corrupted (contains runs of `?`) and report how
many were skipped. `knowledge_documents` currently has 0 rows — the pipeline
will index nothing until the user writes documents. Say so plainly rather than
reporting an empty index as a working feature.

# PHASE 6 — Validation *(after a credential exists)*

Full rebuild, PostgREST restart, smoke test with a bogus 404 control, end-to-end
verification of each migrated AI feature and of RAG.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / DEFERRED / STOPPED, with commit SHAs and push status
2. **Phase 1: the six verification results from 1.5 with real numbers**, how
   you neutralized Path A, how you handled the bank header code, and proof from
   1.6 that the test data was removed and scores recomputed
3. Phase 2: the four fields for each of the six modules, the bucket you
   assigned, and what you deleted versus kept
4. Phase 3: where each AI env var actually lives; the shared client's shape;
   the key storage decision and its trade-off; where the encryption key lives;
   the admin route; how capability detection works
5. Typecheck / lint / build results against the 70 baseline
6. Anything you decided on your own that needs review
7. **Exactly what the user must provide to unblock Phases 4–6**
8. What still requires a human, with the Persian menu path for each

## START NOW
Begin at Phase 1.1.