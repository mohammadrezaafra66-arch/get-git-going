# B1 FIX probe — live AMI hook → one card key

**Verdict:** DONE  
**Date:** 2026-09-21 (UTC) / session 2026-09-22 local  
**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**HEAD (at probe start):** `8a8b61e3f021c6ccad8a50aa3e6717ab803e4662`  
**HEAD (after probe / before this commit):** `fd8ae1bbf9da8ba3c8ae8ab267020e94e1f231c2` (moved by W2-OPS commit on same worktree — noted per D-1)  
**Branch:** `feature/salesdesk-9-fixes`

## Claim

Synthetic call via **real** hook `POST /api/public/hooks/issabel-ami-ring` with **two mapped extensions** and the **same `linkedid`** inserts **2** `call_ring_events` rows; `groupCallsByCardKey` on the popup-shaped rows yields **1** card key containing both extensions.

## Auth (no secrets printed)

Route: `src/routes/api/public/hooks/issabel-ami-ring.ts`  
- Header: `Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}`  
- Ingest: `ingestAmiRingEvent` → insert into `call_ring_events` only when extension is mapped (`call_log_extensions.employee_id` present).

Token was **not** loaded from host `.env.lan` for outbound calls. Probe used in-container env:

```text
docker exec -e HOOK_BASE=http://127.0.0.1:3000 afrakala-lan-web node /tmp/b1-post-in-web.mjs
```

(`afrakala-lan-web` listens on **:3000**; host publishes **:3100** → container :3000.)

Token presence only: `TOKEN_SET=true TOKEN_LEN=36` (value redacted).

## Commands (redacted)

### 1) Unit baseline (already green) — E3

```text
npx --yes tsx --test src/lib/calls/call-card-key.test.ts
```

Exit: **0** — 6 pass / 0 fail (incl. `groupCallsByCardKey — B1 two extensions same linkedid`).  
Artifact: `b1-unit.txt`

### 2) Live hook POST ×2 — E3

```text
docker cp docs/.../b1-post-in-web.mjs afrakala-lan-web:/tmp/b1-post-in-web.mjs
docker exec -e HOOK_BASE=http://127.0.0.1:3000 afrakala-lan-web node /tmp/b1-post-in-web.mjs
```

Exit: **0**

Mapped extensions on LAN at probe time: `["403","412"]` (`401` **not** mapped → unused).

| Field | Value |
|-------|--------|
| linkedid | `TEST-9FIX-B1-1790027512033` |
| phone | `09000000101` |
| marker | `[TEST-9FIX]` in `raw` |
| ext A | `403` → HTTP 200, `ok:true`, id `ba72fe9f-…`, duplicate false |
| ext B | `412` → HTTP 200, `ok:true`, id `2b61c599-…`, duplicate false |

Artifacts: `b1-post.txt`, `b1-post-result.json`

### 3) DB count + group — E3 / E4

```text
node docs/.../b1-hook-probe.mjs group
npx --yes tsx docs/.../b1-group-real.mts
```

| Metric | Value |
|--------|--------|
| SQL `count(*)` WHERE linkedid = probe | **2** |
| `old_card_key_count` (pre-B1: `ring:${uuid}`) | **2** |
| `new_card_key_count` (`lid:${linkedid}`) | **1** |
| `group_count` | **1** |
| group extensions | `["403","412"]` |
| group key | `lid:TEST-9FIX-B1-1790027512033` |

**E4 (algorithm before/after on the same hook-inserted rows):**

- Before grouping (old popup id keys): 2 distinct cards  
  `ring:ba72fe9f-…`, `ring:2b61c599-…`
- After `groupCallsByCardKey` (real module `src/lib/calls/call-card-key.ts`): **1** group  

Artifacts: `b1-group.txt`, `b1-group-report.json`, `b1-shaped.json`, `b1-group-real.json`, `b1-group-real-run.txt`  
Exit group: **0**; exit real: **0**

### 4) Cleanup — E3

```text
node docs/.../b1-hook-probe.mjs cleanup
```

```text
before_count = 2
DELETE 2
after_count  = 0
```

Predicate: `linkedid LIKE 'TEST-9FIX-B1-%'` (synthetic marker only).  
Artifact: `b1-cleanup.txt` (stdout; after_count **0**)

## Row counts summary

| Stage | Rows matching probe markers |
|-------|-----------------------------|
| After POST | 2 |
| After DELETE | 0 |
| Card groups (after POST, before DELETE) | **1** |

## Notes / caveats

- Extensions requested in brief were `401`+`412`; live map had **`403`+`412`** only — probe used mapped pair (ingest skips unmapped extensions with `ok:true,id:null`).
- Host `http://192.168.170.8:3100` returned HTTP 200; authenticated POSTs executed **inside** web container on `:3000` to avoid shipping token from host `.env.lan`.
- Unit suite already asserts B1; this probe adds **live hook → DB → real `groupCallsByCardKey`** evidence.

## Optional Wave 2 acceptance stub (Playwright / node)

Not a full e2e UI run. Suggested follow-up:

1. Keep `b1-post-in-web.mjs` + `b1-group-real.mts` as LAN smoke under `evidence/W2/`.
2. Playwright (optional): login sales user with extension `412` or `403`, fire the same dual POST, assert Caller ID UI shows **one** card for `09000000101` within `RING_EVENTS_WINDOW_MS` (2 min), then cleanup SQL as above.
3. Config base URL: `E2E_BASE_URL` default `http://192.168.170.8:3100` (`playwright.config.ts`).

## Helpers added (evidence only)

- `b1-post-in-web.mjs` — in-container dual POST  
- `b1-hook-probe.mjs` — group / cleanup via `afrakala-lan-db`  
- `b1-group-real.mts` — import real `groupCallsByCardKey`  
- `b1-post-in-web.sh` — curl variant (unused; image has no curl)
