# AfraKala — Research pass #3
## Accounting model conflict + AI provider abstraction + knowledge RAG

READ-ONLY. Change nothing. Create nothing. Commit nothing. Push nothing.
No migrations, no schema changes, no frontend edits, no rebuilds.
The only output is a written report.

Repo: `D:\AfraKalaTest\app`
Branch: `feature/navigation-modernization`

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala
```
Never print the password.

**Output in English only** — this terminal reverses Persian text when copied.
Refer to Persian UI strings by English meaning plus Latin transliteration.

For every finding give the exact file path, table, function, or route. For every
absence write plainly "NONE — does not exist." Do not propose designs, do not
write code, do not soften a negative finding. Quote SQL and code where asked.

**Part A is the most urgent — the accounting module is completely non-functional
until it is resolved. Complete and report Part A fully before starting Part B.**
If the context budget runs short, a complete Part A alone is a successful
outcome; say so and stop cleanly.

---

# PART A — The accounting posting conflict

## Established facts — do not re-derive
Two live posting paths write `journal_entries` for the same receipt, and they
post **different** entries. `journal_entries` has 0 rows; no receipt has ever
posted. Both are currently broken.

- **Path A** `post_receipt_journal` — fired by trigger
  `trg_payment_receipts_post_journal` on approve. Debit = beneficiary
  accounting_code, Credit = payer accounting_code. No side effects. Single bug:
  the idempotency guard compares `source_id` (uuid) to `_receipt_id::text`.
- **Path B** `post_receipt_accounting` — called from
  `src/routes/_app.accounting.receipts.$receiptId.tsx:332`. Debit =
  bank/external_party, Credit = customer. Also runs
  `increase_credit(customer, amount)` and reconciles invoice status. Two bugs:
  it writes `journal_lines` columns `kind`/`ref_id` which do not exist (real
  columns are `account_kind`/`account_ref_id`), and it reads
  `bank_accounts.accounting_code` which does not exist.

## What the research must establish

**A.1 — Is AfraKala's ledger authoritative, or a mirror?**
The business marks pre-invoices as "registered in the external Asan accounting
software." Determine whether `journal_entries` is meant to be the company's
real book of record, or a secondary/informational copy.

Evidence to gather: does any report, export, financial statement, trial
balance, or balance-sheet screen read `journal_entries`? Is there any
reconciliation with an external system? Search `src/` and the database for
every consumer of `journal_entries` and `journal_lines`.

This determines how much rigor the entry shape needs.

**A.2 — What else writes to the ledger?**
Find every function, trigger, or code path that inserts into `journal_entries`
or `journal_lines` — not just the two receipt paths. Expenses, invoices,
adjustments, opening balances, anything.

For each, report which `account_kind` values it uses and what entry shape it
produces. **If other writers exist, whichever receipt model matches them is
almost certainly the intended design** — report that alignment explicitly.

**A.3 — The account model**
- Full schema of `journal_entries` and `journal_lines`, every column.
- The complete set of allowed `account_kind` values — is it an enum, a CHECK,
  or free text? Quote the constraint.
- Is there a chart of accounts table? Where do `accounting_code` values live,
  what format are they, and which entities carry one? Report the columns on
  `external_parties`, `customers`, and any other party table.
- Is there any UI for managing accounting codes? Which route?

**A.4 — `increase_credit` and the credit ledger**
Quote the full definition of `increase_credit`. Report:
- which table it writes
- how that table relates to the customer credit system
  (`calculate_customer_realtime_credit`, `dynamic_scoring_parameters`,
  `customer_payment_discipline`)
- whether anything else calls it, and whether the credit ledger currently has
  any rows

**This is the decisive question for the user:** if only Path B updates the
credit ledger, then choosing Path A means customer payments never affect credit
limits or payment-discipline scoring. State plainly whether that is the case.

**A.5 — The receipts detail page**
Read `src/routes/_app.accounting.receipts.$receiptId.tsx` around line 332.
Report: what the user-facing action is called, which roles can perform it,
what the UI does before and after, and whether it is guarded against being
pressed twice.

**A.6 — The bank account gap**
`bank_accounts` has no `accounting_code`. Report its full column list. Then
determine how the system is *supposed* to identify a bank in the ledger — is
there a mapping table, a convention, or is this simply unfinished? Check
whether `external_parties` carries a code and how bank vs party is
distinguished at receipt entry.

**A.7 — Scope of the fix**
For each of the two models, report exactly what would have to change to make it
work end to end: which functions, which columns, which triggers, and whether
the other path can be neutralized without dropping anything.

Report the effort and risk of each, but **do not recommend one** — the choice
is the user's accounting decision. Present the facts that let them choose.

---

# PART B — AI provider abstraction

The user wants a single arrangement serving **two** features: knowledge RAG and
receipt OCR. The rule: prefer self-hosted Ollama; if it is unavailable or
failing, fall back to a keyed provider; let an admin enter the key; have the
system discover which models the key supports and pick a suitable, cheap one.

This spans three different capabilities — **chat, embeddings, and vision** — and
not every provider or model supports all three. That distinction must run
through the whole report.

**B.1 — Ollama reality check**
- Is `OLLAMA_API_URL` set in the running container? Presence only, never the
  value.
- Is an Ollama instance reachable from the app container at all? If some host
  is configured, probe it. If nothing is configured, say so plainly.
- If reachable: which models does it have (`/api/tags`), does it expose an
  embeddings endpoint, and are any of its models vision-capable?
- If not reachable: state what the user would need to provide.

**B.2 — Every current AI call site, in detail**
For each of these, quote the request construction, the model name, the error
handling, and the graceful-disable path:
- `src/routes/api/messenger/ai-chat.ts` (chat, Ollama)
- `src/lib/messenger/embeddings.functions.ts` (embeddings, Lovable gateway)
- `src/lib/receipt-ocr.functions.ts` (vision, Lovable gateway)
- `src/lib/ai-tools/purchase-advisor.functions.ts` (chat, Lovable gateway)
- `src/lib/ai-tools/ad-copy.functions.ts` (chat, Lovable gateway)
- `src/lib/messenger/transcribe.functions.ts` (audio, Whisper)

Then answer: **is there any shared client or helper, or does each construct its
own fetch?** This determines whether a fallback chain can be introduced in one
place or must touch every call site. Report the exact duplication.

**B.3 — Receipt OCR specifics**
This is the feature the user most wants routed through the new arrangement.
- What exactly does it extract from a receipt image, and into which fields?
- Which model does it use today and what prompt does it send?
- How does the UI use the result — auto-fill, suggestion, or confirmation?
- Where is it triggered from, and which roles can use it?
- What happens today when it fails or is disabled?
- **Is the extracted data ever written without human confirmation?** If OCR
  output can reach a financial record unreviewed, that is a money-safety
  consideration and must be reported prominently.

**B.4 — Model discovery, honestly**
- Does any provider currently in use expose a model-listing endpoint?
- Does any expose pricing programmatically? Do not assume — check.
- If pricing is not discoverable, what is the honest fallback: a hardcoded
  preference list, or admin choice? Report what is actually possible rather
  than what would be ideal.
- For a given key, how would the system determine which of chat / embeddings /
  vision it can serve? Is there a cheap probe, or must it be attempted?

**B.5 — Quota and credit exhaustion**
- Quote the current 429 and 402 handling in each call site.
- Do providers distinguish "rate limited, retry shortly" from "account credit
  exhausted"? Report the actual response shapes if determinable.
- Is there any central place a status could be recorded and surfaced to an
  admin?

**B.6 — Key storage**
- `shop_settings` full schema — plaintext key/value. Confirm.
- Is `pgcrypto` installed, and is it used anywhere today? Quote an example if
  so.
- How does `bot_api_keys` store secrets, and confirm the distinction: bot keys
  are **hashed** because they only need verification, while provider keys must
  be **decryptable** to be sent outbound. Confirm this against the code.
- Where would the decryption key itself live? Report what options the current
  deployment actually supports — container env, Postgres setting, or something
  else. Do not propose; report what exists.
- Which admin route is the natural home for a provider settings page? List
  candidates with their guards.

---

# PART C — Knowledge RAG specifics

Established from earlier passes — do not repeat: pgvector 0.7.4 installed;
`message_embeddings` dim 1536 with HNSW cosine; `search_messenger_messages_semantic`
exists; `knowledge_documents` has `is_published` and `access_level`
(`all` / `manager_only` / `finance_only` / `admin_only`) and currently 0 rows;
no chunking; no reindex action.

Report only what is still unknown:

**C.1** Quote the full definition of `search_messenger_messages_semantic` — it
is the template for a knowledge equivalent.

**C.2** Quote every RLS policy on `message_embeddings` — a knowledge chunk
table needs an equivalent shape.

**C.3** How is `access_level` enforced on `/knowledge` today — RLS policy,
application-side filter, or both? Quote the policy and the query.

**C.4** Confirm the embedding dimension is genuinely tied to
`openai/text-embedding-3-small` (1536). **If the user later switches to an
Ollama embedding model with a different dimension, what breaks?** Report the
consequence plainly — this affects whether the chunk table can be
provider-agnostic.

**C.5** Is there any existing text-chunking or tokenization utility in the
codebase that could be reused, or would it be new?

---

# REPORT FORMAT

Answer A, then B, then C, using the numbered sub-points as headings so nothing
is skipped.

End with three tables.

**Table A — The accounting decision**

| | Model A (code-to-code) | Model B (bank/customer + credit) |
|---|---|---|
| Matches other ledger writers? | | |
| Updates customer credit ledger? | | |
| Bugs to fix | | |
| Missing schema | | |
| Effort | | |
| Risk | | |

**Table B — AI capability coverage**

| Capability | Ollama today | Lovable today | Shared helper exists? | Used by |
|---|---|---|---|---|
| Chat | | | | |
| Embeddings | | | | |
| Vision (OCR) | | | | |
| Audio | | | | |

**Table C — What must be built vs reused**

| Piece | Status | Reuse from | Notes |
|---|---|---|---|

Do not propose designs. Do not write code. Report only.