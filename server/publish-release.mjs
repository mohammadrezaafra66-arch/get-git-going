/**
 * انتشار خودکار نسخه پس از استقرار.
 *
 * Calls public.auto_publish_release() with the notes baked into this build.
 *
 * TWO CALLERS, AND THE PRODUCTION ONE IS THE CLI
 *   1. deploy/lan/up.ps1 runs this file directly, after the stack is up. THIS is
 *      the path that matters. The runner image contains only .output,
 *      package.json and node_modules — `server/` is not copied into it, and the
 *      container's CMD is `node .output/server/index.mjs`, nitro's own server.
 *      So nothing inside the container can execute this module.
 *   2. server/node-entry.mjs also calls it on listen(). That entry point is used
 *      by `npm run preview` for local self-host checks, never in the container.
 *      Kept because it is genuinely useful there and is idempotent anyway.
 *
 *   An earlier version of this file assumed the container ran node-entry.mjs.
 *   It does not, and the hook would silently never have fired. The CLI path
 *   exists because of that.
 *
 * FAILURE POLICY
 *   Nothing here may prevent the app from serving. Every failure is caught and
 *   logged. A release that does not publish is a missing page entry; a server
 *   that will not boot is an outage. The former is always preferable.
 *
 * IDEMPOTENCY
 *   Two layers. auto_publish_release() is keyed on git_sha, so a restart cannot
 *   duplicate. And before calling it we slice the note list down to commits
 *   newer than the last published release, so a redeploy does not republish
 *   content the previous release already carried.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NOTES_FILENAME = "release-notes.json";

function log(msg) {
  console.log(`[release-publish] ${msg}`);
}

/** public/ is copied into dist/client by vite; fall back to the source tree. */
function findNotesFile(dirs) {
  for (const dir of dirs) {
    const p = resolve(dir, NOTES_FILENAME);
    if (existsSync(p)) return p;
  }
  return null;
}

async function restCall(baseUrl, key, path, init = {}) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Entries strictly newer than the last release already recorded.
 * Returns all entries when the last sha is unknown to this build — that happens
 * on the very first deploy after this feature lands, and on a history rewrite.
 */
