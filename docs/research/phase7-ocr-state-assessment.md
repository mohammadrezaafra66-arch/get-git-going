# Phase 7 (OCR) — what is already built, measured before building anything

**Date:** 2026-08-26 · **Mission:** 14, step zero · **Migration:** 397 · production لمس نشد

Per RULE 3, this mission started by asking *what does this already do* rather than *what must
I build*. The answer changes the mission substantially: **OCR is built and working. What is
missing is where it PERSISTS, which branches it reaches, and — until migration 397 — which
engine it asked.**

---

## 1. Item-by-item state of 7.1–7.7

| # | Checklist item | Actual state | Evidence |
|---|---|---|---|
| 7.1 | `docs/ocr/requirements.md` | **BUILT** — 122 lines, all sections present | file exists |
| 7.2 | upload → `document_attachments` | **NOT BUILT** | table has **0 rows** and **zero references anywhere in `src/`**; the UI writes to `payment_receipt_documents` instead |
| 7.3 | OCR result → `ocr_payload` | **NOT BUILT** | nothing in `src/` mentions `ocr_payload` or `ocr_status`; both columns exist and are unwritten |
| 7.4 | receipt pre-fill | **BUILT** | `PaymentReceiptDocuments.tsx` calls `extractReceiptDocumentOcr`; `OcrResult.structured` carries mapped form fields |
| 7.5 | payment pre-fill | **NOT BUILT** | no voucher document component exists at all |
| 7.6 | dual pre-fill | **NOT BUILT** | no dual-document component exists at all |
| 7.7 | OCR failure never blocks manual entry | **BUILT** | explicit `{ok:false, disabled:true, reason:"ocr_disabled"}` discriminator; a missing vision provider is treated as *disabled*, not as an error |

So Phase 7 is roughly **half built**, and the built half is the hard half — a working vision
pipeline with structured extraction, Persian-digit handling and a non-blocking failure path.

---

## 2. The engine: three sources disagreed, and the code was the only one telling the truth

| Source | Says the engine is |
|---|---|
| `docs/ocr/requirements.md` (Pipeline, step 3) | pytesseract + Tesseract 5.4.0 |
| `src/lib/receipt-ocr.functions.ts` header comment | "calls Lovable AI Gateway (vision model)" |
| The owner's Phase-1 answer, 2026-08-26 | `qwen3.6` (vision) |
| **What the code actually does** | **calls `aiVision()`, which resolves a provider from a database-driven abstraction** |

Both documents were stale. `aiVision` does not hard-code any vendor: providers live in
`ai_providers`, Ollama is a **first-class kind** with real vision support
(`POST /api/generate` with `images:[...]`), and per-usage routing lives in `ai_usage_routes`.
The mechanism was built correctly and generically.

**It was pointed the wrong way.** Measured before migration 397:

```
ai_usage_routes: receipt_ocr.vision -> gpt-messenger   (openai_compatible,
                                                        https://api.openai.com/v1)
                 is_enabled=true, fallback_enabled=true
ai_providers:    ollama  ACTIVE, http://192.168.170.8:11434,
                 vision_model = qwen3.6:latest        (present on the host)
```

So the local model the owner named was already configured for exactly this job, and was only
reached **after** a cloud call was attempted.

### What the health log establishes, and what it does not

`ai_provider_health` for the cloud provider's `vision` capability:

```
last_ok_at    2026-08-02
last_error_at 2026-08-19   code 401
              "You didn't provide an API key..."
```

**This does establish** that the cloud vision route was being *attempted* as recently as
2026-08-19, and that the attempt carries the request body — so the slip image left the
network before being rejected at authentication.

**It does not establish** that any slip was successfully *processed* by OpenAI. The 401 means
it was refused. Since `fallback_enabled` was true, the call then fell through to Ollama, which
is why receipt OCR appeared to work at all.

The honest summary is therefore: **OCR was working by accident, through a failover, while the
primary route sent banking images to a third party and got rejected.** That is a worse state
than either "using the cloud" or "using local", because it looked healthy from the outside.

