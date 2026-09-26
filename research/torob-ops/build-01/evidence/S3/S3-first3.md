# First 3 `torob_link_assignments` (cycle 27ffbd97)

Q6 `has_torob_url` for all three was **no** (`evidence/S1/Q6-products.md`). No assignment row exists for the pre-existing URL product `41464c40-1bf7-4909-bc2e-4eeadaf02613`.

| # | product | old `torob_url` | new url | score | reasons |
|---|---|---|---|---|---|
| 1 | `00f41ff5` یونیوا 60000 مدل UN-MF60D SCROLL T3 معمولی سرد وگرم | empty | `https://torob.com/p/62ed35b3-263f-41c6-b774-31783d987274/کولر-گازی-یونیوا-اسکرول-60000-مدل-un-mf60d-scroll-t3/` | 0.70 | `token_hits=7/10`. No colour token on either side → colour check not triggered. Tokens covering model/capacity: 60000, UN-MF60D, SCROLL, T3. |
| 2 | `2f71e92b` جنرال مکس 12000 مدل معمولی سرد وگرم | empty | `https://torob.com/p/c253271e-4651-4978-bf21-9219045d5ca0/جنرال-گلد-12000-مدل-پلاتینیوم-معمولی-سرد-وگرم/` | 0.86 | `token_hits=6/7`. Capacity 12000 + معمولی/سرد/گرم. Candidate brand is جنرال گلد vs our جنرال مکس (name overlap only). |
| 3 | `d935994d` جاروبرقی پاناسونیک مدل MC-CG713 رنگ مشکی | empty | `https://torob.com/p/03ef5c25-39d7-4e78-bd90-b0ca86e3cd81/جارو-برقی-پاناسونیک-مدل-mc-cg713-قدرت-2000-وات/` | 0.57 | `token_hits=4/7`. Model MC-CG713 matched. Our colour «مشکی» is not in the candidate title; candidate has no colour word so `color_mismatch` did not fire (hard reject only when both sides name a colour and they differ). |

Raw SQL: `S3-first3.out.txt`, `S3-cycle-end.out.txt`.

## Pre-existing URL unchanged

| metric | before this cycle | after |
|---|---|---|
| Active products with non-empty `torob_url` | **1** (R6 / Q6; only `41464c40` ساید الجی x24 — known silver-variant link) | **14** |
| Assignment rows for `41464c40` | — | **0** |
| `assigned=true` writes | — | **13** |

1 + 13 = 14. The original LG URL is still the silver-variant Torob page; it was not rewritten.
