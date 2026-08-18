# Data-gap worklist — record-level detail — 2026-08-17

Companion to `DATA-GAP-WORKLIST.md`. Read that first: it carries the leverage analysis and two corrections to the mission's premise.

> ⚠️ **TEST DATABASE — anonymised 2026-08-14.** Names are synthetic. Counts, amounts and structure are real.

Ids are shown as the first 8 characters of the uuid, which is unique across every table in this database.

---

## D1 — Purchases with no supplier (92 rows, complete)

Ordered by amount descending, as the brief requires. `paid` and `has_voucher` are `f` for **every** row (`W1`: 0 paid, 0 with voucher — `payment_vouchers` holds 0 rows).

### D1.1 — The only actionable row

| Purchase | Number | Date | Amount | Qty | Product | Notes |
|---|---|---|---|---|---|---|
| `6bcc3544` | *(none)* | 2026-08-02 | **7,840,000,000.00** | 70 | کولر گازی جنرال گلد 24000 مدل پلاتینیوم GG-MS24000 PLATINUM معمولی سرد وگرم | *(none)* |

### D1.2 — The 91 test-residue rows

Every row below carries an explicit test marker in `notes`. All are dated 2026-08-07 or 2026-08-08 except the two probes. All are product «۳۰ایوولی md1» except the two probes. **Total value 370,400 Toman.**

