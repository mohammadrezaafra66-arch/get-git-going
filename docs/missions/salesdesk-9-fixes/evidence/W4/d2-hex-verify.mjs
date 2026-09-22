/**
 * Hex round-trip verify for sales_activity_types titles.
 * Compares encode(convert_to(title,'UTF8'),'hex') to Buffer.from(title,'utf8').toString('hex').
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(
  readFileSync(join(dir, "d2-expected-hex.json"), "utf8"),
);

const sql = `
SELECT sort_order,
       encode(convert_to(title, 'UTF8'), 'hex') AS title_hex,
       is_active
  FROM public.sales_activity_types
 ORDER BY sort_order;
SELECT count(*)::int AS row_count FROM public.sales_activity_types;
`;

const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -A -F '|' -t`,
  ],
  { input: Buffer.from(sql, "utf8"), encoding: "utf8" },
);

writeFileSync(join(dir, "d2-hex-verify-raw.txt"), out, "utf8");

const lines = out
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);
// last non-empty before blank sections: rows then count
const dataLines = lines.filter((l) => l.includes("|"));
const countLine = lines.find((l) => /^\d+$/.test(l));

const results = [];
let allOk = true;
for (const line of dataLines) {
  const [sortStr, hex, active] = line.split("|");
  const sort_order = Number(sortStr);
  const exp = expected.find((e) => e.sort_order === sort_order);
  const ok = !!exp && exp.hex === hex;
  if (!ok) allOk = false;
  results.push({
    sort_order,
    db_hex: hex,
    expected_hex: exp?.hex ?? null,
    ok,
    is_active: active,
  });
}

const report = {
  row_count_db: countLine ? Number(countLine) : null,
  expected_count: expected.length,
  all_ok: allOk && results.length === expected.length,
  sample_0: results.find((r) => r.sort_order === 0) ?? null,
  sample_17: results.find((r) => r.sort_order === 17) ?? null,
  results,
};

const text = [
  `row_count_db=${report.row_count_db}`,
  `expected_count=${report.expected_count}`,
  `all_ok=${report.all_ok}`,
  `sample_0_hex=${report.sample_0?.db_hex ?? "MISSING"} ok=${report.sample_0?.ok}`,
  `sample_17_hex=${report.sample_17?.db_hex ?? "MISSING"} ok=${report.sample_17?.ok}`,
  "",
  ...results.map(
    (r) =>
      `sort=${r.sort_order} ok=${r.ok} hex=${r.db_hex}${r.ok ? "" : " EXPECTED=" + r.expected_hex}`,
  ),
  "",
].join("\n");

writeFileSync(join(dir, "d2-hex-verify.txt"), text, "utf8");
writeFileSync(join(dir, "d2-hex-verify.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(text);
process.exit(report.all_ok ? 0 : 1);
