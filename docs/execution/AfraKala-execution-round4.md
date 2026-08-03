# AfraKala — Execution round 4
## Complete the payment chain, then build the AI foundation

Run unattended. The user is not present and will not answer questions.
Phases 1–3 complete the payment chain. Phases 4–7 build the AI foundation.
**Phase 3 is a good stopping point if the budget runs short.**

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
SQL containing Persian: `docker cp` then `psql -f`. Never pipe it. Pure-ASCII
SQL may be piped. Never print the password.

English only in terminal output — this terminal reverses Persian text when
copied. Persian is fine inside files you write.

### 0.2 Git
Stay on `feature/navigation-modernization`. One commit per phase, staging only
that phase's files. Never `git add -A`. Never commit the user's root-level
`*.md` working documents. Push after each phase. Never `git reset --hard`,
`git clean -fd`, `git push --force`. Never leave a migration
applied-but-uncommitted.

### 0.3 Execution engine
After each phase: validate → self-repair → commit → push → continue.

**STOP** for: any DB or permission error; a required object asserted here being
absent; a weakened route guard or broadened permission; any situation where
money could be posted twice, attached to the wrong customer, or silently not
posted; or a low context budget — finish the current phase cleanly, commit,
push, write "RESUME AT PHASE N" into `docs/execution-progress.md`, stop.

**REPAIR (max 3 attempts)** for typecheck/lint/build errors you introduced.
After 3 failures revert only your own edits, mark DEFERRED, continue.

**RECORD AND CONTINUE** past the 70 baseline errors.

Never claim validation passed when it did not. Never claim a screen was
visually inspected when only an HTTP request was made.

### 0.4 Verified state — do not re-derive
- **Receipt posting works.** Migration 149 repaired it on the Model B ledger
  path; verified end-to-end (one balanced entry, `increase_credit` once, one
  credit-ledger row, idempotent re-approve). Path A is a retained no-op.
- `payment_receipt_links` has a nullable `quote_id`, `invoice_id` is nullable,
  and a CHECK enforces exactly one of the two (migration 148).
- `sales_quotes` has a nullable `customer_id`; 4 of 5 backfilled; the quote form
  passes it with a money-safety guard.
- `public.invoices` = 0 rows and is never used. `sales_quotes` is the live
  workflow. Quotes list: `/sales/quotes`.
- Three latent `text = app_role` bugs have been fixed (`user_roles.role` is
  TEXT). If you meet a fourth, fix it the same way with `public.has_role`.
- **Ollama is now reachable from the web container** at
  `http://192.168.170.8:11434`, verified. Models available:
  | model | capability | note |
  |---|---|---|
  | `bge-m3` | embedding | **1024 dimensions** |
  | `qwen2.5:7b` | chat | |
  | `qwen3.6` | vision + chat | 36B, large and slow |
- `deploy/lan/.env.lan` declares `LOVABLE_API_KEY=` **empty** — that empty
  declaration caused an earlier "present vs absent" contradiction. No `OLLAMA_*`
  var is set anywhere yet.

---

# PHASE 1 — Receipt form: allocate against quotes

`PaymentReceiptForm.tsx` still queries `.from("invoices").eq("type","pre_invoice")`,
which returns nothing. An accountant therefore cannot allocate a receipt to
anything, even though posting now works.

## 1.1 Change the source
When receipt type is `invoice_payment`, list the selected customer's **accepted
quotes with a remaining balance greater than zero**, using the `customer_id`
link.

A quote's remaining balance is `final_amount` minus the sum of allocations
already linked to it — there is no stored paid column, so it must be computed.
Decide where that computation lives (a view, an RPC, or client-side) and report
the choice with its reasoning.

Only `accepted` quotes are allocatable. Draft, sent, canceled, and rejected are
not debts.

## 1.2 Preserve every existing validation
- allocation total ≤ receipt amount
- each allocation ≤ that quote's remaining balance
- at least one allocation required for `invoice_payment`

## 1.3 Two UI details that matter
- If the selected customer has no eligible quotes, say so plainly rather than
  showing an empty list with no explanation.
- Show each quote's **remaining** balance next to its total — the accountant
  needs to see what is still owed, not just what was invoiced.

Rename any user-facing label that says "invoice" to the quote terminology the
rest of the app uses, so the accountant is not hunting for something that does
not exist.

## 1.4 Verify
Create a receipt through the UI path's RPCs, allocate part of it to the
accepted quote, and confirm: the link row has `quote_id` set and `invoice_id`
null; over-allocation is rejected; the quote's remaining balance drops by the
allocated amount; a second partial allocation is possible up to the remainder.

Clean up afterward and confirm row counts return to their starting values.

Commit `feat(accounting): allocate receipts against sales quotes`.

---

# PHASE 2 — Surface collected payments

Three read paths are still invoice-keyed, so they show nothing.