| Purchase | Date | Amount | Qty | Notes |
|---|---|---|---|---|
| `a285cc7a` | 2026-08-08 | 10,000.00 | 2 | E2E_C2_219 main |
| `07a87bdc` | 2026-08-08 | 10,000.00 | 2 | E2E_C2_219 main |
| `8ca044d8` | 2026-08-08 | 10,000.00 | 2 | E2E_C1_219 |
| `01444bd9` | 2026-08-08 | 10,000.00 | 2 | E2E_C1_219 |
| `66680390` | 2026-08-08 | 10,000.00 | 2 | E2E_C1_219 |
| `b9b17344` | 2026-08-08 | 10,000.00 | 2 | E2E_C2_219 main |
| `3f257407` | 2026-08-07 | 10,000.00 | 2 | E2E_C1_219 |
| `37d94cd2` | 2026-08-07 | 10,000.00 | 2 | E2E_C2_219 main |
| `577e171a` | 2026-08-07 | 10,000.00 | 2 | E2E_C1_219 |
| `67f81c89` | 2026-08-07 | 10,000.00 | 2 | E2E_C2_219 main |
| `b9d919b0` | 2026-08-07 | 10,000.00 | 2 | E2E_C1_219 |
| `8deec87e` | 2026-08-07 | 10,000.00 | 2 | E2E_C2_219 main |
| `29c55020` | 2026-08-08 | 7,500.00 | 3 | E2E_C3_219 summary buy mskng8he-9 |
| `5cf7b977` | 2026-08-08 | 7,500.00 | 3 | E2E_C3_219 summary buy msjq4pib-9 |
| `e278a576` | 2026-08-08 | 7,500.00 | 3 | E2E_C3_219 summary buy msjpmd37-9 |
| `f32d7473` | 2026-08-07 | 7,500.00 | 3 | E2E_C3_219 summary buy msjaxcc4-9 |
| `92fa8299` | 2026-08-07 | 7,500.00 | 3 | E2E_C3_219 summary buy msi6t9cz-9 |
| `5ec4fb31` | 2026-08-07 | 7,500.00 | 3 | E2E_C3_219 summary buy msiewzxm-9 |
| `89ce92d3` | 2026-08-08 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `7531be73` | 2026-08-08 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `49d2ef55` | 2026-08-08 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `77fa2bca` | 2026-08-07 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `ded4a97c` | 2026-08-07 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `1410a88b` | 2026-08-07 | 7,000.00 | 1 | E2E_C2_219 conflict |
| `9426bc27` | 2026-08-03 | 5,000.00 | 1 | **PROBE_do_not_keep** — product: یخچال ساید بای ساید ال جی مدل X287 رنگ سیلور |
| `6f37402a` | 2026-08-02 | 5,000.00 | 5 | **C3_CONCURRENCY_PROBE** — product: جنرال گلد 12000 مدل معمولی سرد وگرم |
| `e4f12deb` | 2026-08-08 | 4,000.00 | 4 | E2E_C3_219 partial buy msjq4pib-4 |
| `23a4c3ed` | 2026-08-08 | 4,000.00 | 1 | E2E_C2_219 retry |
| `5c95ce9c` | 2026-08-08 | 4,000.00 | 1 | E2E_C2_219 retry |
| `240665f5` | 2026-08-08 | 4,000.00 | 4 | E2E_C3_219 partial buy mskng8he-4 |
| `5bfa66e3` | 2026-08-08 | 4,000.00 | 1 | E2E_C2_219 retry |
| `39153089` | 2026-08-08 | 4,000.00 | 4 | E2E_C3_219 partial buy msjpmd37-4 |
| `84badec7` | 2026-08-07 | 4,000.00 | 1 | E2E_C2_219 retry |
| `d18ed422` | 2026-08-07 | 4,000.00 | 4 | E2E_C3_219 partial buy msjaxcc4-4 |
| `839c94b7` | 2026-08-07 | 4,000.00 | 4 | E2E_C3_219 partial buy msi6t9cz-4 |
| `6ac09a5b` | 2026-08-07 | 4,000.00 | 1 | E2E_C2_219 retry |
| `7a628e2a` | 2026-08-07 | 4,000.00 | 1 | E2E_C2_219 retry |
| `da72040b` | 2026-08-07 | 4,000.00 | 4 | E2E_C3_219 partial buy msiewzxm-4 |
| `cf94345d` | 2026-08-08 | 3,000.00 | 1 | E2E_C2_219 double |
| `66cb22e2` | 2026-08-08 | 3,000.00 | 2 | E2E_C4_219 c3 buy msjpqp4c-16 |
| `c9bb0cf7` | 2026-08-08 | 3,000.00 | 1 | E2E_C2_219 double |
| `599d2810` | 2026-08-08 | 3,000.00 | 2 | E2E_C4_219 c3 buy msknhxaq-16 |
| `55c72712` | 2026-08-08 | 3,000.00 | 2 | E2E_C4_219 c3 buy msjq8c7a-16 |
| `c6de5d2c` | 2026-08-08 | 3,000.00 | 1 | E2E_C2_219 double |
| `569a90e7` | 2026-08-07 | 3,000.00 | 2 | E2E_C4_219 c3 buy msif3nho-12 |
| `a95a8662` | 2026-08-07 | 3,000.00 | 1 | E2E_C2_219 double |
| `8af45ba2` | 2026-08-07 | 3,000.00 | 1 | E2E_C2_219 double |
| `970ed349` | 2026-08-07 | 3,000.00 | 1 | E2E_C2_219 double |
| `1d6a93ce` | 2026-08-07 | 3,000.00 | 2 | E2E_C4_219 c3 buy msi6wglo-16 |
| `25ab788c` | 2026-08-07 | 3,000.00 | 2 | E2E_C4_219 c3 buy msjaz6az-16 |
| `d954214a` | 2026-08-07 | 3,000.00 | 2 | E2E_C4_219 c3 buy msiflpwu-16 |
| `aa9efaad` | 2026-08-08 | 2,200.00 | 1 | E2E_C5_219 standalone msjqft5c-3 |
| `9a305eab` | 2026-08-08 | 2,200.00 | 1 | E2E_C5_219 standalone msknlgj5-3 |
| `c6a1b9fc` | 2026-08-08 | 2,200.00 | 1 | E2E_C5_219 standalone msjpxcl2-3 |
| `fe14ef27` | 2026-08-07 | 2,200.00 | 1 | E2E_C5_219 standalone msi73e62-3 |
| `1023be45` | 2026-08-07 | 2,200.00 | 1 | E2E_C5_219 standalone msifbwis-3 |
| `700cfa7b` | 2026-08-07 | 2,200.00 | 1 | E2E_C5_219 standalone msi8p7za-3 |
| `61c1d6b3` | 2026-08-07 | 2,200.00 | 1 | E2E_C5_219 standalone msi8kgs3-3 |
| `479f3c06` | 2026-08-07 | 2,200.00 | 1 | E2E_C5_219 standalone msjb2spp-3 |
| `ef15e943` | 2026-08-08 | 2,000.00 | 4 | E2E_C3_219 multi b msjq4pib-7 |
| `a3033714` | 2026-08-08 | 2,000.00 | 4 | E2E_C3_219 multi b msjpmd37-7 |
| `ab4cb9c2` | 2026-08-08 | 2,000.00 | 4 | E2E_C3_219 multi b mskng8he-7 |
| `2f8fb4b6` | 2026-08-07 | 2,000.00 | 4 | E2E_C3_219 multi b msi6t9cz-7 |
| `6f2ecd8c` | 2026-08-07 | 2,000.00 | 4 | E2E_C3_219 multi b msjaxcc4-7 |
| `8517c1c7` | 2026-08-07 | 2,000.00 | 4 | E2E_C3_219 multi b msiewzxm-7 |
| `394ee6af` | 2026-08-08 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `394127ae` | 2026-08-08 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `cecee5dc` | 2026-08-08 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `4744e3e6` | 2026-08-07 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `99bee54e` | 2026-08-07 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `5aa497c8` | 2026-08-07 | 1,800.00 | 2 | E2E_C3_219 double buy |
| `4d3bb881` | 2026-08-08 | 1,600.00 | 2 | E2E_C5_219 deliver buy msjpxcl2-5 |
| `f55f17e7` | 2026-08-08 | 1,600.00 | 2 | E2E_C5_219 deliver buy msjqft5c-5 |
| `9aa674a9` | 2026-08-08 | 1,600.00 | 2 | E2E_C5_219 deliver buy msknlgj5-5 |
| `e294bb4a` | 2026-08-07 | 1,600.00 | 2 | E2E_C5_219 deliver buy msjb2spp-5 |
| `161c5195` | 2026-08-07 | 1,600.00 | 2 | E2E_C5_219 deliver buy msifbwis-5 |
| `e838e2eb` | 2026-08-07 | 1,600.00 | 2 | E2E_C5_219 deliver buy msi8kgs3-5 |
| `f65c73c0` | 2026-08-07 | 1,600.00 | 2 | E2E_C5_219 deliver buy msi8p7za-5 |
| `68d9bd0d` | 2026-08-07 | 1,600.00 | 2 | E2E_C5_219 deliver buy msi74crq-2 |
| `f76f3760` | 2026-08-08 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `24bec60a` | 2026-08-08 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `582ee8d5` | 2026-08-08 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `66611bee` | 2026-08-07 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `3255255a` | 2026-08-07 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `15fade6e` | 2026-08-07 | 1,200.00 | 1 | E2E_C3_219 standalone |
| `1f5ccabc` | 2026-08-08 | 1,000.00 | 2 | E2E_C3_219 multi a msjq4pib-6 |
| `8319a9af` | 2026-08-08 | 1,000.00 | 2 | E2E_C3_219 multi a mskng8he-6 |
| `fd8c6ff8` | 2026-08-08 | 1,000.00 | 2 | E2E_C3_219 multi a msjpmd37-6 |
| `786e24c0` | 2026-08-07 | 1,000.00 | 2 | E2E_C3_219 multi a msjaxcc4-6 |
| `4299945f` | 2026-08-07 | 1,000.00 | 2 | E2E_C3_219 multi a msi6t9cz-6 |
| `e274ec61` | 2026-08-07 | 1,000.00 | 2 | E2E_C3_219 multi a msiewzxm-6 |

