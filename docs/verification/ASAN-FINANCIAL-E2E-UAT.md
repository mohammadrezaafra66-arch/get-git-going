# ASAN Financial E2E UAT

Date: 2026-08-05

Root: `D:\AfraKalaTest\app`

Branch: `feature/navigation-modernization`

HEAD: `5113fe65e41f2590012ebd10ae530572c1e251f5`

Test LAN: `192.168.170.8:3100`

Production: not touched (`192.168.170.10`)

UAT prefix: `E2E_ASAN_UAT_20260805_191320`

## Overall Verdict

PASS

All six financial export/import paths reconciled:

- AfraKala source fixtures
- generated frontend Excel workbooks
- owner-completed manual import into TEST Asan
- post-import cleanup

No production environment was used. No commit or push was performed.

## Deployment Gate

The clean TEST LAN deployment was accepted using the approved project rule that `APP_GIT_SHA`
stores `git rev-parse --short HEAD`.

| Signal | Value |
| --- | --- |
| Full HEAD | `5113fe65e41f2590012ebd10ae530572c1e251f5` |
| Short HEAD | `5113fe65` |
| `APP_GIT_SHA` | `5113fe65` |
| `APP_BUILD_TIME` | `2026-08-05T15:25:17Z` |
| `afrakala-lan-web` | healthy |
| `/app/.output` Asan symbols | present |
| local vs origin | equal |

## Dedicated UAT Data

Dedicated fixtures were created only in the TEST LAN database and only with the approved prefix.
No existing business document was used or modified.

Fixed source IDs:

| Type | Source ID | Source document |
| --- | --- | --- |
| Sales invoice | `5113fe65-0020-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_SALE` |
| Purchase invoice | `5113fe65-0030-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_PURCHASE` |
| Receipt journal | `5113fe65-0041-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_RECEIPT_JOURNAL` |
| Payment journal | `5113fe65-0050-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_PAYMENT_JOURNAL` |
| Third-party journal | `5113fe65-0060-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_THIRD_PARTY_JOURNAL` |
| Bank deposit | `5113fe65-0070-4000-8000-202608051913` | `E2E_ASAN_UAT_20260805_191320_BANK_DEPOSIT` |

Codes:

| Item | Code |
| --- | --- |
| UAT customer person | `19132001` |
| UAT supplier person | `19132002` |
| UAT external party | `19132003` |
| UAT product | `19132010` |
| Bank Mellat | `8` |
| `invoice_ar` | `989` |

Amount:

| Source Toman | Expected Rial |
| ---: | ---: |
| `12,345` | `123,450` |

## Exported Files

Generated through the real deployed frontend:

`http://192.168.170.8:3100/admin/asan-export`

Stored under ignored local path:

