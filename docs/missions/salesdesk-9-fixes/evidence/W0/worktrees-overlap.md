# W0 — Worktree overlap vs `origin/feature/sales-desk`

**Date:** 2026-09-21  
**Mission worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes` (`feature/salesdesk-9-fixes` @ `c1ea61a1`)  
**Merge base for “in sales-desk”:** `origin/feature/sales-desk` @ `c1ea61a1` (`feat(collaboration): sidebar pin and in-app usage help hints`)

## Commands

```text
git -C D:\AfraKalaTest\app worktree list
git -C D:\AfraKalaTest\app branch --merged origin/feature/sales-desk
git -C D:\AfraKalaTest\app log --oneline origin/feature/sales-desk..<branch> -- <mission pathspec>
git -C D:\AfraKalaTest\app merge-base --is-ancestor <tip> origin/feature/sales-desk
```

**Mission pathspec (summary):** `WorkItemDetailPage`, `WorkBoardPage`, `src/lib/work`, `PurchaseForm`, purchase-payments routes/libs, `CallerInboundPopup`, `src/lib/calls` (filter, settings, recent), caller-id settings route, `src/components/sales-desk`, `src/lib/sales-desk`, `supabase/migrations`.

**Note:** On current `feature/sales-desk`, `CallerInboundPopup.tsx` lives at `src/components/sales-desk/CallerInboundPopup.tsx` (not under `src/components/calls/`).

---

## 1. Full worktree list (main repo)

`git worktree list` reported **38** worktrees rooted at `D:\AfraKalaTest\app` plus paths under `C:\Users\AFRA\...` temp/scratchpad trees. Primary repo:

| Path | HEAD | Branch |
|------|------|--------|
| `D:/AfraKalaTest/app` | `c1ea61a1` | `feature/sales-desk` |
| `D:/AfraKalaTest/wt-salesdesk-9-fixes` | `c1ea61a1` | `feature/salesdesk-9-fixes` |

---

## 2. Relevant nearby worktrees

“Merged into `origin/feature/sales-desk`” = branch name appears in `git branch --merged origin/feature/sales-desk` **or** branch tip is an ancestor of `origin/feature/sales-desk`.

| Path | Branch | HEAD (short) | Merged into `origin/feature/sales-desk`? | Commits on base..tip touching mission paths |
|------|--------|--------------|------------------------------------------|-----------------------------------------------|
| `D:/AfraKalaTest/wt-rtl-sales-desk` | `feature/sales-desk-rtl` | `e32826dd` | **No** | **1 code** (+ 2 docs-only, see §3) |
| `D:/AfraKalaTest/wt-bot-key-fix` | `fix/bot-api-key-dialog` | `fbb7f5d4` | **Yes** | *(none)* |
| `D:/AfraKalaTest/wt-salesdesk-9-fixes` | `feature/salesdesk-9-fixes` | `c1ea61a1` | **Yes** (same tip as base) | *(none)* |
| `D:/AfraKalaTest/wt-work-calm` | `staging` | `a469e5a0` | **Yes** (ancestor) | *(none)* |
| `D:/AfraKalaTest/wt-c` | `feature/wave6-c-phone` | `b51f2761` | **No** | 6 commits (migrations only; §3) |
| `D:/AfraKalaTest/wt-module-chrome` | `feature/module-page-chrome` | `d815c173` | **No** | 4 commits (torob migrations/docs; §3) |
| `…/wt-phonefix` (temp) | `hotfix/quote-link-empty-phone` | `6298b97d` | **Yes** | *(none)* |
| `…/scratchpad/wt-P` | `feature/wave5-partial-payment` | `f441155c` | **Yes** | *(none)* |
| `…/scratchpad/wt-U` | `feature/wave5-workbench-page` | `ef6b71e8` | **Yes** | *(none)* |
| `…/scratchpad/wt-A` | `feature/wave5-allocation` | `c25aa9da` | **Yes** | *(none)* |

**Also checked (no local worktree under `D:/AfraKalaTest`, branch exists):**

| Branch | Tip | Merged? | Mission-path commits on base..tip |
|--------|-----|---------|-----------------------------------|
| `feature/work-calm-mind` | `0ea55cfd` | **Yes** | *(none)* — ticket/work-item work already on sales-desk |

`feature/sales-desk-rtl` is **not** on `origin` (fetch of `feature/sales-desk-rtl` failed); it exists **locally** only at `wt-rtl-sales-desk`.

---

## 3. Unmerged commits touching mission files (detail)

### 3.1 `feature/sales-desk-rtl` — **primary overlap**

**Merge-base with `origin/feature/sales-desk`:** `755466cf`

| Commit | Subject | Mission files touched |
|--------|---------|------------------------|
| `aa63de1c` | fix(sales-desk): RTL Persian labels + LTR phone | `CallNoteForm.tsx`, `CallerInboundPopup.tsx`, `FollowUpsToday.tsx`, `InteractionTimeline.tsx`, `MyMonthStatsCard.tsx`, `OutcomeButtons.tsx`, `QuickRequestForm.tsx`, `_app.sales_.customers_.$customerId.dossier.tsx` |
| `a3bc5dad` | docs checkpoint RTL | *(docs only — out of pathspec)* |
| `e32826dd` | docs SHA completion | *(docs only)* |

### 3.2 `fix/bot-api-key-dialog` @ `wt-bot-key-fix`

Merged; **no** commits on `origin/feature/sales-desk..fix/bot-api-key-dialog` touching mission paths. Safe — **no row SKIPs** from this worktree.

### 3.3 `feature/wave6-c-phone` @ `wt-c`

All six commits touch `supabase/migrations/` only:

| Commit | Migration file | Overlap with mission scope |
|--------|----------------|----------------------------|
| `e4f1516d` | `20260906202000_498_call_log_extensions.sql` | **Table already on sales-desk** (same filename on disk at base). Parallel branch history, not missing schema. |
| `e3d99ba4` | `497_call_logs_cdr_columns.sql` | CDR columns — related to calls (W1) but **not** popup/settings TS files. |
| `3d8a61f5`, `8a20ab61`, `ea22cc53`, `68f8d5d0` | `496`, `485`, `484`, `483` | Unrelated domains (gamification, RBAC gaps, capital, allocation). |

No TS/TSX overlap with mission components on this branch.

### 3.4 `feature/module-page-chrome` @ `wt-module-chrome`

Touches `supabase/migrations/20260916190000_555_torob_ops_path_b.sql` and `…557_torob_ops_path_a.sql` (torob-ops). Sales-desk base already has **different** `555` / `557` migration files (torob path B vs person-merge `557`). Stale parallel numbering — **migration merge hazard** if that branch were integrated, but **no overlap** with mission UI files listed in §5 action rows.

---

## 4. Action-row SKIPPED recommendations (overlapping **unmerged** work)

Rule applied: if an **unmerged** commit modifies files a row owns, flag **SKIPPED** (or integrate RTL first — see note).

### From `feature/sales-desk-rtl` (`aa63de1c`)

| Row | SKIPPED? | Reason |
|-----|----------|--------|
| **A1–A6** | No | No work-item / purchase files in RTL commit. |
| **B1** | **Recommend SKIPPED** until RTL integrated | `CallerInboundPopup.tsx` |
| **B2** | **Recommend SKIPPED** until RTL integrated | Same popup surface |
| **B3** | **Recommend SKIPPED** until RTL integrated | Popup + likely same call UI bundle |
| **B4** | **Recommend SKIPPED** until RTL integrated | Popup / call sheet |
| **B5** | **Recommend SKIPPED** until RTL integrated | `CallNoteForm.tsx` |
| **C1** | **Recommend SKIPPED** until RTL integrated | `QuickRequestForm.tsx` + desk copy |
| **C2** | **Recommend SKIPPED** until RTL integrated | `QuickRequestForm.tsx` (responsible field) |
| **C3** | Partial — **SKIPPED** if same form files edited | `QuickRequestForm.tsx` |
| **C4** | **Recommend SKIPPED** until RTL integrated | `FollowUpsToday.tsx` |
| **C6** | **Recommend SKIPPED** until RTL integrated | `QuickRequestForm.tsx` (product block placement) |
| **C7** | **Recommend SKIPPED** until RTL integrated | `OutcomeButtons.tsx` |
| **C5, C8, C9** | No direct file overlap in RTL commit | — |
| **D1–D7** | Partial | `InteractionTimeline.tsx`, `CallNoteForm.tsx` → **D1, D3** at minimum **SKIPPED** until RTL integrated; dossier route may affect activity/deal views |

**Orchestration note (preferred to blind SKIPPED):** Cherry-pick or merge `aa63de1c` onto `feature/salesdesk-9-fixes` **before Wave 2–3**, then implement functional rows on top. RTL is mostly presentation; skipping entire waves loses N1–N7 fixes. If the mission registry requires literal `SKIPPED` status for conflict avoidance, use the table above and document “integrate `aa63de1c` first, then re-open rows.”

### From `feature/wave6-c-phone` / `feature/module-page-chrome`

| Rows | SKIPPED? |
|------|----------|
| **All A–D** | **No** (no shared TS/TSX files). Optional watch: new migrations on mission branch should use numbers **> 559** and not reuse torob `555`/`557` filenames from module-chrome. |

### From merged branches (`fix/bot-api-key-dialog`, `feature/work-calm-mind`, wave5\*, staging)

**No SKIPPED rows** — no unmerged mission-path commits.

---

## 5. Summary for Wave 0 gate

| Finding | Impact |
|---------|--------|
| Only **material unmerged UI overlap** is `feature/sales-desk-rtl` @ `aa63de1c` on sales-desk + call popup files. | Resolve before Wave 2/3 to avoid merge conflicts. |
| `wt-bot-key-fix` | Already merged; ignore for overlap. |
| `wt-salesdesk-9-fixes` | Same commit as `origin/feature/sales-desk`; clean execution base. |
| `feature/work-calm-mind` | Merged into sales-desk; ticket baseline already on base (Wave 1 A-rows still valid to implement). |
| Parallel migration branches (`wave6-c-phone`, `module-page-chrome`) | Do not block UI rows; avoid merging those branches without renumbering. |

**Suggested owner/orchestrator action:** Integrate `aa63de1c` (or full `feature/sales-desk-rtl`) early in Wave 0/1, then **do not** mark B/C/D rows SKIPPED unless executing strictly without that merge.