## 2.1 The collected component of the sales KPI
The sales KPI computes `0.8 × collected + 0.2 × issued` and collected is
permanently 0. Read the live definition of `calculate_employee_score` first —
also check `calculate_salesperson_collected_sales`, which may already be the
collected path. Report which one you edited and why.

Make the minimum edit so collected reads quote-linked receipts. Preserve the
0.8 / 0.2 weighting exactly.

## 2.2 Credit score
Extend `calculate_credit_score` so payments against quotes count toward payment
discipline the way invoice payments were meant to. Preserve the existing
scoring shape.

## 2.3 Receivables
Extend `vw_customer_receivables` and `get_receivable_detail` so an accepted
quote's unpaid balance appears as a receivable. Same balance rule as 1.1 —
`final_amount` minus allocations.

## 2.4 Verify
For the accepted quote and its salesperson, show before/after for: the
salesperson's score with collected now non-zero, the customer's credit score,
and the receivables view. Use a transaction you roll back, or clean up and
recompute so no stale score row remains.

Commit `feat(accounting): surface quote payments in scoring, credit, and receivables`.

---

# PHASE 3 — Payment chain end to end

Rebuild the LAN container, restart `afrakala-lan-rest`, poll until 200.

Then run the complete chain against quote `4850549b` (salesperson `56014064`,
customer `d05bbd0b`, final 100100000), external party `e9b29dd2` for the
receiver path:
1. create a receipt
2. allocate it against the quote
3. approve it
4. confirm exactly one balanced journal entry
5. confirm `available_credit` rose and one credit-ledger row was written
6. confirm the quote's remaining balance dropped
7. confirm it appears correctly in receivables
8. confirm the salesperson's score rose via the collected component

Report real numbers at each step. Then delete the test data, restore
`available_credit`, recompute scores, and prove with before/after row counts
that the system is back to its starting state.

Smoke test with a bogus 404 control: `/accounting/receipts/create`,
`/sales/quotes`, `/accounting/receipts`, `/gamification/admin/manual-metrics`,
`/this-route-does-not-exist-xyz`.

Update `docs/execution-progress.md`: the payment chain is complete.

**This is a natural stopping point. If the context budget is low, stop here —
it is a complete, verified deliverable.**

---

# PHASE 4 — Wire up Ollama

## 4.1 Configuration
Add to `deploy/lan/.env.lan`:
```
OLLAMA_API_URL=http://192.168.170.8:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3
OLLAMA_VISION_MODEL=qwen3.6
```
Use whatever variable names the existing code already reads where they overlap
— check `src/routes/api/messenger/ai-chat.ts` first rather than inventing
names.

Rebuild the container and confirm the app can reach Ollama from inside it.

## 4.2 Prove each capability actually works before building on it
Do not assume. Call Ollama directly and verify:
- **chat**: `qwen2.5:7b` answers a Persian question in Persian, coherently
- **embeddings**: `bge-m3` returns a vector, and confirm its length is
  **1024** — report the actual number
- **vision**: `qwen3.6` reads a Persian bank receipt image. Use a real receipt
  image if one exists in the uploads; otherwise report that vision is untested
  and say so plainly rather than claiming it works

Report each result honestly. If Persian vision output is poor, say so — that
finding determines whether receipt OCR can move to Ollama at all, and a false
"it works" here would cost real accuracy on financial data later.

Commit `chore(ai): configure Ollama provider`.

---

# PHASE 5 — Shared AI client

No shared client exists. Five files each hardcode `ai.gateway.lovable.dev` with
their own fetch, model name, and error handling.

## 5.1 Build one client all AI calls route through
It must expose **chat, embeddings, and vision** as distinct capabilities —
not every provider or model serves all three, and conflating them is how a
vision call ends up at a text model.

- **Provider order:** Ollama first when configured and reachable; the keyed
  provider otherwise.
- **Fall back only on unavailability** — connection failure, timeout, 5xx.
  Never fall back because an answer was poor: that means paying twice and
  getting two different answers to one question.
- **Distinguish 429 from 402.** Rate-limited means retry shortly; credit
  exhausted means the account needs topping up. Different Persian messages.
- Record provider health somewhere an admin can see: which provider served the
  last call, when it last failed, and why.
- With no provider available, every caller degrades gracefully. Nothing throws
  to the user.

## 5.2 Key storage
An admin must be able to enter a provider key through the UI.

`bot_api_keys` hashes its secrets because it only verifies them. A provider key
must be **decryptable** to be sent outbound, so that pattern cannot be reused.
`pgcrypto` is installed but unused. `shop_settings` is plaintext.

Decide where the encryption key itself lives based on what this deployment
actually supports, and report the trade-off honestly. Do not invent
infrastructure that is not there.

The key must never appear in logs, error messages, or API responses. Show only
a short prefix.

