# WPC-0-001 Ali Boundary Inventory Report

Status: Draft
Owner: Ali Talebi Zadeh
Branch: docs/WPC-0-001-ali-boundary-inventory
Base branch: staging
Scope: Inventory only. No implementation changes.

## Summary

This report records Ali's inventory review of the Phase 6 boundary-governance package and related Phase 3.8 -> 4 governance alignment issues.

No code, UI, database, worker runtime, API implementation, migration, or production behavior was changed.

## PR #142 Status

PR #142 was already merged before this inventory work.

The merge commit was found as:

```text
c80336da Merge pull request #142 from mohammadrezaafra66-arch/cursor/phase6-boundary-governance
```

The commit is currently contained in these remote branches:

```text
origin/staging
origin/lovable/ui-staging
origin/docs/WPC-3.9-001-boundary-inventory-staging
origin/docs/WPC-3.9-002-path-ownership-matrix
origin/docs/WPC-3.9-003-lovable-cursor-boundary
origin/cursor/docs/ali-phase6-review
```

Because PR #142 is already merged and has become part of later branches, the practical decision is not to continue or close PR #142. Any correction should be done in a new small follow-up PR.

## PR #142 Changed Areas

PR #142 touched multiple governance-sensitive areas at once:

```text
.cursor/rules/**
.env.example
.env.staging.example
.env.production.example
.github/CODEOWNERS
.github/pull_request_template.md
.github/workflows/**
docs/governance/**
docs/testing/**
openapi/openapi.yaml
```

This scope was broad. For future work, these concerns should be split into smaller reviewable PRs.

## OpenAPI Findings

The canonical automation OpenAPI contract is:

```text
automation/openapi/automation-v1.yaml
```

The related JSON schemas are:

```text
automation/schemas/heartbeat.schema.json
automation/schemas/job.schema.json
```

The following files confirm the canonical automation contract:

```text
docs/automation/OPENAPI_CANONICAL_RESOLUTION.md
docs/process/OPENAPI_CONTRACT_STRATEGY.md
openapi/README.md
openapi/automation-v1.yaml
```

However, there is still an OpenAPI source-of-truth conflict:

```text
docs/governance/API_CONTRACT_RULES.md
```

still treats:

```text
openapi/openapi.yaml
```

as the primary platform API contract.

At the same time:

```text
docs/process/OPENAPI_CONTRACT_STRATEGY.md
```

states that root:

```text
openapi/
```

is deprecated pointer-only unless a future ADR changes it.

This conflict should be resolved before implementation work depends on `openapi/openapi.yaml`.

## Environment Example Findings

PR #142 replaced the previous `.env.example` content with a simplified shared example.

