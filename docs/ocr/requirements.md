# OCR requirements — all three branches

**Hard prerequisite (OG-5): HTTPS.** File upload requires a Secure Context. The site runs on HTTP
today, so `getUserMedia`, `crypto.randomUUID` and `crypto.subtle` are unavailable and no polyfill
fixes it. `myafrakala.ir` is purchased; Let's Encrypt DNS-01 is the intended route. **Phase 7 cannot
start until this is live.**

## Governing principle

OCR is an **accelerator, never a gate**. Every field it fills must remain editable, and every branch
must work fully with OCR switched off. This is requirement 7.7 and it is not negotiable: an OCR
failure that blocks document creation is worse than no OCR at all.

---

## Pipeline

1. User uploads an image or PDF at the branch's document step.
2. File is stored; a `document_attachments` row is created with `ocr_status='pending'`.
3. OCR runs. **Corrected 2026-08-26 against the running code:** this is NOT Tesseract and never
   was. `extractReceiptDocumentOcr` calls `aiVision()`, which resolves a provider from
   `ai_providers` and the per-usage route in `ai_usage_routes` — so the engine is configuration,
   not a hard-coded library. Migration 397 pins `receipt_ocr.vision` to the **local Ollama
   provider with `qwen3.6:latest`**, with cloud fallback **off**, because the slip may carry a
   bank account number, a name and a signature (see Privacy below). The earlier text named
   pytesseract + Tesseract 5.4.0 (EasyOCR having been abandoned when Iranian network filtering
   blocked its model downloads); that plan was not what shipped, and a reader who trusted it
   would look for an engine that is not there.
4. The extracted payload is written to `document_attachments.ocr_payload` (jsonb) and `ocr_status`
   becomes `done` or `failed`.
5. The form pre-fills from the payload. **Every pre-filled field is marked as OCR-derived and stays
   editable.**

Note `payment_receipt_documents` has no UPDATE policy, so a write-back there is silently a no-op.
`document_attachments` (task 1.5) is where the payload belongs.

---

## Fields per branch

### Receipt — bank
| Field | Confidence | Notes |
|---|---|---|
| amount | high | Persian and Latin digits; strip separators |
| date | high | Jalali on the slip; convert |
| time | medium | often present on Iranian slips |
| tracking number | high | the most valuable field — long digit run |
| source bank | medium | from the logo or header text |
| destination account | low | **do not auto-select.** Suggest at most |

### Receipt — cash
Amount and date only. There is no slip to read in most cases; upload is optional.

### Receipt — cheque
| Field | Confidence |
|---|---|
| cheque number | high |
| amount | high |
| due date | high |
| issuing bank | medium |
| drawer | low |

### Payment — bank
Same as receipt-bank, but the **source** account is ours. Never auto-select our own account from
OCR; the user chooses it.

### Payment — cheque (own)
Cheque number, due date, amount from our own cheque book image.

### Payment — cheque (endorsed)
**No OCR.** The cheque is selected from the list of cheques we already hold, and every field is
auto-filled from that record. Reading it again from an image would risk contradicting stored data.

### Dual document
Amount, date, time, tracking number, source bank, destination bank. **Never** infer the payer or the
beneficiary from the slip — those are deliberate accounting choices with balance consequences, and
a name on a slip is not an identity.

---

## Rules that keep OCR safe

1. **Never auto-select a party.** A name on a slip is not a person record. Identity comes from the
   Asan code or mobile lookup, always by a human.
2. **Never auto-select one of our accounts.** Suggest; the user confirms.
3. **Amounts are Toman, whole numbers.** If OCR yields a fraction or an unparseable figure, leave the
   field empty rather than guess. The Asan export blocks on fractions and the RPC raises.
4. **Persian digits normalise to Latin** before parsing. Persian and Arabic-Indic digit ranges both
   occur on Iranian slips.
5. **Confidence is visible.** A low-confidence field is pre-filled but visually flagged.
6. **Failure is silent and non-blocking.** `ocr_status='failed'` leaves the form empty and usable;
   never a modal, never a blocked submit.
7. **First model load takes ~12 s.** Show progress; do not block the rest of the form. Use
   `curl.exe -s -m 120`, not `wget`, when calling the local service.

---

## Error handling

| Situation | Behaviour |
|---|---|
| Unreadable image | `ocr_status='failed'`, form stays empty and usable |
| Partial extraction | Fill what was found, leave the rest empty |
| Timeout | Abandon after 120 s, mark failed, do not retry automatically |
| Wrong document type | No detection attempted — the user already chose the branch |
| Service down | Upload still succeeds; `ocr_status='pending'`, form usable |

---

## Privacy

The uploaded image may contain a full bank account number, a name and a signature.

- `document_attachments` carries RLS: `admin`, `accountant`, `manager` only.
- Never log the OCR payload to the console or to a file that could reach git. An exported
  spreadsheet containing real customer names has already reached this repository's history once and
  could not be removed without a force-push.
- Never include OCR text in an error message shown to the user.

---

## Acceptance

1. A real bank slip uploaded in the receipt branch fills amount, date and tracking number correctly.
2. With the OCR service stopped, all three branches still create documents.
3. A slip with Persian digits parses to the correct amount.
4. A fractional amount on a slip leaves the field empty, not rounded.
5. No party is ever auto-selected from OCR output.
6. `document_attachments` rows are unreadable by a `sales` test user.
