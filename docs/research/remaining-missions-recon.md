# Remaining-missions reconnaissance — measured before building anything

**Date:** 2026-08-26 · **Method:** five independent read-only agents, one per mission ·
production لمس نشد

Each agent was given the mission's constraints and the project's method rules, and **no**
mission context beyond that. All were read-only: no file written, no migration, no git, no test
run, and production never contacted.

## The one-line summary, and it is the same shape five times

**Almost nothing here is missing. Most of it is BUILT and deliberately or accidentally
disconnected.** That is now the expected shape on this project rather than a surprise — RULE 3
records it after four occurrences, and this makes it nine.

| Mission | Headline |
|---|---|
| **Phase 7 rest** | OCR built; the payload has nowhere to persist; only the receipt branch has a surface |
| **M1** | **~70% built and deliberately fused shut** — two components with zero callers, and three RPCs that accept `p_attachment_ids` and *raise* if you pass it |
| **OG-67** | `asan_list_bank_deposit_export` is **receipts-only by construction** — no direction concept at all |
| **Phase 8** | **The seed cannot run.** It aborts on its third statement and rolls back to zero rows |
| **M11** | `hold_credit` and `release_credit` **already exist with zero callers** — and a second, more complete reservation family exists and is also 100% dead |

The agents' full reports follow verbatim. They are kept whole rather than summarised because
the evidence lines — file:line, SQL output, trigger names — are the part that will still be
useful when someone implements these.

---

## Phase 7 remainder — items 7.2, 7.3, 7.5, 7.6 (OG-72 / OG-73)

## Phase 7 remainder recon — 7.2 / 7.3 / 7.5 / 7.6 (OG‑72, OG‑73)

### Headline correction to the mission brief
There is **no separate payment UI and no separate dual UI to find.** All three branches are one component: `src/features/ledger-wizard/DocumentWizard.tsx` (810 lines), mounted at exactly one place — `src/routes/_app.accounting.receipts.create.tsx:95`. `src/routes/_app.accounting.payment-vouchers.tsx` is a **read-only list** since migration 368 (comment at `:31-38`; "The create path now lives only in the document wizard"). So 7.5 and 7.6 are not "build two new screens" — they are "add one document step to a wizard that already has three branches", plus the persistence that OG‑72 blocks.

---

## 1. Payment (voucher) branch UI — **PARTIAL (creation exists, attachment ABSENT)**

| | Evidence |
|---|---|
| Creator | `DocumentWizard.tsx:45-49` `BRANCH_STEPS.payment = ["نوع سند","نحوهٔ پرداخت","گیرنده","جزئیات","بازبینی"]` |
| RPC | `DocumentWizard.tsx:267-282` → `callLedgerRpc("create_payment", …)` |
| Route | `/accounting/receipts/create` (`_app.accounting.receipts.create.tsx:13`) |
| List | `_app.accounting.payment-vouchers.tsx:39` — read-only, 8 columns, **no attachment column** |
| Detail page | **none.** No `_app.accounting.payment-vouchers.$id.tsx` exists (`ls src/routes/`) |
| Document/attachment step | **ABSENT.** `grep -n "attach\|document\|ocr\|file\|upload\|پیوست\|تصویر" DocumentWizard.tsx` → 7 hits, **all are the word "document" in `create_dual_document` / prose comments. Zero file inputs, zero `<input type=file>`, zero storage calls.** |

## 2. Dual-document branch UI — **PARTIAL, and thinner than payment**

| | Evidence |
|---|---|
| Creator | `DocumentWizard.tsx:400-437` (step 2 field grid), submit at `:283-299` |
| List / detail | **ABSENT entirely.** `grep -rn "dual_documents" src/` → **0 hits.** On success the wizard sends the user to `/accounting/receipts` (`DocumentWizard.tsx:311-313`), which queries `payment_receipts` only (`_app.accounting.receipts.tsx:132`). A created dual document **is not viewable anywhere in the app.** |
| Attachment step | **ABSENT** (same grep as above) |
| DB blocker | `validate_document_attachment_ref()` **raises `0A000` for `document_type='dual'`** — "جدول مرجع آن در فاز ۴ تعیین می‌شود". Receipt→`payment_receipts`, payment→`payment_vouchers`, dual→**hard refusal**. |

### Both branches share one more blocker
All three RPCs accept `p_attachment_ids` and **refuse it**:
```
supabase/migrations/20260819101000_355_create_payment.sql:294-297
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids,1) > 0 THEN
    RAISE EXCEPTION 'پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود…' USING ERRCODE='0A000';
```
Same block at `361_create_dual_document.sql:269`. Client maps it at `src/features/ledger-wizard/rpc.ts:57-64`. **Attachment must therefore be a post-create step, never part of the wizard submit.**

---

## 3. `PaymentReceiptDocuments.tsx` — 1334 lines, 5 responsibilities, ~55 % reusable

**Distinct responsibilities:**
| # | Responsibility | Lines | Reusable for payment/dual? |
|---|---|---|---|
| A | File-type / size allowlist + MIME resolution | 56-167, 325-353 | **Yes, verbatim** — branch-agnostic |
| B | `ReceiptDocumentPicker` — staged picker before the doc exists | 426-527 | **Yes, verbatim** — takes `File[]`, no receipt concept |
| C | `uploadReceiptDocuments` — storage + row + audit | 359-417 | **No** — hardcodes table + audit entity |
| D | `ReceiptDocumentsList` — list/open/delete/extract/auto-extract/apply dialog | 530-1334 | **Structure yes, bindings no** |
| E | Apply-to-form field map + normalizers | 208-312 | **Partly** — see §7 gap |

**Already-built-but-unwired inside this file** (5th instance of the pattern in this chain): `ReceiptDocumentPicker`, `uploadReceiptDocuments`, `validateReceiptFile` and `MAX_DOC_COUNT` are **exported and imported by nobody**:
```
grep -rn "ReceiptDocumentPicker|uploadReceiptDocuments|validateReceiptFile" src/ e2e/
  → only src/lib/receipt-ocr.functions.ts:41,105 (the bucket constant)
```
Only `ReceiptDocumentsList` is consumed — `_app.accounting.receipts.$receiptId.tsx:31, 569`. The old create-form that used the picker was replaced by the wizard and the picker was orphaned.

**Receipt-specific couplings, by line** (every one must be parameterised or forked):

| Line | Coupling |
|---|---|
| 56 | `RECEIPT_DOCS_BUCKET = "payment-receipt-documents"` (bucket name only; policies are role-based, see §Reusable) |
| 169-182 | `ReceiptDocumentRow.receipt_id` |
| 360, 368, 377-379 | upload writes `payment_receipt_documents` keyed by `receipt_id` |
| 398-399 | audit `entity_type:"payment_receipt"` |
| 531-534 | props are `receiptId` |
| 559-570 | `payment_receipts.posting_status` gate (`isPosted`) |
| 572-585 | list query `payment_receipt_documents … .eq("receipt_id", …)` |
| 614-631 | delete + audit `entity_type:"payment_receipt"` |
| 652-655, 731-743, 837-845 | extraction audit `entity_type:"payment_receipt_document"` |
| 718-727 | **payload write-back → `payment_receipt_documents`** (the OG‑72 surface) |
| 759-812 | **auto-apply → `payment_receipts` (amount, tracking_number)** — hard-wired columns |
| 935-1000 | manual apply → `payment_receipts`, 13-column select at `:947` |
| 982-993 | `evaluateReceiptSecurityWarnings` reads `has_perforation`, `is_typed_receipt`, `is_mobile_bank_screenshot`, `security_warnings` — **receipt-only columns; `payment_vouchers` and `dual_documents` have none of them** |
| 850-853, 1028-1030 | 4 query-key invalidations, all `payment-receipt*` |
| 1041, 1050, 1122, 1137 | Persian copy says «فیش» (slip) |

**Verdict:** not receipt-specific in *shape* — receipt-specific in *every binding*. The honest refactor is (table name, id column, audit entity, apply-target table, apply field map, security-warning evaluator, Persian noun) as 7 injected parameters.

---

## 4. `docs/ocr/requirements.md` "Fields per branch" — verbatim

**Payment — bank** (`docs/ocr/requirements.md:63-65`)
> Same as receipt-bank, but the **source** account is ours. Never auto-select our own account from OCR; the user chooses it.

