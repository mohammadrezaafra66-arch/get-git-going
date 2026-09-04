import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

import {
  ASAN_EXPORT_BATCH_LIMIT,
  EMPTY_SELECTION,
  buildExportRowGroups,
  countEligibleSelected,
  flattenExportRows,
  countTicked,
  isTicked,
  paginate,
  splitForExport,
  tickAllEligible,
  tickAllMatching,
  tickPage,
  toggle,
  untickAllMatching,
  untickPage,
  type ExportSelection,
} from "../../src/lib/asan/export-selection";
import {
  BANK_DEPOSIT_HEADERS,
  JOURNAL_HEADERS,
  LAYOUT_HEADERS,
  PURCHASE_HEADERS,
  SALES_HEADERS,
} from "../../src/lib/asan/layouts";
import { buildAsanWorkbook } from "../../src/lib/asan/write-xlsx";
import {
  cellText,
  firstSheetName,
  rawCell,
  sharedStrings,
  sheetDataXml,
} from "../helpers/xlsx-raw";
import {
  AsanExportNotAvailableError,
  notBuiltYet,
  type AsanCell,
  type AsanExportDocument,
} from "../../src/lib/asan/export-types";
import { tomanToRial, AmountConversionError } from "../../src/lib/asan/amounts";
import { isAsanDate, isoToJalaliAsan, toAsciiDigits } from "@/lib/asan/dates";
import { ASAN_EXPORTS, ASAN_EXPORT_ORDER } from "@/lib/asan/export-registry";

/**
 * ASAN M4.2 — the shared export shell.
 *
 * What this phase actually promises, and therefore what is asserted here:
 *
 *   * every row is ticked by default, and unticking survives paging and page-size changes;
 *   * "this page" and "all N matching" are different controls and must not be conflated;
 *   * a blocked document is visible with its reason and absent from the file — neither
 *     silently dropped nor allowed to fail the whole export;
 *   * the four layouts are reproduced character for character, including the sales layout's
 *     deliberately-blank column K, which must still occupy its position;
 *   * amounts are Rial (Toman × 10) written as real numbers;
 *   * only admin and accountant may reach the page or consume Asan numbers.
 *
 * The selection model is deliberately pure, so the semantics above are asserted directly
 * rather than inferred from clicking. That is not a shortcut around the browser: the two
 * select-all controls are precisely where a browser test proves the *widget* works while the
 * *rule* underneath is wrong. The page's own guards are asserted in a real browser at the end,
 * and a source-level tripwire ties the page to the functions tested here so the two cannot
 * drift apart.
 *
 * No export is `available` yet — 4.3 through 4.7 flip them on one at a time — so the file
 * pipeline is exercised through a definition constructed in this spec. That is the honest
 * shape: the shell is what is under test in this phase, and the shell is what knows nothing
 * about any particular export.
 */

const MARK = `${E2E_PREFIX}ASAN_SHELL`;
const ROUTE = "/admin/asan-export";
const PAGE_TITLE = "خروجی برای آسان";

/** Fake source ids. Numbering deliberately does not require the document to exist (M4.1). */
const BATCH_A = "bbbbbbbb-0000-4000-8000-00000000000a";
const BATCH_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const BATCH_C = "bbbbbbbb-0000-4000-8000-00000000000c";
const DENIED = "bbbbbbbb-0000-4000-8000-0000000000de";
const ALL_FAKE = [BATCH_A, BATCH_B, BATCH_C, DENIED];

let adminJwt: string;
let salesJwt: string | null = null;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `doc-${String(i).padStart(3, "0")}`);

function doc(sourceId: string, blockedReason: string | null = null): AsanExportDocument {
  return {
    sourceId,
    title: sourceId,
    dateIso: "2026-08-04",
    partyName: "طرف حساب",
    totalToman: 1000,
    rowCount: 1,
    asanNumber: null,
    blockedReason,
    payload: null,
  };
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const salesUser = await userWithRole(adminJwt, "sales");
  salesJwt = salesUser ? mintJwt(salesUser) : null;
});

