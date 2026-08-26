import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

import {
  BANK_DEPOSIT_HEADERS,
  JOURNAL_HEADERS,
  PURCHASE_HEADERS,
  SALES_HEADERS,
} from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  buildInvoiceRows,
  groupInvoiceRows,
  type InvoiceExportRow,
} from "../../src/lib/asan/export-invoice-rows";
import {
  buildJournalRows,
  groupJournalRows,
  type JournalExportRow,
} from "../../src/lib/asan/export-journal-rows";
import {
  buildBankDepositRows,
  groupBankDepositRows,
  type BankDepositRow,
} from "../../src/lib/asan/export-bank-deposit-rows";
import type { AsanCell } from "../../src/lib/asan/export-types";

/**
 * M5.2 — full-program verification.
 *
 * The parts of phase 5.2 that are assertions rather than commands live here, so they run on every
 * future regression instead of only once:
 *
 *   * item 3 — every module this program added is seeded for **every** role;
 *   * item 4 — the RLS pass with **real JWTs** for viewer / sales / accountant / admin against
 *     **every table this program created**, counting rows rather than trusting status codes;
 *   * item 5 — zero test data survives, checked per fixture rather than in general;
 *   * item 8 — **one document of each of the five export types produced end to end and opened
 *     with openpyxl**, header rows compared against `docs/asan/asan-layouts.md`. This is the
 *     final proof that the deliverable actually works.
 *
 * Item 8's files are written to `docs/verification/m5-export-samples/` so the owner can open the
 * real thing rather than take my word for it.
 */

const SAMPLE_DIR = "docs/verification/m5-export-samples";
const FULL_RANGE = { from: "2026-01-01", to: "2026-12-31" };

let adminJwt: string;
let salesJwt: string | null = null;
let accountantJwt: string | null = null;
let viewerJwt: string | null = null;

// OG-46: counts read from the live database when this spec starts. Six checks below used to pin
// whole tables to ZERO and three pinned the catalogue to the sizes it had in Mordad. Those were
// never properties of the software — they were a census of one afternoon's database, and every
// one of them is false today because the owner has since used the features they describe: 4 real
// import batches, 7,349 staged product rows, 2 minted Asan numbers, 1 delivery receipt, 84
// persons instead of 70, 15 Asan person codes instead of 11.
const survivors: Record<string, number> = {};

/** Every table this program created. Anything added later must be added here too. */
const PROGRAM_TABLES = [
  "asan_control_accounts",
  "asan_export_numbers",
  "asan_import_batches",
  "asan_import_person_rows",
  "asan_import_product_rows",
  "phone_collisions",
  "product_video_chain",
  "product_video_chain_events",
];

/** Every module this program seeded into `role_permissions`. */
const PROGRAM_MODULES = ["asan-import", "asan-export", "product-videos"];

function readWithOpenpyxl(file: string): (string | number | null)[][] {
  const out = execFileSync(
    "python",
    [
      "-c",
      [
        "import sys, json, openpyxl",
        "wb = openpyxl.load_workbook(sys.argv[1], data_only=True)",
        "ws = wb[wb.sheetnames[0]]",
        "rows = [[c.value for c in r] for r in ws.iter_rows()]",
        "sys.stdout.write(json.dumps(rows, ensure_ascii=False))",
      ].join("\n"),
      file,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out) as (string | number | null)[][];
}

async function writeSample(
  name: string,
  headers: readonly string[],
  rows: AsanCell[][],
): Promise<(string | number | null)[][]> {
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  const bytes = await buildAsanWorkbook({ headers, rows, sheetName: "Asan" });
  const file = path.join(SAMPLE_DIR, `${name}.xlsx`);
  fs.writeFileSync(file, Buffer.from(bytes));
  return readWithOpenpyxl(file);
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const sales = await userWithRole(adminJwt, "sales");
  salesJwt = sales ? mintJwt(sales) : null;
  const acc = dbScalar(
    "select coalesce((select user_id::text from user_roles where role = 'accountant' and user_id not in (select user_id from user_roles where role = 'admin') limit 1), '')",
  );
  accountantJwt = acc ? mintJwt(acc) : null;
  const viewer = dbScalar(
    "select coalesce((select user_id::text from user_roles where role = 'viewer' and user_id not in (select user_id from user_roles where role in ('admin','manager','sales','accountant')) limit 1), '')",
  );
  viewerJwt = viewer ? mintJwt(viewer) : null;

  // OG-46: the "unchanged by this spec" baselines, read once before any test in this file runs.
  // The labels are the join key to the `unchanged` list in test 5.2/5 — if one is added there
  // without being added here the comparison would silently be against `undefined`, so the loop
  // below asserts the pairing rather than trusting it.
  for (const [label, sql] of [
    ["staged import batches", "select count(*) from asan_import_batches"],
    ["staged person rows", "select count(*) from asan_import_person_rows"],
    ["staged product rows", "select count(*) from asan_import_product_rows"],
    ["minted Asan numbers", "select count(*) from asan_export_numbers"],
    ["video chains", "select count(*) from product_video_chain"],
    ["delivery receipts", "select count(*) from delivery_receipts"],
    ["product catalogue", "select count(*) from products"],
    ["persons", "select count(*) from persons"],
    [
      "Asan person codes",
      "select count(*) from person_identifiers where kind = 'asan_person_code'",
    ],
  ] as [string, string][]) {
    const n = Number(dbScalar(sql));
    expect(Number.isFinite(n), `baseline for "${label}" did not read as a number`).toBe(true);
    survivors[label] = n;
  }
});