(receipt-bank, referenced by that line, is `:41-49`: amount high, date high, time medium, tracking number high, source bank medium, destination account low/**do not auto-select**)

**Payment — cheque (own)** (`:67-68`)
> Cheque number, due date, amount from our own cheque book image.

**Payment — cheque (endorsed)** (`:70-72`)
> **No OCR.** The cheque is selected from the list of cheques we already hold, and every field is auto-filled from that record. Reading it again from an image would risk contradicting stored data.

**Dual document** (`:74-77`)
> Amount, date, time, tracking number, source bank, destination bank. **Never** infer the payer or the beneficiary from the slip — those are deliberate accounting choices with balance consequences, and a name on a slip is not an identity.

**Stale line in that doc:** `:34` says `payment_receipt_documents` "has no UPDATE policy, so a write-back there is silently a no-op." **That was true when written and is now false** — migration 398 (applied) created `prd_update_admin_accountant`; confirmed live:
```
polname                     | cmd
prd_update_admin_accountant | UPDATE
```
The persistence gap has moved: it is now `document_attachments`, which has **INSERT/SELECT/DELETE + restrictive `viewer_restricted` and NO UPDATE policy** — so `ocr_status` can never leave `'pending'` and `ocr_payload` can never be written post-upload.

---

## 5. Structured extractor field set — **receipt-only, and specifically bank-transfer-only**

`src/lib/accounting/receipt-ocr-structured.ts:32-59`:
```ts
export type ReceiptOcrResult = {
  status: "SUCCESS"|"PENDING"|"FAILED"|"UNKNOWN";
  transfer_method: "PAYA"|"SATNA"|"CARD_TO_CARD"|"INTERNAL"|"ACCOUNT_TO_ACCOUNT"|"CASH_DEPOSIT"|"OTHER"|"UNKNOWN";
  amount: number | null;  currency: "IRR"|"TOMAN"|"UNKNOWN";
  receipt_date: string;   receipt_time: string;
  sender_name: string;    receiver_name: string;
  source_bank: string;    destination_bank: string;
  source_card: string;    destination_card: string;
  source_account: string; destination_account: string;
  source_sheba: string;   destination_sheba: string;
  tracking_number: string; reference_number: string;
  transaction_number: string; terminal_number: string;
  branch: string;         description: string;
  confidence: number;     needs_manual_review: boolean;
  missing_fields: string[]; warnings: string[];
};
```
`src/lib/accounting/receipt-extraction.ts:24-39` (the form-facing shape):
```ts
export interface ReceiptExtractionResult {
  raw_text: string;
  tracking_number: string | null;   amount: number | null;
  receipt_date: string | null;      receipt_time: string | null;
  source_bank: string | null;       destination_bank: string | null;
  payer_name_on_receipt: string | null;
  receiver_name_on_receipt: string | null;
  document_channel: DocumentChannel;   // card_to_card|paya|pol|satna|cash|other|unknown
  detected_keywords: string[];  warnings: string[];
  structured?: ReceiptOcrResult | null;
}
```
Mapper: `receipt-ocr-structured.ts:493-531` (`ocrResultToExtractionResult`).

**Does it support payment/dual field sets? Answer: the bank sub-set YES, the cheque sub-set NO.**
- Nothing in `ReceiptOcrResult`, `ReceiptExtractionResult`, or the vision prompt (`receipt-ocr-prompt.ts:12-40`, 25 keys) is receipt-*direction*-specific. `sender_name`/`receiver_name`/`source_bank`/`destination_bank` are symmetric and serve payment and dual unchanged.
- **No cheque fields exist at all**: no `cheque_number`, no `due_date`, no `issuing_bank`, no `drawer`. The prompt's opening line even scopes the model: *"Iranian bank payment receipts (فیش واریزی)… ATM, internet/mobile bank, SATNA, PAYA, card-to-card, cash deposit"* (`receipt-ocr-prompt.ts:7-8`).

---

## 6. `aiVision` / `listProvidersFor` / `applyUsageRoute` — **mechanism confirmed; already documented and already fixed**

Selection path for capability `'vision'`, in order:
1. `aiVision(opts)` → `runWithFailover("vision", …, opts.usageKey)` — `client.server.ts:475-479, 534-536`
2. `runWithFailover` → `listProvidersFor("vision", {usageKey})`; **zero providers ⇒ `{ok:false, reason:"no_provider"}`** — `client.server.ts:305-313`
3. `listProvidersFor` — `client.server.ts:124-138`:
   ```ts
   .eq("is_active", true).order("priority", {ascending:true})     // :129-130
   .map(toProvider).filter(p => p.capabilities.includes(capability))  // :133-135  ← filter FIRST
   const route = await getUsageRoute(opts?.usageKey, capability);     // :136
   return applyUsageRoute(providers, route);                          // :137      ← route SECOND
   ```
4. `applyUsageRoute` — `client.server.ts:107-117`:
   ```ts
   if (!route) return providers;
   if (!route.is_enabled) return [];
   if (!route.provider_id) return providers;
   const selected = providers.find(p => p.id === route.provider_id);
   if (!selected) return route.fallback_enabled ? providers : [];   // :113  ← THE TRAP
   if (!route.fallback_enabled) return [selected];
   return [selected, ...providers.filter(p => p.id !== selected.id)];
   ```

**Answer to "what happens when the PINNED provider does not declare the capability":** the `:135` filter removes it *before* the route is consulted, `find` at `:112` returns `undefined`, and `:113` with `fallback_enabled=false` returns **`[]`** — not the fallback, not an error. `runWithFailover` then reports `no_provider`, and `receipt-ocr.functions.ts:210-219` renders that as `{disabled:true, reason:"ocr_disabled"}` → the user sees «OCR در دسترس نیست، لطفاً دستی وارد کنید». **A pinned route silently becomes an off-switch.**

This is not hypothetical and is not open — migration **401** (`20260827030000_401_ollama_declares_vision_so_the_pin_resolves.sql:10-28`) records this exact five-step chain and fixes it. Live state confirms both the trap and the fix:
```
ai_providers:
 gpt-messenger | openai_compatible | active | prio 1  | gpt-4.1-mini   | {chat,vision}
 ollama        | ollama            | active | prio 10 | qwen3.6:latest | {chat,embeddings,vision}   ← 'vision' added by 401

ai_usage_routes:
 receipt_ocr.vision | vision | d30816a9…(ollama) | is_enabled=t | fallback_enabled=f
```
**Standing fragility:** because `fallback_enabled=f`, removing `'vision'` from that one array — or deactivating the ollama row — turns receipt OCR **completely off** with a reassuring Persian message and no error anywhere. No test guards the array.

**Stale code comment to fix while nearby:** `src/lib/receipt-ocr.functions.ts:193-198` still asserts the opposite of live config — *"The LAN Ollama deliberately does not declare it \[vision]… receipt OCR stays on a keyed provider"*. Migrations 397 + 401 inverted that. A reader trusting this comment will misdiagnose the next OCR outage.

---

## 7. The field-set gap, receipt → payment → dual

Receipt applies 9 fields (`PaymentReceiptDocuments.tsx:212-246`). Against the live target tables:

| Extracted field | → `payment_receipts` | → `payment_vouchers` | → `dual_documents` |
|---|---|---|---|
| amount | `amount` | `amount` | `amount` |
| receipt_date | `payment_date` | `payment_date` | `document_date` |
| receipt_time | `receipt_time` | `payment_time` | **no column** ← doc `:75` asks for time |
| tracking_number | `tracking_number` | `tracking_number` | `tracking_number` |
| source_bank | `source_bank` | **no column** | `source_bank` |
| destination_bank | `destination_bank` | **no column** | `destination_bank` |
| payer_name_on_receipt | `payer_name_on_receipt` | **no column** | `transferrer_name` (+`transferrer_account_no` unfed) |
| receiver_name_on_receipt | `receiver_name_on_receipt` | `payee_name` ⚠️ **is the resolved party, not a slip name — do NOT map** | `recipient_name` (+`recipient_account_no` unfed) |
| document_channel | `document_channel` | `document_channel` | **no column** |
| — cheque_number | — | `cheque_number` **extractor has no such field** | — |
| — cheque_due_date | — | `cheque_due_date` **extractor has no such field** | — |

Live column lists from `information_schema.columns` (both tables queried).

**Two extractor-side additions are genuinely new work**, and `source_account`/`destination_account`/`source_sheba`/`destination_sheba`/`source_card`/`destination_card` are already extracted and **currently discarded** — `ocrResultToExtractionResult` (`:515-530`) drops all six. They are exactly what `dual_documents.transferrer_account_no` / `recipient_account_no` want. Free value already on the wire.

---

## Reusable vs. genuinely new

**Reusable as-is (no change):**
- `aiVision` + usage key `receipt_ocr.vision` — nothing receipt-specific in the routing (`usages.ts:47-52`); no new usage key needed for the other branches.
- `RECEIPT_OCR_PROMPT` + `ReceiptOcrResult` + Zod parse + `tryStructuredExtraction` — for the **bank** channel of all three branches.
- Storage bucket `payment-receipt-documents`: policies are **role-based, not path-coupled** — `prd_storage_{select,insert,delete}` gate on `bucket_id` + `has_role(admin|accountant|manager)` only. A `payment/<voucher_id>/…` path works today under the existing policies. (Name is misleading; that is cosmetic.)
- `ReceiptDocumentPicker` (`:426-527`), `validateReceiptFile` (`:325`), allowlists (`:64-114`) — all already exist and are orphaned.
- `ReceiptDocumentsList`'s extract → score → status → apply-dialog flow as a **shape**.

**Genuinely new:**
1. **A document step in `DocumentWizard.tsx` for all three branches**, positioned *after* create (the RPCs refuse `p_attachment_ids` with `0A000`).
2. **A voucher detail page and a dual-document detail page** — neither exists; dual has no view at all. Without them there is nowhere to hang a document list.
3. **A persistence decision (OG‑72).** `document_attachments` is fully built (`ocr_payload jsonb`, `ocr_status`, RLS admin/accountant/manager, `document_type CHECK IN ('receipt','payment','dual')`) and holds **0 rows with 0 references in `src/`** — but it has **no UPDATE policy**, so the payload still cannot be written after upload. `payment_receipt_documents.receipt_id` is **NOT NULL FK → payment_receipts ON DELETE CASCADE**, so it can never hold a voucher or dual row.
4. **Unblock `document_type='dual'`** in `validate_document_attachment_ref()` (currently a hard `0A000`), which means settling D10's "which table backs dual" first.
5. **Cheque extraction** — a second prompt/schema for `cheque_number`, `due_date`, `issuing_bank`, `drawer`. Covers receipt-cheque *and* payment-cheque(own). Payment-cheque(endorsed) is explicitly **out of scope by design** (`requirements.md:70-72`) and the wizard already locks those fields from the held-cheque record (`DocumentWizard.tsx:493-497`).
6. **A branch-aware apply map** replacing `APPLY_FIELD_TO_COLUMN` (`:236-246`), plus a decision on `evaluateReceiptSecurityWarnings` (`:982-993`) whose four input columns exist only on `payment_receipts`.
7. **`dual_documents` has no time column** — either add one or drop "time" from the doc's dual field list at `:75`.

## Could not determine [U]
- **[U] Whether OG‑72 resolves as "migrate to `document_attachments` wholesale" or "payload only".** Rule 14 (no parallel modules) argues against leaving two attachment tables side by side, but migrating moves a working surface with 1 live row. **What would settle it:** an owner decision, recorded in `docs/execution/decisions.md` — this is a policy call, not a measurement.
- **[U] Which table backs `document_type='dual'`.** Deferred to "task 4.2 / decisions.md D10" by the trigger's own comment; D10 is not resolved in the repo. **What would settle it:** reading D10's resolution, or the owner picking `dual_documents` (which exists, has 3 rows, and is the obvious candidate).
- **[U] Whether qwen3.6 reads a *cheque* image acceptably.** 401 verified vision works on a PNG probe and 397 notes a 2026‑07‑24 probe found it misreads Persian digits (45,000,000 → 25,000,000) — which is disqualifying for a cheque amount. **What would settle it:** a live probe against a real cheque image; I cannot run one read-only.

## Files inspected (absolute)
`D:/AfraKalaTest/app/src/features/ledger-wizard/{DocumentWizard.tsx,rpc.ts,types.ts}` · `D:/AfraKalaTest/app/src/routes/{_app.accounting.payment-vouchers.tsx,_app.accounting.receipts.create.tsx,_app.accounting.receipts.tsx,_app.accounting.receipts.$receiptId.tsx}` · `D:/AfraKalaTest/app/src/components/accounting/PaymentReceiptDocuments.tsx` · `D:/AfraKalaTest/app/src/lib/accounting/{receipt-ocr-structured.ts,receipt-extraction.ts,receipt-ocr-prompt.ts}` · `D:/AfraKalaTest/app/src/lib/{receipt-ocr.functions.ts,ai/client.server.ts,ai/usages.ts}` · `D:/AfraKalaTest/app/docs/ocr/requirements.md` · `D:/AfraKalaTest/app/supabase/migrations/{20260819101000_355_create_payment.sql,20260826230000_397_receipt_ocr_routes_to_local_vision.sql,20260827000000_398_receipt_document_extraction_can_persist.sql,20260827030000_401_ollama_declares_vision_so_the_pin_resolves.sql}`

**No files were written, no git commands run, no migrations applied. All SQL was SELECT / catalogue only.**

---

## M1 — attachment BEFORE the document, OCR before submit

# M1 RECON — attachment-before-document / OCR-fills-form-before-submit

## HEADLINE
The feature is **~70% already built and deliberately fused shut**. Two components (`ReceiptDocumentPicker`, `extractReceiptFromBytes`) implement exactly the M1 goal, have zero callers, and three RPCs carry a `p_attachment_ids uuid[]` parameter that **raises an exception if you ever pass it**. The blocker is not missing code — it is four interlocking guards written on purpose.

---

## 1. `public.document_attachments` — **BUILT (schema) / ABSENT (app)**

9 cols. **`document_id uuid NOT NULL`, and `pg_constraint` confirms NO foreign key** (earlier finding verified — 0 rows of `contype='f'`, and 0 FKs point *at* it either).

| col | type | null |
|---|---|---|
| id | uuid | NOT NULL `gen_random_uuid()` |
| document_type | text | NOT NULL |
| **document_id** | **uuid** | **NOT NULL, no FK** |
| storage_path | text | NOT NULL, **UNIQUE** |
| mime_type | text | NULL |
| ocr_payload | jsonb | NULL |
| ocr_status | text | NOT NULL `'pending'` |
| uploaded_by | uuid | NOT NULL |
| created_at | timestamptz | NOT NULL `now()` |

**Legal `ocr_status`:** `pending`, `processing`, `done`, `failed` (`document_attachments_ocr_status_check`).
**Legal `document_type`:** `receipt`, `payment`, `dual` — but see trigger below, `dual` is refused at runtime.

**Row count: 0.** **`grep -rn "document_attachments" src/ e2e/` → 0 hits.** Not in `src/integrations/supabase/types.ts` either — the client cannot even name it type-safely.

**RLS (4 policies, `pg_policy`):** select `r`, insert `a`, delete `d`, `viewer_restricted` `*` RESTRICTIVE. **There is NO UPDATE policy — permissive or otherwise.** Migration 342 says so explicitly: `-- UPDATE none -- no policy at all, so it is impossible, not merely forbidden`.

*(Drift note: migration 342's header argues `viewer_restricted` is "deliberately absent... Adding it would break the acceptance count of 3" — but migration 391 added it anyway. Live count is 4, not 3.)*

## 2. `public.payment_receipt_documents` — **BUILT & WIRED (this is what the UI uses)**

12 cols, **`receipt_id uuid NOT NULL` WITH a real FK** → `payment_receipts(id) ON DELETE CASCADE`. Row count **1**.

Differences vs `document_attachments`: real FK (not a trigger); receipt-only (not polymorphic); richer file metadata (`file_name`, `file_type`, `file_size`); OCR fields are `extraction_status`/`extracted_data`/`extraction_confidence`/`extraction_notes` (values `pending`/`extracted`/`needs_review`/`failed`) rather than `ocr_status`/`ocr_payload`; and it **has an UPDATE policy** (`prd_update_admin_accountant`) so extraction results can be written back.

**The UI uses `payment_receipt_documents` exclusively.** `document_attachments` is dead schema awaiting "phase 4/6/7".

## 3. Storage — **BUILT, and NOT a blocker**

Bucket `payment-receipt-documents`, private, 20 MB limit, broad MIME allowlist. `storage.objects` counts: `payment-receipt-documents` 1, `delivery-receipts` 1, `product-images` 22, `messenger-attachments` 3.

3 policies on `storage.objects` — `prd_storage_insert_admin_accountant` / `select_privileged` / `delete_admin_accountant`. **All three gate on `bucket_id` + role only. None constrains the object path.** The `${receiptId}/` prefix at `PaymentReceiptDocuments.tsx:368` is a pure client-side convention. **Storage will happily accept an upload under a `draft/<uuid>/` prefix today.**

## 4. Order of operations in `PaymentReceiptDocuments.tsx` — **file first, but only after the receipt exists**

`uploadReceiptDocuments(receiptId, userId, files)` at **:359** — note `receiptId` is a *required first argument*:

- **:368** `const path = \`${receiptId}/${safeRandomUUID()}-...\`` ← receiptId needed to even build the path
- **:370** `supabase.storage.from(RECEIPT_DOCS_BUCKET).upload(path, file, …)` ← **file uploaded**
- **:377–378** `.from("payment_receipt_documents").insert({ receipt_id: receiptId, … })` ← **row created after**
- **:387–390** on insert error, storage object is rolled back via `.remove([path])`
- **:396** audit `receipt_document_uploaded`

So within one file: **storage → row**. But the whole function is downstream of an existing `payment_receipts.id`.

**The already-built, unwired pieces:**
- **`ReceiptDocumentPicker` (:426)** — doc comment: *"Staged-file picker used inside the create form (before receipt exists)."* Holds `File[]` in React state. **Zero importers.**
- **`extractReceiptFromBytes` (`src/lib/receipt-ocr-bytes.functions.ts:56`)** — header: *"OCR/extract a payment receipt from raw bytes **BEFORE the receipt is saved**… Used by the create-receipt form to auto-fill amount, date, tracking number, and bank names the moment the user picks a file."* Accepts `{file_name, mime, base64}`, no document id, returns `structured` form fields. **Zero callers** (`grep -rn "extractReceiptFromBytes" src/ e2e/` → 0).
- Only **`ReceiptDocumentsList` (:530)** is imported, at `src/routes/_app.accounting.receipts.$receiptId.tsx:31,569` — the **detail** page, i.e. post-creation only.
- The create form is `DocumentWizard.tsx` (via `_app.accounting.receipts.create.tsx:~95`). **It has no file input, no upload, no OCR** — grep for `attachment|Picker|upload|ocr|File` returns only `PersianDatePicker` hits (:404, :506, :573).

## 5. What structurally BLOCKS attachment-before-document — 4 mechanical guards

**B1 — The existence trigger (the hard one).** `trg_validate_document_attachment_ref` BEFORE INSERT OR UPDATE OF `document_type, document_id` → `validate_document_attachment_ref()`. It maps `receipt`→`payment_receipts`, `payment`→`payment_vouchers`, then runs `EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)')` and raises SQLSTATE `23503` if absent. **A parent row must already exist. `document_id` being FK-free buys nothing** — the trigger is a hand-rolled FK.

**B2 — `dual` is refused outright.** Same function: `document_type='dual'` hits `_target IS NULL` → `RAISE EXCEPTION … ERRCODE='0A000'` (*"نوع سند «%» هنوز پشتیبانی نمی‌شود"*). The CHECK constraint permits `dual`; the trigger forbids it.

**B3 — No UPDATE policy ⇒ the "insert with placeholder, re-point later" workaround is dead.** Even with a sentinel `document_id`, `authenticated` has no permissive UPDATE policy on `document_attachments`, so re-pointing is impossible outside a `SECURITY DEFINER` RPC. And re-pointing would itself re-fire the trigger (it fires on `UPDATE OF document_id`).

**B4 — All three creation RPCs raise on `p_attachment_ids`.** Signatures accept it; bodies refuse it:
- `create_receipt(…, p_attachment_ids uuid[])` — *"A3 gives document_attachments a NOT NULL document_id and a BEFORE INSERT/UPDATE existence trigger, so an attachment row cannot exist before the document it belongs to… Phase 6 decides the upload order and wires this. Recorded as C8"* → `RAISE … ERRCODE='0A000'` (*"پیوست فایل در این نسخه هنوز پشتیبانی نمی‌شود"*)
- `create_payment(…, p_attachment_ids uuid[])` — same refusal, comment at ~:143–147
- `create_dual_document(…, p_attachment_ids uuid[])` — refusal at :84–87, *"a document whose purpose is evidence cannot yet hold the scanned slip"*

**B5 (secondary, for the OCR half).** `extractReceiptDocumentOcr` takes `InputSchema = { document_id: uuid }` (`receipt-ocr.functions.ts:62–64`) and loads a `payment_receipt_documents` row (:89–93) — it *cannot* run pre-save. But **B5 is already solved** by the unwired `extractReceiptFromBytes`.

**Not blockers:** storage RLS (B-none, path-free); the `storage_path` UNIQUE constraint (a `draft/<uuid>/` path is unique); the `ON DELETE CASCADE` on `payment_receipt_documents`; and the cleanup triggers `tg_cleanup_receipt_attachments` / `tg_cleanup_payment_attachments` (they only delete `document_attachments` when the parent is deleted).

## 6. Voucher / dual attachment surface — **ABSENT (UI) / PARTIAL (DB)**

- `payment_vouchers` (1 row): DB-side supported — `document_type='payment'` validates against it, and `trg_cleanup_payment_attachments` exists. **No UI whatsoever.**
- `dual_documents` (3 rows): **actively refused** by B2, and notably has **no** `trg_cleanup_*_attachments` trigger (see `pg_trigger` listing — dual has lock/delete-block/number triggers only). **No UI whatsoever.**
- `grep -rln "dual_document\|payment_voucher" src/ | xargs grep -ln "storage.from\|input type=\"file\"\|Upload"` → **0 files**.

---

## VERDICT TABLE

| Item | Status | Evidence |
|---|---|---|
| `document_attachments` schema + RLS | BUILT | `pg_constraint`/`pg_policy`; 0 rows |
| `document_attachments` app wiring | **ABSENT** | 0 hits in `src/`, `e2e/`, `types.ts` |
| `document_id` NOT NULL, no FK | CONFIRMED | `pg_constraint` → no `contype='f'` |
| Trigger enforces parent existence | BUILT (= the blocker) | `validate_document_attachment_ref()` |
| `payment_receipt_documents` + UI | BUILT & WIRED | `$receiptId.tsx:31,569` |
| Storage bucket + policies | BUILT, path-agnostic | 3 policies, bucket+role only |
| Pre-submit staged picker | **BUILT, UNWIRED** | `PaymentReceiptDocuments.tsx:426` |
| Pre-submit OCR from bytes | **BUILT, UNWIRED** | `receipt-ocr-bytes.functions.ts:56` |
| Create form upload/OCR | **ABSENT** | `DocumentWizard.tsx` — no file surface |
| `p_attachment_ids` on 3 RPCs | PARTIAL — accepted, then refused | `create_receipt` / `create_payment` / `create_dual_document` |
| Voucher/dual attachment UI | **ABSENT** | 0 files |

## [U] — could not determine
- **Why the picker + bytes-OCR were built then left unwired** — whether a commit reverted the wiring or it never existed. Settled by `git log -S "extractReceiptFromBytes" --oneline` and `git log -S "ReceiptDocumentPicker"` (I am read-only and cannot run git).
- **What `docs/execution/phase-2-PROGRESS.md` "C8"** and **`ledger-decisions` "A3"/"D10"** prescribe as the intended phase-6 upload order. Settled by reading those two files — they are cited by name in both RPC bodies and appear to contain the recorded owner decision this mission is working against.
- **Whether the owner decision that rejects create-then-attach postdates migration 342/349/355/361** — if so, the C8 refusals are stale-by-decision rather than pending-by-plan. Settled by dating the decision doc against those migrations.

## CHEAPEST PATH (mechanical consequence of the above)
`document_attachments` is unreachable without changing the trigger **and** adding an UPDATE policy **and** unfusing three RPCs. `payment_receipt_documents` needs only `receipt_id` to become nullable-until-claimed. The two unwired components already speak the second dialect: `ReceiptDocumentPicker` stages `File[]`, `extractReceiptFromBytes` fills the form from raw bytes with no row anywhere. Neither touches `document_attachments`.

---

## OG-67 — bank payments into the Asan bank template

## OG-67 RECON — bank payments → Asan layout 4, negative

### 1. `public.asan_list_bank_deposit_export(_from date, _to date)` — LIVE

`STABLE SECURITY DEFINER`, `search_path=public`, plpgsql, `#variable_conflict use_column`.
Migration lineage: `supabase/migrations/20260805153000_295_asan_bank_deposit_export_source.sql` → last touched by `20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql`.

**Returns (10 cols, NO direction column):** `doc_id uuid, doc_label text, doc_date date, party_name text, person_code text, tracking_number text, amount numeric, bank_code text, bank_title text, blocked_reason text`

**Reads:** `public.payment_receipts` ONLY. One CTE `r`, single `FROM public.payment_receipts pr`. No `payment_vouchers` anywhere in the body.

**Filters (verbatim):**
```
pr.status = 'approved'
AND pr.destination_bank_account_id IS NOT NULL
AND (pr.document_channel IS NULL OR pr.document_channel NOT IN ('cash','cheque'))
AND pr.reversed_at IS NULL
AND pr.payment_date BETWEEN _from AND _to
```
Guards: `has_any_role(auth.uid(), ARRAY['admin','accountant'])` else 42501 `'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید'`; null/inverted range → 22023.

**Lookups:** person code = `person_identifiers.value_normalized WHERE kind='asan_person_code'` on `COALESCE(pr.customer_person_id, (SELECT c.person_id FROM customers c WHERE c.id=pr.customer_id))`. Bank = `bank_accounts.accounting_code` / `.title` on `pr.destination_bank_account_id`.

**`blocked_reason` ladder:** no person code → `'کد آسان برای «…» ثبت نشده است'`; no bank code → `'کد آسان حساب بانکی مقصد ثبت نشده است'`; `amt IS NULL OR amt <= 0` → `'مبلغ این واریز معتبر نیست'`; `amt <> trunc(amt)` → not-integer-Toman.

**Verdict: ABSENT** for payments. It is receipts-only by construction and has no direction concept at all.

---

### 2. `public.payment_vouchers` — 28 columns

| # | column | type | null | note |
|---|---|---|---|---|
|1|`id`|uuid|NO|`gen_random_uuid()`|
|2|`voucher_number`|text|YES|UNIQUE|
|3|`amount`|numeric|NO|CHECK `amount > 0`|
|4|`payment_date`|date|NO||
|5|`payment_time`|text|YES|CHECK `^\d{2}:\d{2}$`|
|6|`payee_type`|text|NO|CHECK `supplier / external_party / customer / other`|
|7|`payee_supplier_id`|uuid|YES|FK suppliers|
|8|`payee_party_id`|uuid|YES|FK external_parties|
|9|`payee_customer_id`|uuid|YES|FK customers|
|10|`payee_name`|text|YES|**only required when `payee_type='other'`**|
|11|**`document_channel`**|text|**NO**|CHECK `card_to_card / paya / pol / satna / cash / cheque / other`|
|12|**`source_bank_account_id`**|uuid|**NO**|FK bank_accounts — the bank channel/account|
|13|`tracking_number`|text|**YES**||
|14–15|`cheque_number`, `cheque_due_date`|||gated by `_cheque_fields_chk`|
|16|`description`|text|YES||
|17|`status`|text|NO|default `'approved'`, CHECK `draft / approved / rejected`|
|18|`purchase_id`|uuid|YES||
|19–21|`created_by`, `created_at`, `updated_at`|||
|22|`payee_person_id`|uuid|**YES**|FK persons; `_payee_person_requires_payee_chk`|
|23|`endorsed_receipt_id`|uuid|YES|FK payment_receipts, cheque-only|
|24–28|`reversed_at`, `reversed_by`, `reversal_reason`, `reversal_journal_entry_id`, `reversal_document_number`||||

**Bank channel identifier:** `document_channel` (values, not a boolean) + `source_bank_account_id` (NOT NULL, always present). **Amount:** `amount` (always > 0 — the export never needs to store a sign). **Counterparty:** four-way — `payee_type` + one of `payee_supplier_id` / `payee_party_id` / `payee_customer_id` / `payee_name`, plus optional `payee_person_id`.

**Live counts:**
```
 document_channel |  status  | live | count      total_vouchers
 other            | approved |  t   |   1              1
```
Receipts for contrast: `other/pending_review 1`, `paya/pending_review 4`, `NULL/approved 4`, `NULL/pending_review 1`.

---

### 3. receipts vs vouchers, column-by-column for layout 4

| Layout-4 need | `payment_receipts` | `payment_vouchers` | gap |
|---|---|---|---|
| A `Date` | `payment_date` NOT NULL | `payment_date` NOT NULL | none |
| B `Code_M` (person code) | `customer_person_id` NOT NULL, fallback `customers.person_id` — 2 paths | `payee_person_id` **nullable**; else via `suppliers.person_id` / `external_parties.person_id` / `customers.person_id` — **4 paths** | **resolution fan-out, not a missing column** |
| C `Name_Moshtare` | `payer_name` **NOT NULL** | `payee_name` **nullable** → must COALESCE `suppliers.name`, `external_parties.full_name`, `customers.name`, `payee_name` | **name is not a single column on vouchers** |
| D `Shopmare_Peygeri` | `tracking_number` **NOT NULL** | `tracking_number` **NULLABLE** | **real gap — a bank payment can legally have no tracking number** |
| E `Mablagh` | `amount` (no CHECK) | `amount` CHECK `> 0` | none; the `amt <= 0` block branch is dead for vouchers |
| F `Bank_cod` | `destination_bank_account_id` **nullable** (hence the `IS NOT NULL` filter) | `source_bank_account_id` **NOT NULL** | none — strictly better, no filter needed |
| channel exclusion | `document_channel` nullable → `IS NULL OR NOT IN (…)` | `document_channel` **NOT NULL** → plain `NOT IN ('cash','cheque')` | none |
| reversal | `reversed_at` | `reversed_at` | none |
| approval | `status='approved'` | `status='approved'` | none |

**No column is missing from `payment_vouchers` that the template needs.** The work is (a) the 4-way name/person COALESCE, and (b) nullable `tracking_number`. The exact COALESCE chain already exists and is proven in `asan_list_journal_export`'s `'payment_voucher'` branch (`s.name` → `ep.full_name` → `cu.name` → `pv.payee_name` → `'؟'`), so this is reuse, not new design.

Live dry-run of the proposed voucher branch (read-only SELECT, no RPC change):
```
 id           | payment_date |      pname      | pcode |      tracking      |  amount  | bcode | channel
 0f32e946-…   | 2026-08-20   | مشتری آزمایشی ۸ |   2   | 654685413518674653 | 36000000 |   8   | other
```
→ one fully unblocked payment row exists today; `Mablagh` would be **-360000000**. A live two-directional gate is possible without writing fixture data.

Indexes present for the new read: `idx_payment_vouchers_date (payment_date DESC)`, `idx_payment_vouchers_source_account (source_bank_account_id, payment_date)`.

---

### 4. `layouts.ts` / `export-bank-deposit-rows.ts` — **BUILT, unwired**

- `src/lib/asan/layouts.ts:88-107` — `BANK_DEPOSIT_HEADERS` 15 wide, `Date, Code_M, Name_Moshtare, Shopmare_Peygeri, Mablagh, Bank_cod` + 9 `""`. No direction concept (correct — direction is in the value).
- `src/lib/asan/export-bank-deposit-rows.ts:25` — `export type BankFlowDirection = "receipt" | "payment";`
- `src/lib/asan/export-bank-deposit-rows.ts:43` — `direction?: BankFlowDirection | null` on `BankDepositRow`, documented as "Absent means `receipt`… the only data source wired today reads `payment_receipts`".
- `src/lib/asan/export-bank-deposit-rows.ts:57-61` — **`mablaghFor` ALREADY negates:**
  ```ts
  function mablaghFor(amount: string | number | null | undefined, direction: BankFlowDirection) {
    const rial = tomanStringToRial(amount);
    if (rial === null || direction !== "payment" || rial === 0) return rial;
    return -rial;
  }
  ```
  `-0` is explicitly avoided.
- `src/lib/asan/export-bank-deposit-rows.ts:66` — `const direction = r.direction === "payment" ? "payment" : "receipt";` (safe default).
- `src/lib/asan/export-bank-deposit-rows.ts:72` — `mablaghFor(r.amount, direction)` into column E.

**The mapping is complete. The only thing missing is a row with `direction: "payment"` ever reaching it.**

Wiring that must change with it:
- `src/lib/asan/export-bank-deposit.ts:42-49` `listBankDeposits` — passes RPC rows straight through; will carry `direction` for free once the RPC returns it.
- `src/lib/asan/export-bank-deposit.ts:59-61` `unverifiedNote` says *"فقط فیش‌های تأییدشده‌ای که … واریز شده‌اند"* — receipts-only copy, now wrong.
- `src/integrations/supabase/types.ts:10270-10284` — generated `Returns` has no `direction`; needs regeneration.
- `src/lib/asan/export-registry.ts:31` — `bank_deposits: BANK_DEPOSIT_EXPORT` (one entry, `docType: null`).

---

### 5. e2e coverage — `e2e/asan/`

`export-bank-deposits.spec.ts` (361 lines) is the primary. Asserts:

| line | assertion |
|---|---|
| 103-130 | header row byte-exact incl. `Name_Moshtare`/`Shopmare_Peygeri`, 15 cols, G–O `""` not null, no Persian |
| 133-157 | listed set == `status='approved' AND destination_bank_account_id IS NOT NULL` in range; every non-approved receipt absent; exclusion non-vacuous |
| 159-178 | `Mablagh == toman * 10`, `typeof === "number"`, `Bank_cod == bank_accounts.accounting_code`, date `^\d{4}/\d{2}/\d{2}$` |
| 180-215 | cross-check: journal debit total == deposit `Mablagh`; deposit `Code_M` ∈ journal account codes |
| 217-246 | blocked-not-dropped; asserts the RPC **source text** contains both `کد آسان…` strings and does **not** contain `payer_accounting_code` |
| 248-261 | `docType: null`, `layout: "bank_deposit"`, `available: true`; route contains `if (definition.docType)` |
| 263-268 | sales role → ≥400 with `اجازهٔ خروجی` |
| 270-284 | UI: option visible, not "هنوز ساخته نشده", note visible |
| **314-333** | **OG-65 two-sided sign test — but on CONSTRUCTED rows**: `receipt[4]===15000`, `payment[4]===-15000`, `typeof === "number"`, absent direction → `15000`, `Object.is(…, -0) === false` |
| 335-343 | both directions 15 cells wide, G–O `""` |
| 350-360 | template-2 guard: reads `export-journal-rows.ts` **as text** and asserts `not.toMatch(/direction\|BankFlowDirection\|-rial\|negat/i)` |

Spec header comment at :292-295 states outright: *"a payment row cannot be obtained from live data today"*.

Also: `final-verification.spec.ts:405-430` (5.2/8d) — RPC → workbook, 6 named headers, 15 columns; no sign assertion. `export-shell.spec.ts:240,278-283` — header constants only.

**So the sign logic is tested; the DATA PATH to it is not tested and does not exist.**

---

### 6. Template 2 (accounting document, layout 3) — negative-leak surface

Feed: `asan_list_journal_export(_from,_to,_filter)` → `journal_entries` (`status='posted'`, not reversed, no cheque legs) + `journal_lines`. `_filter` accepts `'payment'`, and `doc_kind='payment'` maps from `source_type='payment_voucher'`. Live: `payment/payment_voucher 1`, `receipt/payment_receipt 5`, `dual/dual_document 3`, `other/manual 2`.

Mapping: `src/lib/asan/export-journal-rows.ts:81-92` → E `amountCell(r.debit)`, F `amountCell(r.credit)`; `:60-63` `amountCell` is `tomanStringToRial(v)` with `0 → null` and **no sign handling of any kind** — it passes whatever it is given straight through.

Structural defences:
- DB: `journal_lines_debit_nonneg CHECK (debit >= 0)`, `journal_lines_credit_nonneg CHECK (credit >= 0)`, `journal_lines_one_side`. Live `min(debit)=0, min(credit)=0` over 22 lines. So a negative cannot originate in the data.
- Code: the two mappings are separate modules; `mablaghFor` is module-private (not exported) in `export-bank-deposit-rows.ts:57`.
- Spec: the source-text regex at `export-bank-deposits.spec.ts:357`.

**Leak vectors that survive:**
1. `payment_vouchers.amount` CHECK `> 0` means the sign is *created* by `mablaghFor`, never stored — so a shared "amount" helper is the only route. If OG-67 refactors `mablaghFor` into `src/lib/asan/amounts.ts` (shared with the journal mapping), the regex guard at :357 still passes (it only greps `export-journal-rows.ts`) and the negative reaches بدهکار/بستانکار.
2. The RPC gains a `direction` column; if a future export reuses `listBankDeposits` output for the journal layout, `buildJournalRows` ignores `direction` — safe today, but nothing asserts the **built journal cells** are non-negative. The guard is a text regex, not a value assertion.

---

## The exact RPC change needed

New migration (next free number — latest on disk is `20260827030000_401_ollama_declares_vision_so_the_pin_resolves.sql`, so **402**, re-checked against disk *and* remote at write time per the shared-tree rule). Per rule 5, the signature `(date, date)` is unchanged, so `CREATE OR REPLACE` alone is correct — **no `DROP FUNCTION` needed, and no defaulted parameter may be added.**

1. **Add an 11th OUT column `direction text`** to the RETURNS TABLE. This changes the row type — PostgREST and `types.ts` both need it, and `BankDepositRow.direction` already accepts it (`export-bank-deposit-rows.ts:43`).
2. **UNION ALL a voucher CTE `v` onto the existing `r` CTE**, keeping `r` byte-identical (rule 4: the live definition is the baseline; the receipt branch must not shift). Voucher branch:
   - `FROM payment_vouchers pv LEFT JOIN suppliers s ON s.id=pv.payee_supplier_id LEFT JOIN external_parties ep ON ep.id=pv.payee_party_id LEFT JOIN customers cu ON cu.id=pv.payee_customer_id`
   - name: `COALESCE(NULLIF(btrim(s.name),''), NULLIF(btrim(ep.full_name),''), NULLIF(btrim(cu.name),''), NULLIF(btrim(pv.payee_name),''), '')`
   - person code: `person_identifiers … kind='asan_person_code'` on `COALESCE(pv.payee_person_id, s.person_id, ep.person_id, cu.person_id)`
   - bank: `bank_accounts.accounting_code` / `.title` on **`pv.source_bank_account_id`**
   - filters: `pv.status='approved' AND pv.document_channel NOT IN ('cash','cheque') AND pv.reversed_at IS NULL AND pv.payment_date BETWEEN _from AND _to` — **no `IS NULL` disjunct** (`document_channel` is NOT NULL on vouchers) and **no bank-account NOT NULL filter** (it is NOT NULL).
3. **`amount` stays POSITIVE in the RPC.** The sign belongs to the presentation layer, which already implements it. Returning a negative from SQL would double-negate in `mablaghFor` and would also poison any other consumer.
4. `doc_label` for payments: `'پرداخت ' || to_char(pdate,'YYYY-MM-DD') || ' — ' || COALESCE(name, left(id::text,8))` (mirrors the receipt's `'واریز '`).
5. `blocked_reason`: reuse the receipt ladder, with payment-worded strings. **Add one branch vouchers need and receipts do not:** `tracking IS NULL` → a Persian "شمارهٔ پیگیری این پرداخت ثبت نشده است" (or an explicit owner decision to allow an empty column D). `amt <= 0` is unreachable for vouchers but keep it — it is the shared ladder.
6. `ORDER BY pdate, id` across the union.
7. Role gate and range validation unchanged; still `STABLE SECURITY DEFINER SET search_path=public`.

Also required, non-RPC: `src/integrations/supabase/types.ts:10272-10283` regenerate; `src/lib/asan/export-bank-deposit.ts:59-61` `unverifiedNote` rewritten (it currently promises receipts only); `export-bank-deposit.ts:18-22` and `export-bank-deposit-rows.ts:39-42` doc comments both assert "the only data source wired today … yields receipts only" and become false.

## What a two-directional gate must assert

Today's OG-65 test (`export-bank-deposits.spec.ts:314-333`) proves the *function*; it cannot prove the *pipeline*. The gate must add, against **live data through the RPC**:

1. **The RPC returns at least one `direction='payment'` row** — non-vacuity first, or every assertion below is free.
2. **That row's built `Mablagh` is `-(amount × 10)`**, `typeof === "number"`, and `Object.is(cell, -0) === false`. The live voucher `0f32e946-…` gives `-360000000`.
3. **Every `direction='receipt'` row's `Mablagh` is `> 0`** — the closing direction. A change that negated everything must fail here.
4. **`SELECT` cross-check**: the set of `direction='payment'` `doc_id`s equals `payment_vouchers WHERE status='approved' AND reversed_at IS NULL AND document_channel NOT IN ('cash','cheque') AND payment_date BETWEEN …` — and equally, that a `cash` and a `cheque` voucher are **absent** (the owner's manual-channel rule). The exclusion must be proved non-vacuous, per the OG-46 precedent at spec line 148-155.
5. **No `doc_id` appears twice** across the union (a receipt id and a voucher id can never collide, but a botched UNION can duplicate).
6. **Template-2 containment, by VALUE not by regex**: drive `asan_list_journal_export(_filter:'payment')` over the same range, build the rows, and assert **every** column E and F cell is `null` or `> 0` — never negative. This is the assertion the current source-text guard at :357 does not make, and it is the one that survives a refactor that moves `mablaghFor` into a shared module. Keep the text guard too; it catches the import before the value does.
7. **The cross-path amount check for a payment** (mirroring :180-215 for receipts): the journal document's debit total for that voucher equals `|Mablagh|` — same magnitude, opposite representation.
8. `blocked_reason` for a voucher with no tracking number / no Asan person code is set rather than the row being dropped.

## [U] — not determined

- **Whether `document_channel='other'` should reach the bank template.** The receipts filter admits it (`NOT IN ('cash','cheque')`) and the single live voucher is `'other'`, so a naive port exports it. Whether the owner's "bank = automatic" covers `other` is an owner question. Settled by: an owner answer, or an audit of what `create_payment` writes `'other'` for.
- **Whether a bank payment with NULL `tracking_number` should block or export with an empty column D.** Settled by: owner decision. No live example exists to observe (the one voucher has a tracking number).
- **Whether adding an 11th OUT column breaks any other caller.** Grep found only `src/lib/asan/export-bank-deposit.ts:43` and the two specs calling `/rpc/asan_list_bank_deposit_export`; no view or function references it (`prosrc ILIKE '%asan_list_bank_deposit_export%'` returned nothing). Settled by: re-grep at implementation time.

---

## Phase 8 — integrated E2E and the seed script

## PHASE 8 RECON — INTEGRATED E2E

### VERDICT

**The seed cannot violate the three conditions, because it cannot run at all.** It aborts on its third statement and rolls back to zero rows. Condition (c) is satisfied by construction (no ledger rows of any kind). Condition (b) is **unsatisfied** — no teardown exists, and the seed's marker is not the one the harness recognises.

---

### 1. `test-data/seed-full-scenario.sql` (178 lines) — **PARTIAL: exists, does not execute**

Guard `test-data/seed-full-scenario.sql:32-42` — refuses unless `current_database()='afrakala'` and `count(*) FROM customers <= 200`. Live: `afrakala`, **28 customers** → guard passes.

| Table | Lines | Rows | Marker |
|---|---|---|---|
| `bank_accounts` | 51-55 | 2 | `aaaaaaaa-…` / `'E2E …'` |
| `persons` | 61-69 | 6 | `bbbbbbbb-…` |
| `person_identifiers` | 78-85, 92-96 | 5 + 2 | via `bbbbbbbb-…` |
| `customers` | 102-107 | 3 | `cccccccc-…` |
| `suppliers` | 109-113 | 2 | `dddddddd-…` |
| `external_parties` | 118-121 | 1 | `eeeeeeee-…` |
| `sales_quotes` | 127-132 | 1 | `ffffffff-…` |

**`journal_entries`: ZERO. Posted documents: ZERO.** Only textual mentions — `:48` (`post_receipt_accounting` in a comment), `:172` (`-- 14 NEGATIVE edit a posted entry`). Every insert is `ON CONFLICT DO NOTHING`; all wrapped `BEGIN;`(44)…`COMMIT;`(134). **Condition (c) is met.**

#### Statements that FAIL (verbatim)

**(a) First failure — line 78, aborts the whole file.** `value_raw` is `NOT NULL` with no default; the seed supplies only `value_normalized`:
```sql
INSERT INTO public.person_identifiers (person_id, kind, value_normalized, status)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'asan_person_code', '100001', 'provisional'),
```
`trg_person_identifiers_normalize` (BEFORE INSERT, tgtype 23) does not backfill it — it **overwrites** the supplied column from the missing one:
```sql
NEW.value_normalized := public.normalize_identifier(NEW.kind, NEW.value_raw, true);
```
and with `value_raw` NULL that call **raises**, measured:
```
ERROR:  مقدار شناسه نامعتبر است
CONTEXT: PL/pgSQL function normalize_identifier(text,text,boolean) line 16 at RAISE
```

**(b) Line 118** — `external_parties.person_id` is `NOT NULL`, no default, unsupplied; the only two triggers are `trg_external_parties_updated_at` (BEFORE **UPDATE** only) and `trg_normalize_phone` — neither sets it:
```sql
INSERT INTO public.external_parties (id, full_name, accounting_code)
```

**(c) Line 127** — `sales_quotes.customer_name` **and** `customer_phone` are both `NOT NULL`, no default, unsupplied. `tg_sales_quotes_derive_person` sets only `customer_person_id`:
```sql
INSERT INTO public.sales_quotes (id, quote_number, customer_id, customer_person_id, status, final_amount)
```

**Net effect today:** `\set ON_ERROR_STOP on` (:26) + open transaction ⇒ psql aborts at 78 and rolls back; `bank_accounts` and `persons` never persist. Confirmed nothing is present now:
```
bank_accounts 0 | persons 0 | customers 0 | suppliers 0 | external_parties 0 | sales_quotes 0
```

**Two triggers that looked dangerous and are not** (both checked, both safe):
- `sales_quotes_assign_number` assigns only `IF new.quote_number IS NULL OR btrim(...)=''` — the seed supplies `'E2E-Q-0001'`, so **no Asan sequence number is consumed**.
- `tg_asan_burn_sales_quote_number` on DELETE calls `asan_burn_document_number`, which is a scoped `UPDATE public.asan_export_numbers … WHERE source_id = _source_id` — no INSERT, no residue if none was minted.
- `trg_sales_quotes_stock_out` and `trg_product_video_chain_on_accept` are tgtype **17 (ROW UPDATE only)** — a direct INSERT with `status='accepted'` fires neither, so no stock movement is created.

Also: companion file `test-data/seed-persian-names.sql`, required by the header (`:10-11`), **does not exist** — `test-data/` contains only `seed-full-scenario.sql`.

---

### 2. Teardown — **ABSENT**

No teardown for this seed exists anywhere. `docs/verification/` holds only phase-2/3/4 cleanups (`phase-2-remediation-testdata-cleanup.sql`, `phase-3-stress-cleanup.sql`, `phase-4-stress-cleanup.sql`) — none reference the `aaaaaaaa-`…`ffffffff-` prefixes. Only two files mention those UUIDs, and they are unrelated fixtures: `e2e/asan/export-shell.spec.ts:75-78`, `e2e/asan/export-sales-batch-selected.spec.ts:23`.

**Cleanup would be provable** (fixed UUIDs, FK order customers/suppliers/person_identifiers → persons; no block-delete trigger on any target table) — but **condition (b) says the teardown must exist and be established *before* seeding**, and it does not.

**Marker mismatch — concrete blocker:** the seed marks rows `'E2E …'` / UUID prefix. The harness marker is `E2E_PREFIX = "E2E_AUDIT_20260729_"` (`e2e/helpers/app.ts:5`). So the seed text would be **rejected outright** by `assertE2eOnlySql` (`e2e/helpers/db-write.ts:15-29`), and its rows are invisible to the leak detector at `e2e/asan/final-verification.spec.ts:273-276`, which looks for `name like 'E2E_AUDIT_%'` / `customer_name like 'E2E_AUDIT_%'`.

---

### 3. Immutability / block-delete triggers — target tables are **CLEAN**

Full `pg_trigger` sweep (`tgisinternal=false`, schema `public`):
```
dual_documents    trg_dual_documents_block_delete_when_posted
dual_documents    trg_dual_documents_lock_when_posted
journal_entries   trg_journal_entry_immutable
journal_lines     trg_journal_line_immutable
payment_receipts  trg_payment_receipts_block_delete_when_posted
payment_receipts  trg_payment_receipts_lock_when_posted
payment_vouchers  trg_payment_vouchers_block_delete_when_posted
payment_vouchers  trg_payment_vouchers_lock_when_posted
product_suppliers product_suppliers_audit_delete
```
**None of the seven seed target tables appears.** The 32 triggers they do carry are `updated_at`, audit, normalise, and mirror triggers only.

The blocking mechanism, verbatim — no role exemption, no `WHEN` clause:
```sql
CREATE OR REPLACE FUNCTION public.tg_journal_entry_immutable() ...
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید'
      USING ERRCODE = 'P0001';
```

**OG-56's two undeletable rows confirmed live** — both `manual`/`posted`, both still carrying the E2E marker:
```
81903a4c-a8f9-4d8c-869e-dad1595ae897 | manual | posted | E2E_AUDIT_20260729_ASAN_RCP_PAYMENT
db8a628c-d560-45f6-8083-be6804f4c345 | manual | posted | E2E_AUDIT_20260729_ASAN_JRN_UNBALANCED
```
All 11 `journal_entries` are `posted`. (Aside, not asked: `6d6b1896-…` reads `?????? ?????? …` — surviving residue of the 2026-07-11 Persian corruption.)

---

### 4. OG-46 option (b) — current pattern is **BUILT**; applying it to Phase 8 is **ABSENT**

**Layers:**
- `e2e/helpers/db.ts:19-33` — `assertReadOnlySql`; `dbScalar`/`dbRows` are SELECT/WITH/SHOW only, as `postgres`.
- `e2e/helpers/db-write.ts:15-29` — `assertE2eOnlySql`; requires a marker, refuses `drop|truncate|alter|grant|revoke|vacuum|analyze|refresh|merge`. Delivery is `docker exec -i` + Buffer stdin (`:59-63`), not `docker cp`.
- `e2e/helpers/pgrest.ts` — `mintJwt`, `rest`, `userWithRole` for role-scoped API calls.

**Per-spec shape today** (canonical: `e2e/persons/aliases-crud.spec.ts:11-38`): module-level `TAG = ${E2E_PREFIX}ALIAS300_` + fixed UUID constants → a local `cleanup()` issuing scoped `DELETE`s (including `audit_logs`) → called in **both** `beforeAll` and `afterAll`, with `afterAll` re-querying to prove zero (`:118-121`, which also asserts `person_fk_drift_report()` = 0).

**40 specs use `dbExecE2e`; 40 declare `test.afterAll`.** Config is `fullyParallel: false`, `workers: 1` (`playwright.config.ts:39,42`).

**Which specs share state — the real coupling is ~10 specs asserting GLOBAL unscoped baselines**, so any foreign row (another spec, or the owner working in the DB) moves them:

| Spec | Global baseline |
|---|---|
| `asan/export-journal.spec.ts:113-124` | `journal_entries`, `journal_lines` |
| `asan/export-receipts-payments.spec.ts:126-136` | `journal_entries`, `journal_lines` |
| `asan/export-numbering.spec.ts:73,94` | `asan_export_numbers` |
| `asan/export-purchase.spec.ts:122,141` | `asan_export_numbers` |
| `asan/export-shell.spec.ts:519,530,637` | `asan_export_numbers` |
| `asan/export-sales-batch-selected.spec.ts:27,117` | `asan_export_numbers` |
| `asan/export-bank-deposits.spec.ts:72,79` | `payment_receipts` |
| `asan/product-asan-code.spec.ts:49,57` | `products` |
| `asan/product-video-chain.spec.ts:88-89` | `product_video_chain`, `tasks` |
| `asan/final-verification.spec.ts:305-322` | 9 tables incl. `persons`, `asan_person_code` |

**The mission-11 failure, in the code, verbatim** (`e2e/asan/export-receipts-payments.spec.ts:107-119`) — this is exactly what option (b) must prevent:
```
-- OG-56: these two are status='posted' and trg_journal_entry_immutable refuses
-- every DELETE on a posted entry, even for supabase_admin. Without this
-- exclusion the DELETE raises, dbExecE2e throws, and beforeAll dies -- which
-- took all 23 tests in these two files out on 2026-08-25. Owner's decision:
-- exclude by id, do not reverse them, do not touch the trigger.
and id not in ('db8a628c-d560-45f6-8083-be6804f4c345',
               '81903a4c-a8f9-4d8c-869e-dad1595ae897');
```

**Concrete shape of option (b) for Phase 8:** drop the single shared `seed-full-scenario.sql` as a *run-once global*; instead give each Phase 8 spec (i) its own `${E2E_PREFIX}P8_<spec>` tag, (ii) its own UUID block, (iii) a local `cleanup()` called in `beforeAll` **and** `afterAll`, (iv) an `afterAll` count-zero proof, and (v) **marker-scoped** baselines (`… WHERE description LIKE '${MARK}%'`) rather than the global `count(*)` above. The seed file's role shrinks to shared *reference* rows only (`bank_accounts`) — and even those must carry `E2E_AUDIT_20260729_` to pass `assertE2eOnlySql`. Note the existing pattern already inserts `journal_entries` with `status='draft', posted_at=null` (`export-receipts-payments.spec.ts:99-100`), which is the compliant precedent for condition (c).

---

### 5. Items 8.1–8.5 — quoted and assessed

```
- [ ] 8.1 `test-data/seed-full-scenario.sql` — Scope: `test-data/` — M
- [ ] 8.2 Full E2E: create one of each type through the UI, verify balances — Scope: tests — M
- [ ] 8.3 Export all three, compare against expected rows — Scope: tests — M
- [ ] 8.4 Role matrix test: each role can do exactly what it should — Scope: tests — M
- [ ] 8.5 Negative tests: no Asan code, unbalanced, fractional, duplicate — Scope: tests — M
     Accept: each is refused with the correct error code and leaves zero rows.
```

| Item | Verdict | Evidence |
|---|---|---|
| **8.1** | **PARTIAL** | File exists (178 lines) but aborts at `:78`; companion `seed-persian-names.sql` missing; no teardown; wrong marker. |
| **8.2** | **PARTIAL** | Wizard creation exists — `e2e/phase6/wizard.spec.ts`, `m6-r1-wizard-branches.spec.ts`, `gate-a-phase-6/wizard-gate-a{,-2..-7}.spec.ts` (11 files). **But `gate-a-phase-6/` is NOT in `playwright.config.ts` testMatch** (it has its own `playwright.gate-a.config.ts`). No spec asserts *balances* after UI creation. |
| **8.3** | **BUILT** | `asan/final-verification.spec.ts:333-455` — five tests opening real xlsx and matching headers against `asan-layouts.md`, incl. sales, purchase, accounting-document, bank-deposit. |
| **8.4** | **PARTIAL** | Role coverage is broad but scattered across 25 specs (`persons/permission-matrix.spec.ts`, `purchase/c5-permissions.spec.ts`, `security/viewer-restrictions.spec.ts`, `asan/export-shell.spec.ts:563-585`, `final-verification.spec.ts:153-266`). No single spec asserts the **matrix** for the Phase 8 document types. |
| **8.5** | **PARTIAL** | Unbalanced/fractional/duplicate covered (`export-journal`, `export-shell.spec.ts:369-390`, `export-sales-batch-selected.spec.ts:127`, `persons/duplicate-mobile-blocked.spec.ts`). The **"no Asan code"** negative is the one the seed's person `…0002` was built for — and that row is exactly what never gets created. |

---

### 6. Suite size and testMatch

`playwright.config.ts:9-34` — **15 directory patterns**: `requirements`, `business-flows`, `persons`, `purchase`, `security`, `scoring`, `capital`, `warehouse`, `marketing`, `clusters`, `products`, `asan`, `branding`, `updates`, `phase6`.

**91 spec files, 506 static `test()` calls** (62 marked `.skip`/`.fixme`):
```
persons 127 | asan 181 | purchase 56 | security 35 | requirements 20 | business-flows 13
products 12 | phase6 12 | updates 11 | branding 9 | marketing 8 | scoring 7 | capital 6
clusters 5 | warehouse 4
```
**Not matched** (invoke explicitly): `auth` (4 files/6), `gate-a-phase-6` (10/32), `pwa` (1/12), `unit` (1/3), `e2e/admin-session-check.spec.ts`. `e2e/backend/` holds no `.spec.ts`.

**[U] Exact runtime count.** Static grep cannot expand `describe` loops or parameterised generators. `npx playwright test --list` would settle it — not run, per constraint.

---

### CONDITION-BY-CONDITION

| Condition | Status |
|---|---|
| **(a) verified backup first** | **Available, not fresh.** Two dumps exist with md5 matching the values recorded in `docs/execution/00-progress.md`: `deploy/lan/backups/afrakala-pre-restart-20260826.dump` = `3bd728e6b6c5cf41256b509e886bff9c`, `pre-docker-restart.dump` = `fc1c7b94ccf1364fb0e0b98043ffa38a`. Both predate this mission; a restore needs `--disable-triggers` (circular FKs). |
| **(b) only marked rows with PROVEN cleanup** | **VIOLATED.** No teardown exists, and the seed's `'E2E '` marker fails `assertE2eOnlySql` and is invisible to the `E2E_AUDIT_%` leak detector. |
| **(c) no posted ledger rows** | **MET.** Zero `journal_entries`; zero posted anything; none of the seven target tables carries a block-delete or immutability trigger. |

**Recommendation:** do not run it as-is — not because it is dangerous, but because it is a no-op that will read as a failure. Fix the four NOT NULL gaps (`value_raw`, `external_parties.person_id`, `sales_quotes.customer_name`/`customer_phone`), re-mark every row with `E2E_AUDIT_20260729_`, and **write the teardown first** — that is condition (b) in its literal form: *a row that cannot be deleted must not be created.*

---

## M11 — hold_credit as a revolving ceiling

# M11 RECON — hold_credit / revolving ceiling

## 1. Does `hold_credit` exist? — **BUILT, INACTIVE (dead code)**

`pg_proc` (public schema):

| function | args | status |
|---|---|---|
| `hold_credit` | `p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid` | **EXISTS**, 0 callers |
| `release_credit` | same shape | **EXISTS**, 0 callers |
| `increase_credit` | `..., p_receipt_id uuid, ...` | **EXISTS**, 2 callers (live) |
| `_ensure_credit_balance` | `p_customer_id uuid` | EXISTS |
| `get_customer_credit` | `p_customer_id uuid` | EXISTS, 1 caller |

**A second, more complete reservation family also already exists and is 100% dead:**

```
can_use_customer_capital_allocation(p_customer_id, p_amount)
hold_capital_allocation(p_customer_id, p_amount, p_invoice_id, p_user_id)
release_capital_allocation(...)   consume_capital_allocation(...)
refund_capital_allocation(...)    _capital_alloc_used(p_kind, p_alloc_id) -> (held, consumed)
```
backed by table `capital_allocation_ledger` (hold/release/**consume**/refund, `held_before/after`, `consumed_before/after`, `reference_type/reference_id`, RLS + sales-scoped SELECT policy).

