# Dual-identity receipts, person import, and the dual-document export limit

**Date:** 2026-09-04 · **Host:** `VIRA-SERVICE` (test). **Production `192.168.170.10` was never contacted, resolved or pinged.**
**Branch:** `staging` @ `cabd7b7a6f2ea655096a23fca08a53b15191a819` — the SHA actually read.
**Verdict: COMPLETE** — every numbered sub-item of Q1, Q2 and Q3 carries a verdict or an explicit
`UNKNOWN` with a reason, and the coverage arithmetic closes.

**Nothing was changed.** No file edited, no migration, no install, no write API call, no
state-changing git command. Every DB statement ran with `default_transaction_read_only=on`;
behavioural probes were wrapped `BEGIN READ ONLY … ROLLBACK`. The only new path in the tree is this
file.

### Preflight, verbatim

```
$ git status --porcelain
?? e2e/auth/generate-role-sessions.spec.ts.bak
?? pw.session.config.ts
?? r9-failures.txt
?? test-objects.txt
?? test-schema-20260831.sql

$ git worktree list
D:/AfraKalaTest/app                      cabd7b7a [staging]
.../wt-asan                              edb48fb8 [hotfix/asan-bank-export-headers]
.../wt-asan2                             c816eea4 [hotfix/asan-bank-export-layout]
.../wt-inline                            69ace7ca [feature/bank-account-asan-code-inline]
.../wt-phonefix                          6298b97d [hotfix/quote-link-empty-phone]
.../wt-terms                             ffd8315b [feature/purchase-term-is-mandatory]
D:/AfraKalaTest/afrakala-deploy-sidebar   257ba917 (detached HEAD)
D:/AfraKalaTest/app-docs-build            33bc6704 [feature/documents-dual-filter-export]
```

Six other worktrees are live. The tree was **not switched** and did not move during the audit —
`git rev-parse --short HEAD` returned `cabd7b7a` before and after, with the same five untracked files.

### Provenance

**[E]** measured in this audit · **[P]** prior art, cited · **[U]** owner-stated, unverified · **[?]** unknown

Prior art relied on: `docs/research/domain-functions-sweep-20260904.md`,
`docs/research/open-items-recon-20260904.md`. The Asan text-loss defect
(`docs/research/asan-export-serialization-fix-20260904.md`) is closed by owner confirmation [U] and
was not reopened.

---

## F1..F31 — یافته‌ها

### Q1 — the "this person is a supplier" receipt refusal

---

**F1 · Q1 · The refusal text and where it is produced · exists-works (as designed) · [E]**

Owner's claim: «دریافت این شخصی که دارین دریافت می‌زنین تامیین کننده است»

**Classification: FRONTEND GUARD.** Not an RPC `RAISE`, not a CHECK, not a trigger.

`src/features/ledger-wizard/lookup.ts:161-176`
```ts
const picked = pickKind(required, mirrors.customer_id, mirrors.supplier_id, extId);
if (!picked) {
  const roleMsg =
    required === "customer"
      ? "این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود."
      : "این شخص نقش قابل ثبت (مشتری، تأمین‌کننده یا طرف حساب) ندارد.";
  return { status: "wrong_role", query, party: null,
           missingName: person.display_name, message: roleMsg };
}
```

`required === "customer"` is supplied only by the receipt branch —
`src/features/ledger-wizard/DocumentWizard.tsx:604-610`:
```tsx
{step === 3 && (branch === "receipt" || branch === "dual") ? (
  <PartyStep label="کد آسان یا شمارهٔ موبایل" state={payerLookup}
    onSearch={(q) => runLookup(q, branch === "receipt" ? "customer" : "any", setPayerLookup)} />
```

Mounted at exactly one route: `src/routes/_app.accounting.receipts.create.tsx:8`.

> **Build consequence:** the string to change is one line in one file; the wizard has a single mount.

---

**F2 · Q1 · The owner's remembered wording does not exist anywhere · absent · [E]**

```
$ grep -rn "تامیین" src e2e server supabase docs
(0 hits)

$ grep -rn "تامیین" . --include=* -l | grep -v node_modules
(0 hits — repo-wide, including scripts/, automation/, audit/, openapi/,
 test-data/, backups/ and the loose *.log / *.txt artefacts at the root)

sql> select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prosrc like '%تامیین%';
0
```
The sweep is repo-wide, not just the source directories. Combined with the `prosrc` check, the
remembered wording is confirmed to be the owner's paraphrase — it is not a literal string anywhere in
the repository or the database.
`تامین کننده` / `تأمین کننده` (spaced, no ZWNJ) → one hit, and it is a comment naming a deleted test
row: `supabase/migrations/20260807010000_303_p0_1_delete_test_persons.sql:10`. Nothing in
application code.

> **Build consequence:** search the real string, not the remembered one; a brief quoting the owner's
> wording verbatim will find nothing.

---

**F3 · Q1 · The guard fires on a missing `customers` row, NOT on being a supplier · exists-broken (mis-scoped) · [E]**

`src/features/ledger-wizard/lookup.ts:52-65`
```ts
if (required === "customer") {
  return customerId ? { kind: "customer", roleId: customerId } : null;
}
```

A supplier-**only** person hits the refusal. A person who is **both** supplier and customer passes
today — and 15 people already hold both files (F8). The message therefore misdescribes its own
condition: it says "this person is not a customer", which is accurate, while the owner reads it as
"this person is a supplier", which is not what is tested.

Prior art records the same behaviour as intended at the time:
`docs/execution/phase-6-GATE-A.md:299` — «| V-3 | The receipt branch enforces its narrower party
rule | «این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود.» shown for a supplier |» [P].

