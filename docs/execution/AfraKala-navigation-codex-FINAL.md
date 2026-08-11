# AfraKala — Navigation Modernization
## Autonomous prompt for Codex — FINAL, amended 2026-07-22

You are working unattended. The user will NOT answer questions. Never ask for
confirmation. Run Stage A through Stage D continuously. Stop only for the hard
stop conditions in 0.6.

> **This version supersedes any earlier copy.** The earlier version told you to
> APPLY database migrations in Stage A. Those migrations are now already
> applied. Stage A is verification-only. Do not apply anything.

---

## 0. GLOBAL RULES

### 0.1 Environment (verified — do not re-derive)
```
Repo             : D:\AfraKalaTest\app
Branch           : feature/navigation-modernization
Backup branch    : backup/pre-navigation-20260722 (local + origin)
DB container     : afrakala-lan-db
PostgREST cont.  : afrakala-lan-rest
Database         : afrakala
LAN test URL     : http://192.168.170.8:3100
npm scripts      : dev, build, build:dev, preview, lint, typecheck, format
Typecheck base   : ~70 pre-existing errors — BASELINE, not yours
```

Frontend serving model (inspected, not guessed — reuse this, do not invent a
second runtime):
```
container  : afrakala-lan-web
image      : afrakala-app:lan
built from : D:\AfraKalaTest\app\deploy\lan  (Dockerfile runs vite build)
publishes  : 3100 -> 3000
commands   : docker compose --env-file .env.lan build web
             docker compose --env-file .env.lan up -d web
```

`feature/navigation-modernization` already contains every commit from
`security/rls-permissive-select-fix`. Build from this branch. Never merge,
cherry-pick, or restore from the backup branch.

### 0.2 Database access
Read-only for this task. Connect as `supabase_admin` (the `postgres` role lacks
CREATE on schema public):
```powershell
docker exec -i -e PGPASSWORD=<from container env> afrakala-lan-db psql -U supabase_admin -d afrakala
```
Never print the credential. **This task must not write to the database at all.**

### 0.3 Terminal output rules
Print ALL terminal output in **English only**. No Persian/Arabic characters —
this terminal reverses RTL text when copied, making reports unusable. Refer to
Persian UI strings by English meaning plus Latin transliteration, e.g.
`sales quick search ("jostoju-ye sari'-e forush")`. Persian IS allowed inside
files you write. Keep paths, identifiers, and SHAs verbatim.

### 0.4 Git rules
- Stay on `feature/navigation-modernization`. Never switch branches.
- One commit per completed phase. Stage ONLY that phase's files. NEVER
  `git add -A` or `git add .`.
- Never commit pre-existing untracked root-level `*.md` or `docs/` files that
  you did not create for this task.
- Push each completed phase to `origin/feature/navigation-modernization`.
  Never push to `main`.
- FORBIDDEN: `git reset --hard`, `git clean -fd`, `git checkout -- .`,
  `git restore .`, `git push --force`.
- Never hand-edit `src/routeTree.gen.ts`. If tooling regenerates it, verify the
  change is expected and record why.

### 0.5 Self-repair engine
After every phase, run validation, then classify each failure:

**STOP IMMEDIATELY** — any database write, a weakened route guard, a broadened
permission, a wrong branch, or anything touching production.

**REPAIR (max 3 attempts)** — new TypeScript errors, new ESLint errors, new
test failures, build failures that you introduced. Fix, re-validate, repeat.
After 3 failures, revert only your own edits, record as DEFERRED, continue to
the next phase. Never commit a failing phase.

**RECORD AND CONTINUE** — the ~70 baseline typecheck errors, and visual
interactions that cannot be automated.

Acceptance: zero NEW errors versus baseline. Never claim the repo is clean when
it is not. Never claim validation passed when it did not.

### 0.6 Hard stop conditions
1. A STOP-class failure from 0.5.
2. A file, table, or function this prompt asserts exists is absent.
3. Port 3100 is owned by an unrelated non-AfraKala process.
4. Context budget nearly exhausted — see 0.7.