```
SELECT allocation_kind, transaction_type, count(*) FROM capital_allocation_ledger GROUP BY 1,2;
(0 rows)
```

Source references — `hold_credit`/`release_credit`/`hold_capital_allocation`/`consume_/release_/refund_capital_allocation` appear **nowhere in `src/`** except `src/integrations/supabase/types.ts` (generated) and one comment at `src/hooks/capital/useDynamicCapital.ts:43`. Nothing named `credit_hold` or `reserved_credit` exists anywhere.

**Verdict: nothing needs to be built from scratch. The reservation primitives are built; they are unwired, and `hold_credit` is written against the wrong model (see §2).**

---

## 2. The credit machinery — TWO COMPETING MODELS, both live

### Where the CEILING is stored
`customer_capital_allocations_dynamic.final_limit`, keyed by `capital_setting_id` → `daily_capital_settings.capital_date`.
```
cust_alloc_rows | with_limit
             14 |          9
```
`customer_credit_profile.credit_limit` is the *other* candidate — **it has 0 rows** (see blocker below).

### Model A — CEILING (revolving). What the UI and e2e use.
`get_customer_dynamic_credit` already implements the owner's model:
```sql
GREATEST(v_final_limit - COALESCE(v_outstanding,0) - COALESCE(v_held,0), 0) AS available_credit
```
`v_final_limit` = latest `customer_capital_allocations_dynamic.final_limit`; `v_outstanding` = `customer_credit_profile.outstanding_balance`; `v_held` = `customer_credit_balance.held_credit`.

