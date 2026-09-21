/**
 * Group shaped ring rows with the REAL call-card-key module (tsx).
 * Usage: npx --yes tsx docs/.../b1-group-real.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCallCardKey,
  groupCallsByCardKey,
} from "../../../../../src/lib/calls/call-card-key.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const shaped = JSON.parse(readFileSync(resolve(dir, "b1-shaped.json"), "utf8"));

// Old popup behavior: one card per ring uuid
const oldKeys = shaped.map((r: { id: string }) => r.id);
const newKeys = shaped.map((r: Parameters<typeof getCallCardKey>[0]) =>
  getCallCardKey(r),
);
const groups = groupCallsByCardKey(shaped);

const report = {
  module: "src/lib/calls/call-card-key.ts",
  shaped_count: shaped.length,
  old_card_key_count: new Set(oldKeys).size,
  new_card_key_count: new Set(newKeys).size,
  old_keys: oldKeys,
  new_keys: newKeys,
  group_count: groups.length,
  groups: groups.map((g) => ({
    key: g.key,
    extensions: g.extensions,
    member_count: g.members.length,
    member_ids: g.members.map((m) => m.id),
  })),
  pass: groups.length === 1 && shaped.length === 2 && groups[0]!.extensions.length === 2,
};

writeFileSync(resolve(dir, "b1-group-real.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
console.log("PASS: real groupCallsByCardKey → 1 card");