// ------------------------------------------------------ item 3: every module, every role ----

test("5.2/3 — every module this program added is seeded for every role", () => {
  const roles = Number(dbScalar("select count(distinct role_name) from role_permissions"));
  expect(roles).toBeGreaterThanOrEqual(7);

  for (const m of PROGRAM_MODULES) {
    expect(
      Number(dbScalar(`select count(*) from role_permissions where module = '${m}'`)),
      `${m}: rule 2.5 — a module with no row for a role falls through to "grant everyone"`,
    ).toBe(roles);
  }

  // Walked, not asserted from memory: these are the exact view sets each module was built for.
  expect(
    dbRows(
      "select role_name from role_permissions where module = 'asan-import' and can_view order by role_name",
    ),
  ).toEqual(["accountant", "admin"]);
  expect(
    dbRows(
      "select role_name from role_permissions where module = 'asan-export' and can_view order by role_name",
    ),
  ).toEqual(["accountant", "admin"]);
  expect(
    dbRows(
      "select role_name from role_permissions where module = 'product-videos' and can_view order by role_name",
    ),
  ).toEqual(["accountant", "admin", "manager", "sales"]);
});

test("5.2/3b — no table in public has RLS switched off", () => {
  // The M1.3 finding: four backup tables had RLS disabled entirely, so every authenticated user
  // could read them whole. This keeps that closed.
  expect(
    Number(
      dbScalar(
        "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
      ),
    ),
  ).toBe(0);
  for (const t of PROGRAM_TABLES) {
    expect(
      Number(
        dbScalar(
          `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = '${t}' and c.relrowsecurity`,
        ),
      ),
      `${t} must have RLS enabled`,
    ).toBe(1);
  }
});

// -------------------------------------------- item 4: the RLS pass, counting rows not codes ----

test("5.2/4 — a viewer and a salesperson read zero rows from every table this program created", async () => {
  test.skip(!viewerJwt || !salesJwt, "this server lacks a viewer-only or sales-only account");

  for (const t of PROGRAM_TABLES) {
    for (const [who, jwt] of [
      ["viewer", viewerJwt!],
      ["sales", salesJwt!],
    ] as const) {
      const res = await rest<unknown[]>(jwt, `/${t}?select=*&limit=5`);
      // RLS on SELECT never errors — it returns zero rows (rule 2.5). So COUNT, never trust a
      // 200. A 4xx is equally acceptable; what must not happen is rows coming back.
      const rows = Array.isArray(res.body) ? res.body.length : 0;
      expect(rows, `${who} must read 0 rows from ${t} (status ${res.status})`).toBe(0);
    }
  }
});