**"Free credit" numerically today = ceiling − outstanding − held.** `held_credit` is *already* subtracted. The read side of the reservation is **BUILT and ACTIVE** — it just always reads `held = 0` because nothing ever writes it.

Caller: `src/routes/_app.sales.quotes.new.tsx:180`.

### Model B — WALLET. What `hold_credit`/`increase_credit` write.
`customer_credit_balance.available_credit` is a *stored* number. `hold_credit` **decrements it** and guards on it:
```sql
IF v_available < p_amount THEN RAISE EXCEPTION 'اعتبار کافی نیست (موجودی: %، درخواست: %)' ...
v_new_available := v_available - p_amount;
v_new_held      := v_held + p_amount;
```
`increase_credit` **increments it** (mints). `get_customer_credit` returns it raw.

`get_customer_dynamic_credit` **ignores `available_credit` entirely.** So the two models never reconcile.

### `calculate_customer_realtime_credit` (preview only, `STABLE`)
Computes `final_limit` on the fly: `weighted_score / Σpeer_scores × salesperson allocated_capital`, capped by `customer_credit_profile.credit_limit` (`binding_constraint` = `formula` | `credit_limit` | `overdue` | `no_salesperson` | `no_capital`). **Does not read or write `held_credit`.** Caller: `src/hooks/credit/useDynamicScoring.ts:393`.