### Why this is a rule violation and not a preference

`docs/ocr/requirements.md` § Privacy states the uploaded image "may contain a full bank
account number, a name and a signature", and forbids letting that payload escape. `CLAUDE.md`
principle 2 forbids a critical dependency on non-self-hostable cloud services, and principle 3
requires external integrations to be optional with a manual fallback. The routing table is
exactly the feature flag principle 3 asks for — it was simply set to the cloud.

### What migration 397 changed

`receipt_ocr.vision` → the **ollama** provider, `is_enabled=true`, **`fallback_enabled=false`**.

`fallback_enabled=false` is a deliberate call and the one most worth the owner's attention:

- With fallback on, a transient Ollama failure **silently re-routes the slip to OpenAI** —
  precisely the outcome the change exists to prevent.
- It would also **hide the failure**, when the owner's instruction was to *try qwen3.6 and
  report if it does not work*. A silent cloud failover makes that report impossible.
- It is safe because **item 7.7** guarantees an OCR failure never blocks manual entry: a
  refused OCR degrades to typing the fields by hand, which is documented behaviour.

**Reversing it is one statement**, if the owner prefers cloud failover:

```sql
UPDATE public.ai_usage_routes SET fallback_enabled = true
 WHERE service_key = 'receipt_ocr.vision';
```

**Scope:** one row. Messenger, knowledge base, purchase advisor and ad copy keep their
providers untouched — none of them handles a banking document, and that is the distinction
being drawn. No provider disabled, no key touched, nothing deleted.

---

## 3. The persistence gap — and the requirements doc already predicted it

`docs/ocr/requirements.md` says, in its own Pipeline section:

> Note `payment_receipt_documents` has no UPDATE policy, so a write-back there is silently a
> no-op. `document_attachments` (task 1.5) is where the payload belongs.

**That prediction is confirmed.** Live policies on `payment_receipt_documents` are
`prd_select_privileged` (r), `prd_insert_admin_accountant` (a), `prd_delete_admin_accountant`
(d) and `viewer_restricted` — **no UPDATE policy of any kind.** And the implementation writes
its documents to exactly that table.

So the OCR payload has nowhere to go:

- `payment_receipt_documents` — where the code writes; **cannot be updated**, so a payload
  write-back is a silent no-op.
- `document_attachments` — built for this, has `ocr_payload jsonb` and `ocr_status`, carries
  its own RLS (`select`, `insert`, `delete_admin`, `viewer_restricted`) — and is **empty and
  referenced by nothing**.

This is the "built but never wired" shape for the fourth time in this chain, and it is the
substance of items 7.2 and 7.3.

---

## 4. What remains, raised rather than silently deferred

- **OG-72** — the OCR payload is computed and then discarded; `document_attachments` is empty
  and unreferenced while the table the code writes to cannot be updated. Items 7.2 + 7.3.
- **OG-73** — OCR reaches only the receipt branch. Items 7.5 + 7.6 have no component to
  attach to, which makes them a build, not a wiring job.
- **Doc correction (done in this mission):** `requirements.md`'s Pipeline step 3 named
  Tesseract, which has never been what runs.

Item 7.4 and 7.7 are satisfied by the existing implementation and need no work — stated
explicitly so a later mission does not rebuild them.

---

## 5. Acceptance items that can be checked today

Of the six acceptance criteria in `requirements.md`, these are already verifiable without
building anything:

| # | Criterion | Status |
|---|---|---|
| 2 | With the OCR service stopped, all three branches still create documents | satisfied by the `disabled` discriminator (7.7) |
| 5 | No party is ever auto-selected from OCR output | needs assertion — not yet gated |
| 6 | `document_attachments` rows are unreadable by a `sales` test user | RLS present; **vacuous today at 0 rows** |

Criterion 6 is worth flagging: it would pass right now for the wrong reason. A gate asserting
it must create a row first, or it proves only that an empty table returns nothing.
