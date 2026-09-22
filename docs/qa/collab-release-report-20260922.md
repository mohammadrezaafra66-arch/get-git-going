# Collaboration release report — 2026-09-22 (TEST 3100)

**Test-server status: NOT READY**

**Release branch:** `release/collab-20260922` @ `a693edff`  
**Worktree:** `D:\AfraKalaTest\wt-collab-release`  
**Stop reason:** Phase 5 ancestry precheck failed — deployed `APP_GIT_SHA=106ae89a` is **not** an ancestor of release HEAD. Deploy aborted per mission §7 (would overwrite someone else's work).

---

## Per-item before / after

| Item | Before (E2E 20260921) | After this run | Evidence |
|------|----------------------|----------------|----------|
| D6 SLA cron | FAIL P1 — no `cron.job` | **PASS on DB** — job active; auto advance without manual tick | jobid=26 `afrakala-tick-inquiries-1min` `* * * * *` `database=afrakala` `active=t`; runs succeeded; inquiry `d2dc0de7-…` → `warning_5min` at ~6.5m |
| D7 penalty | only via manual tick | **Partial** — ticker live; full D7 E2E not re-run (deploy blocked) | Phase 1 ROLLBACK tick OK; cron succeeds (`return_message=1 row`) |
| A6 login redirect | FAIL P0/P1 | **Code fixed, not deployed** | `_app.tsx` client redirect + hold loading; `route-guards` marks SSR defer |
| A3 viewer پیام‌ها | FAIL P1 → unauthorized | **Code fixed, not deployed** | viewer removed from hub + mobile `/messages` |
| purchase_specialist hub | missing cards | **Code fixed, not deployed** | added to پیام‌ها + فضای خرید |
| C11 work_items | FAIL (wrong expectation) | **Test fixed, not re-run on 3100** | asserts `work_items` + `/operations/work` |
| C6 upload | PARTIAL (kong URL) | **Helpers forced to `:9000`; UI test added; not re-run** | `supabaseUrl()`/`storageBaseUrl()` hardcode host IP |
| c1ea61a1 help/pin | not on 3100 | **In branch history; not deployed** | ancestor of HEAD |
| 42P10 tick whole-fn | unverified | **PASS** | `BEGIN; SELECT tick_inquiries(); ROLLBACK;` → 1 row, no error |

---

## Phase gates

| Phase | Gate | Result |
|-------|------|--------|
| 0 Worktree | clean branch + conventions | **PASS** |
| 1 tick probe | no error in ROLLBACK | **PASS** |
| 2 hygiene | open>10m=0; non-prefix unchanged | **PASS** (11→expired via manager RPC; 94 groups soft-off; non-prefix inquiries 5→5, groups 11→11) |
| 3 cron migration | job + runs + auto warning | **PASS** |
| 4 code | typecheck ≤70 + no new in touched | **PARTIAL** — touched files **0** errors; total **74** (baseline claimed 70; excess unrelated) |
| 5 deploy | ancestry + SHA match | **STOP** — `106ae89a` ⊄ HEAD |
| 6 re-verify | E2E READY criteria | **SKIPPED** |
| 7 report/push | docs + push branch | this file + checklist |

---

## What the owner must do next

1. Decide fate of currently deployed `106ae89a` (other feature work on 3100).
2. When 3100 may receive this release: from worktree  
   `git merge-base --is-ancestor $(docker exec afrakala-lan-web printenv APP_GIT_SHA) HEAD` must exit 0, then deploy with compose project `afrakala-lan` and `--env-file D:\AfraKalaTest\app\deploy\lan\.env.lan`.
3. Cron for tick_inquiries is **already live on TEST** (job 26). Do not re-apply blindly; verify first.
4. Re-run Phase 6 E2E after deploy (non-slow ×2, SLA slow ×1, UI upload).
5. Production: use `docs/qa/collab-prod-promotion-checklist-20260922.md` only — never from this agent against `.10`.

---

## Commits on branch

```
a693edff test(collab): align E2E with SLA cron, work_items, upload URL, A6 twin
c44d28d5 fix(collab): hub/nav messenger visibility for viewer and purchase_specialist
586fef0d fix(auth): redirect cold sessions on guarded routes to login
b6023591 db(collab): schedule tick_inquiries every minute on test
8d608784 docs(collab): plan v2 — 42P10 check
```
