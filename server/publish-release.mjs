/**
 * انتشار خودکار نسخه هنگام بالا آمدن سرور.
 *
 * Step 3 of making /updates fill itself. Runs once per process, right after the
 * HTTP server starts listening, and calls public.auto_publish_release().
 *
 * WHY HERE AND NOT IN A ROUTE
 *   A route would have to be reachable to be triggered, which means either
 *   exposing a publish endpoint or bolting a side effect onto an unrelated one.
 *   Boot is the honest place: it happens exactly once per deploy, needs no
 *   secret of its own, and cannot be poked from outside.
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
import { resolve } from "node:path";

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
  const idx = commits.indexOf(lastSha);
  if (idx === -1) return entries;
  const newer = new Set(commits.slice(0, idx));
  return entries.filter((e) => newer.has(e.sha));
}

/** Compose one release row out of N commit notes. */
function composeRelease(entries) {
  const titles = entries.map((e) => e.title_fa).filter(Boolean);
  const title = titles.length === 1 ? titles[0] : `${titles.length} به‌روزرسانی جدید`;
  const summary =
    titles.length === 1
      ? titles[0]
      : `در این نسخه ${titles.length} تغییر اعمال شده است.`;
  // Mixed types get the neutral category; a uniform batch keeps its own.
  const cats = [...new Set(entries.map((e) => e.category))];
  const category = cats.length === 1 ? cats[0] : "بهبود";
  return {
    title: title.slice(0, 200),
    summary: summary.slice(0, 1000),
    category,
    items: entries.map((e) => ({ text: e.title_fa, sha: e.shortSha })),
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

    // What is already on the page? Any status counts — an archived release still
    // means its commits shipped.
    const existing = await restCall(
      url,
      key,
      "platform_releases?select=git_sha,release_number&order=release_number.desc&limit=1",
    );
    const lastSha = existing?.[0]?.git_sha ?? null;

    const fresh = entriesSinceLastRelease(payload, lastSha);
    if (fresh.length === 0) {
      log(`nothing new since ${lastSha ? lastSha.slice(0, 8) : "the beginning"}`);
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