> **Build consequence:** this contradicts **[U] OG-16** ("a receipt must be recordable from any
> person"). The refusal is not about supplier-ness and removing "supplier" reasoning will not fix it.

---

**F4 · Q1 · `create_receipt` has no supplier gate and is hard-keyed to `customers.id` · exists-works · [E]**

Live `pg_get_functiondef`, header verbatim:
```
CREATE OR REPLACE FUNCTION public.create_receipt(p_channel text, p_customer_id uuid, p_amount numeric,
  p_payment_date date, p_payment_time time without time zone,
  p_destination_bank_account_id uuid DEFAULT NULL::uuid, p_tracking_number text DEFAULT NULL::text,
  p_source_bank text DEFAULT NULL::text, p_cheque_number text DEFAULT NULL::text,
  p_cheque_due_date date DEFAULT NULL::date, p_cheque_bank text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb,
  p_attachments jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(receipt_id uuid, document_number text, journal_entry_id uuid, new_balance numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
```

Yes, it takes `p_customer_id uuid` — a **`customers.id`**, not a `persons.id`. Its identity gates:
```sql
IF p_customer_id IS NULL THEN RAISE EXCEPTION 'مشتری پرداخت‌کننده انتخاب نشده است' USING ERRCODE='22023'; END IF;
SELECT c.person_id INTO _person_id FROM public.customers c WHERE c.id = p_customer_id;
IF _person_id IS NULL THEN RAISE EXCEPTION 'مشتری یافت نشد' USING ERRCODE='22023'; END IF;
```
Role gate: `has_any_role(_uid, ARRAY['admin','accountant','manager'])`.

It also hard-wires the credit side to a customer:
```sql
(_entry_id, 2, 'customer_credit', p_customer_id, 0, p_amount, 'افزایش اعتبار / کاهش بدهی مشتری')
PERFORM public.increase_credit(p_customer_id, p_amount, _receipt_id, _uid);
```

**Refusal inventory (every `RAISE` in the body):** role 42501 · channel not bank/cash/cheque · NULL
customer · amount ≤ 0 · fractional amount · NULL/future date · date older than previous Jalali year ·
NULL time · missing destination account · missing tracking · cheque number/due-date missing ·
destination account on a cheque · cheque fields on a non-cheque · non-array allocations/attachments ·
attachment without `storage_path` · **missing Asan code (`require_asan_code`)** · account not found ·
account_type/channel mismatch · missing `accounting_code` on the account · duplicate quote in
allocations · quote not found · quote belongs to another customer · unbalanced entry.

**None is supplier-related.**

> **Build consequence:** the database will create a receipt for any person holding a `customers`
> row. Accepting a *non-customer* payer is not free — the credit line and `increase_credit` both
> take `customers.id`, so [U] T9 needs either a mirror row or a signature change.

---

**F5 · Q1 · Enforcement sites, counted · [E]**

| # | Site | Kind | Text |
|---|---|---|---|
| 1 | `src/features/ledger-wizard/lookup.ts:169` (via `pickKind` `:53-54`, driven by `DocumentWizard.tsx:608`) | frontend guard | «این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود.» |
| 2 | `src/features/ledger-wizard/lookup.ts:170` | frontend guard, `required==="any"` (payment/dual) | «این شخص نقش قابل ثبت (مشتری، تأمین‌کننده یا طرف حساب) ندارد.» — blocks a person with *no* mirror at all |
| — | `create_receipt` `'مشتری یافت نشد'` | RPC RAISE | referential, not a labelling check |

**Zero CHECK constraints** on `payment_receipts` mention supplier (nine `contype='c'` constraints, all
amount/cheque/status/channel/receiver-exclusivity). **Zero triggers** block on role: the eight
non-internal triggers are `trg_payment_receipts_recompute_employee_score`, `_updated_at`,
`_enforce_allocation_on_approve`, `_derive_person`, `_block_delete_when_posted`, `_lock_when_posted`,
`trg_burn_receipt_document_number`, `trg_normalize_phone`.

> **Build consequence:** two frontend lines are the entire supplier/customer receipt gate.

---

**F6 · Q1 · No RLS policy blocks on identity type either · exists-works · [E]**

```
customers        rls=true forced=false
payment_receipts rls=true forced=false
suppliers        rls=true forced=false

payment_receipts:
  viewer_restricted            | ALL    | authenticated | USING (NOT is_viewer_only(uid()))
  pr_insert_admin_accountant   | INSERT | authenticated | CHECK has_any_role(uid(),['admin','accountant']) AND created_by = uid()
  pr_select_privileged         | SELECT | authenticated | USING has_any_role(uid(),['admin','manager','accountant'])
  pr_update_admin_accountant   | UPDATE | authenticated | USING/CHECK has_any_role(uid(),['admin','accountant'])
```
Every policy gates on **role**, never on the payer's identity type. And `create_receipt` is
`SECURITY DEFINER`, so RLS on `payment_receipts` does not apply to its inserts at all.

Incidental inconsistency worth noting: `create_receipt` admits **manager**, but
`pr_insert_admin_accountant` does not. A manager can create a receipt only through the DEFINER RPC,
never by direct insert.

> **Build consequence:** closes the RLS question — nothing hidden below the frontend guard.

---

**F7 · Q1 · `tg_payment_vouchers_derive_person` does NOT contribute to this refusal · not-connected · [E]**

Full live body:
```sql
BEGIN
  IF NEW.payee_supplier_id IS NOT NULL THEN
    SELECT s.person_id INTO NEW.payee_person_id FROM public.suppliers s WHERE s.id = NEW.payee_supplier_id;
  ELSIF NEW.payee_customer_id IS NOT NULL THEN
    SELECT c.person_id INTO NEW.payee_person_id FROM public.customers c WHERE c.id = NEW.payee_customer_id;
  ELSIF NEW.payee_party_id IS NOT NULL THEN
    SELECT ep.person_id INTO NEW.payee_person_id FROM public.external_parties ep WHERE ep.id = NEW.payee_party_id;
  ELSE
    NEW.payee_person_id := NULL;
  END IF;
  RETURN NEW;
END
```
Precedence confirmed exactly as [prior:sweep] describes. **Unrelated to the receipt refusal:** it
fires on `payment_vouchers`, never on `payment_receipts`; it only derives a mirror column; it
contains no `RAISE`; and it never executes in the receipt path.

**But the frontend has a mirror-image precedence that IS real** — `lookup.ts:57-62`:
```ts
if (supplierId) return { kind: "supplier", roleId: supplierId };
if (externalPartyIdValue) return { kind: "external_party", roleId: externalPartyIdValue };
if (customerId) return { kind: "customer", roleId: customerId };
```
For `required === "any"`, a dual-role person always resolves as **supplier**, so a payment to a
dual-role person is always booked against the supplier file. Distinct behaviour, distinct finding.

> **Build consequence:** do not touch the trigger for Q1. Do consider `lookup.ts:57-62` when
> implementing [U] "one net balance" — it silently picks a side.

---

**F8 · Q1 · How a person's "type" is stored — three mechanisms, one authoritative · exists-partial · [E]**

**`persons.kind` is individual/organization, not customer/supplier:**
```
persons_kind_check :: CHECK ((kind = ANY (ARRAY['individual'::text, 'organization'::text])))
```
Live: `organization=14`, `individual=72`.

**The mirror tables are the authority**, each 1:1 with a person:
```
customers | uq_customers_person_id | UNIQUE (person_id)
suppliers | uq_suppliers_person_id | UNIQUE (person_id)
```
Live: `customers=86`, `suppliers=15`, **`dual_role_persons=15`** — every supplier is also a customer.

**`person_context_links` carries a third, non-authoritative label:**
```
CHECK (context_kind = ANY (ARRAY['customer','supplier','driver','sender','receiver','referrer',
  'marketer','representative','complainant','returner','staff_link','credit_party',
  'accounting_party','delivery_party','purchase_owner','sales_expert','warehouse_owner','other']))
```
Live active links: `staff_link=41`, `customer=30`, `supplier=15`, `accounting_party=1`.
**Drift: 86 customers but only 30 `context_kind='customer'` links.** Nothing in the receipt path
reads this table.

The guard reads the mirrors via `readPersonMirrors` — `src/lib/persons/dual-role.ts:35-47`:
```ts
const [{ data: customerRow }, { data: supplierRow }] = await Promise.all([
  supabase.from("customers").select("id, name, city").eq("person_id", personId).maybeSingle(),
  supabase.from("suppliers").select("id, name, city").eq("person_id" as never, personId).maybeSingle(),
]);
```

> **Build consequence: the fix is guard-removal + data entry, NOT a data-model change.** The model
> already supports dual role. [U] T9 ("membership is a label, not a separate entity") is *almost*
> true of the schema — except the label lives in two places that disagree by 56 rows.

---

**F9 · Q1 · `list_mutual_settlement_candidates`' "exactly one file" predicate is DEAD CODE · exists-partial · [E] — corrects the brief**

The brief states the function "restricts candidates to persons holding exactly one customer file
**and** exactly one supplier file". The predicate is real:
```sql
WITH dual AS (
  -- Exactly one customer file and exactly one supplier file. A person with
  -- duplicates is excluded rather than guessed at; person_settlement_position
  -- raises for the same reason, and the p1-dual-role agent owns the merge.
  SELECT p.id, p.display_name,
         (SELECT c.id FROM public.customers c WHERE c.person_id = p.id LIMIT 1) AS cid,
         (SELECT s.id FROM public.suppliers s WHERE s.person_id = p.id LIMIT 1) AS sid
    FROM public.persons p
   WHERE (SELECT count(*) FROM public.customers c WHERE c.person_id = p.id) = 1
     AND (SELECT count(*) FROM public.suppliers s WHERE s.person_id = p.id) = 1
),
```
**But the `= 1` upper bound is unreachable.** `uq_customers_person_id` and `uq_suppliers_person_id`
(F8) make `count(*) > 1` impossible. The predicate degenerates to *"has a customer file AND has a
supplier file"*.

What it excludes: every customer-only person (86 − 15 = **71**), every supplier-only person (**0**
today), and everyone with no mirror. Measured: the `dual` CTE yields **15 rows**.

Same dead code in `person_settlement_position`:
```sql
IF _n > 1 THEN RAISE EXCEPTION 'این شخص % پروندهٔ مشتری دارد؛ تا وقتی یکی نشده‌اند تسویهٔ متقابل ممکن نیست.', _n ...
IF _n > 1 THEN RAISE EXCEPTION 'این شخص % پروندهٔ تأمین‌کننده دارد؛ ...', _n ...
```
Both raises are unreachable under the UNIQUE constraints.

> **Build consequence:** the exclusion the brief worries about is not the real one. The real
> exclusion is "must have both files", which excludes 71 of 86 people.

---

**F10 · Q1 · `post_mutual_settlement` cannot post for a single person today · exists-broken · [E]**

Its gates:
```sql
IF _pos.customer_id IS NULL OR _pos.supplier_id IS NULL THEN
  RAISE EXCEPTION 'تسویهٔ متقابل فقط برای شخصی ممکن است که هم پروندهٔ مشتری دارد و هم تأمین‌کننده.' USING ERRCODE='22023';
IF _offset_amount > LEAST(GREATEST(_pos.receivable, 0), GREATEST(_pos.payable, 0)) THEN
  RAISE EXCEPTION 'مبلغ تهاتر (%) از کمترینِ طلب (%) و بدهی (%) بیشتر است؛ ...' ...
```

Measured positions across all 15 candidates:
```
r=0 p=0                      × 14
r=-9240000 p=-15000000       × 1
```
For the one non-zero person, `LEAST(GREATEST(-9240000,0), GREATEST(-15000000,0)) = LEAST(0,0) = 0`,
so **any `_offset_amount > 0` is refused**; with `_offset_amount = 0` both residuals are 0 and the
cash branch hits «بعد از تهاتر چیزی برای تسویهٔ نقدی باقی نمانده است.»; and the opening check refuses
`_offset_amount = 0 AND _cash_amount = 0`.

The screen will list 15 people, 14 showing net 0 and one showing net **+5,760,000**
(`−9,240,000 − (−15,000,000)`, direction `customer_pays`) — a number produced by subtracting two
negatives, which the poster will then refuse.

> **Build consequence:** the "one net balance" feature [U] is not merely thin on data — it is
> currently unusable end to end, and the number it displays is an artefact.

---

**F11 · Q1 · The journal is not merely skewed; its one payable line has the wrong sign · exists-broken · [E] — confirms [prior]**

```
account_kind      | count | sum(debit)            | sum(credit)
bank              |    32 | 11720371245.00        | 32768181090899564
cheque_receivable |     6 | 2084007866487         | 542520410145
customer_credit   |    51 | 32768724062809709     | 2096194737132.00
supplier_payable  |     1 | 15000000              | 0
```

**51 `customer_credit` vs 1 `supplier_payable` — CONFIRMS** [prior:domain-functions-sweep-20260904.md:410-411].

Worse than thin: the single `supplier_payable` line is a **debit of 15,000,000 with no matching
credit ever** (`account_ref_id = bbb456fa-d6a5-42dd-aba1-0304db277dea`, `entry_status = posted`).
A payable accrues as a *credit*; this line has the opposite sign, which is why the one non-zero
person's payable reads −15,000,000.

Side observation, out of scope: the sums are absurd — one test entry of ~3.28e16 dominates both
`bank.credit` and `customer_credit.debit`. Separate data-quality problem.

> **Build consequence:** any "net balance" feature must first have a payables ledger. Today there is
> one line and it points the wrong way.

---

### Q2 — Asan person import

---

**F12 · Q2 · The full import chain · exists-works · [E]**

| # | File / object | Role |
|---|---|---|
| 1 | `src/lib/navigation/registry.ts:803`, `:1258` | nav entry `/admin/asan-import`, roles `["admin","accountant"]` |
| 2 | `src/components/layout/primary-modules.ts:192` | module hub entry |
| 3 | `src/routes/_app.admin.asan-import.tsx` (777 lines) | route + `AsanPersonImportPanel` |
| 4 | `src/lib/asan/parse-persons.ts` | client-side xlsx parse by header text |
| 5 | `src/lib/asan/parse-workbook.ts` | `buildHeaderIndex`, `cell`, `isBlankRow` |
| 6 | `public.asan_import_batches` | batch header + `stats` jsonb |
| 7 | `public.asan_import_person_rows` | staging table |
| 8 | `trg_asan_person_row_guard` → `tg_asan_person_row_guard()` | refuses `decision='accept'` on a `conflict` row |
| 9 | `public.asan_classify_person_batch(uuid)` | SECURITY DEFINER |
| 10 | `public.asan_commit_person_batch(uuid)` | SECURITY DEFINER — the only writer to `persons` |
| 11 | `public.normalize_identifier(text,text,boolean)` | called 4× per row inside the commit |

Flow: `handleFile` `:268-280` → `stageAndClassify` `:297-323` (chunked insert, `CHUNK = 200` at `:60`)
→ `classify` `:333` → `setDecision` `:344-372` → `commit` `:377-379`.

The page's own docstring, `:40-46`:
> `* The pipeline is upload → preview → stage → classify → confirm, and **every rule that matters lives in the database, not here**`

`discard` `:396-398` only sets `status = 'discarded'` — **it deletes nothing, including persons
already committed.**

> **Build consequence:** enforcement belongs in `asan_commit_person_batch` by the page's own stated
> design; adding it only to the form would contradict the architecture.

---

**F13 · Q2 · The Asan code is required at ZERO of three layers · absent · [E]**

Owner's claim: people arrive "without an Asan code … and a pre-invoice cannot be created".

**(a) UI — column-level warning only, and warnings never block.** `src/lib/asan/parse-persons.ts:79-81`:
```ts
if (index.asan_code === null) {
  warnings.push("بدون ستون «کد حساب» امکان تطبیق مطمئن وجود ندارد");
}
```
Fires only when the **column** is missing, never per row. `_app.admin.asan-import.tsx:471-483` renders
warnings in an amber box; the commit button at `:514` is `disabled={staging || classifying}` only.
Nothing consults `parsed.warnings`.

**(b) RPC — silent skip.** `asan_commit_person_batch`:
```sql
IF _code IS NOT NULL THEN
  INSERT INTO public.person_identifiers (...)
```
Measured: `normalize_identifier('asan_person_code','',false)` → `NULL`. A blank cell yields NULL, the
`IF` is false, the identifier is simply not written. No `RAISE`, no `_skipped` increment. The person
row and the customers row are created anyway.

**(c) Database — no constraint.** `persons` constraints are `persons_display_name_not_blank`,
`persons_kind_check`, `persons_visibility_scope_check`. NOT NULL set: `id, kind, display_name,
visibility_scope, is_active, created_at, updated_at`. Nothing identifier-related.

---

**F14 · Q2 · The mobile is required at ZERO of three layers · absent · [E]**

Same three layers. The UI has **no check of any kind** on `mobile_raw` — the only per-row warning is
for the name (`parse-persons.ts:104-105`). The RPC uses the identical `IF _mob IS NOT NULL THEN`
guard. `normalize_identifier('mobile_e164','',false)` → `NULL`, measured. No DB constraint.

**0 of 3 layers, for either field.** Requirement exists only downstream, at document time — which is
exactly the owner's symptom.

---

**F15 · Q2 · The CHECK that looks like enforcement is on the child table, and is structurally unreachable · exists-partial · [E]**

```
person_identifiers_value_normalized_not_blank :: CHECK ((length(btrim(value_normalized)) > 0))
person_identifiers_value_raw_not_blank        :: CHECK ((length(btrim(value_raw)) > 0))
```
Both `value_raw` and `value_normalized` are `NOT NULL`, so the brief's NULL-passes-CHECK trap does
not even apply here. The problem is different and worse: **the constraint is on `person_identifiers`,
a child row.** It can only fire on a row being inserted. A person with **no `asan_person_code` row at
all** violates nothing — there is no row to check.

The partial unique indexes have the same shape — uniqueness, never presence:
```
uq_person_identifiers_asan_code_active    ON (kind, value_normalized) WHERE status <> 'revoked' AND kind = 'asan_person_code'
uq_person_identifiers_asan_one_per_person ON (person_id)              WHERE kind = 'asan_person_code' AND status <> 'revoked'
uq_person_identifiers_contact_global      ON (kind, value_normalized) WHERE status <> 'revoked' AND kind IN ('mobile_e164','email')
```

> **Build consequence:** presence cannot be enforced on the child table. It needs either a NOT VALID
> CHECK on a derived column, a trigger on `persons`, or enforcement inside the commit RPC.

---

**F16 · Q2 · "Pre-invoice cannot be created" is TWO different gates, in two subsystems · exists-works · [E]**

**Mobile → the quote RPC.** `create_sales_quote_with_items`, live body:
```sql
IF p_customer_phone IS NULL OR btrim(p_customer_phone) = '' THEN
  RAISE EXCEPTION 'شماره تماس مشتری الزامی است.' USING ERRCODE = '22023';
END IF;
```

**Asan code → the ledger wizard.** `src/features/ledger-wizard/lookup.ts:150-159`:
```ts
const asanCode = await asanFor(person.id);
if (!asanCode) {
  return { status: "missing_asan", query, party: null,
           missingName: person.display_name, message: MISSING_ASAN(person.display_name) };
}
```
Rendered by `DocumentWizard.tsx:1033-1034` → `src/features/ledger-wizard/MissingAsanMessage.tsx`.
Server-side twin `public.require_asan_code(uuid)`:
```sql
RAISE EXCEPTION 'کد آسان برای «%» ثبت نشده است؛ ابتدا کد آسان او را وارد کنید، سپس سند را ثبت کنید', _name
```
Callers, measured over `prosrc`: `create_payment`, `create_receipt`, `create_dual_document` —
**not** `create_sales_quote_with_items`.

> **Build consequence:** the owner's single complaint is two independent fixes. The Asan-code gate
> does not touch pre-invoices at all; the pre-invoice failure is the phone.

---

**F17 · Q2 · Deletion blast radius · exists-broken · [E]**

```
total persons                          86
persons WITHOUT active asan code       69
persons WITHOUT active mobile          51
persons missing BOTH                   48
persons missing EITHER  ("bad")        72
```
(The Asan code lives in `person_identifiers` with `kind='asan_person_code'`, `status <> 'revoked'` —
verified; `persons` has no such column. Only **17** such rows exist in the whole database.)

Dependants of the 72:
```
via person_fk_drift_report's mirror columns only         20
via every FK to persons(id) except CASCADE-owned kids    72

customers=72  suppliers=14  external_parties=1  profiles=40
sales_quotes=40  purchases=13  mutual_settlements=0  person_merge_log=1
```

### **Arithmetic: total 72 ▸ safe to delete 0 ▸ has dependants 72.**

All 72 hold a `customers` row, and `customers_person_id_fkey` is plain
`FOREIGN KEY (person_id) REFERENCES persons(id)` — no `ON DELETE`, i.e. NO ACTION/RESTRICT. This is a
direct consequence of the importer: `asan_commit_person_batch` unconditionally creates the mirror
("414 — the Asan import path must produce customers too").

**If a delete path dropped the `customers` mirror first: 72 ▸ 9 safe ▸ 63 blocked.**

---

**F18 · Q2 · `person_fk_drift_report` has 15 arms, not 16, and was never a dependency inventory · exists-partial · [E] — CONTRADICTS the brief**

Counted in the live body: **15** arms. The function's own comment explains the drop:
```sql
-- 331: the 'invoices' drift arm was removed with the table.
```
So 16 was correct historically. **The brief's "16 pairs" is stale.**

`pg_constraint` reports **29** FKs referencing `persons(id)`. The drift report covers a strict
subset. Missing, with their delete actions:

| Not covered | ON DELETE |
|---|---|
| **`customers.person_id`** | *(none → RESTRICT)* ← **the one that blocks all 72** |
| `suppliers.person_id` | *(none)* |
| `external_parties.person_id` | *(none)* |
| `profiles.person_id` | *(none)* |
| `purchases.supplier_person_id` | *(none)* |
| `sales_quotes.customer_person_id` | *(none)* |
| `mutual_settlements.person_id` | RESTRICT |
| `person_merge_log.winner_id` / `.loser_id` | RESTRICT |
| `person_aliases`, `person_context_links`, `person_field_values`, `person_identifiers`, `person_merge_candidates.person_id_a/_b` | CASCADE |
| `asan_import_person_rows.matched_person_id` | SET NULL |

> **Build consequence:** using the drift report as the reference set for a delete path would miss the
> exact FK that makes deletion impossible. Derive the set from `pg_constraint`, not from that function.

---

**F19 · Q2 · No delete path exists — confirmed · absent · [E], confirms [prior]**

840 functions in `public` scanned by `prosrc`:
```
=== functions deleting from persons ===   (empty)
=== functions deleting from customers === (empty)
```
No `person_delete`, `person_purge`, `person_remove`, `admin_delete_person`. The only `*delete*`
functions are `admin_delete_ai_provider`, `delete_bot_api_key_secure`,
`delete_bot_api_key_table_access`, `audit_product_suppliers_delete`, and three
`tg_*_block_delete_when_posted` triggers. **Confirms** [prior:sweep, `domain-functions-sweep-20260904.md:28,42-43`].

`person_merge` merges, does not delete — its four `DELETE FROM` statements target child tables only,
for duplicates the winner already holds. The loser survives:
```sql
UPDATE public.persons SET is_active = false,
  notes = COALESCE(NULLIF(btrim(COALESCE(notes,'')),'') || E'\n','')
        || 'ادغام‌شده در شخص ' || p_winner_id::text || ' در تاریخ ' || now()::date::text,
  updated_at = now() WHERE id = p_loser_id;
```

---

**F20 · Q2 · `persons` has NO DELETE policy — a REST delete returns 204 having deleted nothing · exists-broken · [E]**

Table GRANTs: `DELETE` is granted to `anon`, `authenticated` **and** `service_role` on `persons`,
`person_identifiers` and `customers`. RLS is on (`force=false`) for all three, so **the grant is not
the gate; the policy is.**

```
=== policies with cmd='DELETE' ===
person_identifiers | person_identifiers_delete_admin_manager | {authenticated}
                   | USING has_any_role(uid(), ARRAY['admin','manager'])
```

| table | policy | cmd | permissive |
|---|---|---|---|
| persons | `persons_insert_identity_authors` | INSERT | PERMISSIVE |
| persons | `persons_select_by_visibility_scope` | SELECT | PERMISSIVE |
| persons | `persons_update_admin_manager` | UPDATE | PERMISSIVE |
| person_identifiers | `viewer_restricted` | ALL | **RESTRICTIVE** |
| person_identifiers | `person_identifiers_delete_admin_manager` | DELETE | PERMISSIVE |
| customers | `viewer_restricted` | ALL | **RESTRICTIVE** |
| customers | `manage customers by role` | ALL | PERMISSIVE |

- **`persons`: no DELETE policy of any kind.** No permissive policy matches DELETE ⇒ zero rows visible
  to the command ⇒ `DELETE /rest/v1/persons` returns **204 having deleted nothing, for every role
  including admin.** Exactly the failure mode the brief warns about, and it holds here.
- `person_identifiers`: DELETE works for admin/manager, subject to the restrictive viewer guard.
- `customers`: DELETE works via the permissive `ALL` policy.

No UI either — searching `src/` for `.delete()` against `"persons"`, `"person_identifiers"` or
`"customers"` returned nothing; `_app.persons.tsx` has no delete control (its only `delete` tokens are
JS `delete next.q` on the URL-search object, `:186-191`).

> **Build consequence:** an operator can delete a bad person's identifiers and customer mirror, but
> the `persons` row is undeletable through every path that exists. A delete feature needs a new
> policy *and* a new RPC *and* an ordering that clears `customers` first.

---

**F21 · Q2 · Idempotency holds only for rows that carry an identifier · exists-partial · [E]**

`asan_classify_person_batch` matches by lookup, not by insert:
```sql
IF _code IS NOT NULL THEN
  SELECT pi.person_id INTO _pid FROM public.person_identifiers pi
   WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
     AND pi.status <> 'revoked' LIMIT 1;
END IF;
```
`asan_commit_person_batch` has no `ON CONFLICT`; it uses `WHERE NOT EXISTS` guards:
```sql
-- identifiers are additive and idempotent: a value already present is left alone
INSERT INTO public.person_identifiers (...)
SELECT _pid, 'asan_person_code', _code, _code, 'confirmed', false
 WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                    WHERE pi.kind = 'asan_person_code' AND pi.value_normalized = _code
                      AND pi.status <> 'revoked');
```
plus the customer-mirror guard, and a batch-status gate that makes re-committing the *same* batch
impossible («این دسته در وضعیت قابل ثبت نیست»).

**The leak:** idempotency is keyed on *identifiers*. A row with **neither** code nor mobile matches
nothing in arms 1 and 2; in arm 3 a name hit yields `conflict`, but if the name differs at all the row
falls to arm 4 `'new'` and **a second person plus a second `customers` row is created**. `persons` has
no unique constraint on `display_name`.

> **Build consequence:** re-importing is safe precisely for the rows that are already fine, and
> duplicates precisely the rows the owner is complaining about.

---

**F22 · Q2 · The `114017` bug: the #381 mechanism is fixed; the account does not exist here · exists-works / UNKNOWN · [E]**

`git show 6298b97d` (PR #381, MERGED 2026-09-03), diff on `src/routes/_app.sales.quotes.new.tsx`:
```diff
+    const storedPhone = (selectedCustomer.phone ?? "").replace(/\D/g, "");
     const phoneMatches =
-      selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
+      storedPhone === "" ? true : storedPhone === customerPhone.replace(/\D/g, "");
```
plus `e2e/security/og98-empty-stored-phone-must-not-unlink.spec.ts` (97 lines).

Current code, `src/routes/_app.sales.quotes.new.tsx:165-180` — **fix present and intact.**

The account itself:
```
=== 114017 anywhere in person_identifiers ===  (empty)
=== 114017 in customers/persons ===             0
```
All 17 Asan codes on this DB: `102012, 105052, 1125623, 114067, 114090, 119041, 13260715, 2, 227261,
58279, 58716, 600018, 601505, 601702, 601704, 90019001, 9908`. `114067` and `114090` are
near-neighbours; **`114017` is absent.**

**Verdict: the mechanism #381 describes is FIXED. Whether the owner's incident was that mechanism is
UNKNOWN** — not reproducible here. Note that #381's failure mode was *orphaning* (quote written with
`customer_id NULL`), not a hard failure; "the pre-invoice failed" matches F16's empty-phone gate
better, and 51 of 86 persons have no mobile.

---

**F23 · Q2 · The merge hazard is LIVE · exists-broken · [E], confirms [prior:recon]**

```
$ git merge-base --is-ancestor feature/quote-customer-picker-readonly HEAD
NOT MERGED (exit 1)
$ git merge-base HEAD feature/quote-customer-picker-readonly
afdade65   (PR #379 — i.e. forked BEFORE #381 landed)
$ git rev-list --count HEAD..feature/quote-customer-picker-readonly   → 21
$ git rev-list --count feature/quote-customer-picker-readonly..HEAD   → 16
$ gh pr list --state all --limit 200 … headRefName=="feature/quote-customer-picker-readonly"
(empty — no PR was ever opened)
```

The flag-OFF fallback carries the pre-#381 comparison verbatim —
`feature/quote-customer-picker-readonly:src/routes/_app.sales.quotes.new.tsx:288-301`:
```ts
if (FEATURE_QUOTE_CUSTOMER_PICKER) {
  return guestOverride ? null : selectedCustomer.id;
}
const nameMatches = selectedCustomer.name.trim() === customerName.trim();
const phoneMatches =
  selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
return nameMatches && phoneMatches ? selectedCustomer.id : null;
```
`FEATURE_QUOTE_CUSTOMER_PICKER` exists only on the branch (`src/lib/feature-flags.ts:33`,
`envFlag(...)` — unset ⇒ **off**). `grep -rn "FEATURE_QUOTE_CUSTOMER_PICKER" src/` on staging: nothing.

> **Build consequence:** merging that branch with its documented default (flag off) silently reverts
> PR #381 for every user. Git will not surface it as a conflict — the branch rewrote the whole hunk.

---

### Q3 — the one-document-per-file limit

---

**F24 · Q3 · Single enforcement point, frontend only · exists-works · [E]**

`src/routes/_app.admin.asan-export.tsx:221-227`
```tsx
if (definition.oneDocumentPerFile && split.exportable.length > 1) {
  toast.error(
    "این قالب «شماره سند» را روی صفحهٔ آسان می‌گیرد، پس هر فایل فقط یک سند دارد. " +
      "لطفاً یک سند را انتخاب کنید.",
  );
  return;
}
```
Inside `download()` (`:206`), after the availability check (`:207`), empty-selection (`:211`) and the
1000-document ceiling (`:215`).

UX detail: `requestDownload` (`:276-292`) does **not** check the flag, and every journal export carries
`docType: "accounting_document"`, so the accountant first sees the numbering-confirm dialog («… ۲ سند»),
presses «ادامه و دانلود», and only then gets the refusal.

The flag is declared once, in the factory — `src/lib/asan/export-journal.ts:66-67`:
```ts
// Asan takes `شماره سند` on the screen, so one file holds exactly one document.
oneDocumentPerFile: true,
```
serving all four journal exports.

---

**F25 · Q3 · The database imposes no cap at all · exists-works · [E]**

`asan_list_journal_export(date,date,text)`, live body: guards are the role check (42501), the date
range (22023), and the `_filter` whitelist (22023). The final statement ends:
```sql
   WHERE _filter = 'all'
      OR (_filter = 'purchase_and_settlement' AND k.dkind IN ('purchase_payment','settlement'))
      OR k.dkind = _filter
   ORDER BY e.edate, e.id, l.lno;
```
**No `LIMIT`, no `FETCH FIRST`, no document counter, no one-document guard.**

`asan_assign_document_numbers(text,uuid[])` is explicitly plural:
```sql
FOREACH _id IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(_ids) AS t(x))
LOOP
  PERFORM public.asan_assign_document_number(_doc_type, _id);
END LOOP;
```

Also checked and negative: `export-selection.ts` (only `ASAN_EXPORT_BATCH_LIMIT = 1000` at `:88`),
`write-xlsx.ts` (counts nothing), `export-journal-rows.ts` (`groupJournalRows:95` groups many documents
without complaint), and the download loop itself (`:247-250`) which is *already* a multi-document
concatenation. The preview (`:618-629`) already renders up to 20 documents' rows in one sheet.

---

**F26 · Q3 · The owner's premise is corroborated by code: the file carries no document number · exists-works · [E]**

`src/lib/asan/export-journal.ts:71` — `buildRows: (doc) => buildJournalRows(doc.payload as JournalExportPayload)`.
The `number | null` second argument the shell passes at `:249` is **dropped on the floor** by the
journal factory. [U] confirmed on the code side.

---

**F27 · Q3 · Nothing in the six columns identifies a document · exists-broken (for the intended change) · [E]**

`src/lib/asan/layouts.ts:63-71`
```ts
export const JOURNAL_HEADERS: readonly string[] = [
  "کد حساب", "کد کالا", "شرح", "تعداد", "بدهکار", "بستانکار",
] as const;
```
`src/lib/asan/export-journal-rows.ts:81-92`
```ts
export function buildJournalRows(payload: JournalExportPayload): AsanCell[][] {
  return payload.lines.filter((r) => r.line_no !== null).map((r) => [
    r.account_code ?? "",      // A کد حساب
    r.product_code ?? "",      // B کد کالا
    r.line_description ?? "",  // C شرح
    num(r.quantity),           // D تعداد
    amountCell(r.debit),       // E بدهکار
    amountCell(r.credit),      // F بستانکار
  ]);
}
```
- **B and D are always empty** for a financial line — the RPC hard-codes `NULL::text` and `NULL::numeric`.
- **E/F zero → empty cell, not `0`** (`amountCell:60-63`), because Asan's «بدون مبلغ حذف شود» is ticked
  by default.
- `doc_id`, `doc_label`, `doc_date`, `doc_kind`, `party_name`, `line_no`, `doc_debit`, `doc_credit` all
  exist on the RPC row type (`export-journal-rows.ts:18-40`) and are **all discarded**.
- **The only discriminator is free text inside C**, via a five-level COALESCE ending in a literal, with
  the dual prefix:
  ```sql
  WHEN 'dual_document' THEN (
    SELECT concat_ws(' — ', 'سند دوطرفه',
             NULLIF('پیگیری ' || btrim(COALESCE(dd.tracking_number,'')), 'پیگیری '),
             NULLIF(btrim(COALESCE(dd.description,'')), ''))
      FROM public.dual_documents dd WHERE dd.id = e.source_id)
  ```
  `dual_documents.description` and `.tracking_number` are both `NOT NULL` in the live DB, corroborating
  [U] that the description is mandatory.
- No blank separator row is emitted — `write-xlsx.ts:38` is `[[...headers], ...rows]`, a flat concat.
- Layout 3 has **no date column at all** (contrast layouts 1/2, which carry `تاریخ` at B).

Real data: all 7 posted dual documents are exactly **two lines, one debit and one credit**.

---

**F28 · Q3 · Whether Asan merges a multi-document file · [?] UNKNOWN — cannot be settled here**

The codebase asserts merging as fact in five places (`export-journal.ts:9-11`, `layouts.ts:126-128`,
`export-journal-rows.ts:78-79`, `export-types.ts:80-81`, and two e2e comments) — but **every one of
those is prose written by this project, not a measurement.** There is no import log, no Asan response
capture, and no template evidence in the repo. [U] contradicts it.

> **Build consequence: blocking.** Only the owner importing a genuine two-document file into Asan can
> settle whether the rows merge into one voucher, are rejected, or split.

---

**F29 · Q3 · No zip / multi-file export capability exists anywhere · absent · [E]**

`package.json` read in full: no `jszip`, `fflate`, `archiver`, `adm-zip`, `zip.js`, `client-zip`.
`fflate` exists **only transitively** under `jspdf` (`package-lock.json:7942-7944`, `:8637`;
`bun.lock:1167`) — already noted as deliberate at `e2e/helpers/xlsx-raw.ts:11`.

Every `zip` hit in `src/` is MIME/attachment handling: `PaymentReceiptDocuments.tsx:89,108,148`,
`lib/messenger/attachment-rules.ts:68-72`, `lib/platform-releases/api.ts:172` (`archiveRelease` is a
status change).

All 11 `createObjectURL` call sites produce exactly one file; grepping for a loop within three lines of
`a.click()` returns **zero hits**. 47 `Promise.all` sites, none around `downloadAsanWorkbook`.

Closest precedent for one-file-per-document: `src/lib/asan/export-single-quote.ts` — a per-document
export button reusing the same RPC, row builder and numbering register (`:74-94`). Not a zip, no loop.

---

**F30 · Q3 · Removal surface, if the owner proceeds · [E] (inventory only)**

1. `src/routes/_app.admin.asan-export.tsx:221-227` — the guard.
2. `src/lib/asan/export-journal.ts:66-67` — the flag (and `:9-11` prose).
3. `src/lib/asan/export-types.ts:79-83` — prose on the interface field (the field may stay; no other
   export sets it `true` — `export-sales.ts:48`, `export-purchase.ts:53`, `export-bank-deposit.ts:57`
   all set `false`).
4. `src/lib/asan/layouts.ts:125-130` — **orphan constant** `JOURNAL_ONE_DOCUMENT_PER_FILE`, imported by
   nothing (grep returns exactly one hit: the declaration).
5. `src/lib/asan/export-journal-rows.ts:78-79` — prose.
6. `e2e/asan/export-shell.spec.ts:442-450` and `:619`.
7. `e2e/asan/export-receipts-payments.spec.ts:170-177` and `:346-357`.
8. `docs/verification/asan/gen-phase-5-samples.mjs:4-9` — stale prose.
9. **Database: nothing to change.**

---

**F31 · Q1/Q2 · `discard` on an import batch does not undo a commit · exists-partial · [E]**

`_app.admin.asan-import.tsx:396-398` — `discard` only sets `status: "discarded"`. Combined with F20
(persons undeletable), a mis-imported batch that was **committed** cannot be undone by any route in the
product.

---

## Duplicates

**D1 — two live receipt-posting implementations.** `create_receipt` (born-posted, wizard) and
`post_receipt_accounting` (approve-then-post, legacy). Both write the same data.
- `post_receipt_accounting` reachable at `src/routes/_app.accounting.receipts.$receiptId.tsx:338`:
  `const { data: postResult, error: rpcErr } = await supabase.rpc("post_receipt_accounting", {` —
  immediately after `.update({ status: "approved", rejection_reason: null })` at `:332`.
- Role gates differ: `create_receipt` admits `admin, accountant, manager`; `post_receipt_accounting`
  only `admin, accountant`.
- Receiver models differ: `post_receipt_accounting` uses `destination_bank_account_id` XOR
  `receiver_party_id`, which `create_receipt` never sets; it also consults `validation_rules`, which
  `create_receipt` ignores.
- **In use: both.** Confirms and localises [prior:domain-functions-sweep-20260904.md:408].
- **Consolidate:** pick one posting path before adding a supplier-payer branch, or the branch must be
  written twice.

**D2 — four person-import surfaces; one is used.**

| Path | Exists | In nav | Writes via | Real use |
|---|---|---|---|---|
| `/admin/asan-import` | ✅ `_app.admin.asan-import.tsx:122` | ✅ `registry.ts:803`, roles `["admin","accountant"]` | `asan_commit_person_batch` | **YES — 33 audit rows** |
| `/persons/import` | ✅ `_app.persons_.import.tsx:15` | ✅ `registry.ts:385`, roles `["admin","manager"]` | `PersonImportForm` — grep for `rpc(`/`fetch(` found only `audit_logs.insert` at `:281` | **NO — 0 rows** |
| `POST /api/persons/import` | ✅ `api.persons.import.ts` (141 lines), in `routeTree.gen.ts:471-472` | ❌ no client calls it | `person_import_batch` | **NO** |
| `/sales/customers/import` | ✅ `_app.sales.customers_.import.tsx:9` | ⚠️ no registry entry; only an in-page link at `_app.sales_.customers.tsx:213` | `CustomerImportForm:216` → `person_import_batch` | **NO — 0 rows** |

```
=== import audit actions ===
asan_persons_imported  | n=33 | last=2026-08-10 12:26:29+00
asan_products_imported | n=25 | last=2026-08-10 12:32:56+00
=== all distinct actions containing 'import' ===
asan_persons_imported
asan_products_imported
```
`persons_imported` (`PersonImportForm.tsx:284`) and `customers_imported` (`CustomerImportForm.tsx:257`):
**zero rows.**

`api.persons.import.ts`'s own docstring (`:10-14`) claims it *"Replaces the per-entity import paths"* —
**that consolidation never happened.** `PersonImportForm` does not even use `person_import_batch`.
- **Consolidate:** retire two of the three unused surfaces before adding enforcement, or enforcement
  must be written three times.

**D3 — an offline re-implementation of the journal layout.**
`docs/verification/asan/gen-phase-5-samples.mjs:19` hand-copies the header array
(`["کد حساب","کد کالا","شرح","تعداد","بدهکار","بستانکار"]`) and `:24-29` hand-copies `amountCell`'s
Toman→Rial rule. Not imported by `src/` or `e2e/`. A documentation duplicate: its prose (`:4-9`) will
silently disagree with the app if the one-per-file limit is removed.

**D4 — settlement: NO duplicate.** `grep -rln "تهاتر"` → `src/lib/accounting/mutual-settlement.ts` and
`src/routes/_app.accounting.mutual-settlement.tsx` only. The live DB has exactly one poster, one
candidate lister, one position reader.

**Searches that found nothing** (recorded, as required): `تامیین` — repo-wide including non-source
directories, plus `prosrc` · `supplier` intersected with `error|cannot|refus|not allow|invalid|guard`
across `src/hooks/treasury`, `src/lib/treasury`, `src/components/treasury` — **closes the treasury
layer as an alternative home for the guard** · `مشتری نیست|دریافت فقط از|فقط از مشتری` in `e2e/` (no
test asserts it) · `.insert(|.rpc(` in `AdvancePaymentSection.tsx`, `_app.accounting.receipts.tsx`,
`_app.operations.receipts.tsx` (all read-only) · `ledger-wizard` outside its one mount ·
`dualDocument` · `journalExport` · `oneFilePerDocument` · `one_file_per_document` · `multiFile` ·
`multi-file` · `downloadZip` · `createZip` · `jszip|fflate|archiver|adm-zip` in `src/` · `.delete()`
against `persons`/`person_identifiers`/`customers` in `src/` · `asan_list_journal_export_v2` or any
abandoned twin in `pg_proc` (14 `asan%` functions, exactly one journal lister).

---

## Integration gaps

**G-A · The wizard's role model vs the RPC's.**
`lookup.ts:53-54` requires a `customers` row before the user may proceed; `create_receipt` requires a
`customers.id` at `:p_customer_id`. Both ends agree — which is why the guard is *consistent* but
*wrong* against [U] OG-16. There is no seam to exploit: relaxing only the frontend produces a call the
RPC will reject with «مشتری پرداخت‌کننده انتخاب نشده است».

**G-B · Two labels for the same fact, 56 rows apart.**
`customers` (86 rows) vs `person_context_links` where `context_kind='customer'` (30 active). Nothing in
the receipt path reads the links table, so the drift is currently harmless — but [U] T9 describes
membership as "a label", and the label that exists is the one nothing reads.

**G-C · Import writes what document-time requires, but never checks it.**
`asan_commit_person_batch` creates the `customers` mirror unconditionally, yet writes the Asan code and
the mobile only `IF … IS NOT NULL`. `require_asan_code` and `create_sales_quote_with_items` then demand
exactly those two. The producer and the consumers disagree about what a usable person is.

**G-D · The importer creates the FK that blocks its own cleanup.**
The `customers` row that `asan_commit_person_batch` guarantees is the RESTRICT dependency that makes all
72 bad persons undeletable (F17/F18).

**G-E · Journal skew vs the settlement UI.**
`list_mutual_settlement_candidates` returns 15 people from the *mirror tables*, but reads balances from
`journal_lines`, where the payable side has one wrongly-signed row. The list is populated; the feature
behind it cannot run (F10/F11).

---

## Numbers

**Q2 §3 arithmetic**

| | |
|---|---|
| total persons | **86** |
| without active Asan code | **69** |
| without active mobile | **51** |
| missing both | **48** |
| **"bad" (missing either) — total** | **72** |
| **▸ safe to delete** | **0** |
| **▸ has dependants** | **72** |
| (if the `customers` mirror is dropped first) | **72 ▸ 9 safe ▸ 63 blocked** |

Dependants by table (over the 72): `customers=72`, `profiles=40`, `sales_quotes=40`, `suppliers=14`,
`purchases=13`, `external_parties=1`, `person_merge_log=1`, `mutual_settlements=0`.
Total `asan_person_code` rows in the database: **17**.
FKs referencing `persons(id)`: **29**. Arms in `person_fk_drift_report`: **15**.

**Q1 journal_lines**

```
account_kind      | count | sum(debit)        | sum(credit)
bank              |    32 | 11720371245.00    | 32768181090899564
cheque_receivable |     6 | 2084007866487     | 542520410145
customer_credit   |    51 | 32768724062809709 | 2096194737132.00
supplier_payable  |     1 | 15000000          | 0
```
Mutual-settlement candidates: **15**. Postable today: **0**.
Mirror counts: `customers=86`, `suppliers=15`, dual-role persons=**15**.
Posted journal entries by kind: `receipt=24`, `payment=12`, `dual=7`, `other=2`.

---

## Constraints

**Stack, from `package.json`:** React 19.2 · react-dom 19.2 · `@tanstack/react-router` 1.168 ·
`@tanstack/react-start` 1.167 · `@tanstack/react-query` 5.83 · Tailwind 4.2 · Vite 7.3 · TypeScript 5.8 ·
`xlsx` 0.18.5 · `@supabase/supabase-js` 2.104 · `@playwright/test` 1.62 · Zod 4.3 · jspdf 4.2.

**Discovered test command:** there is **no top-level `test` script**. `package.json` scripts are
`dev, build, build:dev, preview, lint, typecheck, test:receipt-ocr, format`. `test:receipt-ocr` is
`npx --yes tsx --test src/lib/accounting/receipt-ocr-structured.test.ts` — one file. Everything else
runs as `npx playwright test` against `playwright.config.ts` (`testDir: "./e2e"`, `asan/`, `persons/`,
`security/` etc. matched). `npm run typecheck` has a **70-error baseline across 6 files**.

**Observed conventions:** every rule that matters lives in the database, per
`_app.admin.asan-import.tsx:40-46`; RPCs are `SECURITY DEFINER` with an explicit `has_any_role` gate and
a Persian `RAISE EXCEPTION`; Persian UI strings are inline, not in a catalogue; mirrors
(`customers`/`suppliers`/`external_parties`) each carry `person_id` with a UNIQUE constraint.

**Conflicts with an owner decision — flagged, not silently corrected:**
1. **[U] OG-16** ("a receipt must be recordable from any person") is contradicted today by F3/F4 —
   and not only by a guard: `create_receipt`'s credit line and `increase_credit` are keyed to
   `customers.id`.
2. **[U] T9** ("membership is a label, not a separate entity") is contradicted by the schema: membership
   *is* a separate entity (`customers`/`suppliers` rows), and the actual label table drifts by 56 rows (G-B).
3. **[U] one net balance** is contradicted by F10/F11 — the feature exists, lists 15 people, and cannot
   post for any of them.
4. **The brief's "16 (table, mirror-column) pairs"** is stale: measured **15** (F18).
5. **The brief's Q1 quotation** of the refusal text does not exist in the codebase (F2).

---

## Coverage

**Sub-item arithmetic — inventoried = assessed + unassessed-with-reason.**

| Question | Sub-items | Assessed | Unassessed |
|---|---|---|---|
| Q1 | 5 numbered + settlement bodies + journal re-measure = **7** | 7 (F1–F11) | 0 |
| Q2 | **6** | 6 (F12–F23) | 0 |
| Q3 | **4** | 4 (F24–F30) | 0 |
| **Total** | **17** | **17** | **0** |

Two sub-items carry an embedded UNKNOWN rather than a negative verdict, and both are named below:
Q3 §3 (does Asan merge) and Q2 §6's account-specific half.

**Counting commands used:** `grep -rn` over `src/ e2e/ server/ supabase/ docs/` for each vocabulary term
(all listed under Duplicates, including the empty ones) · `pg_get_functiondef` on `create_receipt`,
`post_receipt_accounting`, `tg_payment_vouchers_derive_person`, `list_mutual_settlement_candidates`,
`person_settlement_position`, `post_mutual_settlement`, `asan_commit_person_batch`,
`asan_classify_person_batch`, `asan_list_journal_export`, `asan_assign_document_numbers`,
`person_fk_drift_report`, `person_merge`, `require_asan_code`, `create_sales_quote_with_items`,
`normalize_identifier` · `pg_policies` for `payment_receipts`, `customers`, `suppliers`, `persons`,
`person_identifiers` · `pg_constraint` for `persons`, `person_identifiers`, `person_context_links`,
`payment_receipts`, `asan_import_person_rows` · `information_schema.columns` for `persons`,
`bank_accounts`, `dual_documents` · `pg_proc` scan of all **840** `public` functions for
`DELETE FROM persons|customers`.

**Deliberately not examined, with reason:** `pay_purchase_with_voucher`, `create_payment`,
`create_dual_document` bodies — the payment-side duplicate is cited from [prior:sweep] rather than
re-derived, per the brief's instruction not to run a third sweep. The aging reports, the accrual-ledger
decision, the purchase/sales exports and `/accounting/payment-vouchers` are **out of scope** by the brief.

---

## UNVERIFIED / UNKNOWN

- **[?] Whether Asan merges two documents in one Layout-3 sheet.** Five places in this codebase assert
  it; all five are our own prose, not a measurement. Only the owner importing a genuine two-document
  file settles it. **Blocking for Q3.**
- **UNKNOWN whether the owner's `114017` incident was the #381 mechanism.** That account does not exist
  in this database (F22). The mechanism is fixed; the incident is not reproducible here.
- **UNVERIFIED: `create_receipt` accepting a supplier-only payer.** The claim that the database would
  accept it is derived from reading the body, not from execution — a behavioural probe would require a
  write, which this mission forbids.
- **UNVERIFIED: runtime behaviour of a REST `DELETE`.** Policies and grants were read (F20); no request
  was issued.
- **Production.** Never contacted. Every number here is from the LAN test database and may differ from
  production.
- **The e2e suite was searched for the refusal string only.** Other supplier-related receipt guards in
  `e2e/` were not audited.