---

## D2 — Suppliers with no Asan code (13 of 15, complete)

Ordered by attached purchase value. `mirror_accounting_code` is blank for all 13.

| Supplier | Name | Person | Active | Purchases | Purchase value | Purchase docs unblocked if coded |
|---|---|---|---|---|---|---|
| `b05f3194` | تأمین‌کنندهٔ آزمایشی 10 | `ee20926a` | yes | 4 | 26,800,000,024.95 | **3** (the 24.95 one stays blocked — fractional) |
| `84d90f79` | تأمین‌کنندهٔ آزمایشی 8 | `1a71b1e2` | yes | 1 | 4,800,000,000.00 | **1** |
| `6e9a0239` | تأمین‌کنندهٔ آزمایشی 6 | `dc76b4a6` | yes | 1 | 65,000,000.00 | **1** |
| `4ba1a0ed` | تأمین‌کنندهٔ آزمایشی 5 | `46f4be38` | yes | 1 | 24,999,999.99 | **0** — fractional amount blocks it |
| `0b72e2c7` | تأمین‌کنندهٔ آزمایشی 1 | `13de5f47` | yes | 0 | 0 | 0 |
| `b9eb6f37` | تأمین‌کنندهٔ آزمایشی 11 | `6cd30201` | yes | 0 | 0 | 0 |
| `d36e357d` | تأمین‌کنندهٔ آزمایشی 13 | `14bb7791` | yes | 0 | 0 | 0 |
| `fd5bb872` | تأمین‌کنندهٔ آزمایشی 14 | `2f76c546` | yes | 0 | 0 | 0 |
| `fe99bd7c` | تأمین‌کنندهٔ آزمایشی 15 | `857b46d8` | yes | 0 | 0 | 0 |
| `0bffad0d` | تأمین‌کنندهٔ آزمایشی 2 | `d80a8f13` | yes | 0 | 0 | 0 |
| `24260c17` | تأمین‌کنندهٔ آزمایشی 3 | `f2337cc0` | yes | 0 | 0 | 0 |
| `7ea10501` | تأمین‌کنندهٔ آزمایشی 7 | `96298267` | yes | 0 | 0 | 0 |
| `866fffbb` | تأمین‌کنندهٔ آزمایشی 9 | `d6c1f55d` | yes | 0 | 0 | 0 |

