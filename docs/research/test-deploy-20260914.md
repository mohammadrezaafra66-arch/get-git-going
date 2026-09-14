# Test-box deploy of the production image — 2026-09-14

**Box:** test computer `192.168.170.8:3100` (`D:\AfraKalaTest\app`, DB `afrakala`).
**Goal:** run the *same* image production runs, so the two boxes differ only in environment.
**Outcome:** deployed and verified. The runtime `VITE_APP_ENV` mechanism works: same image, amber
test banner here.

Nothing on `192.168.170.10` was touched. No migration, no ledger write, no image build, no
`docker commit`/`pause`, no image or tag deleted.

## Before / target / rollback

| | Image id | APP_GIT_SHA | Note |
|---|---|---|---|
| Before (running) | `sha256:0c3106602cc9…` | `c0804142` | built 2026-09-12; **not in the local image store** |
| Target | `sha256:b67d27106ce4…` | `a935be0b` | the image production runs, `afrakala-app:a935be0b`, already on this box |
| Rollback | `sha256:296eb4b4899f…` | `3bc526c4` | tagged `afrakala-app:lan-rollback-test` |

## Phase 0 — orientation

- The checkout was on `staging` at `edd55fb9`, one docs commit ahead of `origin/main`. With the
  owner's approval it was switched: `git switch main`, then HEAD `a935be0b` = `origin/main`,
  behind/ahead 0/0. The extra commit stays on `origin/staging`.
- Five untracked leftovers were in the tree. **I did not touch them** (not deleted, stashed, moved
  or committed):
  - `docs/research/526-repair-measurement-20260914.md` (0 B)
  - `docs/research/_last-report.md` (9755 B)
  - `docs/research/_last-report.prev-20260914T1133-asan541.md` (7085 B)
  - `docs/research/release-line/_last-report.md` (0 B)
  - `docs/runbooks/526-repair-20260914.md` (0 B)

## Accepted loss: build `c0804142`

`docker image inspect 0c3106602cc9` returned `No such image`. A tag cannot point at it, and
`docker commit` was forbidden, so no rollback point for the running build could exist. The owner
accepted the loss: it is a 2026-09-12 test-box build, its source is in git, and nothing depends on
that exact binary. **Rolling back does NOT restore what was running before this deploy.**

## Rollback target: what it is

`296eb4b4899f` (`3bc526c4`, built 2026-09-13T05:09:38Z) is the **2026-09-13 incident image**. Its
client bundle has `http://192.168.170.8:9000` baked in; `grep` inside the image found it in
`assets/index-DHg13tWP.js` and `assets/upload-with-progress-BZ3iDSYu.js`. On production that
address was the outage. On this box it is correct, because test Kong really is `:9000`.

> The rollback target is a different, older build, and it happens to be correct on this box for
> the same reason it was catastrophic on production.

The tag was verified with `docker tag 296eb4b4899f afrakala-app:lan-rollback-test` (exit 0). The
tag's id equals `afrakala-app:lan` (True) and does not equal the running container's image (False,
as expected).

Pre-authorised rollback:
```
docker tag afrakala-app:lan-rollback-test afrakala-app:lan
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --no-build web
```

## Finding — `afrakala-app:lan` had drifted from the running image (same class as D2)

Before the deploy, `afrakala-app:lan` pointed at `296eb4b4899f` (`3bc526c4`), **not** at the
running image `0c3106602cc9`. Most likely `lan` was retagged after the container started and the
old image was then pruned; that sequence was not verified. `296eb4b4899f` was built 2026-09-13, so
for at least a day anyone who ran a bare `compose up web` here
would have silently switched this box to `3bc526c4`. That includes the documented deploy and
rollback commands. Nothing in `docker ps` reveals it: the container's `Config.Image` still reads
`afrakala-app:lan`.

The deploy closed it: `lan` now equals the running image. The underlying hazard remains. A mutable
tag is not a record of what is running. Before any deploy or rollback, compare
`docker inspect <container> --format {{.Image}}` with `docker image inspect <tag> --format {{.Id}}`.

## Phase 1 — target image checks

- `afrakala-app:a935be0b`: id `b67d27106ce4…`, `APP_GIT_SHA=a935be0b` baked in. No load from the
  share was needed.
- Client bundle (`/app/.output/public`): 0 files containing `192.168.170.8:9000`, 0 containing
  `192.168.170.10:8000`. 2 files in `/app/.output` reference `__APP_RUNTIME_CONFIG__`. No address
  is baked in, so the URL must come from runtime.

## Phase 4 — deploy (2026-09-14 19:02 +05:00)

```
docker tag afrakala-app:a935be0b afrakala-app:lan                          EXIT 0
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --no-build web
  Container afrakala-lan-web Recreate / Recreated / Starting / Started    EXIT 0
docker restart afrakala-lan-rest                                           EXIT 0
```

The web service's runtime env resolved by compose (secrets not printed):
`APP_SUPABASE_PUBLIC_URL=http://192.168.170.8:9000`, `VITE_APP_ENV=test`,
`SUPABASE_URL=http://kong:8000`.

## Phase 5 — verification

| Check | Result |
|---|---|
| 5.1 running image / APP_GIT_SHA | `sha256:b67d27106ce4…` / `a935be0b` — PASS |
| 5.2 `/login` | 200 in 0.084s — PASS |
| 5.2 `/api/healthz` | 200 in 0.016s — PASS |
| 5.3 served runtime config | see below — PASS |
| 5.4 amber banner | rendered, in SSR HTML and after hydration in a real browser — PASS |
| 5.5 containers | all `afrakala-lan-*` Up, `web` healthy, `db-role-fix` Exited (0) — PASS |
| PostgREST after restart | schema cache loaded (255 relations); `/rest/v1/` via Kong answers 401 without a key, as expected |

**5.3 — served `window.__APP_RUNTIME_CONFIG__` on `/login`** (the anon key is redacted here. It is
the public anon JWT, served to every browser by design, but it has no place in git):
```json
{"supabaseUrl":"http://192.168.170.8:9000","supabaseAnonKey":"<anon JWT, redacted>","appEnv":"test"}
```
Production serves `http://192.168.170.10:8000` / `"production"` **from the same image id
`b67d27106ce4`**. Different values from one binary means runtime configuration is working, which is
the point of this release. (Production's values are taken from the owner's brief. This run did not
read production.)

**5.4 — banner.** The served HTML contains
`<div dir="rtl" role="alert" class="… bg-amber-100 … text-amber-950 …" data-environment="test">«محیط تست myafrakala.ir — اطلاعات این بخش واقعی نیست»</div>`.
In Chrome, in an isolated context after a 2.5s settle, it was present, visible, `data-environment="test"`,
with an amber background. The live `window.__APP_RUNTIME_CONFIG__` matched the SSR payload.

## State after the run

- Checkout: `main` at `a935be0b`; the five leftovers are still untracked and untouched.
- Tags now: `lan` = `a935be0b` = `b67d27106ce4` (running); `lan-rollback-test` = `3bc526c4` =
  `296eb4b4899f`. No tag was deleted.
