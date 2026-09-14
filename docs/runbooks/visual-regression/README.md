# Visual regression for a release

A release has three layers that can change. Before this tool, only two were compared automatically:

| Layer         | Tool                                                       |
| ------------- | ---------------------------------------------------------- |
| code          | `git diff`                                                 |
| database      | `scripts/schema-snapshot.sh` (12 dimensions)               |
| **rendering** | **`scripts/visual-regression/compare.mjs`** (this runbook) |

Given two images, it starts each as a disposable container with **the same runtime environment
and the same database**. It captures the same pages from both with Playwright `toHaveScreenshot()`
and reports which pages differ and by how much. It also records which hosts each page contacted,
because a page can look identical while reading from the wrong server (see "What it does NOT catch").

It is **not wired into the release line**. Nothing in `release/` calls it.

---

## Read this first: three things you will otherwise find out the hard way

1. **You need a minted session, and the tool cannot get one itself. That is by design.**
   A password login writes to `afrakala` (`auth.sessions`, `auth.refresh_tokens`,
   `auth.audit_log_entries`, `auth.users.last_sign_in_at`), and this tool must not write.
   So a human mints a JWT with `JWT_SECRET`. The harness deliberately denies agents
   read access to `deploy/lan/.env.lan`, and the tool must not route around that rule.
2. **The session expires 2 hours after minting.** The tool refuses to start with less than
   15 minutes left. Mint a fresh one with the command below. The TTL is fixed in the script.
3. **The session file holds a live JWT. It must never land inside a repo.** `mint-session.mjs`
   refuses any destination inside a git work tree, and `compare.mjs` refuses an `--out` inside one
   (screenshots show real business data). Put both in your scratch/temp directory.

---

## How to run

### 1. Mint a session (human, once per 2 hours)

From PowerShell, in your own shell. The secret is read into the process environment only,
never into an argument or a file, and cleared afterwards:

```powershell
$f='D:\AfraKalaTest\app\deploy\lan\.env.lan'
function envv($k){ ((Get-Content -LiteralPath $f | Where-Object { $_ -match "^$k=" } | Select-Object -First 1) -replace "^$k=",'').Trim().Trim('"',"'") }
$env:JWT_SECRET = envv 'JWT_SECRET'
$env:SUPABASE_PUBLISHABLE_KEY = envv 'SUPABASE_PUBLISHABLE_KEY'
node scripts\visual-regression\mint-session.mjs --out $env:TEMP\visreg-session\admin.session.json
Remove-Item Env:JWT_SECRET, Env:SUPABASE_PUBLISHABLE_KEY
```

What `mint-session.mjs` does:

- Signs an HS256 token for `test.admin@afrakala.local`, valid for 2 hours.
- Runs one `SELECT` for the account's uuid, with `default_transaction_read_only=on`.
- Writes `{email, expiresAt, anonKey, session}`.
- Prints only the path, the account and the expiry.

`SUPABASE_PUBLISHABLE_KEY` is the public anon key. The containers need it at runtime. It comes
from the same shell, so nothing else has to read `.env.lan`.

### 2. Compare two images

Run from a checkout with `node_modules` installed (`npm ci`). Uses the repo's own `@playwright/test`.

```bash
node scripts/visual-regression/compare.mjs \
  --before <image> --after <image> \
  --session <session file> \
  --out <empty dir outside any repo> \
  [--supabase-url http://192.168.170.8:9000] [--app-env production]
```

- Both containers: `docker run --rm`, bound to `127.0.0.1:<free high port>`, label `visreg=1`,
  stopped when the run ends (also on Ctrl+C). Port 3000 and 3100 are never used.
- `--supabase-url` must be reachable from **inside** the container as well as from the browser.
  The container's `/api/healthz` checks the database from inside the container, so `127.0.0.1:9000`
  gives `503` and the run fails with `not healthy`. `http://host.docker.internal:9000` works on
  this machine.
- It never touches the running stack, never tags or moves an image, and runs nothing on `.10`.

### 3. Read the result

`<out>/SUMMARY.txt` is written to be read in ten seconds:

```
RESULT: 4 of 4 pages differ

  DIFF   login      37,590 px (2.94%)     diff/login.png  size 1366px by 900px -> 1366px by 937px
  DIFF   dashboard  24,666 px (1.25%)     diff/dashboard.png  size 1366px by 1403px -> 1366px by 1440px
  ...
hosts contacted: identical on every page
unconfigured hosts: none (every request went to the app or 192.168.170.8:9000)
writes blocked by read-only guard: before 2, after 2 (same set: yes) — see network/
```

| Path                                                        | Content                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `before/<page>.png`                                         | baseline, captured from `--before`                            |
| `after/<page>.png`                                          | the same page from `--after`                                  |
| `diff/<page>.png`                                           | Playwright's diff (red = changed), only for pages that differ |
| `network/<side>-<page>.json`                                | hosts contacted and requests the guard blocked                |
| `report-before.json`, `report-after.json`, `test-results-*` | raw Playwright output                                         |

