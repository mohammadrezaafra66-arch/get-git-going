# W3 Critic — C2 re-review (zod fix)

**Role:** `dev-code-critic` (independent; no builder reports)  
**Scope:** C2 only  
**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**HEAD at measure:** `42392d3f3664d259db6fd0341b2a7aaf0441b9ab`  
**Product fix commit:** `c4bcafe9` (`fix(sales-desk): C2 — zod اجباری برای مسئول معامله`)  
**Measured:** 2026-09-22T≈06:20Z · deadline 2026-09-22T06:30:00Z  
**Product code modified by critic:** none

---

## معیار (از خواستهٔ این بازبینی)

C2: UI empty default + **zod** (`salespersonId` uuid) + trigger `RESPONSIBLE_REQUIRED` + Persian error «مسئول معامله الزامی است».  
Expected: `schema.ts` `createDealInteractionSchema`; `QuickRequestForm` + `createSalesInteraction` use it.

---

## بررسی

| زیرر | برآورده؟ | شاهد |
|------|----------|------|
| Empty default (no `__me__`) | بله | `QuickRequestForm.tsx:72-73` — `useState<string>("")` |
| Zod requires uuid | بله | `schema.ts:19-23` — `.min(1, RESPONSIBLE_MSG).uuid({ error: RESPONSIBLE_MSG })` |
| Form uses zod | بله | `QuickRequestForm.tsx:108-125` `parseCreateDealInteraction(...)`; `:150-153` shape.safeParse |
| Lib uses zod on request | بله | `interactions.ts:64-70` — `if (kind === "request") parseCreateDealInteraction(...)` |
| Persian message | بله | `schema.ts:7,49-50`; UI `:152`; `errors.ts:7` maps `RESPONSIBLE_REQUIRED` |
| Trigger | بله | Live INSERT/UPDATE NULL → `RESPONSIBLE_REQUIRED` (E3 below) |

### E2 quotes

```19:23:src/lib/sales-desk/schema.ts
  salespersonId: z
    .string({ error: RESPONSIBLE_MSG })
    .trim()
    .min(1, RESPONSIBLE_MSG)
    .uuid({ error: RESPONSIBLE_MSG }),
```

```64:70:src/lib/sales-desk/interactions.ts
  if (input.kind === "request") {
    const parsed = parseCreateDealInteraction({
      ...input,
      body: input.body ?? "",
      salespersonId: input.salespersonId,
    });
    salespersonId = parsed.salespersonId;
  }
```

```72:73:src/components/sales-desk/QuickRequestForm.tsx
  /** Empty default — no __me__ sentinel (C2). */
  const [salespersonId, setSalespersonId] = useState<string>("");
```

```149:153:src/components/sales-desk/QuickRequestForm.tsx
  const onSubmit = () => {
    const sp = createDealInteractionSchema.shape.salespersonId.safeParse(salespersonId);
    if (!sp.success) {
      setSalespersonError("مسئول معامله الزامی است");
```

---

## تلاش‌های ابطال

| Attempt | Result |
|---------|--------|
| Empty `salespersonId` via unit `parseCreateDealInteraction` | Throws «مسئول معامله الزامی است» — test pass (E3) |
| Missing `salespersonId` in schema.safeParse | `success=false` — test pass |
| Non-uuid / empty through createSalesInteraction for `kind=request` | Gated by zod before RPC (`interactions.ts:64-70`) |
| CallNoteForm create without salesperson | `kind` is call/note — zod not required (typed optional); OK for C2 scope |
| DB INSERT request with `salesperson_id=NULL` | Still `RESPONSIBLE_REQUIRED` (E3) |
| DB UPDATE set salesperson NULL | Still `RESPONSIBLE_REQUIRED` (E3) |
| Grep `__me__` default in QuickRequestForm | Absent; only empty `""` |

---

## اجرای واقعی (E3)

```
npx --yes tsx --test src/lib/sales-desk/schema.test.ts src/lib/sales-desk/errors.test.ts
→ EXIT=0  # tests 7 # pass 7 # fail 0
artifact: evidence/W3/critic-c2-zod-unit.txt

node …/psql-run.mjs …/critic-c2-rereview-insert.sql …/critic-c2-rereview-insert.txt
→ EXIT=0  NOTICE: C2_INSERT_OK RESPONSIBLE_REQUIRED

node …/psql-run.mjs …/critic-c2-upd.sql …/critic-c2-rereview-db.txt
→ EXIT=0  NOTICE: C2_UPD_NULL_OK RESPONSIBLE_REQUIRED
```

---

## یافته‌ها

None blocking C2. Direct PostgREST/RPC bypass of the TS lib still hits the DB trigger (defense in depth; not a C2 AC failure).

---

## حکم: **CONFIRM** (C2)