### Live data
```
customer_credit_ledger:  payment=4 (2026-07-25 … 2026-08-20), adjustment=1.  hold=0, release=0.
customer_credit_balance: 12 rows | nonzero_held=0 | sum_avail=10,225,000,000.00 | sum_held=0.00
customer_credit_profile: 0 rows
```

### ⛔ BLOCKER — `hold_credit` cannot succeed on this database as written
`_ensure_credit_balance` seeds a new row from
`COALESCE((SELECT credit_limit FROM customer_credit_profile WHERE customer_person_id=_person_id), 0)`.
`customer_credit_profile` has **0 rows** → seeds `available_credit = 0` → `hold_credit` raises `اعتبار کافی نیست` for every customer that does not already have a hand-seeded balance row. Its guard must be repointed at the ceiling (`final_limit − outstanding − held`), not at the stored wallet.

---

## 3. Quote finalization — `update_sales_quote_status`. **Does NOT touch credit.**

`public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text DEFAULT NULL)` → `TABLE(id, status, cancel_reason)`, `SECURITY DEFINER`.
Enum `sales_quote_status`: `draft, sent, accepted, rejected, canceled`. Finalization = **`accepted`**.

Frontend caller: `src/lib/sales/quote-status.functions.ts:103`.

The `accepted` branch does exactly three things — **no credit call anywhere in the body**:
```sql
IF p_next = 'accepted'::public.sales_quote_status THEN
  PERFORM public.apply_required_services_for_quote_item(i.id) FROM public.sales_quote_items i WHERE i.quote_id = p_quote_id;
  -- ... _missing check -> RAISE 'خدمت اجباری برای این کالاها ثبت نشده است: %'
END IF;

UPDATE public.sales_quotes AS sq SET status = p_next WHERE sq.id = p_quote_id;

IF p_next = 'accepted'::public.sales_quote_status THEN
  -- INSERT INTO public.tasks (... assigned_queue 'store' ...) idempotent
END IF;
```

