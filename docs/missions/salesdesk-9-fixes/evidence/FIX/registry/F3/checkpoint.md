# F3 checkpoint
updated: 2026-09-22T13:45:00+05:00
state: FAIL
item: F3 C9/C5
C9: FAIL — deal quote prefill sets source=manual; validateQuote + create_sales_quote_with_items reject («این کالا در سیستم تعریف نشده…»)
C5: PASS — UI+SQL count +1 for (author=sales2, tehran_today); leftover 0 after cleanup
PRODUCT_FIX_NEEDED: yes — `src/routes/_app.sales.quotes.new.tsx` (deal prefill `source: "manual"` → should be `product_price` + `sale_price_type_id`)
evidence: f3-run.txt, f3-c9.txt, f3-c5.txt, f3-cleanup.txt, f3-c5-mutant-fail.txt, f3-sql.mjs, playwright.fix-f3.config.ts
