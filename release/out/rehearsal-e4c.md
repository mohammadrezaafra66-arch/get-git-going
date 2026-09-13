# Baseline gate measurement — prod_rehearsal_e4c (PRISTINE restore, ZERO migrations replayed)

Generated: 2026-09-12T21:38:05Z

This is what og102 and og103 report about the target BEFORE this release touches it.
Nothing here is licensed as acceptable. It is the measurement the gates phase compares
against, so that 'the release did not make it worse' is a fact rather than a claim.

og102/og103 playwright exit code on the pristine shape = 1

## Baseline failures (these are PRE-EXISTING on the target, not caused by this release)

```
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:284:1
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:299:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:523:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:589:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:651:1
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:682:1
```

baseline failing tests: 6
file for the gates phase: D:/AfraKalaTest/wt-conv-release/release/runs/e4c/baseline-gate-failures.txt