Exit code: `0` nothing differs. `1` a page differs, or the two sides contacted different hosts,
or a side contacted a host other than `--supabase-url`. `2` the tool failed or a page could not
be captured.

**The % is pixels changed ÷ page area.** A layout shift inflates it. The planted banner is 37px
tall, but it pushes the whole page down, so most of the page counts as changed. Open `diff/`
before judging how big a change is.

---

## Pages and why

| Page         | Session | Why                                                             |
| ------------ | ------- | --------------------------------------------------------------- |
| `/login`     | none    | the one page anyone sees without a session                      |
| `/dashboard` | admin   | the page every user lands on: KPIs, activity feed, chart, dates |
| `/products`  | admin   | largest list (356 rows, 18 pages), filters, prices, tags        |
| `/persons`   | admin   | the unified persons list: badges, action buttons, pagination    |

Desktop only (1366×900, full page), `fa-IR`, `Asia/Tehran`. To add a page, add one entry to
`PAGES` in `capture.spec.ts` with a `ready` selector. Then run the image against itself
(see "Stability") before trusting it.

---

## Same database, never written to

Both containers read **`afrakala` on the test computer through Kong** (`192.168.170.8:9000` or an
alias of it). Two different databases would make every page differ and the tool would be noise.

It is a live, shared database, so the tool is read-only by construction, not by hope:

1. **No password login.** The minted session means no GoTrue write.
2. **No service-role key** in either container. The server side has only the anon key.
3. **A browser route guard** (`installGuard` in `capture.spec.ts`) aborts and records anything that could write:
   - Supabase paths allow `GET`/`HEAD`, plus `POST /rest/v1/rpc/<fn>` only when every overload of
     `<fn>` is `STABLE`/`IMMUTABLE`. That list is read from `pg_proc` at start. PostgREST runs such
     calls in a read-only transaction (per PostgREST's documented behaviour; not separately measured
     here). Edge functions are always blocked.
   - The app container allows `GET`/`HEAD` for pages and assets, and only `/api/version` and
     `/api/healthz` under `/api`. **`/_serverFn/*` is always blocked**, because server functions
     carry the user's token and can write.
   - WebSockets are always closed.
   - Service workers are blocked, so nothing can bypass the guard.
4. **Measured, 2026-09-14.** The guard blocked `PATCH /rest/v1/profiles` on every authenticated
   page load. That is the app's last-seen update, and without the guard every run would have
   written it. After about 12 comparisons (08:02–08:26Z), the fixture account was byte-for-byte
   unchanged: `last_sign_in_at` 2026-09-12 17:23:25, `profiles.last_seen_at` 2026-09-12 18:33:01,
   `auth.sessions` 1, `auth.refresh_tokens` 2, GoTrue audit rows 5573, `audit_logs` rows 5972.

The cost is that anything a page shows **from a blocked call** renders in its failed state, the
same on both sides. On the dashboard, for example, «اتصال زنده قطع است» (live connection down)
appears because realtime is blocked. Those parts of the UI are not compared.

---

## Stability, and why the result is not noise

The app is Persian RTL with local fonts. A tool that finds differences between an image and
itself is worthless, so these are the controls:

| Source of noise                                                         | Control                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| clock: "today", greetings, «۹ روز پیش»                                  | `page.clock.setFixedTime` with **one timestamp shared by both runs**                                                      |
| CSS animations, transitions, caret                                      | `toHaveScreenshot({ animations: "disabled", caret: "hide" })`, `reducedMotion: "reduce"`                                  |
| fonts not yet loaded                                                    | `await document.fonts.ready`                                                                                              |
| capturing before hydration                                              | per-page `ready` selector, plus a wait until no `aria-busy="true"` and no «در حال آماده‌سازی» / «در حال بارگذاری» remains |
| a failed session silently capturing /login on both sides ("identical!") | authenticated pages assert the URL is still the target page                                                               |
| rendering differences between machines                                  | both sides render in the same local Chromium, one after the other                                                         |
| screenshot taken mid-change                                             | `toHaveScreenshot` waits for two identical consecutive frames                                                             |

**The hydration control was found, not assumed.** The first version waited only for
`networkidle`. Two runs of the same image pair then reported different pixel counts
(37,590 vs 37,172) for `/login`, because one capture caught the submit button before hydration
(«در حال آماده‌سازی...», disabled). That state is stable for two frames, so it passes
`toHaveScreenshot`'s own stability check. The `ready` selector fixed it.

**Masking: none needed, measured.** Each page's `mask` list is empty because the self-comparison
needed no masks once the controls above were in place. If a page you add shows differences
against itself, first find out _why_ (clock, loading state, live data). Add a `mask` selector only
for content that legitimately changes between two captures (masked areas paint `#FF00FF`).

**Measured, 2026-09-14:**

