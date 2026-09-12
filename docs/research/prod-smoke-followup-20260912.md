# Production smoke follow-up — 2026-09-12

Research only. No git writes, no database writes. All evidence read from the **`3b9ee7dc`**
tree, which has the identical tree SHA (`f5979b3f9a7c1d650dab950c8482d0717ac9f781`) and the
identical parent (`63ec097e`) as production's `d60232f5`. Pre-range comparisons use
`469fe0a9`.

---

## 1 · `src/routes/_app.operations.receipts.tsx`

> **VERDICT: DELETED** — in commit `899847d5`, merged through **PR #408**
> (`feature/wave4-agentO`). Retired, not retargeted, because it queried `ocr_receipts`, a table
> that exists in no migration and no database. **The receipt image is uploaded at
> `/accounting/receipts/create`**; OCR is then run and reviewed at
> `/accounting/receipts/$receiptId`.

### Presence

```
at 469fe0a9: PRESENT
at 3b9ee7dc: ABSENT
899847d5  D  src/routes/_app.operations.receipts.tsx
```

### Why, from the commit's own message (`899847d5`, Ali, 2026-09-06)

> `O-3: retire /operations/receipts, which reads a table that has never existed`
>
> "The page queried `ocr_receipts`. That table exists in no migration, in no generated type,
> and not in the live `afrakala` database (`to_regclass('public.ocr_receipts')` -> NULL). The
> page detected `42P01` and rendered an honest stub, **so it has never shown a row to anyone.**"

Four reasons it was retired rather than pointed at the real table, quoted in brief:

1. "The OCR review surface on `payment_receipt_documents` **ALREADY EXISTS and is reachable**
   … Retargeting this page would have produced a SECOND OCR queue over the same rows."
2. "`payment_receipt_documents.receipt_id` is NOT NULL, so every document already belongs to a
   receipt whose detail page lists it. There is no orphan set…"
3. "The two schemas **share no column** … Retargeting would need a migration adding four
   columns plus a review workflow."
4. "The page was **unreachable**. Zero inbound links: not in `registry.ts`, `nav-items.ts`,
   `AppSidebar`, `MobileBottomNav`, `primary-modules.ts`, breadcrumbs or the command palette."

The message also disposes of a claim attached to the old page: *"The 'Python/FastAPI service'
attributed to this page does not verify. Its only source is the Persian UI string at line 162
of the deleted file."*

### Where the OCR upload UI lives now — two distinct surfaces

`payment_receipt_documents` is referenced in exactly three places under `src/`:

| file:line | role |
|---|---|
| `src/components/accounting/PaymentReceiptDocuments.tsx:377, 657, 695, 800, 915` | the component |
| `src/lib/receipt-ocr.functions.ts:90` | the server-side OCR function |
| `src/integrations/supabase/types.ts:5345` | generated types |

The component exports two surfaces, and they are rendered on **different routes**:

| export | file:line | rendered by | what the user does |
|---|---|---|---|
| `ReceiptDocumentPicker` | `PaymentReceiptDocuments.tsx:507` — holds the `type="file"` input at **:561** and the storage upload at **:460** | `src/features/ledger-wizard/DocumentWizard.tsx:573` and `:771`, which is rendered **only** by `src/routes/_app.accounting.receipts.create.tsx` | **uploads the image** |
| `ReceiptDocumentsList` | `PaymentReceiptDocuments.tsx:611` | `src/routes/_app.accounting.receipts.$receiptId.tsx:569` | runs OCR (`extractReceiptDocumentOcr`, imported at `:54`), reviews the extracted fields, applies them to the receipt |

**So: to upload a receipt image a user opens `/accounting/receipts/create`.** To run the
extraction and review it, they open the saved receipt at `/accounting/receipts/$receiptId`.
`ReceiptDocumentsList` contains no file input of its own — it lists documents that already
exist.

> Relevant to tonight's smoke test: the OCR button at `:747` calls `extractReceiptDocumentOcr`,
> which routes through `receipt_ocr.vision`. Migration 522 left that pinned to the **local**
> ollama provider, which does **not** declare the `vision` capability on production — so the
> candidate list resolves empty and extraction is expected to fail or be reported disabled.
> The UI has a string for exactly that at `:786`: `استخراج متن PDF در این محیط پشتیبانی نمی‌شود.`

---

## 2 · `create_sales_quote_with_items` — the two credit branches

> **VERDICT: BOTH BRANCHES `RAISE`** — they do not set a flag and do not pass silently. Each
> raises `ERRCODE 22023` **unless** the caller supplies the matching `p_quote_exception_type`,
> in which case the RAISE is skipped and a `_credit_snapshot` jsonb is built with a `mode`
> value. **This logic was already present at `469fe0a9`, byte for byte** — `diff` of the two
> blocks returns zero differences. Nothing about it changed tonight.