test("5.2/4b — an accountant reads the Asan tables and an admin reads all of them", async () => {
  test.skip(!accountantJwt, "no accountant-only account on this server");

  // The point of the export module is that the accountant can use it. If she could not read
  // these, the feature would be silently useless — the exact failure mode RLS produces.
  for (const t of ["asan_export_numbers", "asan_control_accounts", "asan_import_batches"]) {
    const res = await rest<unknown[]>(accountantJwt!, `/${t}?select=*&limit=5`);
    expect(res.status, `accountant should not be refused ${t}`).toBeLessThan(400);
  }

  for (const t of PROGRAM_TABLES) {
    const res = await rest<unknown[]>(adminJwt, `/${t}?select=*&limit=5`);
    expect(res.status, `admin must be able to read ${t}`).toBeLessThan(400);
  }
});

test("5.2/4c — nobody can write to the tables that take no writes", async () => {
  // `asan_export_numbers`, `product_video_chain` and `product_video_chain_events` deliberately
  // have SELECT-only policies: every write goes through a SECURITY DEFINER function.
  for (const t of ["asan_export_numbers", "product_video_chain", "product_video_chain_events"]) {
    expect(
      Number(
        dbScalar(
          `select count(*) from pg_policies where schemaname = 'public' and tablename = '${t}' and cmd <> 'SELECT'`,
        ),
      ),
      `${t} must have no write policy`,
    ).toBe(0);
  }

  // And a real attempt bounces. Counting rows, because PostgREST answers 2xx for a no-op.
  const before = Number(dbScalar("select count(*) from product_video_chain"));
  await rest(adminJwt, "/product_video_chain", {
    method: "POST",
    body: JSON.stringify({
      quote_item_id: "00000000-0000-4000-8000-000000000001",
      quote_id: "00000000-0000-4000-8000-000000000002",
    }),
  });
  expect(Number(dbScalar("select count(*) from product_video_chain"))).toBe(before);
});

// -------------------------------------------------------- item 5: zero test data survives ----

test("5.2/5 — no fixture from any phase of this program survives", () => {
  // Per fixture, not in general: "the database looks fine" is not evidence.
  // HALF ONE — rows this program MARKED. These stay pinned to zero, and they are the assertions
  // that actually carry the claim in this test's title: a fixture from this program is
  // identifiable by its marker, so "none survives" is a statement the query can settle. Left
  // exactly as written.
  const marked: [string, string][] = [
    ["E2E-marked products", "select count(*) from products where name like 'E2E_AUDIT_%'"],
    ["E2E-marked quotes", "select count(*) from sales_quotes where customer_name like 'E2E_AUDIT_%'"],
    [
      // OG-56: two posted journal rows cannot be deleted by anyone -- `trg_journal_entry_immutable`
      // refuses every UPDATE and DELETE where OLD.status='posted', verified as superuser. The
      // owner decided: exclude by id, do NOT reverse them, do NOT touch the trigger. That
      // exclusion already guards `cleanupConstructed`; it belongs here too, because otherwise
      // this assertion stays permanently red for a reason the owner has already ruled on.
      // Excluded BY ID, never by marker -- a marker-wide exemption would hide a genuine future
      // leak behind the same clause.
      "E2E-marked journal entries",
      "select count(*) from journal_entries where description like 'E2E_AUDIT_%'"
        + " and id not in ('db8a628c-d560-45f6-8083-be6804f4c345','81903a4c-a8f9-4d8c-869e-dad1595ae897')",
    ],
    [
      "constructed external-party codes",
      "select count(*) from external_parties where accounting_code like '999000%'",
    ],
    [
      "constructed person codes",
      "select count(*) from person_identifiers where value_normalized like '999000%'",
    ],
  ];
  for (const [label, sql] of marked) {
    expect(Number(dbScalar(sql)), label).toBe(0);
  }

  // HALF TWO — OG-46. These six tables carry NO marker distinguishing a test fixture from real
  // work, so a whole-table count cannot express "no fixture survives" once the feature has been
  // used for real. It never could; it only looked like it could while the tables happened to be
  // empty. `asan_import_batches` now holds four batches the owner committed and discarded on
  // 2026-08-10 — real records, and a spec that demands they not exist is asserting that the
  // owner never used the importer.
  //
  // What is still true and still worth asserting: THIS SPEC leaves them exactly as it found
  // them. The baselines come from an independent query in beforeAll, before any test in this
  // file runs, so the comparison spans every test above — it is not a value read twice in the
  // same breath.
  const unchanged: [string, string][] = [
    ["staged import batches", "select count(*) from asan_import_batches"],
    ["staged person rows", "select count(*) from asan_import_person_rows"],
    ["staged product rows", "select count(*) from asan_import_product_rows"],
    ["minted Asan numbers", "select count(*) from asan_export_numbers"],
    ["video chains", "select count(*) from product_video_chain"],
    ["delivery receipts", "select count(*) from delivery_receipts"],
    ["product catalogue", "select count(*) from products"],
    ["persons", "select count(*) from persons"],
    [
      "Asan person codes",
      "select count(*) from person_identifiers where kind = 'asan_person_code'",
    ],
  ];
  for (const [label, sql] of unchanged) {
    expect(Number(dbScalar(sql)), `${label} — unchanged by this spec`).toBe(survivors[label]);
  }
});