### Suppliers that DO have a code (2, for contrast)

| Supplier | Name | Asan code | Purchases |
|---|---|---|---|
| `bbb456fa` | تأمین‌کنندهٔ آزمایشی 12 | `601702` | 2 — **the only 2 exportable purchase documents** |
| `26d7b2e9` | تأمین‌کنندهٔ آزمایشی 4 | `90019001` | 0 |

### Suppliers with no person record: 0 rows

`suppliers.person_id` is `NOT NULL` and no orphan references exist (`W0b`: `suppliers_person_null` = 0, `suppliers_person_orphan` = 0).

---

## D3 — Customers with no Asan code (13 of 23, complete)

| Customer | Name | Person | Active | Receipts | Approved | Accepted quotes | Quote value | Receipt value |
|---|---|---|---|---|---|---|---|---|
| `d05bbd0b` | **مشتری آزمایشی 17** | `a089aa60` | yes | **4** | **1** | **3** | **663,600,000** | **10,276,000,000.00** |
| `61ba4ba6` | مشتری آزمایشی 6 | `630403fb` | yes | 1 | 0 | 0 | 0 | 50,000,000.00 |
| `b60e21e8` | پیرایش | `d2b5c255` | yes | 0 | 0 | 0 | 0 | 0 |
| `9e6a981e` | مشتری آزمایشی 12 | `94d58dd6` | yes | 0 | 0 | 0 | 0 | 0 |
| `ac3fb744` | مشتری آزمایشی 13 | `3813954d` | yes | 0 | 0 | 0 | 0 | 0 |
| `ae54faa1` | مشتری آزمایشی 14 | `3a2ff0e1` | yes | 0 | 0 | 0 | 0 | 0 |
| `c57263d1` | مشتری آزمایشی 15 | `4e3b44d7` | yes | 0 | 0 | 0 | 0 | 0 |
| `d38624fa` | مشتری آزمایشی 18 | `bf3dc235` | yes | 0 | 0 | 0 | 0 | 0 |
| `d538ac2b` | مشتری آزمایشی 19 | `7f46fa25` | yes | 0 | 0 | 0 | 0 | 0 |
| `1a2c7e3e` | مشتری آزمایشی 2 | `3352373b` | yes | 0 | 0 | 0 | 0 | 0 |
| `d790831a` | مشتری آزمایشی 21 | `49635aa1` | yes | 0 | 0 | 0 | 0 | 0 |
| `f17fb12c` | مشتری آزمایشی 22 | `36bb5871` | yes | 0 | 0 | 0 | 0 | 0 |
| `7dbf1ad1` | مشتری آزمایشی 7 | `8728d906` | yes | 0 | 0 | 0 | 0 | 0 |