Triggers on `sales_quotes` (all 23 inspected): `sales_quotes_validate_status`, `sales_quotes_assign_number`, `audit_sales_quotes`, `tg_sales_quotes_derive_person`, `trg_sales_quote_stock_out`, `tg_product_video_chain_on_accept`, `tg_asan_burn_sales_quote_number`, `tg_normalize_phone_columns`, `set_updated_at`. **None touches credit.**

The *only* credit guard on the quote path is **advisory and read-only**: the `new.tsx` UI reads `get_customer_dynamic_credit` and records an exception (`quote_exception_type`/`_amount`/`_text`) — it records the shortfall, it does not reserve against it.

### ⚠️ Design trap in `sales_quotes_validate_status`
```sql
IF old.status IN ('accepted','rejected','canceled') THEN
  RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)' ...
IF NOT ( (old.status='draft' AND new.status IN ('sent','canceled'))
      OR (old.status='sent'  AND new.status IN ('accepted','rejected','canceled')) )
```
**An `accepted` quote can never move to `canceled`.** So "release on cancellation" has **no status-transition path** for a quote that ever reserved. Cancel only reaches quotes in `draft`/`sent`, which will never have held anything. Release must therefore come from payment (receipt) or from a new explicit release path — reserving on accept with only a cancel-release would strand every hold permanently.