The following settings were removed from `.env.example`:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
EXTERNAL_OCR_ENABLED
EXTERNAL_API_TIMEOUT_MS
MARKET_RATES_AUTO_INGEST_ENABLED
MARKET_RATES_EXTERNAL_ENABLED
NAVASAN_ENABLED
NAVASAN_API_KEY
TGJU_ENABLED
MARKET_RATES_CRON_SECRET
MARKET_RATES_INGEST_INTERVAL_MINUTES
```

New environment example files were added:

```text
.env.staging.example
.env.production.example
```

These files add useful staging/production separation and worker safety defaults:

```text
WORKER_MODE=mock
WORKER_MODE=controlled
ENABLE_REAL_BOT_EXECUTION=false
ENABLE_REAL_CUSTOMER_MESSAGING=false
```

However, the removed OCR and market-rate settings were not fully restored in staging or production examples.

This should be treated as an environment documentation gap.

## Cursor Rules vs Process Docs

The `.cursor/rules/**` files currently still point to Phase 6 governance.

Examples:

```text
.cursor/rules/phase6-boundary.mdc
.cursor/rules/branch-discipline.mdc
```

These rules reference:

```text
docs/governance/LOVABLE_CURSOR_BOUNDARY.md
docs/governance/BRANCH_STRATEGY.md
cursor/phase6-boundary-governance
```

However, newer Phase 3.9 process documents live under:

```text
docs/process/lovable-cursor-boundary.md
docs/process/path-ownership-matrix.md
docs/process/BRANCH_STRATEGY.md
```

This creates a source-of-truth conflict between `docs/governance/**` and `docs/process/**`.

## Lovable / Cursor Boundary Findings

There are two boundary documents:

```text
docs/governance/LOVABLE_CURSOR_BOUNDARY.md
docs/process/lovable-cursor-boundary.md
```

The governance document is Phase 6 and active.

The process document is Phase 3.9.3 and newer.

The newer process document is stricter and more specific in several places, including:

```text
src/routes/** instead of src/pages/**
shared paths requiring Handoff
Lovable forbidden access to src/lib/**
more detailed Stop-The-Line conditions
```

The older governance document allows more flexible Lovable access to:

```text
src/hooks/**
src/lib/**
```

when related to UI behavior.

This difference should be resolved so Cursor and Lovable do not follow different boundary rules.

## Branch Strategy Findings

There are two branch naming models.

Older governance model:

```text
cursor/docs-*
cursor/phase6-*
```

Newer process model:

```text
docs/*
```

The Cursor rules still reference the older Phase 6 model.

This should be aligned before future documentation/governance task packets are executed.

## Encoding Findings

Several markdown files display corrupted Persian text in PowerShell, such as:

```text
ظ‡ط¯ظپ
ط§غŒظ†
â€” 
```

This affects readability for Persian-speaking reviewers.

This was observed in multiple process and automation documents.

No encoding fix was made in this inventory step.

## Branch Target Assessment

Merging PR #142 into `staging` was generally defensible because it was governance/test-before-production work.

However, the PR scope was too broad and touched many sensitive areas at once.

Recommended follow-up:

```text
Do not revert directly.
Do not edit staging directly.
Create small follow-up PRs for each cleanup area.
```

## Recommended Follow-Up PRs

Suggested follow-up PRs:

```text
1. Align .cursor/rules/** with docs/process/** and current Phase 3.8 -> 4 roadmap.
2. Resolve docs/governance/** vs docs/process/** source-of-truth duplication.
3. Resolve OpenAPI root contract ambiguity around openapi/openapi.yaml.
4. Restore or relocate missing OCR and market-rate environment example settings.
5. Fix markdown encoding issues in Persian governance/process documents.
6. Align branch naming rules across Cursor rules, governance docs, and process docs.
```

## Decision

PR #142 should be treated as merged historical governance work.

Future corrections should be split into smaller follow-up PRs.

No implementation work should start until the source-of-truth conflicts are resolved or explicitly accepted by the project owner.

## Evidence Commands Used

```powershell
git log --oneline --grep="#142" --all
git diff --name-status c80336da^1 c80336da
dir openapi, automation\openapi
Get-Content openapi\README.md -TotalCount 80
Get-Content openapi\openapi.yaml -TotalCount 80
Get-Content automation\openapi\automation-v1.yaml -TotalCount 80
Get-Content openapi\automation-v1.yaml -TotalCount 80
Get-Content docs\automation\OPENAPI_CANONICAL_RESOLUTION.md -TotalCount 120
git diff c80336da^1 c80336da -- .env.example
Get-Content .env.staging.example -TotalCount 120
Get-Content .env.production.example -TotalCount 140
dir .cursor\rules, docs\process
Get-Content docs\process\lovable-cursor-boundary.md -TotalCount 160
Get-Content docs\process\lovable-cursor-boundary.md | Select-Object -Skip 160 -First 180
Get-Content docs\process\lovable-cursor-boundary.md | Select-Object -Skip 340 -First 160
Get-Content .cursor\rules\phase6-boundary.mdc -TotalCount 160
Get-Content docs\governance\LOVABLE_CURSOR_BOUNDARY.md -TotalCount 160
Get-Content docs\governance\LOVABLE_CURSOR_BOUNDARY.md | Select-Object -Skip 160 -First 180
Get-Content docs\governance\LOVABLE_CURSOR_BOUNDARY.md | Select-Object -Skip 340 -First 160
Get-Content .cursor\rules\branch-discipline.mdc -TotalCount 160
Get-Content .cursor\rules\openapi-contract.mdc -TotalCount 160
Get-Content .cursor\rules\worker-boundary.mdc -TotalCount 160
dir docs\governance
Get-Content docs\process\BRANCH_STRATEGY.md -TotalCount 140
Get-Content docs\governance\BRANCH_STRATEGY.md -TotalCount 140
Get-Content docs\governance\BRANCH_STRATEGY.md | Select-Object -Skip 140 -First 180
Get-Content docs\governance\BRANCH_STRATEGY.md | Select-Object -Skip 320 -First 140
Get-Content docs\process\OPENAPI_CONTRACT_STRATEGY.md -TotalCount 160
Get-Content docs\governance\API_CONTRACT_RULES.md -TotalCount 160
Get-Content docs\governance\API_CONTRACT_RULES.md | Select-Object -Skip 160 -First 160
git branch -r --contains c80336da
```