## 5.3 Admin page
Admin-only, at `_app.admin.settings.tsx` unless you find a better fit — confirm
before choosing. It must allow adding, editing, and removing a provider; show
each provider's status (working / error / credit exhausted); show which
capabilities each can serve; and offer a connection test.

## 5.4 Model discovery — honestly
Ollama exposes `/api/tags` and reports `capabilities` per model — you have
already seen this working. Use it.

**Pricing is not discoverable programmatically** from any provider here. So
"pick a cheap model" cannot be automatic in the strict sense. Do the honest
version: a curated preference list per provider with admin override. Do not
fabricate a pricing lookup.

## 5.5 Do not migrate the call sites yet
Build the client and prove it in isolation first.

Commit `feat(ai): add shared provider client and admin key management`.

---

# PHASE 6 — Migrate the AI call sites

One at a time, verifying each still works after migration:
```
src/routes/api/messenger/ai-chat.ts             chat
src/lib/messenger/embeddings.functions.ts       embeddings
src/lib/receipt-ocr.functions.ts                vision
src/lib/ai-tools/purchase-advisor.functions.ts  chat
src/lib/ai-tools/ad-copy.functions.ts           chat
```

**Receipt OCR carries a safety property that must survive:** its output is a
suggestion a human reviews — it must never write to a financial record
unreviewed. Verify this still holds after migration.

If Phase 4.2 showed Persian vision is weak on `qwen3.6`, keep receipt OCR on
the keyed provider and report that decision. Accuracy on financial data matters
more than using the local model.

Commit each migration separately so a regression is traceable.

---

# PHASE 7 — Knowledge RAG

`knowledge_documents` has 0 rows. Build the pipeline so it activates when the
user writes documents. Report plainly that it indexes nothing until then — do
not present an empty index as a working feature.

## 7.1 Reuse, do not reinvent
- `search_messenger_messages_semantic` is the retrieval template: SECURITY
  DEFINER, cosine `<=>`, access gate inside the WHERE, hard cap
  `LEAST(p_limit, 50)`.
- `message_embeddings` is the table and RLS shape.
- `kd_role_can_view(uid(), access_level)` is the existing access function. The
  chunk table's RLS must join to its parent document and reuse it — otherwise a
  finance-only document's chunks leak to a salesperson.

## 7.2 The dimension — this is now a known fact, not a risk
`bge-m3` produces **1024** dimensions. `message_embeddings` is `vector(1536)`
because it uses a different model. **Do not copy 1536.** Use the dimension you
verified in Phase 4.2.

pgvector fixes the dimension per column, so a model change later means a new
column and a full re-index. Store the **model name and dimension alongside each
chunk** so a mismatch is detectable rather than silently wrong, and document
the re-index path.

## 7.3 Build
- a Persian-aware chunking utility — must handle ZWNJ and not split mid-word.
  None exists. Report the size and overlap chosen and why.
- a reindex action with a button in `/knowledge/manage` for admin and manager,
  reporting documents processed, chunks created, and documents skipped.
- **skip any document whose text is corrupted** (contains runs of `?`) and
  report the count. Indexing corrupted text poisons every answer.
- an ask endpoint following the auth pattern in `ai-chat.ts`.
- the question box **inside `/knowledge` itself**, not a separate route. The
  existing plain-text title search must keep working unchanged.

## 7.4 Answer rules
Persian only. Grounded strictly in retrieved chunks. Sources shown with links.
Exactly «در اسناد موجود پاسخی پیدا نکردم.» when the context lacks the answer.
Never guess — a confident wrong answer is worse than "I don't know."

## 7.5 Verify
Create one test document, reindex, ask a question answerable from it, confirm
the answer cites it. Ask an unrelated question and confirm the not-found
message. Confirm a restricted document does not surface to a role that cannot
view it. Then delete the test document and reindex.

Commit `feat(knowledge): add document-grounded AI question answering`.

---

# FINAL REPORT (English)

1. Phase-by-phase: OK / DEFERRED / STOPPED, with commit SHAs and push status
2. Phase 1: where the balance computation lives and why; the four verification
   results
3. Phase 2: which function you edited for collected and why; before/after for
   score, credit, and receivables
4. **Phase 3: the eight end-to-end results with real numbers, and proof the
   test data was removed**
5. Phase 4.2: **the honest result of each capability probe** — especially
   whether Persian vision actually works on `qwen3.6`, and the real embedding
   dimension
6. Phase 5: the client's shape; the key storage decision and where the
   encryption key lives; the admin route
7. Phase 6: which call sites migrated, and whether receipt OCR stayed on the
   keyed provider
8. Phase 7: chunk size and overlap; the dimension used; whether the feature is
   live or waiting for content
9. Typecheck / lint / build / smoke against the 70 baseline
10. Anything you decided on your own that needs review
11. What still requires a human, with the Persian menu path for each

## START NOW
Begin at Phase 1.