When stopping: exact reason, affected files/services, commands already run,
safe options, recommended option, exact resume point, which commits were
created, which were pushed.

### 0.7 Resumability
After EVERY phase, update `docs/navigation-modernization-progress.md` with
enough detail for a fresh session to resume with zero prior context. If the
context budget runs low: finish the current phase cleanly, commit, push, write
"RESUME AT PHASE N" into the progress doc, and stop. That is a successful
outcome, not a failure.

### 0.8 Scope guards — do not touch
Other work is running in parallel on this same branch. Stay strictly inside
navigation:
- Do NOT modify `calculate_employee_score`, `manual_daily_metrics_totals`, or
  `staff_daily_performance_metrics`.
- Do NOT touch the knowledge base, `knowledge_document_chunks`, or any AI/RAG
  code.
- Do NOT touch QA test products or any data-cleanup migration.
- Do NOT create, modify, or apply any database migration. If you believe
  navigation needs one, STOP and report instead.
- Do NOT modify sales logic, RLS policies, pricing, gamification logic, market
  intelligence, or production deployment config.
- Do NOT change route URLs, route guards, permissions, or roles.
- Do NOT redesign the visual style. This is navigation ARCHITECTURE.

If `git pull` brings in changes from the parallel work, rebase or merge
cleanly and continue; never discard someone else's commits.

---

# STAGE A — VERIFY BACKEND STATE (read-only, apply nothing)

All migrations are already applied. Confirm, do not act:
```sql
SELECT to_regclass('public.staff_daily_performance_metrics');   -- expect non-null
SELECT entity_type, count(*) FROM public.dynamic_scoring_parameters GROUP BY 1;
-- expect customer and salesperson rows
```
Confirm views `v_dynamic_customer_capital_balances` and
`v_dynamic_salesperson_capital_balances` exist.

If any is missing, STOP and report — do not apply anything yourself.

---

# STAGE B — BASELINE AND SMOKE GATE

### B.1 Repository state
Run: `git rev-parse --show-toplevel`, `git branch --show-current`,
`git status --short`, `git log --oneline --decorate -10`, `git remote -v`.

Worktree rule:
- Untracked or modified root-level `*.md` or `docs/` files: RECORD AND
  CONTINUE. Leave them untouched.
- Modified or untracked files under `src/` or `supabase/`: these may belong to
  the parallel task. Record them, do not touch them, and continue — but never
  stage or commit them.

### B.2 Port ownership
```powershell
Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
```
Expect the AfraKala container. If an unrelated process owns it, STOP.

### B.3 Baseline
Run `npm run typecheck`, `npm run lint`, `npm run build`, plus any test script
that actually exists. Record exit codes and error counts.

Create `docs/navigation-modernization-progress.md` with: date, branch, starting
commit SHA, runtime mechanism, exact start command, host, port, base URL, test
route, baseline command results and counts, and known risks.

### B.4 Smoke gate
Verify these respond without 404/500 and without a blank page, plus one bogus
route that must return 404 to prove the 200s are meaningful:
```
/gamification/admin/manual-metrics
/accounting/receipts/create
/sales/invoices
/sales/search
/knowledge
/this-route-does-not-exist-xyz    -> must be 404
```
`/accounting/receipts/create` has already been confirmed working by a human,
including a successful write. If it now fails, that is a regression from the
parallel work — record it, do NOT try to fix it (out of scope), and continue
using `/sales/search` as your manual test page.

---

# STAGE C — NAVIGATION MODERNIZATION (Phases 1–9)

Preserve at all times: existing visual design, route URLs, guards, permissions,
Persian labels, RTL behavior, mobile navigation, and the seven primary modules
in this exact order:
```
داشبورد ، دستیار ، کالا ، فروش ، مالی ، تحلیل ، مدیریت
```

