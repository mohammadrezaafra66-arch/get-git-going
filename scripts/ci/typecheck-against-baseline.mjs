#!/usr/bin/env node
/**
 * typecheck-against-baseline.mjs
 *
 * Runs the same TypeScript check as `npm run typecheck` (`tsc --noEmit`) with
 * non-pretty output, normalizes errors to Q8 keys, and compares counts to
 * ci/typecheck-baseline.txt.
 *
 * Exit codes:
 *   0 — every key's current count ≤ baseline count (or --write succeeded)
 *   1 — a key is new or exceeds its baseline count
 *   2 — TypeScript check could not run (crash / no parsable errors on failure)
 *
 * Usage:
 *   node scripts/ci/typecheck-against-baseline.mjs
 *   node scripts/ci/typecheck-against-baseline.mjs --write <path>
 *   node scripts/ci/typecheck-against-baseline.mjs --baseline <path>
 *   node scripts/ci/typecheck-against-baseline.mjs --compare-only <measurement> [--baseline <path>]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ERROR_LINE_RE =
  /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

function parseArgs(argv) {
  const out = {
    write: null,
    baseline: path.join(REPO_ROOT, "ci", "typecheck-baseline.txt"),
    compareOnly: null,
    project: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write") {
      out.write = argv[++i];
      if (!out.write) dieUsage("--write requires a path");
    } else if (a === "--baseline") {
      out.baseline = argv[++i];
      if (!out.baseline) dieUsage("--baseline requires a path");
    } else if (a === "--compare-only") {
      out.compareOnly = argv[++i];
      if (!out.compareOnly) dieUsage("--compare-only requires a path");
    } else if (a === "--project") {
      out.project = argv[++i];
      if (!out.project) dieUsage("--project requires a path");
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      dieUsage(`unknown argument: ${a}`);
    }
  }
  return out;
}

function dieUsage(msg) {
  console.error(msg);
  printHelp();
  process.exit(2);
}

function printHelp() {
  console.error(`Usage:
  node scripts/ci/typecheck-against-baseline.mjs [--baseline <path>]
  node scripts/ci/typecheck-against-baseline.mjs --write <path>
  node scripts/ci/typecheck-against-baseline.mjs --compare-only <measurement> [--baseline <path>]
  node scripts/ci/typecheck-against-baseline.mjs --project <tsconfig>   (for exit-2 probes)`);
}

/** Normalize tsc stdout/stderr into Map<key, count> where key = file|TScode|message */
export function parseTypecheckOutput(text) {
  const counts = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = ERROR_LINE_RE.exec(line);
    if (!m) continue;
    let file = m[1].replace(/\\/g, "/");
    if (file.startsWith("./")) file = file.slice(2);
    const code = m[4];
    const message = m[5];
    const key = `${file}|${code}|${message}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** Parse baseline / measurement file: optional # comments; lines count|file|TScode|message */
export function parseBaselineFile(text) {
  const counts = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("#")) continue;
    const firstBar = line.indexOf("|");
    if (firstBar < 0) continue;
    const countStr = line.slice(0, firstBar);
    const rest = line.slice(firstBar + 1);
    const count = Number(countStr);
    if (!Number.isFinite(count) || count < 0) continue;
    // rest must contain at least file|TScode|message (two more bars)
    if (rest.split("|").length < 3) continue;
    counts.set(rest, (counts.get(rest) || 0) + count);
  }
  return counts;
}

export function formatBaseline(counts) {
  const header = [
    "# Typecheck baseline (count|file|TScode|message).",
    "# Growth is allowed only via an explicit commit whose message explains why.",
    "# Shrinking (clearing errors) is always allowed and does not require a baseline edit.",
    "# Generated / maintained for Staging Check gate: scripts/ci/typecheck-against-baseline.mjs",
  ].join("\n");
  const body = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, count]) => `${count}|${key}`)
    .join("\n");
  return `${header}\n${body}\n`;
}

export function compareToBaseline(current, baseline) {
  const offenders = [];
  let atOrBelow = 0;
  let cleared = 0;

  for (const [key, cur] of current) {
    const base = baseline.get(key);
    if (base === undefined) {
      offenders.push({ key, current: cur, baseline: 0 });
    } else if (cur > base) {
      offenders.push({ key, current: cur, baseline: base });
    } else {
      atOrBelow += 1;
    }
  }

  for (const [key, base] of baseline) {
    const cur = current.get(key) || 0;
    if (cur === 0 && base > 0) cleared += 1;
    else if (cur < base && current.has(key)) {
      // still counted in atOrBelow above
    }
  }

  // keys present in baseline but missing from current also count as "cleared"
  // already handled; keys at or below that exist in both already counted.

  const rawTotal = [...current.values()].reduce((s, n) => s + n, 0);
  return {
    offenders,
    rawTotal,
    uniqueKeys: current.size,
    atOrBelow,
    cleared,
  };
}

function runTsc(project) {
  const tscJs = path.join(REPO_ROOT, "node_modules", "typescript", "lib", "tsc.js");
  const args = [tscJs, "--noEmit", "--pretty", "false"];
  if (project) {
    args.push("--project", project);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = stdout + (stderr ? (stdout && !stdout.endsWith("\n") ? "\n" : "") + stderr : "");
  return {
    status: result.status,
    error: result.error,
    signal: result.signal,
    output: combined,
  };
}

function printSummary(label, comparison, baselineSize) {
  console.log(label);
  console.log(`  raw errors: ${comparison.rawTotal}`);
  console.log(`  unique keys: ${comparison.uniqueKeys}`);
  console.log(`  keys at or below baseline: ${comparison.atOrBelow}`);
  console.log(`  keys cleared since baseline: ${comparison.cleared}`);
  if (baselineSize !== undefined) {
    console.log(`  baseline unique keys: ${baselineSize}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  let current;
  let tscMeta = null;

  if (args.compareOnly) {
    const text = fs.readFileSync(args.compareOnly, "utf8");
    current = parseBaselineFile(text);
  } else {
    tscMeta = runTsc(args.project);
    if (tscMeta.error) {
      console.error("TypeScript check could not run:", tscMeta.error.message);
      process.exit(2);
    }
    current = parseTypecheckOutput(tscMeta.output);
    const failed = tscMeta.status !== 0 && tscMeta.status !== null;
    if (failed && current.size === 0) {
      console.error("TypeScript check failed with no parsable errors.");
      if (tscMeta.output.trim()) {
        console.error(tscMeta.output.trim().slice(0, 4000));
      }
      console.error(`tsc exit status: ${tscMeta.status}; signal: ${tscMeta.signal}`);
      process.exit(2);
    }
  }

  if (args.write) {
    const text = formatBaseline(current);
    fs.mkdirSync(path.dirname(path.resolve(args.write)), { recursive: true });
    fs.writeFileSync(args.write, text, "utf8");
    const raw = [...current.values()].reduce((s, n) => s + n, 0);
    console.log(`Wrote ${current.size} unique keys (${raw} raw) to ${args.write}`);
    process.exit(0);
  }

  if (!fs.existsSync(args.baseline)) {
    console.error(`Baseline file not found: ${args.baseline}`);
    process.exit(2);
  }
  const baseline = parseBaselineFile(fs.readFileSync(args.baseline, "utf8"));
  const comparison = compareToBaseline(current, baseline);
  printSummary("typecheck-against-baseline summary:", comparison, baseline.size);

  if (comparison.offenders.length > 0) {
    console.log(`NEW typecheck errors vs baseline (${comparison.offenders.length}):`);
    for (const o of comparison.offenders) {
      console.log(`  ${o.key}`);
      console.log(`    current=${o.current} baseline=${o.baseline}`);
    }
    process.exit(1);
  }

  console.log("OK: all typecheck error keys are at or below baseline counts.");
  process.exit(0);
}

main();