// -------------------------------- item 8: one document of each type, opened with openpyxl ----

test("5.2/8 — export 1 (sales) produces a real file whose header matches the spec", async () => {
  const res = await rest<InvoiceExportRow[]>(adminJwt, "/rpc/asan_list_sales_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  const docs = groupInvoiceRows(res.body ?? [], new Map()).filter((d) => !d.blockedReason);
  expect(docs.length, "at least one sales invoice must be exportable").toBeGreaterThan(0);

  const rows = buildInvoiceRows(docs[0].payload as never, 1);
  const aoa = await writeSample("1-sales", SALES_HEADERS, rows);

  for (let i = 0; i < 18; i++) {
    expect(aoa[0][i] ?? "", `sales column ${String.fromCharCode(65 + i)}`).toBe(SALES_HEADERS[i]);
  }
  expect(aoa.length - 1, "one row per line").toBe(docs[0].rowCount);
  // The unit, one last time, against the database.
  const toman = Number(
    dbScalar(`select final_amount from sales_quotes where id = '${docs[0].sourceId}'`),
  );
  expect(
    aoa.slice(1).reduce((s, r) => s + (typeof r[7] === "number" ? r[7] : 0), 0),
    "sum(H) is exactly the AfraKala total x 10",
  ).toBe(toman * 10);
});

test("5.2/8b — export 2 (purchase) produces a real file whose header matches the spec", async () => {
  // Every purchase is blocked today (no supplier has an Asan code), which is the correct answer
  // rather than a broken one. The LAYOUT is still proved: a header-only file is a real xlsx with
  // the right eighteen columns, and that is what the accountant would receive.
  const res = await rest<InvoiceExportRow[]>(adminJwt, "/rpc/asan_list_purchase_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  const all = groupInvoiceRows(res.body ?? [], new Map());
  const exportable = all.filter((d) => !d.blockedReason);
  const rows = exportable.length ? buildInvoiceRows(exportable[0].payload as never, 1) : [];

  const aoa = await writeSample("2-purchase", PURCHASE_HEADERS, rows);
  for (let i = 0; i < 18; i++) {
    expect(aoa[0][i] ?? "", `purchase column ${String.fromCharCode(65 + i)}`).toBe(
      PURCHASE_HEADERS[i],
    );
  }
  expect(aoa[0][10], "the purchase tab has پرداخت چک where sales is blank").toBe("پرداخت چک");
  // Say plainly what the file contains rather than letting an empty file look like a pass.
  expect(all.length, "there ARE purchases in range; they are blocked, not missing").toBeGreaterThan(
    0,
  );
});

test("5.2/8c — exports 3/4/5 (accounting document) produce a real file whose header matches", async () => {
  const res = await rest<JournalExportRow[]>(adminJwt, "/rpc/asan_list_journal_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to, _filter: "all" }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  const docs = groupJournalRows(res.body ?? [], new Map()).filter((d) => !d.blockedReason);
  expect(docs.length, "at least one accounting document must be exportable").toBeGreaterThan(0);

  const rows = buildJournalRows(docs[0].payload as never);
  const aoa = await writeSample("3-accounting-document", JOURNAL_HEADERS, rows);

  expect(aoa[0]).toEqual([...JOURNAL_HEADERS]);
  // The invariant that matters most in this layout.
  const sumE = aoa.slice(1).reduce((s, r) => s + (typeof r[4] === "number" ? r[4] : 0), 0);
  const sumF = aoa.slice(1).reduce((s, r) => s + (typeof r[5] === "number" ? r[5] : 0), 0);
  expect(sumE, "the exported document balances").toBe(sumF);
  expect(sumE).toBeGreaterThan(0);
});

test("5.2/8d — the secondary bank-deposit file matches the Latin layout", async () => {
  const res = await rest<BankDepositRow[]>(adminJwt, "/rpc/asan_list_bank_deposit_export", {
    method: "POST",
    body: JSON.stringify({ _from: FULL_RANGE.from, _to: FULL_RANGE.to }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  const docs = groupBankDepositRows(res.body ?? []).filter((d) => !d.blockedReason);
  expect(docs.length).toBeGreaterThan(0);

  const rows = buildBankDepositRows(docs[0].payload as never);
  const aoa = await writeSample("4-bank-deposits", BANK_DEPOSIT_HEADERS, rows);

  // The six NAMED headers, byte-for-byte, as measured from the real Asan .xlsx on
  // 2026-08-26 -- `Name_Moshtare` and `Shopmare_Peygeri`, both legacy-intentional.
  expect(aoa[0].slice(0, 6)).toEqual([...BANK_DEPOSIT_HEADERS].slice(0, 6));

  // 15 columns, matching the real template's max_col. THE DEVIATION IS RECORDED RATHER THAN
  // ASSERTED AWAY (OG-69): the owner's template has G-O as empty STRINGS, and this writer
  // produces cells that `openpyxl` -- the same tool the template was measured with -- reads
  // back as `None`. The column COUNT is right and is what Asan's importer positions on; the
  // cell TYPE is not proven equal. Asserting `''` here would assert something untrue, and
  // asserting `None` would assert this implementation rather than the template, so this
  // asserts only the part that is measured true.
  expect(aoa[0].length, "15 columns like the real template").toBe(15);
  for (let c = 6; c < 15; c += 1) {
    expect(String(aoa[0][c] ?? ""), `column ${c} carries no header text`).toBe("");
  }
  expect(aoa.length).toBe(2);
});

test("5.2/8e — every sample file is a real xlsx and every header matches asan-layouts.md", () => {
  // The four files above, re-read from disk as a set — the owner can open exactly these.
  const spec = fs.readFileSync(path.resolve("docs/asan/asan-layouts.md"), "utf8");
  const files = fs.readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".xlsx"));
  expect(files.length, "one sample per layout").toBe(4);

  for (const f of files) {
    const full = path.join(SAMPLE_DIR, f);
    const head = fs.readFileSync(full).subarray(0, 4);
    expect([...head], `${f}: zip magic bytes`).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const aoa = readWithOpenpyxl(full);
    for (const h of aoa[0]) {
      if (h === null || String(h) === "") continue;
      // Every header written must appear verbatim in the verified specification document.
      expect(spec, `${f}: header «${h}» is not in asan-layouts.md`).toContain(String(h));
    }
  }
});

// ------------------------------------------------- item 7: Persian was never re-corrupted ----

test("5.2/7 — nothing this program wrote re-corrupted Persian text", () => {
  // M1.1 repaired 687 values. The scan's buckets A and B must still be empty: any function or
  // config value this program wrote that lost its Persian would show up here.
  const corrupted = dbRows(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'asan_%' and pg_get_functiondef(p.oid) like '%?%'",
  );
  expect(corrupted, "no asan_* function body may contain an ASCII question mark").toEqual([]);

  const videoFns = dbRows(
    "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'product_video%' and pg_get_functiondef(p.oid) like '%?%'",
  );
  expect(videoFns).toEqual([]);

  // The rows this program inserted with Persian in them.
  expect(
    Number(dbScalar("select count(*) from product_service_types where name_fa like '%?%'")),
  ).toBe(0);
  expect(
    Number(dbScalar("select count(*) from category_required_services where display_text like '%?%'")),
  ).toBe(0);
  expect(
    Number(dbScalar("select count(*) from asan_control_accounts where label_fa like '%?%'")),
  ).toBe(0);

  // And the 15 bucket-C rows M1.1 deliberately left alone are still exactly 15 — neither
  // silently "fixed" by this program nor grown.
  expect(
    Number(dbScalar("select count(*) from journal_entries where description like '%?%'")),
    "the one bucket-C financial description, untouched",
  ).toBe(1);
});