Note `61ba4ba6` carries a **mirror** `customers.accounting_code = 114067` but has **no `person_identifiers` row**. The export reads the identifier, not the mirror — so this customer is blocked despite appearing to have a code in the customer record. **That mismatch is worth the owner's attention: the UI may show a code that the export cannot use.**

### Customers that DO have a code (10, for contrast)

| Customer | Name | Asan code |
|---|---|---|
| `16a78984` | مشتری آزمایشی 1 | `58716` |
| `8b36df09` | مشتری آزمایشی 10 | `114090` |
| `9685a046` | مشتری آزمایشی 11 | `119041` |
| `ce69632d` | مشتری آزمایشی 16 | `1125623` |
| `d634ac60` | مشتری آزمایشی 20 | `600018` |
| `2b67455e` | مشتری آزمایشی 3 | `601702` |
| `4a42034a` | مشتری آزمایشی 4 | `9908` |
| `5329c847` | مشتری آزمایشی 5 | `601505` |
| `7e35520c` | مشتری آزمایشی 8 | `2` |
| `862fb5db` | مشتری آزمایشی 9 | `58279` |

Observation, recorded without interpretation: code `601702` appears on both customer `2b67455e` and supplier `bbb456fa`. The export's lookup is `LIMIT 1` with no `ORDER BY` per person, but these are two different persons, so no collision occurs in the lookup itself.

---

## D4 — Accepted sales quotes (all 4, complete)

| Quote | Id | Date | Customer | Amount | Person link | Asan code | Registered | Stock out | Line items | Blocking cause |
|---|---|---|---|---|---|---|---|---|---|---|
| `SQ-2026-000024` | `bcbe3ce6` | 2026-07-28 | مشتری آزمایشی 17 | 500,500,000 | yes | — | yes | yes | 1 | `BLOCK_no_asan_code` |
| `SQ-2026-000003` | `4850549b` | 2026-07-21 | مشتری آزمایشی 17 | 100,100,000 | yes | — | **no** | **no** | 1 | `BLOCK_no_asan_code` |
| `SQ-2026-000005` | `0cde3c46` | 2026-07-23 | مشتری آزمایشی 17 | 63,000,000 | yes | — | yes | **no** | 1 | `BLOCK_no_asan_code` |
| `SQ-2026-000004` | `2a38bcc3` | 2026-07-21 | مشتری آزمایشی 11 | 62,200,000 | yes | `119041` | yes | **no** | 1 | `BLOCK_stock_not_deducted` |