`D:\AfraKalaTest\app\test-results\asan-real-uat\`

| Type | File | SHA256 |
| --- | --- | --- |
| Sales invoice | `asan-sales-E2E_ASAN_UAT_20260805_191320.xlsx` | `c6cd01a6a1c70e0043c27856eeba4c8a7f936ec88215d82e0fefdbd2d1efc2d3` |
| Purchase invoice | `asan-purchase-E2E_ASAN_UAT_20260805_191320.xlsx` | `4c54904008b8531a64d5966f006cbb1441387e66438d0b846bfedf152d3954cb` |
| Receipt | `asan-receipts-E2E_ASAN_UAT_20260805_191320.xlsx` | `41ad4caaf5064df17ee03b3a50c33289936cd2353379e40b8f8cdccbaeae4f81` |
| Payment | `asan-payments-E2E_ASAN_UAT_20260805_191320.xlsx` | `641d7335fd672043f340ce8e6cd8661c0a442d97a6d25abe1bede65653905f90` |
| Third-party journal | `asan-third_party-E2E_ASAN_UAT_20260805_191320.xlsx` | `04637b2f7f4df5d05569ebb8187afdd4e55c19bb2906cc315365fcf2517a7735` |
| Bank deposit | `asan-bank_deposits-E2E_ASAN_UAT_20260805_191320.xlsx` | `444e2aa1768d3903703e73ff3eb1cc77a0db256c71cc4a0d4aaf0fe9e353bacc` |

## Automatic Validation

Automatic workbook validation passed for all six files:

- workbook opens
- sheet name is `Asan`
- headers exact
- column count exact
- purchase workbook has exactly 18 columns
- Rial x10 exact
- expected person/product/account/bank codes exact
- journal debit/credit balanced
- required cells nonblank
- no formulas in exported cells
- no corrupted text marker
- one selected UAT document per file

RPC eligibility validation passed for all six fixtures before download:

| Type | Source date | Lines | Blocked reason |
| --- | --- | ---: | --- |
| Sales invoice | 2026-08-05 | 1 | none |
| Purchase invoice | 2026-08-05 | 1 | none |
| Receipt | 2026-08-05 | 2 | none |
| Payment | 2026-08-05 | 2 | none |
| Third-party journal | 2026-08-05 | 2 | none |
| Bank deposit | 2026-08-05 | 1 | none |

## Manual TEST Asan Evidence

Owner reported all six manual imports completed successfully in TEST Asan:

| Type | Manual result |
| --- | --- |
| Sales invoice | PASS |
| Purchase invoice | PASS |
| Receipt | PASS |
| Payment | PASS |
| Third-party journal | PASS |
| Bank deposit | PASS |

No production environment was used.

## Reconciliation

| Type | AfraKala source | Excel workbook | Imported TEST Asan document | Result |
| --- | --- | --- | --- | --- |
| Sales invoice | date `2026-08-05`, customer `19132001`, product `19132010`, `12,345` Toman | doc no `1`, `123,450` Rial, 1 line, 18 columns | owner reported PASS | PASS |
| Purchase invoice | date `2026-08-05`, supplier `19132002`, product `19132010`, `12,345` Toman | doc no `1`, `123,450` Rial, 1 line, 18 columns | owner reported PASS | PASS |
| Receipt | bank debit `8`, customer credit `19132001`, debit=credit `12,345` Toman | doc no `1`, debit=credit `123,450` Rial, 2 lines | owner reported PASS | PASS |
| Payment | customer debit `19132001`, bank credit `8`, debit=credit `12,345` Toman | doc no `2`, debit=credit `123,450` Rial, 2 lines | owner reported PASS | PASS |
| Third-party journal | external party debit `19132003`, `invoice_ar` credit `989`, debit=credit `12,345` Toman | doc no `3`, debit=credit `123,450` Rial, 2 lines | owner reported PASS | PASS |
| Bank deposit | date `2026-08-05`, customer `19132001`, Bank Mellat `8`, tracking `E2E_ASAN_UAT_20260805_191320_BANK_DEPOSIT`, `12,345` Toman | no document-number register, `123,450` Rial, 1 line | owner reported PASS | PASS |

Cross-checks:

- document numbers matched expected assigned UAT registers where applicable
- dates matched `2026-08-05`
- party/account/product/bank codes matched expected values
- Bank Mellat code was `8`
- `invoice_ar` was `989` where applicable
- all amounts used exact `Toman x 10` conversion
- no unexpected rounding
- no missing lines
- no duplicate import was observed or reported
- no corrupted Persian text marker was found in generated workbook cells

## Cleanup

Cleanup was executed only after owner manual PASS evidence was received.

Cleanup SQL:

`D:\AfraKalaTest\app\test-results\asan-real-uat\cleanup-uat-fixtures-counting.sql`

Actual cleanup counts:

| Table | Deleted rows |
| --- | ---: |
| `asan_export_numbers` | 5 |
| `journal_lines` | 6 |
| `journal_entries` | 3 |
| `payment_receipts` | 2 |
| `stock_movements` | 1 |
| `sales_quote_items` | 1 |
| `sales_quotes` | 1 |
| `purchase_items` | 1 |
| `purchases` | 1 |
| `external_parties` | 1 |
| `customers` | 1 |
| `suppliers` | 1 |
| `products` | 1 |
| `person_identifiers` | 3 |
| `persons` | 3 |

Post-clean verification:

| Check | Result |
| --- | ---: |
| remaining UAT-prefixed / fixed-ID rows | 0 |
| all `asan_export_numbers` rows | 0 |
| `person_fk_drift_report()` rows | 0 |
| non-UAT export numbers consumed | 0 |

No real business rows were intentionally modified. The cleanup statements targeted only the
approved UAT prefix and fixed UAT UUIDs.

## Git / Evidence

Generated Excel files and screenshots are under ignored `test-results/asan-real-uat/`.

No generated UAT Excel file or generated UAT screenshot is tracked by Git.

Only this verification document is left as an untracked report pending owner decision.

## Final Status Per Type

| Type | Status |
| --- | --- |
| Sales invoice | PASS |
| Purchase invoice | PASS |
| Receipt | PASS |
| Payment | PASS |
| Third-party journal | PASS |
| Bank deposit | PASS |

## Final Verdict

PASS