test.afterAll(() => {
  // Rule 2.10: the batch RPC really does mint numbers, so this phase really must give them back.
  dbExecE2e(
    `-- ${MARK} cleanup
     delete from asan_export_numbers where source_id in (${ALL_FAKE.map((x) => `'${x}'`).join(",")});`,
  );
  expect(
    Number(
      dbScalar(
        `select count(*) from asan_export_numbers where source_id in (${ALL_FAKE.map((x) => `'${x}'`).join(",")})`,
      ),
    ),
    "no Asan number minted by this phase may survive it",
  ).toBe(0);
});

// ---------------------------------------------------------------- selection ----

test.describe("what the accountant has ticked", () => {
  test("the default state is every row ticked", () => {
    const all = ids(7);
    expect(countTicked(all, EMPTY_SELECTION)).toBe(7);
    for (const id of all) expect(isTicked(EMPTY_SELECTION, id)).toBe(true);
    // A row nobody has ever seen is ticked by construction, not by having been added to a set.
    expect(isTicked(EMPTY_SELECTION, "a-row-that-was-never-listed")).toBe(true);
  });

  test("unticking survives a page-size change that moves the row off screen", () => {
    const all = ids(30);
    // Page 3 of 10 holds doc-020..029. Untick one of them, then show 25 per page: the row is
    // now on page 1, and later on page 2 — it must stay unticked throughout.
    let sel: ExportSelection = toggle(EMPTY_SELECTION, "doc-022");
    expect(isTicked(sel, "doc-022")).toBe(false);
    expect(countTicked(all, sel)).toBe(29);

    for (const size of [10, 25, 100, 1]) {
      const pages = Math.ceil(all.length / size);
      for (let p = 1; p <= pages; p++) {
        const view = paginate(all, p, size);
        for (const id of view.items) {
          expect(isTicked(sel, id), `${id} at size ${size}`).toBe(id !== "doc-022");
        }
      }
    }

    // And a second untick on a different page does not resurrect the first.
    sel = toggle(sel, "doc-004");
    expect(countTicked(all, sel)).toBe(28);
    expect(isTicked(sel, "doc-022")).toBe(false);
  });

  test('"this page" touches only the page currently displayed', () => {
    const all = ids(30);
    const page2 = paginate(all, 2, 10).items;
    expect(page2).toEqual(ids(30).slice(10, 20));

    const sel = untickPage(EMPTY_SELECTION, page2);
    expect(countTicked(all, sel), "only the ten rows on page 2 are affected").toBe(20);
    for (const id of page2) expect(isTicked(sel, id)).toBe(false);
    for (const id of paginate(all, 1, 10).items) expect(isTicked(sel, id)).toBe(true);
    for (const id of paginate(all, 3, 10).items) expect(isTicked(sel, id)).toBe(true);

    // Ticking page 1 must not silently re-tick page 2 as well.
    const back = tickPage(sel, paginate(all, 1, 10).items);
    expect(countTicked(all, back)).toBe(20);
  });

  test('"all N matching" touches every page — and is a different operation', () => {
    const all = ids(30);
    const none = untickAllMatching(all);
    expect(countTicked(all, none)).toBe(0);

    const everything = tickAllMatching();
    expect(countTicked(all, everything)).toBe(30);

    // The distinction the brief insists on: unticking one page leaves 20 selected; unticking
    // all leaves 0. If these two were the same control the accountant could not tell the
    // difference until the file was already in Asan.
    expect(countTicked(all, untickPage(EMPTY_SELECTION, paginate(all, 1, 10).items))).toBe(20);
    expect(countTicked(all, untickAllMatching(all))).toBe(0);
  });

  test("a page-size change that leaves the page past the end is clamped, not empty", () => {
    const all = ids(30);
    const view = paginate(all, 3, 100);
    expect(view.page).toBe(1);
    expect(view.pageCount).toBe(1);
    expect(view.items.length).toBe(30);
    expect(paginate(all, 0, 10).page, "page 0 is not a page").toBe(1);
    expect(paginate([], 1, 10).pageCount, "an empty result still has one page").toBe(1);
  });

  test("a blocked row is never exported, whatever its tick says", () => {
    const docs = [doc("a"), doc("b", "کد آسان مشتری ثبت نشده است"), doc("c")];
    // Ticked — the accountant asked for it — and still not exportable. The tick is intent;
    // blocked is the system's verdict, and the verdict wins.
    const split = splitForExport(docs, EMPTY_SELECTION);
    expect(split.exportable.map((d) => d.sourceId)).toEqual(["a", "c"]);
    expect(split.blocked.map((d) => d.sourceId)).toEqual(["b"]);
    expect(split.skipped).toEqual([]);
    expect(split.blocked[0].blockedReason, "the reason must be shown, not swallowed").toBe(
      "کد آسان مشتری ثبت نشده است",
    );

    // Unticking a good row moves it to `skipped`, not to `blocked`: they are different states
    // and the preview tells the accountant which is which.
    const withSkip = splitForExport(docs, toggle(EMPTY_SELECTION, "c"));
    expect(withSkip.exportable.map((d) => d.sourceId)).toEqual(["a"]);
    expect(withSkip.skipped.map((d) => d.sourceId)).toEqual(["c"]);
    expect(withSkip.blocked.map((d) => d.sourceId)).toEqual(["b"]);
  });

  test("«انتخاب همه نتایج قابل خروجی» ticks eligible rows only", () => {
    const docs = [doc("a"), doc("b", "کد آسان مشتری ثبت نشده است"), doc("c")];
    const sel = tickAllEligible(docs);
    expect(isTicked(sel, "a")).toBe(true);
    expect(isTicked(sel, "b")).toBe(false);
    expect(isTicked(sel, "c")).toBe(true);
    expect(countEligibleSelected(docs, sel)).toBe(2);
    expect(countTicked(["a", "b", "c"], sel)).toBe(2);
    expect(ASAN_EXPORT_BATCH_LIMIT).toBe(1000);
    // split must match the eligible-selected set
    expect(splitForExport(docs, sel).exportable.map((d) => d.sourceId)).toEqual(["a", "c"]);
  });
});