---

## 4. Receipt approve/post — **affects credit today, and it MINTS**

`post_receipt_accounting(p_receipt_id, p_user_id)` (`SECURITY DEFINER`; the only journal writer) — after flipping `posting_status='posted'`:
```sql
PERFORM public.increase_credit(v_receipt.customer_id, v_receipt.amount, v_receipt.id, p_user_id);
```
Called from `src/routes/_app.accounting.accounting.receipts.$receiptId.tsx:338` (and `get_customer_credit` at `:261`).
Journal line 2: `('customer_credit', customer_id, 0, amount, 'افزایش اعتبار/کاهش بدهی مشتری')`.

`create_receipt(...)` — **second mint path**, step 9 of its body:
```sql
PERFORM public.increase_credit(p_customer_id, p_amount, _receipt_id, _uid);
```

No trigger on `payment_receipts` or `payment_receipt_links` touches credit (12 triggers inspected: number burn, attachment cleanup, phone normalize, delete-block-when-posted, derive-person, allocation limits on approve, lock-when-posted, employee-score recompute, updated_at).

**This is exactly the behaviour OG-17 rejects:** a receipt increments the stored `available_credit` wallet — it mints. Under the owner's model it must decrement `held_credit` (release ceiling) and/or reduce `outstanding_balance`; the ledger row shape (`transaction_type='payment'`) is already correct.

