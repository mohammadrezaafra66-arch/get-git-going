# Step 0.6 — QuickRequestForm salesperson NULL semantics

**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**Question:** Did `QuickRequestForm.tsx` ever offer an explicit “no salesperson” choice that stored `NULL`, **beyond** the default `__me__` → `NULL` mapping?  
**Owner rule:** Backfill legacy `salesperson_id IS NULL` → `author_id` **unless** such an explicit choice existed.

## Verdict

**YES_BACKFILL**

---

## Current file (HEAD)

**Path:** `src/components/sales-desk/QuickRequestForm.tsx`

| Element | Value |
|--------|--------|
| Default state | `useState<string>("__me__")` |
| Submit mapping | `salespersonId === "__me__" \|\| salespersonId === ""` → `null`; else UUID |
| Select options | One sentinel: `SelectItem value="__me__"` → label **«خودم (بدون ارجاع صریح)»**; plus active `profiles` rows |
| Placeholder | **«خودم / بدون ارجاع»** (display only; not a separate stored value) |

No `SelectItem` with a distinct value (e.g. `""`, `"none"`, `"null"`) labeled as “بدون کارشناس” / “no salesperson” / unassigned.

The `""` branch in submit logic is defensive; the Radix `Select` never exposes an empty-string option in this file.

---

## Git history (`git log -p --follow -- "**/QuickRequestForm.tsx"`)

| Commit | Date | Salesperson-related delta |
|--------|------|---------------------------|
| `a2537aee` | 2026-09-16 | **File introduced** with `__me__` default, same `__me__`/`""` → `null` mapping, same single `SelectItem` for `__me__`, same placeholder text. |
| `3bec3749` | 2026-09-16 | RTL/LTR display only; **no** salesperson UI or mapping changes. |
| `945ac3d5` | 2026-09-16 | Persian follow-up fields; grid layout for salesperson block; **no** new select values or NULL paths. |

**Total commits touching file:** 3 (1 create + 2 unrelated fixes).  
**Removed options:** none related to salesperson.  
**Alternate paths:** file was always at `src/components/sales-desk/QuickRequestForm.tsx` (no rename in `--follow` history).

---

## Interpretation vs owner rule

- **`__me__` → NULL** is the documented default (“myself / without explicit referral”), not a separate third meaning of “no salesperson assigned to anyone.”
- **Explicit “no salesperson”** in the rule means a **second** UI choice (different value) that also persisted `NULL` — e.g. “unassigned” distinct from “myself.” That pattern **never appears** in history.
- Therefore NULL `salesperson_id` rows from this form are consistent with “author chose default / self” semantics, not with a user-intentional “leave unowned” flag.

---

## Conclusion for backfill

Proceed with backfill of legacy `salesperson_id IS NULL` to `author_id` per owner rule: **YES_BACKFILL**.
