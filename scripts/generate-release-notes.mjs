#!/usr/bin/env node
/**
 * تولید خودکار یادداشت انتشار فارسی از تاریخچهٔ گیت.
 *
 * WHY THIS RUNS AT BUILD TIME, ON THE HOST
 *   `.git` is in .dockerignore, so the container has no git history. The notes
 *   must therefore be produced where git exists — the build machine — and baked
 *   into the image as JSON. deploy/lan/build.ps1 calls this before
 *   `docker compose build`.
 *
 * WHERE THE PERSIAN TEXT COMES FROM, in priority order:
 *   1. A `Release-note-fa:` trailer on the commit. Best quality — a human (or an
 *      agent following AGENTS.md) wrote it for end users.
 *   2. The conventional-commit type mapped to a Persian label, plus the subject.
 *      Automatic, but the subject is still English.
 *
 *   Option 2 is a fallback, not the design. Commits that change what a user sees
 *   should carry the trailer.
 *
 * WHAT IS DELIBERATELY EXCLUDED
 *   chore / docs / test / refactor / ci / build / style commits are internal.
 *   Publishing them tells the user nothing and leaks how the system is built.
 *   A commit of those types is included ONLY if it carries an explicit
 *   Release-note-fa trailer, i.e. someone decided it is user-facing after all.
 *
 * OUTPUT  public/release-notes.json  (gitignored — it is a build artefact)
 *   { generatedAt, headSha, entries: [{ sha, type, category, title_fa, subject }] }
 *
 * USAGE
 *   node scripts/generate-release-notes.mjs [--since <ref>] [--max <n>]
 *   --since defaults to the previous 50 commits; the server publishes only the
 *   entries whose sha is not already recorded, so over-generating is harmless.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(repoRoot, "public/release-notes.json");

/** Conventional-commit type → Persian label shown to the user. */
const TYPE_LABEL_FA = {
  feat: "قابلیت جدید",
  fix: "رفع اشکال",
  perf: "بهبود کارایی",
  revert: "بازگردانی تغییر",
};

/** Internal types: excluded unless the commit carries an explicit trailer. */
const INTERNAL_TYPES = new Set([
  "chore",
  "docs",
  "test",
  "refactor",
  "ci",
  "build",
  "style",
]);

/** platform_releases.category values this maps onto. */
const TYPE_CATEGORY = {
  feat: "feature",
  fix: "fix",
  perf: "improvement",
  revert: "fix",
};

function git(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const out = { since: null, max: 50, allowFallback: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--since") out.since = argv[++i] ?? null;
    else if (argv[i] === "--max") out.max = Number(argv[++i] ?? 50) || 50;
    else if (argv[i] === "--allow-fallback") out.allowFallback = true;
  }
  return out;
}

/**
 * A commit's full message, split into subject and trailers. `git log` records
 * are separated by a NUL so a multi-line body can never be mistaken for a new
 * record — subjects in this repo contain colons, parentheses and Persian text.
 */
function readCommits({ since, max }) {
  const range = since ? `${since}..HEAD` : `-n${max}`;
  const fmt = "%H%x1f%s%x1f%b%x1e";
  const raw = git(["log", range, `--format=${fmt}`, "--no-merges"]);
  return raw
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body = ""] = record.split("\x1f");
      return { sha: sha.trim(), subject: (subject ?? "").trim(), body };
    });
}

/** `Release-note-fa: متن` — may appear anywhere in the body, one per commit. */
function trailerFa(body) {
  const m = body.match(/^Release-note-fa:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

/** `feat(scope): subject` → { type, scope, rest } */
function parseConventional(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/);
  if (!m) return { type: null, scope: null, rest: subject };
  return { type: m[1].toLowerCase(), scope: m[2] ?? null, rest: m[3].trim() };
}

function buildEntries(commits, { allowFallback }) {
  const entries = [];
  for (const c of commits) {
    const fa = trailerFa(c.body);
    const { type, scope, rest } = parseConventional(c.subject);

    // STRICT BY DEFAULT: only commits carrying a Persian trailer are published.
    //
    // The fallback path produces titles like "رفع اشکال: migration 306 repairs
    // the regression 304 introduced" — a Persian label glued to English
    // engineering prose. That is worse than showing nothing: it is unreadable
    // for the intended audience and exposes internals. A `fix(unify):` commit
    // repairing an internal migration is also not a user-facing change at all,
    // yet its type alone would let it through.
    //
    // --allow-fallback exists for inspecting what history WOULD produce, not
    // for shipping.
    if (!fa && !allowFallback) continue;

    // Internal work stays internal unless someone explicitly wrote a note.
    if (!fa && (type === null || INTERNAL_TYPES.has(type))) continue;

    const label = TYPE_LABEL_FA[type] ?? "تغییر";
    entries.push({
      sha: c.sha,
      shortSha: c.sha.slice(0, 8),
      type: type ?? "other",
      category: TYPE_CATEGORY[type] ?? "improvement",
      // The trailer is the whole title when present. Otherwise the Persian
      // label carries the meaning and the English subject is the detail.
      title_fa: fa ?? `${label}: ${rest}`,
      hasFaTrailer: Boolean(fa),
      scope,
      subject: c.subject,
    });
  }
  return entries;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let commits;
  try {
    commits = readCommits(args);
  } catch (err) {
    // A build must never fail because notes could not be generated. Emit an
    // empty file so the server simply has nothing new to publish.
    console.error(`[release-notes] git read failed, emitting empty: ${err.message}`);
    commits = [];
  }

  const entries = buildEntries(commits, { allowFallback: args.allowFallback });
  let headSha = "unknown";
  try {
    headSha = git(["rev-parse", "HEAD"]).trim();
  } catch {
    /* leave unknown */
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    headSha,
    entries,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const withTrailer = entries.filter((e) => e.hasFaTrailer).length;
  console.log(
    `[release-notes] ${entries.length} entries (${withTrailer} with a Persian trailer)` +
      " -> public/release-notes.json",
  );
  if (entries.length === 0) {
    console.log(
      "[release-notes] nothing to publish: no commit in range carries a" +
        " 'Release-note-fa:' trailer. See AGENTS.md.",
    );
  }
  if (entries.length > withTrailer) {
    console.log(
      "[release-notes] WARNING: --allow-fallback is on, so some titles are" +
        " English engineering text. Do not ship this to users.",
    );
  }
}

main();