// ------------------------------------------------------------------ layouts ----

test.describe("the layouts are the contract with Asan", () => {
  test("every header is reproduced character for character", () => {
    expect(SALES_HEADERS.length).toBe(18);
    expect(PURCHASE_HEADERS.length).toBe(18);
    expect(JOURNAL_HEADERS.length).toBe(6);
    // 15, not 6: the real template is 15 columns wide, G-O being empty strings.
    expect(BANK_DEPOSIT_HEADERS.length).toBe(15);

    expect([...SALES_HEADERS]).toEqual([
      "شماره فاکتور",
      "تاریخ",
      "کدشخص",
      "کد کالا",
      "نام کالا",
      "تعداد",
      "مبلغ ق",
      "مبلغ کل",
      "دریافت نقد",
      "واریز به بانک",
      "",
      "تخفیف",
      "عوارض",
      "نام حساب",
      "گروه حساب/کد۲",
      "سریال کد کالا",
      "بارکد کالا",
      "تلفن/کد۳",
    ]);

    // Purchase differs from sales in exactly three positions — I, J, K — and nowhere else.
    const differing = SALES_HEADERS.map((h, i) => (h === PURCHASE_HEADERS[i] ? null : i)).filter(
      (i) => i !== null,
    );
    expect(differing).toEqual([8, 9, 10]);
    expect(PURCHASE_HEADERS[8]).toBe("پرداخت نقد");
    expect(PURCHASE_HEADERS[9]).toBe("پرداخت از بانک");
    expect(PURCHASE_HEADERS[10]).toBe("پرداخت چک");

    expect([...JOURNAL_HEADERS]).toEqual(["کد حساب", "کد کالا", "شرح", "تعداد", "بدهکار", "بستانکار"]);
    // Latin transliterations, reproduced as the REAL TEMPLATE writes them — not translated
    // and not spell-corrected. Corrected 2026-08-26 from the owner's actual .xlsx, read cell
    // by cell: `Name_Moshtare` and `Shopmare_Peygeri`. Both look wrong and both are
    // legacy-intentional in Asan; this spec previously asserted the "corrected" pair and was
    // the thing keeping the wrong headers in place. G-O are empty strings, not absent cells.
    expect([...BANK_DEPOSIT_HEADERS]).toEqual([
      "Date",
      "Code_M",
      "Name_Moshtare",
      "Shopmare_Peygeri",
      "Mablagh",
      "Bank_cod",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);

    // No header may carry stray whitespace or a Persian-digit character that a copy-paste
    // would have introduced; either would import into the wrong column.
    for (const [key, headers] of Object.entries(LAYOUT_HEADERS)) {
      for (const h of headers) {
        expect(h, `${key}: header padded with whitespace`).toBe(h.trim());
        expect(h.includes("?"), `${key}: '?' means Persian text was corrupted`).toBe(false);
      }
    }
  });

  test("the sales layout's blank column K holds its position in a real file", async () => {
    // The actual risk: an unnamed column collapsing and shifting L..R one place left, which
    // would post تخفیف into the نام حساب field. Sentinels make a shift visible.
    const row: AsanCell[] = SALES_HEADERS.map((_, i) => `S${i}`);
    const bytes = await buildAsanWorkbook({ headers: SALES_HEADERS, rows: [row] });
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

    expect(aoa[0].length, "the header row must still be 18 wide").toBe(18);
    expect(aoa[0][10] ?? "", "column K is blank, and blank is not the same as absent").toBe("");
    for (let i = 0; i < 18; i++) {
      if (i === 10) continue;
      expect(aoa[0][i], `header ${i}`).toBe(SALES_HEADERS[i]);
    }
    // Every data cell is where it was written, especially L..R after the blank header.
    expect(aoa[1]).toEqual(row);
    expect(aoa[1][11], "تخفیف must not have shifted into column K").toBe("S11");
    expect(aoa[1][17]).toBe("S17");
  });

  test("amounts are written as numbers, never as formatted strings", async () => {
    const bytes = await buildAsanWorkbook({
      headers: JOURNAL_HEADERS,
      rows: [["8", null, "شرح", null, 12_340_000, null]],
    });
    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // `t` is the cell type: 'n' number, 's' string. A string with separators is not summable
    // and a Persian-digit string is not even a number to Excel.
    expect(ws["E2"].t, "بدهکار must be a numeric cell").toBe("n");
    expect(ws["E2"].v).toBe(12_340_000);
    expect(ws["A2"].t, "an account code is a code, not a quantity").toBe("s");
    expect(ws["F2"], "a null amount is an empty cell, not a zero").toBeUndefined();
  });
});

// ------------------------------------------------------------------- amounts ----

test.describe("the currency unit — Toman × 10 = Rial", () => {
  test("conversion is exact integer arithmetic", () => {
    expect(tomanToRial(1)).toBe(10);
    expect(tomanToRial(1234)).toBe(12_340);
    expect(tomanToRial(0), "zero converts to zero, and is not treated as absent").toBe(0);
    expect(tomanToRial(123_456_789)).toBe(1_234_567_890);
    // The largest amount this business plausibly writes, still exact in IEEE-754.
    expect(tomanToRial(9_007_199_254_74)).toBe(9_007_199_254_740);
  });

  test("an inapplicable amount stays empty rather than becoming zero", () => {
    // Asan's `بدون مبلغ حذف شود` drops zero-amount rows, so writing 0 for "not applicable"
    // changes what Asan imports.
    expect(tomanToRial(null)).toBeNull();
    expect(tomanToRial(undefined)).toBeNull();
  });

  test("a fractional Toman value is refused, never silently rounded", () => {
    expect(() => tomanToRial(10.5)).toThrow(AmountConversionError);
    expect(() => tomanToRial(Number.NaN)).toThrow(AmountConversionError);
    expect(() => tomanToRial(Number.POSITIVE_INFINITY)).toThrow(AmountConversionError);
  });

  test("no amount column on the live database carries a fraction", () => {
    // The refusal above is only safe because this is true. If it ever stops being true, the
    // export starts throwing rather than quietly posting a rounded number — but the owner
    // should learn it here first.
    expect(
      Number(
        dbScalar(
          "select count(*) from sales_quotes where final_amount is not null and final_amount <> trunc(final_amount)",
        ),
      ),
      "a fractional Toman amount would make tomanToRial throw at export time",
    ).toBe(0);
  });
});

// --------------------------------------------------------------------- dates ----

test("dates are Jalali YYYY/MM/DD in Latin digits", () => {
  const out = isoToJalaliAsan("2026-08-03");
  expect(isAsanDate(out), `${out} is not Asan's date format`).toBe(true);
  expect(out).toBe("1405/05/12");
  expect(/[۰-۹]/.test(out), "the app's own formatter emits Persian digits; this one must not").toBe(
    false,
  );
  // Zero padding, because `1405/5/2` is a different string to Asan's parser.
  expect(isoToJalaliAsan("2026-03-21")).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  expect(isoToJalaliAsan(null)).toBe("");
  expect(isoToJalaliAsan("not-a-date")).toBe("");
  expect(toAsciiDigits("۱۴۰۵/۰۵/۱۲")).toBe("1405/05/12");
  expect(toAsciiDigits("٠٩١٢")).toBe("0912");
});

// ------------------------------------------------------------------ registry ----

test.describe("the export catalogue", () => {
  test("an export that is not built refuses to produce a file", () => {
    for (const key of ASAN_EXPORT_ORDER) {
      const def = ASAN_EXPORTS[key];
      if (def.available) continue;
      // Not an empty file and not a guessed layout — an error naming the export.
      expect(() => def.buildRows(doc("x"), 1)).toThrow(AsanExportNotAvailableError);
      try {
        def.buildRows(doc("x"), 1);
      } catch (e) {
        expect((e as Error).message).toContain(def.label);
        expect((e as Error).message).toContain("هنوز ساخته نشده");
      }
    }
  });

  test("every export names a real layout and its numbering register", () => {
    expect(ASAN_EXPORT_ORDER.length).toBe(7);
    expect(new Set(ASAN_EXPORT_ORDER).size).toBe(7);
    for (const key of ASAN_EXPORT_ORDER) {
      const def = ASAN_EXPORTS[key];
      expect(def.key).toBe(key);
      expect(LAYOUT_HEADERS[def.layout], `${key} names an unknown layout`).toBeTruthy();
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.targetScreen.length, `${key} must say which Asan screen it targets`).toBeGreaterThan(
        0,
      );
      if (def.docType) {
        expect(["sales_invoice", "purchase_invoice", "accounting_document"]).toContain(def.docType);
      }
    }
  });

  test("no export limits a file to one document any more", () => {
    // Layout 3 has no `شماره سند` column, and until 2026-09-04 that was read as "so a file may
    // hold only one document" — the accounting-document exports carried `oneDocumentPerFile:
    // true` and the page refused a larger selection. The owner established that **Asan assigns
    // the document number itself at posting**, so the platform's number never reaches the file
    // and there is nothing for a second document to collide with. The flag is gone; this asserts
    // it has not come back, under that name or as the orphan constant beside it.
    for (const key of ["receipts", "payments", "third_party", "purchase_settlement"] as const) {
      expect(ASAN_EXPORTS[key].layout).toBe("journal");
    }
    for (const key of ASAN_EXPORT_ORDER) {
      expect(
        Object.keys(ASAN_EXPORTS[key]),
        `${key} still declares a one-document limit`,
      ).not.toContain("oneDocumentPerFile");
    }
    const layouts = fs.readFileSync(path.resolve("src/lib/asan/layouts.ts"), "utf8");
    expect(layouts, "the orphan JOURNAL_ONE_DOCUMENT_PER_FILE constant is deleted").not.toContain(
      "JOURNAL_ONE_DOCUMENT_PER_FILE",
    );
    const types = fs.readFileSync(path.resolve("src/lib/asan/export-types.ts"), "utf8");
    expect(types).not.toContain("oneDocumentPerFile");
  });

  test("many documents go into one sheet, and each row still knows which document it came from", async () => {
    // The behavioural half. Two documents, one workbook — and the grouping that makes a later
    // per-document split cheap is asserted rather than assumed, because a flat concatenation
    // loses the boundary silently.
    const def = {
      ...notBuiltYet("sales", "قالب آزمایشی", "—", "sales", "sales_invoice"),
      available: true,
      buildRows: (d: AsanExportDocument, n: number | null): AsanCell[][] => [
        [
          n,
          "1405/05/12",
          d.sourceId,
          null,
          `کالای ${d.sourceId}`,
          1,
          1000,
          1000,
          ...Array(10).fill(null),
        ],
        [
          n,
          "1405/05/12",
          d.sourceId,
          null,
          `ردیف دوم ${d.sourceId}`,
          2,
          500,
          1000,
          ...Array(10).fill(null),
        ],
      ],
    };
    const docs = [doc("multi-a"), doc("multi-b")];
    const split = splitForExport(docs, EMPTY_SELECTION);
    expect(split.exportable.length, "both documents are selected").toBe(2);

    const numbers = new Map([
      ["multi-a", 11],
      ["multi-b", 12],
    ]);
    const groups = buildExportRowGroups(split.exportable, numbers, (d, n) => def.buildRows(d, n));
    expect(groups.map((g) => g.sourceId)).toEqual(["multi-a", "multi-b"]);
    expect(groups.map((g) => g.asanNumber)).toEqual([11, 12]);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 2]);

    const rows = flattenExportRows(groups);
    expect(rows.length, "one sheet, four rows, two documents").toBe(4);

    const bytes = Buffer.from(await buildAsanWorkbook({ headers: SALES_HEADERS, rows }));
    expect(firstSheetName(bytes)).toBe("Sheet1");
    const sst = sharedStrings(bytes);
    expect(sst, "Asan drops every text cell without a real shared-string table").not.toBeNull();
    const data = sheetDataXml(bytes);
    // Both documents are in the file, and their text arrived as shared strings (`t="s"`), never
    // as the `t="str"` cached-formula type Asan silently discards.
    for (const ref of ["C2", "C3", "C4", "C5"]) {
      expect(rawCell(data, ref)?.t, `${ref} must be a shared string`).toBe("s");
    }
    expect([cellText(bytes, data, "C2"), cellText(bytes, data, "C3")]).toEqual([
      "multi-a",
      "multi-a",
    ]);
    expect([cellText(bytes, data, "C4"), cellText(bytes, data, "C5")]).toEqual([
      "multi-b",
      "multi-b",
    ]);
    expect(sst).toContain("کالای multi-b");
  });

  test("a blocked document is absent from the file while the rest still export", async () => {
    // The whole pipeline the page uses, with a definition standing in for a real export:
    // list → split → buildRows → workbook. A blocked row must neither appear in the file nor
    // stop the other rows from being written.
    const def = {
      ...notBuiltYet("sales", "قالب آزمایشی", "—", "sales", "sales_invoice"),
      available: true,
      buildRows: (d: AsanExportDocument, n: number | null): AsanCell[][] => [
        [n, "1405/05/12", d.sourceId, null, "کالا", 1, 1000, 1000, ...Array(10).fill(null)],
      ],
    };
    const docs = [doc("ok-1"), doc("blocked-1", "کد آسان شخص ثبت نشده است"), doc("ok-2")];
    const split = splitForExport(docs, EMPTY_SELECTION);

    const rows: AsanCell[][] = [];
    split.exportable.forEach((d, i) => rows.push(...def.buildRows(d, i + 1)));
    const bytes = await buildAsanWorkbook({ headers: SALES_HEADERS, rows });

    const XLSX = await import("xlsx");
    const wb = XLSX.read(Buffer.from(bytes), { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(
      wb.Sheets[wb.SheetNames[0]],
      { header: 1, raw: true, defval: null },
    );
    expect(aoa.length, "header + two exportable rows").toBe(3);
    const written = aoa.slice(1).map((r) => r[2]);
    expect(written).toEqual(["ok-1", "ok-2"]);
    expect(written).not.toContain("blocked-1");
    // And it is not lost: it is reported, with its reason, for the accountant to fix.
    expect(split.blocked.map((d) => d.blockedReason)).toEqual(["کد آسان شخص ثبت نشده است"]);
  });
});