`SQ-2026-000024` is the quote that already holds an `asan_export_numbers` row (`sales_invoice` #1, assigned 2026-08-08) — see `ASAN-EXPORT-REALITY.md` §6.

**Receipt-to-quote allocations** (`L8`): `payment_receipt_links` holds 3 rows across 3 receipts and 2 quotes; **0 rows carry an `invoice_id`** (the invoices subsystem was retired).

---

## D5 — The SQL, ready to run read-only elsewhere

Every statement is a `SELECT`. There is no DDL and no DML. Write it to a file with an **editor** (PowerShell `>` and default `Set-Content` produce UTF-16, which PostgreSQL cannot read), `docker cp` it into the DB container, and run with `psql -f`.

Remember: **on production the database is named `postgres`, not `afrakala`.**

```sql
\o /tmp/worklist.out
\pset pager off

-- W1 purchases supplier coverage
SELECT count(*) AS purchases_total,
       count(supplier_id) AS with_supplier,
       count(*) - count(supplier_id) AS without_supplier,
       sum(total_amount) AS total_value_all,
       sum(total_amount) FILTER (WHERE supplier_id IS NULL) AS value_without_supplier,
       count(*) FILTER (WHERE supplier_id IS NULL AND paid_at IS NOT NULL) AS nosup_paid,
       count(*) FILTER (WHERE supplier_id IS NULL AND paid_at IS NULL) AS nosup_unpaid
  FROM public.purchases;

-- W2 the worklist itself
SELECT left(p.id::text,8) AS purchase_id8, COALESCE(p.number,'') AS number,
       p.purchase_date, p.total_amount, p.quantity,
       COALESCE(pr.name,'') AS product_name,
       COALESCE(NULLIF(btrim(p.notes),''),'') AS notes,
       (p.paid_at IS NOT NULL) AS paid,
       EXISTS (SELECT 1 FROM public.payment_vouchers v WHERE v.purchase_id = p.id) AS has_voucher
  FROM public.purchases p LEFT JOIN public.products pr ON pr.id = p.product_id
 WHERE p.supplier_id IS NULL
 ORDER BY p.total_amount DESC, p.purchase_date DESC;

-- L6 how much of that is test residue
SELECT CASE WHEN notes IS NULL OR btrim(notes)='' THEN 'no_notes'
            WHEN notes ~ '^E2E_' THEN 'E2E_test_marker'
            WHEN notes ~* 'PROBE|CONCURRENCY' THEN 'PROBE_marker'
            ELSE 'other_notes' END AS note_class,
       count(*) AS purchases, sum(total_amount) AS value
  FROM public.purchases WHERE supplier_id IS NULL GROUP BY 1 ORDER BY 3 DESC;

-- W4 suppliers with no Asan code
SELECT left(s.id::text,8) AS supplier_id8, s.name, left(s.person_id::text,8) AS person_id8,
       COALESCE(NULLIF(btrim(s.accounting_code),''),'') AS mirror_code, s.is_active,
       (SELECT count(*) FROM public.purchases p WHERE p.supplier_id = s.id) AS purchase_count,
       COALESCE((SELECT sum(p.total_amount) FROM public.purchases p WHERE p.supplier_id = s.id),0) AS purchase_value
  FROM public.suppliers s
 WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                    WHERE pi.person_id = s.person_id AND pi.kind='asan_person_code')
 ORDER BY purchase_value DESC, purchase_count DESC, s.name;

-- W6 customers with no Asan code
SELECT left(c.id::text,8) AS customer_id8, c.name, left(c.person_id::text,8) AS person_id8,
       COALESCE(NULLIF(btrim(c.accounting_code),''),'') AS mirror_code, c.is_active,
       (SELECT count(*) FROM public.payment_receipts r WHERE r.customer_id = c.id) AS receipts,
       (SELECT count(*) FROM public.payment_receipts r WHERE r.customer_id = c.id AND r.status='approved') AS receipts_approved,
       (SELECT count(*) FROM public.sales_quotes q WHERE q.customer_id = c.id AND q.status='accepted') AS quotes_accepted,
       COALESCE((SELECT sum(q.final_amount) FROM public.sales_quotes q
                  WHERE q.customer_id = c.id AND q.status='accepted'),0) AS quotes_value,
       COALESCE((SELECT sum(r.amount) FROM public.payment_receipts r WHERE r.customer_id = c.id),0) AS receipts_value
  FROM public.customers c
 WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                    WHERE pi.person_id = c.person_id AND pi.kind='asan_person_code')
 ORDER BY receipts_value DESC, quotes_value DESC, c.name;

-- W7 impact of the proposed blocking rule
SELECT count(*) AS customers_blocked_by_new_rule, count(*) FILTER (WHERE c.is_active) AS of_which_active
  FROM public.customers c
 WHERE NOT EXISTS (SELECT 1 FROM public.person_identifiers pi
                    WHERE pi.person_id = c.person_id AND pi.kind='asan_person_code');

-- L1 PURCHASE export blocking, replicated from asan_list_purchase_export
WITH p AS (
  SELECT pu.id, pu.total_amount, pu.supplier_id,
         (SELECT pi.value_normalized FROM public.person_identifiers pi
           WHERE pi.person_id = COALESCE(pu.supplier_person_id, s.person_id)
             AND pi.kind='asan_person_code' LIMIT 1) AS pcode
    FROM public.purchases pu LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
   WHERE pu.status='received'),
agg AS (SELECT i.purchase_id AS pid, COUNT(*) AS n, SUM(i.line_total) AS total,
               bool_or(i.unit_price <> trunc(i.unit_price) OR i.line_total <> trunc(i.line_total)) AS frac
          FROM public.purchase_items i GROUP BY i.purchase_id)
SELECT COALESCE(CASE
         WHEN COALESCE(a.n,0)=0 THEN 'BLOCK_no_line_items'
         WHEN p.pcode IS NULL OR btrim(p.pcode)='' THEN
              CASE WHEN p.supplier_id IS NULL THEN 'BLOCK_no_supplier_at_all'
                   ELSE 'BLOCK_supplier_has_no_asan_code' END
         WHEN COALESCE(a.frac,false) OR p.total_amount <> trunc(p.total_amount) THEN 'BLOCK_fractional_amount'
         WHEN a.total IS DISTINCT FROM p.total_amount THEN 'BLOCK_line_sum_mismatch'
         ELSE NULL END,'EXPORTABLE') AS cause,
       count(*) AS documents, sum(p.total_amount) AS value
  FROM p LEFT JOIN agg a ON a.pid = p.id GROUP BY 1 ORDER BY 2 DESC;

-- L3 SALES export blocking, replicated from asan_list_sales_export
WITH q AS (
  SELECT sq.id, sq.quote_number, sq.final_amount,
         (SELECT pi.value_normalized FROM public.person_identifiers pi
           WHERE pi.person_id = sq.customer_person_id AND pi.kind='asan_person_code' LIMIT 1) AS pcode,
         (sq.accounting_registered_at IS NOT NULL) AS finalized,
         EXISTS (SELECT 1 FROM public.stock_movements m
                  WHERE m.ref_type='sale_quote_confirm' AND m.ref_id = sq.id) AS stock_out
    FROM public.sales_quotes sq WHERE sq.status='accepted'),
agg AS (SELECT i.quote_id AS qid, COUNT(*) AS n, SUM(i.line_total) AS total,
               bool_or(i.unit_price <> trunc(i.unit_price) OR i.line_total <> trunc(i.line_total)) AS frac
          FROM public.sales_quote_items i GROUP BY i.quote_id)
SELECT q.quote_number, q.final_amount, COALESCE(q.pcode,'') AS asan_code,
       q.finalized, q.stock_out, COALESCE(a.n,0) AS line_items,
       COALESCE(CASE
         WHEN COALESCE(a.n,0)=0 THEN 'BLOCK_no_line_items'
         WHEN q.pcode IS NULL OR btrim(q.pcode)='' THEN 'BLOCK_no_asan_code'
         WHEN NOT q.finalized THEN 'BLOCK_not_accounting_registered'
         WHEN NOT q.stock_out THEN 'BLOCK_stock_not_deducted'
         WHEN COALESCE(a.frac,false) OR q.final_amount <> trunc(q.final_amount) THEN 'BLOCK_fractional_amount'
         WHEN a.total IS DISTINCT FROM q.final_amount THEN 'BLOCK_line_sum_mismatch'
         ELSE NULL END,'EXPORTABLE') AS cause
  FROM q LEFT JOIN agg a ON a.qid = q.id ORDER BY q.final_amount DESC;

-- W8 quotes accounting-registration summary
SELECT count(*) AS accepted_total,
       count(*) FILTER (WHERE accounting_registered_at IS NOT NULL) AS registered,
       count(*) FILTER (WHERE accounting_registered_at IS NULL) AS not_registered,
       COALESCE(sum(final_amount) FILTER (WHERE accounting_registered_at IS NULL),0) AS value_not_registered
  FROM public.sales_quotes WHERE status='accepted';

-- W13 non-data blockers
SELECT 'bank_accounts_total' AS k, count(*)::text AS v FROM public.bank_accounts
UNION ALL SELECT 'bank_accounts_with_code', count(*)::text FROM public.bank_accounts
  WHERE accounting_code IS NOT NULL AND btrim(accounting_code) <> ''
UNION ALL SELECT 'external_parties_total', count(*)::text FROM public.external_parties
UNION ALL SELECT 'external_parties_with_code', count(*)::text FROM public.external_parties
  WHERE accounting_code IS NOT NULL AND btrim(accounting_code) <> ''
UNION ALL SELECT 'asan_control_accounts_rows', count(*)::text FROM public.asan_control_accounts;

\o
```

**Reading the result:** `docker cp <container>:/tmp/worklist.out .` then open it in an editor. Do **not** print it to a terminal — it is full of Persian and the console reverses RTL text.