Key files:
```
src/components/layout/nav-items.ts
src/components/layout/primary-modules.ts
src/components/layout/AppSidebar.tsx
src/components/layout/MobileBottomNav.tsx
src/components/layout/AppHeader.tsx
src/lib/rbac/roles.ts            (hasPermissionEx, hasAnyRole)
src/lib/rbac/route-guards.ts     (requirePermission, requireAnyRole)
```

### Known current state — scope this honestly before you build
Commit `257ba917` moved the sales quick-search button into the Sidebar.
Preserve that behavior.

**The sidebar already has a working Persian search box showing a `Ctrl K`
badge, and searching "receipt" returns correctly filtered results.** Some of
what Phases 4 and 9 describe may therefore already exist.

Before Phase 1, audit what is already implemented: the existing search, its
normalization, and whether a command palette component (`cmdk`, shadcn
`Command`, or a custom dialog) is already wired to Ctrl+K. Report your findings
and adjust the scope of Phases 4 and 9 accordingly — improve what exists rather
than building a duplicate. Record the decision in the progress doc.

After EVERY phase: inspect the diff, remove unrelated edits, run validation,
apply the self-repair engine, update the progress doc, commit, push, verify
clean status, continue automatically.

### Phase 1 — Central Navigation Registry
Create `src/lib/navigation/` with `types.ts`, `registry.ts`, `selectors.ts`,
`search.ts`. Entries carry: id, title, route, module, group, subgroup,
description, keywords, icon, permission, adminOnly, pinnable, primaryForRoles,
badgeSource, breadcrumb metadata, mobileVisible, mobilePriority,
recentEligible, analyticsKey.

Requirements: stable unique IDs, unique routes, existing icon types, no
circular imports, RBAC compatibility, preserved ordering, no route changes, no
security changes. Pure selectors for: by module, visible-to-user, by route, by
id, searchable, pinnable, mobile-eligible.

If `NAV_ITEMS` must remain, derive it from the Registry or add a compatibility
adapter. Never maintain two manual sources of truth.

Tests: unique IDs, unique routes, valid modules, required metadata, permission
filtering, backward-compatible ordering.

Acceptance: visible UI unchanged.
Commit `feat(navigation): add centralized registry`.

### Phase 2 — Sidebar consumes the Registry
`AppSidebar` renders resolved view models; data ownership moves out. Preserve
module/group/subgroup order, expanded and collapsed state, RTL, active-route
highlighting, permission filtering, existing badges, and current search
behavior (search is handled in Phase 4).

Audit every visible menu item against its route guard. A menu item visible to a
role the guard rejects is a STOP-class security mismatch — report it, never
guess a fix.

Align `MobileBottomNav` to derive metadata from the Registry while keeping its
current appearance, item count, and order. Add an invariant test that every
mobile destination exists in the Registry.

Runtime check: sidebar renders on the test page, module order intact, active
route highlighted, collapse/expand works, no blank page, no console exception.
Commit `refactor(navigation): derive sidebar from registry`.

### Phase 3 — Role-based primary action
One clear primary action near the top of the Sidebar per role: Registry-driven,
permission-filtered, hidden when inaccessible, keyboard accessible, working
expanded and collapsed, deterministic precedence for multi-role users.

Derive mappings from repo evidence (`QUICK_ACCESS_BY_ROLE`,
`SHORTCUTS_BY_ROLE`, route guards, existing workflows). If a mapping is
genuinely ambiguous, pick the safest accessible existing route, record the
reasoning, and CONTINUE — do not stop.

Tests: role resolution, multiple roles, permission filtering, fallback.
Commit `feat(navigation): add role primary actions`.

### Phase 4 — Persian navigation search
Scope per the audit above: improve the existing search rather than replacing it,
unless the audit shows replacement is cleaner — in which case say so.

Search title, description, keywords, and safe route aliases. Normalization must
handle ی/ي, ک/ك, ZWNJ, extra whitespace, Persian and Arabic digits, basic
diacritics, Latin case.

Ranking: exact title → title prefix → title contains → keyword exact/prefix →
description contains → conservative fuzzy only if justified.

