# RLS RBAC Policy

## Phase 0 rule

Before any automation database change, access rules must be defined.

## Minimum requirements

- UI permission alone is not enough.
- Worker access and operator access must be separated.
- Server-side privileged access must not be exposed to browser code.
- Job, log, checkpoint, output and worker state tables need clear read/write rules.

## Secret rule

No real key, password, token, cookie or credential may be committed to GitHub.