---

## 5. Tables a ceiling reservation needs — **ALL ALREADY EXIST**

| need | exists? | evidence |
|---|---|---|
| per-customer held total | **YES** | `customer_credit_balance.held_credit numeric(15,2) NOT NULL DEFAULT 0`, PK `customer_id`, FK→`persons`, trigger `tg_credit_derive_customer_person` |
| hold/release audit trail | **YES** | `customer_credit_ledger` — CHECK `transaction_type IN ('hold','release','charge','payment','adjustment')`, `reference_type`/`reference_id`, idx `ledger_reference_idx` |
| richer hold+consume ledger | **YES, unused** | `capital_allocation_ledger` — CHECK `('hold','release','consume','refund')`, `held_before/after`, `consumed_before/after`, idx `idx_cal_ref` |
| the ceiling itself | **YES** | `customer_capital_allocations_dynamic.final_limit` (+ `binding_constraint`, `weighted_score`, `salesperson_id`) |
| aggregate helper | **YES** | `_capital_alloc_used(p_kind, p_alloc_id) OUT held, OUT consumed` |
| audit log | **YES** | `hold_credit`/`release_credit` already INSERT `audit_logs` actions `credit_hold` / `credit_release` |

**Nothing new to create. No migration adds a table; no FK to `persons` is needed, so the migration-328 registry gate is not in play.**

RLS on all three credit tables: `viewer_restricted` RESTRICTIVE + role-gated read/write; every function is `SECURITY DEFINER` so writes pass regardless.

---

## 6. e2e coverage

| spec | asserts | effect of reserving on accept |
|---|---|---|
| `e2e/business-flows/212-quote-credit-guard.spec.ts` | `get_customer_dynamic_credit` fields: `available_credit >= 200000` (sufficient), `has_overdue`, `has_allocation`, shortfall `available_credit === 100000` (`:646`). **`:728` re-asserts `available_credit === 100000` AFTER quotes were created** — i.e. it pins that quote *creation* does not consume. Also asserts exception dialogs (`مشتری مانده معوق دارد`, `کسری اعتبار`, `مشتری اعتبار قابل استفاده ندارد`) and API anti-bypass. | **SAFE.** `grep "accepted\|update_sales_quote_status"` on this file → **no matches**. It never finalizes a quote; all fixtures stay `draft`/`sent`. |
| `e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts` | `final_limit > 0`, `binding_constraint ∈ {formula, credit_limit}`, `no_salesperson`/`overdue`/`no_capital` branches, `weighted_score` round-trip, recompute audit rows. Never reads `held_credit`. | **SAFE.** |
| `e2e/scoring/manual-score-preview.spec.ts`, `threshold-levels.spec.ts` | scoring rules/thresholds UI. No credit balance assertions. | SAFE. |

No spec asserts `hold_credit`, `release_credit`, or `held_credit` anywhere.

---

## Where a reservation hooks in

1. **Reserve** — `update_sales_quote_status`, inside the existing `IF p_next = 'accepted'` block, **after** the mandatory-services `_missing` check and **after** the `UPDATE sales_quotes SET status`, alongside the `tasks` INSERT. That block is already idempotent-aware and is the single accept chokepoint (the status trigger forbids re-entering `accepted`, so a hold there fires at most once per quote).
2. **Guard** — replace `hold_credit`'s wallet check with the ceiling check already written in `get_customer_dynamic_credit`: `final_limit − outstanding_balance − held_credit`. Stop decrementing `available_credit` (double-counts against Model A); write `held_credit` only.
3. **Release on payment** — `post_receipt_accounting` and `create_receipt`, at the existing `PERFORM public.increase_credit(...)` call sites: release held ceiling instead of minting `available_credit`.
4. **Release on cancellation** — the `p_next = 'canceled'` branch of `update_sales_quote_status` covers `draft`/`sent` only. **`accepted → canceled` is blocked by the status trigger**, so an accepted-and-reserved quote has no cancel path today. This needs an owner decision (widen the trigger, or a dedicated reversal RPC).

## Unresolved

- **[U] Reservation amount basis.** `sales_quotes` carries `final_amount` and `deposit_amount`; whether the hold is `final_amount` or `final_amount − deposit_amount` is a product decision. Settles by: owner ruling, or `\d public.sales_quotes` + the OG-17 note.
- **[U] Which ledger to use.** `customer_credit_ledger` (already has `hold`/`release`, already the wallet's log) vs `capital_allocation_ledger` (richer, has `consume`, zero rows, zero callers, but keyed by allocation id not customer). Both are built. Settles by: owner ruling on whether "consume on invoice" is in M11 scope.
- **[U] `customer_credit_profile` is empty (0 rows)** while `get_customer_dynamic_credit` subtracts `outstanding_balance` from it. So `outstanding` is currently always 0 and free credit == full ceiling. Settles by: finding what was meant to populate that table (`update_customer_overdue_status`, `recompute_customer_credit_scores`) — not investigated in this recon.

---