Results always permission-filtered, only real Registry entries.

Test with: اعتبار ، فیش ، رسید ، پرداخت ، سرمایه ، قیمت
Tests: normalization, ZWNJ, keyword lookup, ranking, permission exclusion,
empty query.
Commit `feat(navigation): improve Persian navigation search`.

### Phase 5 — Needs Action
Compact «نیازمند اقدام» area, maximum three genuinely actionable entries,
ordered by urgency, permission-aware, hidden at zero count, isolated
loading/error states, using the existing query cache. No polling. No N+1. **No
new migrations — if a badge needs backend data that does not exist, drop that
badge rather than creating a table.** Never invent a filler third item; fewer
than three is correct.

Typed source abstraction: id, label, resolver, route, permission, priority,
cache policy, failure behavior. Data logic stays out of presentation.

Tests: max three, ordering, zero-hiding, permissions, error isolation, loading.
Commit `feat(navigation): add needs-action section`.

### Phase 6 — Favorites / My Shortcuts
Pin up to five Registry destinations. Persistence priority: existing user
preference mechanism → existing safe profile/settings storage → localStorage.
**No migration for this under any circumstance.**

Key `afrakala.navigation.favorites.v1`. Store stable Registry IDs only — never
permissions, never full sensitive detail URLs. Max five, no duplicates, invalid
IDs ignored, inaccessible entries hidden, deterministic order, keyboard
accessible, RTL-safe.

Tests: maximum, duplicates, invalid IDs, permissions, serialization, storage
unavailable.
Commit `feat(navigation): add user favorites`.

### Phase 7 — Recent navigation
Key `afrakala.navigation.recent.v1`. Registry IDs only, approved routes only,
newest first, deduplicated, capped near five. Exclude sensitive detail routes,
auth/system/error routes, and anything with `recentEligible=false`. Never
persist query strings, user-typed search content, or sensitive identifiers.

Tests: deduplication, cap, exclusions, permission filtering, cleanup, sensitive
route handling.
Commit `feat(navigation): add recent destinations`.

### Phase 8 — Breadcrumb and page metadata
Resolver for title, short title, description, breadcrumb chain, parent item,
module/group, analytics key. Static routes first; dynamic routes use generic
safe labels with page-level override support. Never expose raw IDs as titles.
Never duplicate an existing `PageHeader` — if global rendering would duplicate,
make integration opt-in.

Tests: static route, parent chain, unknown route, dynamic fallback, RTL order.
Commit `feat(navigation): add route metadata breadcrumbs`.

### Phase 9 — Command Palette
Scope per the audit above — a Ctrl+K affordance may already exist. Reuse
existing dependencies (`cmdk`, shadcn `Command`, `Dialog`); do not add a heavy
new dependency.

Ctrl+K / Cmd+K must not fire while typing in form inputs and must not clash
with existing shortcuts. Supports permission-filtered pages, the Phase 4
Persian search, module/group context, Favorites, Recent, keyboard navigation,
screen-reader labels, RTL, Escape to close. Typed command kinds: navigation,
action, recent, favorite. Excludes unauthorized routes, destructive commands
without confirmation, raw DB actions, sensitive dynamic URLs, placeholders.

Tests: shortcut, search, Persian normalization, permissions, navigation,
favorites/recent, duplicates.
Commit `feat(navigation): add command palette`.

---

# STAGE D — INTEGRATION, RUNTIME VALIDATION, DOCUMENTATION

Mandatory. Code that compiles is not the deliverable — a running, visually
testable application is.

### D.1 Rebuild and serve
```powershell
cd D:\AfraKalaTest\app\deploy\lan
docker compose --env-file .env.lan build web
docker compose --env-file .env.lan up -d web
```
Stamp `GIT_SHA` and `BUILD_TIME` build args with the real short SHA and a UTC
timestamp. Then restart `afrakala-lan-rest` and confirm readiness by polling a
REST endpoint until it returns 200 — that container defines no Docker
healthcheck, so "healthy" is never reported.