// -------------------------------------------------------- batch numbering RPC ----

test.describe("assigning Asan numbers to a whole export", () => {
  const batch = (jwt: string, docType: string, list: string[]) =>
    rest<{ source_id: string; asan_number: number }[]>(jwt, "/rpc/asan_assign_document_numbers", {
      method: "POST",
      body: JSON.stringify({ _doc_type: docType, _ids: list }),
    });

  test("a batch is numbered in one transaction, in a predictable order", async () => {
    const before = Number(
      dbScalar(
        "select coalesce(max(asan_number), 0) from asan_export_numbers where doc_type='sales_invoice'",
      ),
    );
    const res = await batch(adminJwt, "sales_invoice", [BATCH_C, BATCH_A, BATCH_B]);
    expect(res.status, res.text).toBeLessThan(300);

    const got = new Map((res.body ?? []).map((r) => [r.source_id, r.asan_number]));
    expect(got.size).toBe(3);
    // Numbered by id order, not by whatever order the client happened to send.
    expect(got.get(BATCH_A)).toBe(before + 1);
    expect(got.get(BATCH_B)).toBe(before + 2);
    expect(got.get(BATCH_C)).toBe(before + 3);

    const all = dbRows(
      `select asan_number from asan_export_numbers where source_id in ('${BATCH_A}','${BATCH_B}','${BATCH_C}')`,
    );
    expect(new Set(all).size, "no two documents in a batch share a number").toBe(3);
  });

  test("re-exporting the same batch returns the same numbers and mints nothing", async () => {
    const first = await batch(adminJwt, "sales_invoice", [BATCH_A, BATCH_B, BATCH_C]);
    const rowsBefore = Number(dbScalar("select count(*) from asan_export_numbers"));
    const second = await batch(adminJwt, "sales_invoice", [BATCH_A, BATCH_B, BATCH_C]);
    expect(second.status, second.text).toBeLessThan(300);
    expect(second.body).toEqual(first.body);
    expect(
      Number(dbScalar("select count(*) from asan_export_numbers")),
      "a second export must not create a second mapping row",
    ).toBe(rowsBefore);
  });

  test("an empty selection is a no-op rather than an error", async () => {
    const rowsBefore = Number(dbScalar("select count(*) from asan_export_numbers"));
    const res = await batch(adminJwt, "sales_invoice", []);
    expect(res.status, res.text).toBeLessThan(300);
    expect(res.body ?? []).toEqual([]);
    expect(Number(dbScalar("select count(*) from asan_export_numbers"))).toBe(rowsBefore);
  });

  test("a salesperson cannot number an export, and the whole batch rolls back", async () => {
    test.skip(!salesJwt, "no sales user on this server");
    const res = await batch(salesJwt!, "sales_invoice", [DENIED]);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("اجازهٔ شماره‌گذاری");
    expect(
      Number(dbScalar(`select count(*) from asan_export_numbers where source_id = '${DENIED}'`)),
      "a refused batch must leave no partial numbering behind",
    ).toBe(0);
  });

  test("the batch function is a loop over the single-document function, not a second implementation", () => {
    // The rules that matter — idempotency, the advisory lock, the permission check — live in
    // `asan_assign_document_number`. A batch that reimplemented them would drift from it.
    const def = dbScalar(
      "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'asan_assign_document_numbers'",
    );
    expect(def).toContain("public.asan_assign_document_number(_doc_type, _id)");
    expect(def, "no second max+1 anywhere").not.toContain("MAX(asan_number)");
    expect(def, "no second INSERT anywhere").not.toContain("INSERT INTO");
  });
});