function entriesSinceLastRelease(payload, lastSha) {
  const { commits = [], entries = [] } = payload;
  if (!lastSha) return entries;

  // Prefix match, NOT equality. platform_releases.git_sha holds whatever
  // APP_GIT_SHA carried — deploy/lan/build.ps1 stamps `git rev-parse --short`,
  // i.e. 8 characters — while the generator emits full 40-character shas.
  // A strict indexOf therefore never matched, silently fell through to "return
  // everything", and would have republished every entry in range on the next
  // deploy. Only the database-level git_sha key stopped it, and that guards the
  // ROW, not the CONTENT.
  const short = lastSha.trim().toLowerCase();
  const idx = commits.findIndex((c) => {
    const full = c.trim().toLowerCase();
    return full.startsWith(short) || short.startsWith(full);
  });
  if (idx === -1) return entries;

  const newer = new Set(commits.slice(0, idx));
  return entries.filter((e) => newer.has(e.sha));
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
/** The page and its audience are Persian; Latin digits look wrong there. */
function toFaDigits(n) {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

// Item field limits, mirrored from src/lib/platform-releases/constants.ts.
// Kept as literals because this file is plain .mjs run by the deploy script and
// cannot import from the TS source tree.
const MAX_ITEM_TITLE = 160;
const MAX_ITEM_DESC = 500;

/**
 * Compose one release row out of N commit notes.
 *
 * ITEM SHAPE IS A CONTRACT, NOT A FREE CHOICE.
 * PlatformReleaseCard.tsx:76-79 renders `item.title_fa` and
 * `item.description_fa`, keyed on `item.item_number`, and the type is declared
 * in src/lib/platform-releases/types.ts:3-10. An earlier version of this
 * function emitted `{ text, sha }` instead — none of the three fields the card
 * reads — so every auto-published release rendered as blank bullets while the
 * Persian text sat in the row, unreachable. Diagnosed in
 * docs/audits/release-notes-description-gap.md.
 *
 * The two fields carry genuinely different content rather than a duplicate:
 * title_fa takes the Persian category (short, renders as the bold line),
 * description_fa takes the commit's Release-note-fa sentence.
 */
function composeRelease(entries) {
  const titles = entries.map((e) => e.title_fa).filter(Boolean);
  const title = titles.length === 1 ? titles[0] : `${toFaDigits(titles.length)} به‌روزرسانی جدید`;
  const summary =
    titles.length === 1
      ? titles[0]
      : `در این نسخه ${toFaDigits(titles.length)} تغییر اعمال شده است.`;
  // Mixed types get the neutral category; a uniform batch keeps its own.
  const cats = [...new Set(entries.map((e) => e.category))];
  const category = cats.length === 1 ? cats[0] : "بهبود";
  return {
    title: title.slice(0, 200),
    summary: summary.slice(0, 1000),
    category,
    items: entries.map((e, i) => ({
      item_number: i + 1,
      title_fa: (e.category || "بهبود").slice(0, MAX_ITEM_TITLE),
      description_fa: (e.title_fa || "").slice(0, MAX_ITEM_DESC),
      change_type: e.type || null,
      module_key: null,
      route_path: null,
    })),
  };
}

export async function publishReleaseOnBoot({ searchDirs }) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const gitSha = process.env.APP_GIT_SHA;
    const buildTime = process.env.APP_BUILD_TIME;

    if (!url || !key) {
      log("skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
      return;
    }
    if (!gitSha || gitSha === "unknown" || gitSha === "local-unknown") {
      log(`skipped: APP_GIT_SHA is "${gitSha ?? "unset"}"`);
      return;
    }

    const file = findNotesFile(searchDirs);
    if (!file) {
      log(`skipped: no ${NOTES_FILENAME} in the image`);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      log(`skipped: ${NOTES_FILENAME} is unreadable (${err.message})`);
      return;
    }

    if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
      log("nothing to publish: no commit in this build carries a Persian note");
      return;
    }

    // Find the newest release whose commit is ACTUALLY IN THIS BUILD, rather
    // than simply the newest row.
    //
    // Taking the newest row was wrong and produced a duplicate release in
    // production: an archived test row carrying a foreign sha became newest, its
    // sha was not in this build's commit list, entriesSinceLastRelease hit its
    // "unknown sha" branch and republished every entry in range. One stray row
    // is enough to poison it, and the failure is silent and user-visible.
    //
    // Matching against the commit list skips archived tests, foreign shas and
    // rewritten history alike. If none match it is genuinely a first deploy, and
    // publishing everything is then correct.
    const known = new Set((payload.commits ?? []).map((c) => c.trim().toLowerCase()));
    const recent = await restCall(
      url,
      key,
      "platform_releases?select=git_sha,release_number&order=release_number.desc&limit=50",
    );
    const lastSha =
      (recent ?? []).find((r) => {
        const sha = (r.git_sha ?? "").trim().toLowerCase();
        if (!sha) return false;
        for (const c of known) {
          if (c.startsWith(sha) || sha.startsWith(c)) return true;
        }
        return false;
      })?.git_sha ?? null;

    const fresh = entriesSinceLastRelease(payload, lastSha);
    if (fresh.length === 0) {
      log(`nothing new since ${lastSha ? lastSha.slice(0, 8) : "the beginning"}`);
      return;
    }

    // auto_publish_release returns the existing row untouched when this commit
    // was already published, so the RPC alone cannot tell us whether anything
    // was created. Ask first, so the deploy log says what actually happened
    // instead of claiming "published" on every restart.
    const already = await restCall(
      url,
      key,
      `platform_releases?select=release_number&git_sha=eq.${encodeURIComponent(gitSha)}&limit=1`,
    );
    if (already?.length) {
      log(`already published as #${already[0].release_number} for ${gitSha.slice(0, 8)}`);
      return;
    }

    const { title, summary, category, items } = composeRelease(fresh);
    const row = await restCall(url, key, "rpc/auto_publish_release", {
      method: "POST",
      body: JSON.stringify({
        p_git_sha: gitSha,
        p_build_time: buildTime && buildTime !== "unknown" ? buildTime : null,
        p_version: gitSha.slice(0, 8),
        p_title_fa: title,
        p_summary_fa: summary,
        p_category: category,
        p_items: items,
      }),
    });

    const num = Array.isArray(row) ? row[0]?.release_number : row?.release_number;
    log(`published release #${num} with ${items.length} item(s) for ${gitSha.slice(0, 8)}`);
  } catch (err) {
    // Deliberately swallowed. See FAILURE POLICY above.
    log(`failed (the app is unaffected): ${err.message}`);
  }
}

// --- CLI entry, used by deploy/lan/up.ps1 -----------------------------------
// Exits 0 even on failure: a deploy must not be marked broken because the
// update page did not gain a row. The message says what happened.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const here = dirname(fileURLToPath(import.meta.url));
  await publishReleaseOnBoot({
    searchDirs: [resolve(here, "../public"), resolve(here, "../dist/client"), process.cwd()],
  });
}