### Which definition is authoritative

Migrations in the range that define the function: **415**, **420**, **421**. The last by
filename timestamp is **`20260903140000_421_guest_refusal_message_tells_the_truth.sql`**.
The last definition present at `469fe0a9` is
**`20260831090000_415_quote_items_require_a_real_product.sql`**.

### The `has_overdue = true` branch — verbatim from 421 (lines 208–219)

```sql
    IF COALESCE(_credit.has_overdue, false) OR COALESCE(_credit.binding_constraint, '') = 'overdue' THEN
      IF p_quote_exception_type IS DISTINCT FROM 'overdue_salesperson_commitment' THEN
        RAISE EXCEPTION 'مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست؛ فقط با تعهد کارشناس فروش و تعیین مهلت تسویه امکان ادامه وجود دارد.'
          USING ERRCODE = '22023';
      END IF;
      _credit_snapshot := jsonb_build_object(
        'mode', 'overdue_salesperson_commitment',
        'checked', true,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final,
        'overdue_since', _credit.overdue_since,
        'minutes', p_quote_exception_minutes
      );
```

**Behaviour:** RAISE, unless the caller passes
`p_quote_exception_type = 'overdue_salesperson_commitment'`. The escape hatch is a salesperson
commitment with a settlement deadline; the deadline itself is validated earlier
(`مهلت تسویه معوقه باید مشخص و بزرگ‌تر از صفر دقیقه باشد.`).

### The `available_credit = 0` branch — verbatim from 421 (lines 221–232)

```sql
    ELSIF _credit IS NULL OR NOT COALESCE(_credit.has_allocation, false)
          OR COALESCE(_credit.available_credit, 0) <= 0 THEN
      IF p_quote_exception_type IS DISTINCT FROM 'accounting_approval' THEN
        RAISE EXCEPTION 'برای این مشتری اعتبار قابل استفاده ثبت نشده است. ثبت بدون بیعانه فقط با تأیید حسابداری مجاز است.'
          USING ERRCODE = '22023';
      END IF;
      _credit_snapshot := jsonb_build_object(
        'mode', 'no_credit_accounting_approval',
        'checked', true,
        'customer_id', p_customer_id,
        'available_credit', COALESCE(_credit.available_credit, 0),
        'required', _sum_final
      );
```

**Behaviour:** RAISE, unless `p_quote_exception_type = 'accounting_approval'`. Note the branch
is `<= 0`, not `= 0`, and it also catches `_credit IS NULL` and `has_allocation = false` — three
different conditions produce the same message.

### Column / value written when the exception path is taken

Not a boolean flag on the quote. The jsonb lands in the column **`quote_exception_snapshot`**
(seen in the `INSERT` column list of the same function), carrying `mode` values
`'overdue_salesperson_commitment'` or `'no_credit_accounting_approval'`. A separate
`_exception_snapshot` variable records the caller-supplied exception.

### Was it present at `469fe0a9`?

**Yes — identical.** 415 at `469fe0a9` lines 216–241 against 421 at `3b9ee7dc` lines 208–233:

```
diff /tmp/b415.txt /tmp/b421.txt
IDENTICAL — zero differences
```