- `visreg-rt:clean` vs itself: 0 of 4 pages differ, in 4 separate runs.
- `afrakala-app:lan` vs itself: 0 of 4, in 2 runs.
- Across 6 captures of `visreg-rt:clean` in 4 runs (08:22–08:25Z), each page's PNG had one md5:
  login `4eabb3d7`, dashboard `9788d880`, products `4bd197b4`, persons `2716539e`. The same
  hashes as the first run at 08:07Z.

**Data drift is still possible.** The database is live and shared with other agents.
`/persons` shows other missions' `E2E_AUDIT_*` rows. The two captures are about 15 seconds
apart, so a row changed in that window shows up as a difference. Re-run the image against itself:
if that also differs, it is drift, not the release.

---

## What it catches (measured 2026-09-14)

| Comparison                                                                                                                  | Result                                                                                                                                          | Time   |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `visreg-rt:clean` vs `visreg-rt:clean`                                                                                      | 0 of 4 differ                                                                                                                                   | 30s    |
| `visreg-rt:clean` vs `visreg-rt:banner` (only change: one planted Dockerfile line, `ENV VITE_SHOW_ENVIRONMENT_BANNER=true`) | **4 of 4 differ**: login 37,590 px, dashboard 24,666, products 143,339, persons 68,474. Every page is 37px taller. Identical counts in two runs | 36–38s |

Both images were built from `origin/fix/release-line-runtime-config` @ `1d2253d5`, with
identical build args, from two scratch copies. The banner copy differs by that single Dockerfile line.

Anything that changes pixels on a captured page is caught: layout, text, colour, a missing
component, a broken page, a banner.

## What it does NOT catch

- **A wrong-host image whose wrong host serves the same data. The pixels are identical.**
  This is the 2026-09-13 incident class, and it was measured. `afrakala-app:lan`
  (`296eb4b4899f`, Supabase host `192.168.170.8:9000` baked in at build) compared against
  `visreg-rt:clean`, which was told `http://host.docker.internal:9000` at runtime (same Kong,
  same database): **0 of 4 pages differ.** The screenshots cannot see where data came from.
  - The **request log** does see it, and it fails the run (exit 1):
    `hosts contacted: DIFFER on 3 page(s)` and
    `unconfigured hosts: FOUND — before: [192.168.170.8:9000] — configured was host.docker.internal:9000`.
    Comparing `296eb4b4899f` against **itself** with that URL also reports
    `unconfigured hosts: FOUND` on both sides.
  - **But this only works if `--supabase-url` differs from the baked host.** On the test computer
    the baked host _is_ the correct one. With the default `--supabase-url http://192.168.170.8:9000`,
    the incident image looks fully correct. Use an alias (`host.docker.internal`) to smoke it out.
  - Where the image actually fetches from **on the server it is deployed to** is the job of
    the **D10 gate** (it reads what the live site serves after deploy). This tool does not replace it.
- **The image production actually ran.** The running `afrakala-lan-web` is on
  `sha256:0c3106602cc9…`, which is **not in the image store** and cannot be started. So "before" can
  never be the image that was really deployed. The tool compares **two images you built or still
  have**, which is a real limit as it stands. Tag an image _before_ it is replaced if you ever
  want to compare against it.
- **Data-only differences.** Same database on both sides, by design, so a release that changes
  data (a migration) and not code shows no rendering difference here. That is `schema-snapshot.sh`'s layer.
- **Anything behind a blocked request.** Server functions, `/api/*` other than version/healthz,
  realtime, edge functions and every write render in their failed state on both sides. Form
  submission and every write path are not exercised at all.
- **Pages and states not listed.** Only the four pages above, desktop viewport, first screen
  state (no clicks, no open dialogs, no second page of a list). No mobile viewport, although the UI
  is mobile-first.
- **Non-visual behaviour.** Performance, console errors, accessibility and service worker update
  flow are all out of scope.
- **Other environments.** It is hard-wired to the test computer: `afrakala-lan-db`, database
  `afrakala`, account `test.admin@afrakala.local`. Nothing here runs against production, and it must not.

---

## Files

| File                                             | Role                                                           |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `scripts/visual-regression/compare.mjs`          | orchestrator: containers, two Playwright runs, summary         |
| `scripts/visual-regression/capture.spec.ts`      | pages, read-only guard, stability controls, `toHaveScreenshot` |
| `scripts/visual-regression/playwright.config.ts` | viewport, locale, snapshot path (`<out>/before`)               |
| `scripts/visual-regression/mint-session.mjs`     | the human step: a 2h session with no DB write                  |

No new dependency: `@playwright/test` 1.62 is already in `package.json`, and its built-in
comparator produces the diff.

## Known quirks

- **Docker Desktop's port proxy accepts TCP before the app listens.** A pending `fetch` does not
  keep Node alive, so the first version exited `0` silently mid-wait and left both containers
  running. `waitHealthy` now uses an explicit timeout per attempt. If you ever see an empty,
  instant exit, check `docker ps --filter label=visreg=1`.
- Stray containers from a killed run: `docker ps -a --filter label=visreg=1`, then `docker stop` them
  (they are `--rm`, so stopping removes them).
