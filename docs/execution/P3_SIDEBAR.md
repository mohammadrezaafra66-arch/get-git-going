# P3 — SIDEBAR RESTRUCTURE

Read `docs/execution/UNIFY_MISSION_CONTROL.md` and
`docs/asan/deeper-diagnostic-round-2.md` Q3 (the full sidebar audit).

Goal: expose the 24 orphaned admin pages to users, restructure the sidebar's groups so
supplier/purchase/asan items sit where they belong, and delete the dead `Sidebar.tsx`.

Three phases.

---

## Phase 3.1 — Delete `Sidebar.tsx` and reduce to one navigation source

The audit found the legacy `Sidebar.tsx` component is imported but never rendered. It's
dead. Remove.

1. Confirm live: search `src/` for imports of `Sidebar.tsx` and for any place it might be
   rendered. Report every hit.
2. Delete the file and every import.
3. Verify the app still renders correctly on the deployed build.

**Test:**
- Full e2e passes.
- Grep confirms zero references.

Commit.

---

## Phase 3.2 — Add the 24 orphan pages to the sidebar

Diagnostic Q3 enumerated 24 route files with no sidebar entry. All are admin/tools pages
the owner or staff need to reach.

Read the full orphan list from the diagnostic report — it names them all. Do not re-derive.

Key ones the owner has named explicitly:
- `/admin/asan-export`
- `/admin/asan-import`
- `/admin/phone-collisions`
- `/sales/product-videos`

For each orphan:
1. Identify the correct sidebar group per section 3.3 below. Do not add them to old wrong
   groups just because that's fastest — they'll be moved again in 3.3.
2. Add the entry with Persian label and correct icon.
3. Assign role visibility. `admin`-only unless the page semantically belongs to another
   role (product videos → `sales`).
4. Confirm every added entry actually navigates to a working page — no dead links.

**Test:**
- For each added entry, click it in the sidebar and confirm the page loads.
- For each role, confirm they see only what they should. Use a real JWT per role.
- Assert no orphan pages remain (route files with no sidebar entry pointing to them).

Commit.

---

## Phase 3.3 — Regroup the sidebar

The current structure has items in the wrong groups. Diagnostic Q3 listed 21 issues.

Target structure (owner-decided, based on business logic):

```
├── داشبورد
│
├── کالا
│   ├── محصولات
│   ├── دسته‌بندی
│   ├── قیمت‌گذاری (all pricing pages consolidated here)
│   └── انبار (stock levels, movements)
│
├── فروش
│   ├── پیش‌فاکتور
│   ├── مشتریان
│   └── فیش دریافت
│
├── خرید
│   ├── ثبت خرید
│   ├── تأمین‌کنندگان
│   ├── فیش پرداخت
│   └── پنل خرید
│
├── حسابداری
│   ├── دفتر (journal)
│   ├── تسویه‌ی متقابل (added by P5)
│   ├── خروجی آسان
│   └── واردسازی آسان
│
├── اشخاص
│   ├── همه‌ی اشخاص
│   ├── ادغام اشخاص
│   └── صف تداخل تلفن
│
├── عملیات
│   ├── وظایف
│   ├── فیلم محصول
│   └── حضور و غیاب
│
└── مدیریت (admin only)
    ├── کاربران
    ├── نقش‌ها و دسترسی‌ها
    ├── تنظیمات
    └── ابزارها (تنظیمات آسان و غیره)
```

For every existing item, decide its new home. If the target group is unclear, leave it
where it is and flag it in `docs/asan/sidebar-regrouping-notes.md` for the owner to decide.
Do not guess when the placement matters.

Specifically fix these known issues from the diagnostic:
- "تأمین‌کنندگان" moves from "کالا" to "خرید"
- "پنل خرید" moves from "کالا" to "خرید"
- "قیمت‌گذاری فروش" moves from "کالا" to "فروش" (or into pricing subgroup under کالا)
- Duplicate items (customer under both کسب‌وکار and مدیریت) collapse to one entry

**Test:**
- Every item still opens the same route it did before (URLs unchanged).
- Every role sees only their allowed items.
- No duplicate labels in the whole tree.
- The tree structure matches the target above, with owner-decision items noted in the
  regrouping notes file.

Commit.

---

## MISSION GATE

1. `npm run typecheck` = 70.
2. Clean tree. Committed. Deployed. Signals match.
3. Full e2e vs baseline. New reds → yours.
4. Update `unify-progress.md`.
5. **Immediately proceed to `docs/execution/P4_JOURNAL_DESC.md`.**