421 changed only the **guest** branch message (its title: "the guest branch's refusal message
told the salesperson to get accounting approval"). The overdue and zero-credit branches were
carried through untouched.

---

## 3 · Credit panel on `_app.sales.quotes.new.tsx`

> **VERDICT: YES.** The route reads live credit on customer selection and renders a blocking
> dialog. File is present at `3b9ee7dc`, 1,492 lines.

| line | what is there |
|---|---|
| `188–190` | `// Items 197/198 — the customer's live credit. Guests have no credit file, so …` then `const { data: creditInfo, isFetching: creditInfoLoading } = useQuery({` |
| `192` | `queryKey: ["quote-credit-info", linkedCustomerId]` — **re-queries on customer selection** |
| `209–211` | calls `expire_stale_credit_holds` first, `p_limit: 50`, to reclaim abandoned reservations **before** reading the ceiling (OG-80) |
| `220` | `const { data, error } = await supabase.rpc("get_customer_dynamic_credit", {` |
| `225, 232` | reads `available_credit`, maps to `availableCredit` |
| `245–248` | `const creditShortfall = Boolean(… creditInfo?.hasAllocation && creditInfo.availableCredit < totals.final_amount)` |
| `250` | `const creditShortage = Math.max(totals.final_amount - (creditInfo?.availableCredit ?? 0), 0)` |
| `400` | `const findCreditBlocker = (): QuoteBlockReason | null => {` |
| `404–406` | `kind: "no_credit"` · `detail: "اعتبار مشتری هنوز از سرور دریافت نشده است."` |
| `409–414` | `if (creditInfo?.hasOverdue)` → blocker carrying `availableCredit` and `overdueSince` |
| `419–421` | `detail: "این پیش‌فاکتور به پرونده مشتری ثبت‌شده وصل نیست و اعتبار مالی قابل بررسی ندارد."` |
| `424–428` | `if (!creditInfo?.hasAllocation || creditInfo.availableCredit <= 0)` → `detail: "برای این مشتری اعتبار قابل استفاده یا تخصیص سرمایه فعال ثبت نشده است."` |
| `431–436` | `if (creditInfo.availableCredit < totals.final_amount)` → `kind: "credit_shortfall"` with `shortage` |
| `448` | `if (blocker.kind === "credit_shortfall")` — drives the dialog branch |

The dialog itself is `src/components/sales/quotes/QuoteCreationBlockDialog.tsx`, whose overdue
copy is at `:81` (`"مشتری مانده معوق دارد"`) and `:131`.

**Note the client mirrors the server rather than replacing it.** The four client blockers line
up one-to-one with the four `RAISE`s in §2, so a user normally sees the dialog; the database
still refuses independently if the RPC is called directly.

---

## 4 · The «این مشتری دارای مانده معوق است…» card

> **VERDICT:** produced by the RPC **`can_issue_customer_invoice(uuid)`**, whose latest
> definition in the range is **migration 454**
> (`20260905220000_454_wire_overdue_gate_to_receivables.sql`). It reads the view
> **`vw_customer_receivables`**. The workbench prints the RPC's `reason` column verbatim.
> **It can be true for 10 of 50 and false for the oldest overdue customer because the predicate
> requires `due_date IS NOT NULL` — a receivable whose due date is unknown is never
> `is_overdue`, however old it is.**

### The path, end to end

`src/routes/_app.accounting.allocation-workbench.tsx:334–338` runs `overdueQ` →
`fetchCustomerOverdueSignals` (`src/lib/allocation/queries.ts:194`) → one
`rpc("can_issue_customer_invoice", { p_customer_id })` per customer → rendered at `:517`
under `data-testid="wb-overdue-signal"`. The route's own comment at `:514`:

> `{/* The reason sentence is written by can_issue_customer_invoice for the accountant and is printed exactly as it comes back. */}`

and the render condition at `:518`: `signal && !signal.can_issue && signal.reason`.

### The predicate — verbatim from 454

```sql
  SELECT COALESCE(SUM(r.outstanding_amount),0)::numeric,
         COUNT(*)::int,
         MIN(r.due_date)
    INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables r
  WHERE r.customer_id = p_customer_id
    AND r.is_overdue = true
    AND r.outstanding_amount > 0;

  IF v_count = 0 THEN
    RETURN QUERY SELECT true, p_customer_id, 0::numeric, 0, NULL::date, NULL::text;
  ELSE
    RETURN QUERY SELECT
      false,
      p_customer_id,
      v_amount,
      v_count,
      v_oldest,
      'این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.'::text;
  END IF;
```

And `is_overdue` itself, from the view's live definition in migration **419**:

```sql
    src.due_date IS NOT NULL AND src.due_date < tehran_today() AND src.outstanding_amount > 0::numeric AS is_overdue,
```

### Why 10 of 50 — four independent filters, in order of likelihood

1. **`due_date IS NOT NULL` — the likeliest reason the *oldest* overdue customer shows nothing.**
   419 exists precisely because `due_date` used to be `q.expires_at`, "the quote's VALIDITY
   deadline, **which is NULL on every accepted quote**". 419 re-derives the date from settlement
   terms, but where terms are absent the view still emits `due_date_unknown` (`419:35`
   `src.due_date IS NULL AS due_date_unknown`). Those rows are **excluded from `is_overdue` by
   construction**, so the oldest debt — the one most likely to predate settlement terms being
   recorded — is exactly the one that fails the test. The workbench still shows the row, with
   `سررسید نامشخص` (`:510`), but with **no red card**.
2. **`outstanding_amount > 0`** — appears twice, in the view and again in the RPC. A customer
   whose overdue invoice has been settled drops out even though its aging bucket still reads
   overdue.
3. **`r.customer_id` must be non-null on the receivables row.** The workbench keys signals by
   customer id (`:492` `const signal = r.customer_id ? overdueQ.data?.[r.customer_id] : undefined`),
   so a receivable with no linked customer file — a guest quote — can never carry a card.
4. **A permission failure is silently indistinguishable from "nothing overdue".** 454 added a
   role gate that raises `42501` for anyone outside `admin/manager/accountant/sales`:
   ```sql
   IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
     RAISE EXCEPTION 'دسترسی غیرمجاز' USING ERRCODE = '42501';
   ```
   and the client swallows it by design (`queries.ts:203`):
   > `// One customer's signal failing must not blank the whole column; the row simply shows`
   > `// no badge, which is the same as "not known" rather than "nothing overdue".`

   **For a `viewer`, every card is absent and the page looks clean.** That is a fail-quiet by
   design, but it means "no card" is not evidence of "no overdue balance."

---

## 5 · Capital ceilings with a validity date

> **VERDICT: only a runtime call.** No migration in the range writes a ceiling row. The date
> lives on `daily_capital_settings.capital_date`, which is supplied as the caller's
> `p_capital_date` argument to `run_daily_capital_allocation`. A row for **۱۵ شهریور ۱۴۰۵
> (= 2026-09-06)** can only have come from someone invoking that RPC with that date — in
> practice from `/accounting/dynamic-capital` or `/accounting/allocation-workbench`. **No cron
> job calls it.** The one migration-time path that can move ceilings indirectly (411/413) was
> applied in late August and refreshes *today's* setting only, so it cannot have produced a
> 2026-09-06 row.

### Where the date comes from

`run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text)` —
migration 510, lines 62–66:

```sql
    INSERT INTO public.daily_capital_settings(capital_date, total_capital, scoring_mode, notes, created_by)
    VALUES (p_capital_date, p_total_capital, 'auto', p_notes, v_caller)
    RETURNING id INTO v_setting_id;
  … 
    RAISE EXCEPTION 'capital allocation already exists for date %', p_capital_date;
```

The ceilings themselves land in `customer_capital_allocations_dynamic`, which carries **no date
column of its own** — it is keyed by `capital_setting_id`, and the date is an attribute of the
setting.

### Every write path in the range, classified

Three migrations in the range contain `INSERT INTO public.customer_capital_allocations_dynamic`
— **484**, **506**, **510** — and **all three are inside function bodies**, not migration DML:

| migration | enclosing function (nearest preceding `CREATE OR REPLACE FUNCTION`) |
|---|---|
| 484 line 451 | `public.recompute_dynamic_capital_setting(` at line 198 |
| 506 line 311 | `public.recompute_dynamic_capital_setting(p_setting_id uuid, p_reason text …)` at line 37 |
| 510 line 239 | `public.run_daily_capital_allocation(p_capital_date date, …)` at line 32 |

Restricting the search to **column-1** statements — genuine migration-time DML — across all 92
files in the range returns only two, and neither touches a ceiling table:

```
20260828000000 (411) 59: UPDATE public.dynamic_entity_scores
20260829000000 (413) 54: UPDATE public.dynamic_entity_scores
```

### The one indirect path, and why it does not fit

411 and 413 are the value-preserving self-updates that re-fire scoring. Both headers note the
consequence explicitly — 411 line 27:

> `trg_refresh_dyn_capital_after_score_change refreshes today's dynamic`

so a migration *can* rewrite ceilings without naming the table. But:

- the trigger refreshes **today's** setting, meaning the day the migration ran;
- 411 and 413 are timestamped 2026-08-28 and 2026-08-29 and were **already applied to
  production before tonight** (production's schema top was 424);
- neither creates a setting for a date it is not running on.

A row stamped 2026-09-06 therefore cannot have come from them.

### Who can call the RPC

```
src/hooks/capital/useDynamicCapital.ts:101   supabase.rpc("run_daily_capital_allocation", { … })
```

exported as `useRunDailyAllocation` (`:93`, doc-comment `/** اجرای RPC ساخت snapshot روزانه. */`),
consumed by exactly two routes:

- `src/routes/_app.accounting.dynamic-capital.tsx`
- `src/routes/_app.accounting.allocation-workbench.tsx`

A search of `445_scheduled_jobs_documentation.sql` — the in-database register of scheduled
functions — returns **no** entry for `run_daily_capital_allocation`, and the production cron
inventory (four active jobs) does not include it either. **There is no automated writer.**

> **Consequence worth stating plainly:** the ceiling for a given day exists only if a person
> pressed the button for that day. A missing day is not a fault; a day whose ceilings look stale
> is most likely a day nobody ran.

---

## Caveats

- Section 5 reasons from the repository, not from production rows. It establishes that **no
  migration in the range writes a dated ceiling**; it cannot tell you who pressed the button on
  2026-09-06 or with what total. `daily_capital_settings.created_by` and the `audit_logs` row
  that 510 writes (`'daily_capital_setting'`, seen at line 249) will name the actor.
- Section 4's ranking of the four filters is ordered by likelihood, not measured against
  production data. The decisive check is one query: how many of the 50 carry
  `due_date_unknown = true`.
- Section 2 asserts the branches are unchanged **in the migration files**. If production's live
  function body differs from the newest migration — the drift CLAUDE.md rule 4 warns about —
  only `pg_get_functiondef` on production settles it.
