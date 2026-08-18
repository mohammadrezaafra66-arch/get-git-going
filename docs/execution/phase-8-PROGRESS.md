# Phase 8 — Integrated verification — PROGRESS

Copy to `phase-<N>-PROGRESS.md` at phase start. One per phase. **Fill as you go, not at the end** —
a phase that hits its context limit mid-run must be resumable from this file alone.

## HANDOFF STATE

```
Phase:                8 — Integrated verification
Status:               not started | in progress | complete | blocked
Branch:               feature/<name>
Base:                 staging @ <sha>
Tasks:                <done> of <total>
Current task:         <id>
Blocked by:           <gate or nothing>
Migrations applied:   <list>
REST restarted after: <yes/no per migration>
Backup taken:         <path>
Typecheck:            <n> / 70 baseline
Last commit:          <sha>
PR:                   #<n> — <state>
```

## Pre-flight

- [ ] `git fetch origin && git switch staging && git pull`
- [ ] `git switch -c feature/<name>`
- [ ] Backup taken and path recorded above
- [ ] `ground-truth.md` re-verified for the facts this phase depends on
- [ ] Rollback file written for every planned migration, **before** any is applied

## Task log

One block per task. **A test not run is recorded as not run, never as passed.**

### Task <id> — <title>
```
Scope:      <files>
Effort:     S | M
Started:    <ts>
Finished:   <ts>
Commit:     <sha>

Acceptance command:
  <verbatim>

Expected:
  <verbatim>

Actual:
  <verbatim — paste the real output>

Verdict:    PASS | FAIL | NOT RUN

Reviewers:
  Observer:            PASS | CHANGE — <objection>
  Software Engineer:   PASS | CHANGE — <objection>
  Security Engineer:   PASS | CHANGE — <objection>
  Lead decision:       <accepted / overruled, and why>
```

## Phase test

```
Command:   npm run typecheck
Expected:  70 errors (documented baseline)
Actual:    <n>

Command:   <phase-specific verification>
Expected:  <...>
Actual:    <...>
```

## Stress test (phases 1–4 only)

```
Scenario:  50 concurrent <operation>
Expected:  50 distinct document numbers, 0 duplicates, 0 unbalanced entries, 0 orphans
Actual:    <...>
```

## Contradictions found

| Expected (ground-truth.md) | Found | Impact |
|---|---|---|

## Owner-Gate

Question, date asked, answer. If open, name the tasks continued in the meantime — idling is not
acceptable.

## Deploy verification

```
git rev-parse --short HEAD:              <sha>
docker exec afrakala-lan-web printenv APP_GIT_SHA:  <sha>
Match:                                    <yes/no>
docker restart afrakala-lan-rest:         <done>
git status --short:                       <n> lines — clean of programme files
```

## Exit criteria

- [ ] Every task PASS with real output recorded
- [ ] Phase test passed
- [ ] Stress test passed (where applicable)
- [ ] No migration applied-but-uncommitted
- [ ] PR merged and verified: `gh pr view <N> --json state,mergedAt` → `MERGED` + timestamp
- [ ] `APP_GIT_SHA` matches HEAD
- [ ] `00-progress.md` updated