### D.2 Integration checks
Not just 200s — confirm the app actually talks to the backend:
- pages load inside the authenticated app layout
- no PostgREST "relation does not exist" or schema-cache errors in logs
- the Stage B smoke routes still respond
- no new fatal console error, no failed network request to a missing table/RPC

### D.3 Runtime verification
Verify: process stays running, base URL responds, test route responds, assets
load, no blank page, no unexpected 404, authentication behaves normally, runtime
logs contain no new fatal exception.

If browser automation already exists in the repo (Playwright/Cypress), run an
end-to-end smoke test covering: sidebar visible, module order, active state,
sidebar search, primary action, Needs Action non-blocking, favorite add/remove,
recent list, breadcrumb, Ctrl+K palette, Persian search, Escape close, navigate
to a result, reload persistence, no fatal console error.

If no browser automation exists, **do not add one.** Perform HTTP checks,
runtime log checks, route compilation checks, and component/integration tests —
then explicitly mark the remaining interactions as requiring user visual
confirmation. Never claim you visually inspected a screen when you only made an
HTTP request.

### D.4 Regression review
Verify: branch correct; all phase commits pushed; `src/routeTree.gen.ts` not
hand-edited; **no migration added**; no route URL changed; no guard weakened;
no permission broadened; production untouched; desktop sidebar, collapsed
sidebar, active route, module navigation, mobile navigation, Persian search,
role action, Needs Action states, Favorites, Recent, Breadcrumb, and Command
Palette all functioning; inaccessible routes hidden; direct URLs still guarded.

Compare against the recorded STARTING COMMIT, not against origin:
```
git diff <starting-commit>..HEAD --stat
```

### D.5 Documentation
`docs/navigation-modernization-final-report.md` (English): executive summary;
starting state; local test environment including the exact startup command;
final architecture; Registry structure; phase-by-phase changes with commit
hashes, validation results, rollback notes; the scope decision from the Phase
4/9 audit; permission audit; persistence decisions; performance review;
accessibility and RTL review; automated validation results; runtime validation
results; files added; files modified; files intentionally not modified;
baseline failures; new failures; known risks; deferred work; rollback
instructions using revert only, with an explicit warning against reset and
force-push; and a production promotion plan ending at "deploy only after
explicit user approval" — do NOT deploy.

`docs/navigation-modernization-manual-test.md` (**in Persian** — the user reads
this one): prerequisites (URL, test account, browser, DevTools); test page URL;
sidebar tests (rendering, module order, collapse/expand, active route, scroll,
RTL); role primary action; Persian search for فیش ، اعتبار ، قیمت ، سرمایه ،
پرداخت ; Needs Action; Favorites; Recent; Breadcrumb; Command Palette (Ctrl+K,
Persian search, keyboard selection, Escape); mobile; and an issue template
asking for page, user role, reproduction steps, actual result, expected result,
screenshot, console error, network error, and time. Mark each item as passed /
failed / needs correction / not testable.

Commit both documentation files.

---

# FINAL REPORT (English, at the very end)

1. completion status — honest; partial is acceptable, false completion is not
2. current branch / starting commit / ending commit
3. every phase commit SHA and push status
4. Stage A verification results
5. Stage B baseline numbers and smoke gate results including the 404 control
6. **the Phase 4/9 scope audit finding** — what already existed, what you built
7. files added / modified / intentionally untouched
8. tests run, baseline failures, NEW failures (must be zero)
9. permission audit summary
10. persistence decisions (Favorites, Recent)
11. exact startup command and current service status
12. base URL and test route status
13. which checks were automated vs. which need user visual confirmation
14. known risks and deferred work
15. rollback instructions
16. confirmation that no migration was created and no database write occurred
17. paths to the three documentation files

Do not claim 100% completion unless Stages A–D all succeeded, every completed
phase was validated, committed, and pushed, the app started, port 3100
responded, and the test route loaded.

## START NOW
Begin with Stage A. Continue automatically through Stage D without asking
anything.