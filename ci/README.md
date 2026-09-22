# CI typecheck baseline gate

## What it does

Staging Check runs `node scripts/ci/typecheck-against-baseline.mjs` instead of bare
`npm run typecheck`. The script runs the same TypeScript check (`tsc --noEmit`,
non-pretty), normalizes each primary error line to a key
`file|TScode|message` (first line of the message only — the Q8 method), and
compares **counts** to `ci/typecheck-baseline.txt`.

| Result | Meaning |
|--------|---------|
| Exit 0 | Every key's current count ≤ its baseline count (shrink always OK) |
| Exit 1 | A key is new or its count grew — prints `NEW typecheck errors vs baseline (N):` |
| Exit 2 | TypeScript could not run (crash / missing project / no parsable errors on failure) |

The baseline format is one sorted line per key:

```text
# comments allowed
<count>|<file>|<TScode>|<message>
```

## How to measure

From the repo root (Node ≥ 22, dependencies installed):

```bash
node scripts/ci/typecheck-against-baseline.mjs --write /tmp/meas.txt
```

That writes the current keys in baseline format and exits 0. Use it only for
measurement or when intentionally reseeding the committed baseline.

## How the baseline may change

- **Shrink:** clearing errors never requires a baseline edit; the gate still passes.
- **Grow:** only via an **explicit commit** that updates `ci/typecheck-baseline.txt`
  and whose commit message explains why the debt is accepted.
- The committed baseline is the **union of max counts** across the release-line
  tips that were measured when the gate was introduced (staging, main, production
  tip, sales-desk, integration). Prefer regenerating with the same method if you
  reseed.

## Rollback

Revert the merge commit that introduced this gate on `staging` (and on `main` if
it has already landed). That restores the previous `npm run typecheck` step and
removes the baseline file and script. No GitHub ruleset changes are required for
rollback of the gate itself.

## Boundary Guard (related)

PRs whose base is `main` pass Boundary Guard only when the head branch is
`staging` or `hotfix/*`. Feature branches must go through `staging` first.
