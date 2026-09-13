# Asan person codes · rows carrying `accounting_code` with no Asan identifier · 2026-09-13

> Read-only sample taken on production `192.168.170.10` with staff working. `SELECT` only.
> Not committed.

## First, a correction to the premise

There is **no `asan_person_code` column**. Grepping the export SQL rather than guessing (migration
`20260819180000_367_asan_export_filters.sql`) shows the exports resolve a person's Asan code like
this:

```sql
COALESCE( NULLIF(btrim(COALESCE(s.accounting_code,'')),''),
          (SELECT pi.value_normalized
             FROM public.person_identifiers pi
            WHERE pi.person_id = s.person_id
              AND pi.kind = 'asan_person_code'
            LIMIT 1) )
```

So the two things sitting side by side are:

| | where it lives |
|---|---|
| `accounting_code` | a **column**, on `customers`, `suppliers`, `external_parties` (and on `products`, `bank_accounts`, `asan_control_accounts`, `api_products_pricing`, which are not person tables) |
| `asan_person_code` | a **row** in `public.person_identifiers` with `kind = 'asan_person_code'`; the code is in `value_normalized` |

Two consequences for how this was measured:

1. "Rows where both columns are non-null" cannot be asked of one table. The comparison below joins
   each `customers` / `suppliers` / `external_parties` row to its person's Asan identifier via
   `person_id` — the same join the export uses.
2. **`accounting_code` wins, not the identifier.** The `COALESCE` reads the column first and only
   falls back to `person_identifiers`. That is the opposite of "the exports read
   `asan_person_code`, and an older `accounting_code` exists alongside it" — on the evidence, the
   column is the primary source and the identifier is the fallback.

## Counts

```
total party rows (customers + suppliers + external_parties) : 1819
rows whose person has an asan_person_code identifier        :   90
rows with accounting_code only (no Asan identifier)         : 1665
rows with neither                                           :   64
rows with accounting_code (either way)                      : 1739
rows with an Asan identifier but no accounting_code         :   16
```

Overlap: **74 rows carry both, and all 74 agree** when compared as trimmed text. Zero mismatches.

The `person_identifiers` table holds 99 `asan_person_code` rows across 97 distinct persons; the two
duplicated persons carry the **same** code twice (`601255`, `600204`), so these are duplicate
identifier rows, not conflicting values.

## The 15 samples

Rows where `accounting_code` is set and the person has **no** `asan_person_code` identifier —
five oldest, five newest, five random from the remainder.

| bucket | display_name | accounting_code | created_at |
|---|---|---|---|
| oldest | مختار | `601702` | 2026-08-11 |
| oldest | afra kala | `119041` | 2026-08-11 |
| oldest | بیدار | `104053` | 2026-08-11 |
| oldest | عبدی | `646` | 2026-08-15 |
| oldest | عرفانیان دلارفردایی شاهمرادی | `601041` | 2026-08-15 |
| newest | محمد متعهدی | `132042` | 2026-09-05 |
| newest | رسول محمدی گوته | `1983` | 2026-09-05 |
| newest | وحید جواد پور | `600644` | 2026-09-05 |
| newest | تست 2 | `12345` | 2026-09-05 |
| newest | آقای علی محمدی | `350423` | 2026-09-05 |
| random | عطایی | `550016` | 2026-08-17 |
| random | حاجی هیمن دلاری تومانی | `601660` | 2026-09-01 |
| random | حسینیان | `524` | 2026-09-01 |
| random | چگینی  مهدی قزوین | `107004` | 2026-09-01 |
| random | حامدفلاحی(لرستان ازنا) | `680011` | 2026-09-01 |

> Names appear in this file only. The terminal was given the row count and nothing else.