// ------------------------------------------------------------------- access ----

test.describe("who may export", () => {
  test("role_permissions has a row for every role, and can_view is exactly admin + accountant", () => {
    // Rule 2.5: `has_dynamic_permission` grants a module with NO row at all to every role, so
    // an unseeded module is an open door. The count must equal the number of roles in the table.
    const roles = Number(dbScalar("select count(distinct role_name) from role_permissions"));
    expect(roles).toBeGreaterThanOrEqual(7);
    expect(
      Number(dbScalar("select count(*) from role_permissions where module = 'asan-export'")),
      "every role needs an explicit row, including the ones being denied",
    ).toBe(roles);

    expect(
      dbRows(
        "select role_name from role_permissions where module='asan-export' and can_view order by role_name",
      ),
    ).toEqual(["accountant", "admin"]);
    expect(
      dbRows(
        "select role_name from role_permissions where module='asan-export' and can_export order by role_name",
      ),
    ).toEqual(["accountant", "admin"]);
  });

  test("the static permission matrix agrees with what the migration seeded", () => {
    // The M3.3 lesson: a fallback matrix that disagrees with the table is how a menu ends up
    // offering something the backend refuses. Only non-admin roles are compared, because
    // `hasPermission` short-circuits to true for admin whatever the matrix says.
    const src = fs.readFileSync(path.resolve("src/lib/rbac/roles.ts"), "utf8");
    const block = src.slice(src.indexOf('"asan-export": {'));
    expect(block.slice(0, block.indexOf("}"))).toContain('view: ["admin", "accountant"]');

    const seededView = new Set(
      dbRows("select role_name from role_permissions where module='asan-export' and can_view"),
    );
    for (const role of dbRows("select distinct role_name from role_permissions")) {
      if (role === "admin") continue;
      const staticSays = block.slice(0, block.indexOf("}")).includes(`"${role}"`);
      expect(staticSays, `${role}: static matrix and migration 291 disagree`).toBe(
        seededView.has(role),
      );
    }
  });

  test("the page keeps the guards this phase depends on", () => {
    // A tripwire, so nobody quietly widens the route or forks the tested logic later.
    const route = fs.readFileSync(path.resolve("src/routes/_app.admin.asan-export.tsx"), "utf8");
    expect(route).toContain('requireAnyRole(["admin", "accountant"])');
    // The download path must go through the split tested above, not its own filter.
    expect(route).toContain("splitForExport");
    expect(route).toContain("split.exportable");
    expect(route).toContain("tickAllEligible");
    expect(route).toContain("ASAN_EXPORT_BATCH_LIMIT");
    expect(route).toContain("برای اسناد انتخاب‌شده شماره خروجی آسان ثبت می‌شود");
    // A blocked row's checkbox is disabled rather than merely ignored on download.
    expect(route).toContain("disabled={!!d.blockedReason}");
    // The unit is stated on screen — the owner asked for it explicitly, "do not make it silent".
    expect(route).toContain("AMOUNT_UNIT_LABEL_FA");
    // The one-document refusal is gone, and the rows are grouped per document on the way out.
    expect(route).not.toContain("oneDocumentPerFile");
    expect(route).not.toContain("هر فایل فقط یک سند دارد");
    expect(route).toContain("buildExportRowGroups");
    expect(route).toContain("flattenExportRows");
    // Numbers are consumed at download, never at preview.
    expect(route.indexOf("asan_assign_document_numbers")).toBeGreaterThan(
      route.indexOf("const download"),
    );

    const registry = fs.readFileSync(path.resolve("src/lib/navigation/registry.ts"), "utf8");
    expect(registry).toContain('"/admin/asan-export": ["admin", "accountant"]');
    // `adminOnly` reads as "admin or manager" (selectors.ts) — the wrong set for this page.
    const entry = registry.slice(registry.indexOf('to: "/admin/asan-export"'));
    expect(entry.slice(0, entry.indexOf("},"))).not.toContain("adminOnly");
  });
});

test.describe("the /admin/asan-export route in a real browser", () => {
  test("an admin reaches it, sees the unit stated, and opening it numbers nothing", async ({
    page,
  }) => {
    const before = Number(dbScalar("select count(*) from asan_export_numbers"));

    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    // The owner's requirement, on screen: "Keep the unit visible in the export UI".
    await expect(page.getByText("واحد مبلغ خروجی:")).toBeVisible();
    await expect(page.getByText("ریال", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("نوع خروجی")).toBeVisible();

    expect(
      Number(dbScalar("select count(*) from asan_export_numbers")),
      "a page that can consume Asan numbers must not consume one just by being opened",
    ).toBe(before);
  });

  test.describe("accountant", () => {
    test.use({ storageState: "e2e/auth/accountant.storage.json" });

    test("an accountant reaches it too — she is who it is for", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    });
  });

  test.describe("sales", () => {
    test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

    test("a salesperson never sees the page", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      // On page content, never on the URL: the shell renders before the guard resolves.
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
      await expect(page.getByText("واحد مبلغ خروجی:")).toHaveCount(0);
    });
  });

  test.describe("anonymous", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("an anonymous visitor never sees the page", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
    });
  });
});
