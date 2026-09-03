/**
 * Read entries out of an .xlsx (a zip) as RAW BYTES, without going through SheetJS.
 *
 * WHY THIS EXISTS. `XLSX.read` normalises what it parses: a cell written as the malformed
 * `t="str"` (cached-formula-result) type comes back reported as `t: "s"`, indistinguishable from a
 * real shared-string cell. That normalisation is exactly the property under test in
 * `og99-bank-export-matches-the-template.spec.ts` — Asan drops `t="str"` text cells on import and
 * keeps only the numbers. A test that reads through SheetJS therefore cannot fail on the defect,
 * which is how the original spec passed against broken output.
 *
 * NO NEW DEPENDENCY, DELIBERATELY. `fflate` is present in node_modules but only transitively, via
 * `jspdf`; leaning on it would let an unrelated dependency bump break this test. Node's own
 * `zlib.inflateRawSync` plus ~40 lines of zip walking has no such coupling.
 *
 * Only what the tests need is implemented: stored (method 0) and deflate (method 8) entries, sizes
 * taken from the central directory so a streaming data descriptor never has to be parsed.
 */
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

/** Byte offset of the End Of Central Directory record, searched from the back. */
function findEocd(buf: Buffer): number {
  // The EOCD is 22 bytes plus an optional comment of at most 0xffff.
  const earliest = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= earliest; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("not a zip: no end-of-central-directory record");
}

/** Every entry name in the archive, in central-directory order. */
export function zipEntryNames(zip: Buffer): string[] {
  const eocd = findEocd(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(p) !== CD_SIG) throw new Error(`bad central directory entry at ${p}`);
    const nameLen = zip.readUInt16LE(p + 28);
    names.push(zip.subarray(p + 46, p + 46 + nameLen).toString("utf8"));
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return names;
}

/** One entry's decompressed bytes as UTF-8 text, or null when the entry is absent. */
export function readZipEntry(zip: Buffer, entryName: string): string | null {
  const eocd = findEocd(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i += 1) {
    const nameLen = zip.readUInt16LE(p + 28);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === entryName) {
      const method = zip.readUInt16LE(p + 10);
      const compSize = zip.readUInt32LE(p + 20);
      const localOffset = zip.readUInt32LE(p + 42);
      // The local header repeats the name and extra fields, and its extra-field length can differ
      // from the central directory's — so read the payload start from the LOCAL header.
      const localNameLen = zip.readUInt16LE(localOffset + 26);
      const localExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const raw = zip.subarray(start, start + compSize);
      if (method === 0) return raw.toString("utf8");
      if (method === 8) return inflateRawSync(raw).toString("utf8");
      throw new Error(`unsupported zip compression method ${method} for ${entryName}`);
    }
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  return null;
}

/** The `<sheetData>…</sheetData>` slice of a worksheet, raw. */
export function sheetDataXml(zip: Buffer, sheetPath = "xl/worksheets/sheet1.xml"): string {
  const xml = readZipEntry(zip, sheetPath);
  if (xml === null) throw new Error(`${sheetPath} is not in the archive`);
  const open = xml.indexOf("<sheetData>");
  if (open === -1) return ""; // an empty sheet serialises as <sheetData/>
  return xml.slice(open, xml.indexOf("</sheetData>") + "</sheetData>".length);
}

/** The workbook's first sheet name, read out of `xl/workbook.xml`. */
export function firstSheetName(zip: Buffer): string {
  const xml = readZipEntry(zip, "xl/workbook.xml");
  if (xml === null) throw new Error("xl/workbook.xml is not in the archive");
  const m = /<sheet[^>]*\bname="([^"]*)"/.exec(xml);
  if (!m) throw new Error("no <sheet name=…> in xl/workbook.xml");
  return m[1];
}

/** The `<si>` string values of `xl/sharedStrings.xml`, in index order; null when absent. */
export function sharedStrings(zip: Buffer): string[] | null {
  const xml = readZipEntry(zip, "xl/sharedStrings.xml");
  if (xml === null) return null;
  // `<si><t>x</t></si>`, `<si><t/></si>` and `<si><t></t></si>` all occur in real files: Asan's own
  // template writes the empty string self-closing, SheetJS writes it as an empty pair.
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) => {
    const inner = m[1];
    const t = /<t[^>]*\/>/.test(inner) ? "" : /<t[^>]*>(.*?)<\/t>/s.exec(inner)?.[1];
    return (t ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  });
}

/**
 * One cell as the file actually stores it: its `t` attribute (absent for a bare number) and its
 * raw `<v>` payload — for a `t="s"` cell that payload is a shared-string INDEX, not the text.
 */
export function rawCell(
  sheetData: string,
  ref: string,
): { t: string | null; v: string | null } | null {
  const m = new RegExp(`<c r="${ref}"([^>]*)>(.*?)</c>|<c r="${ref}"([^>]*)/>`, "s").exec(sheetData);
  if (!m) return null;
  const attrs = m[1] ?? m[3] ?? "";
  const body = m[2] ?? "";
  const t = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? null;
  const v = /<v>(.*?)<\/v>/s.exec(body)?.[1] ?? null;
  return { t, v };
}

/** Resolve a cell to its text, following the shared-string table when the cell is `t="s"`. */
export function cellText(zip: Buffer, sheetData: string, ref: string): string | null {
  const c = rawCell(sheetData, ref);
  if (!c) return null;
  if (c.t === "s") {
    const sst = sharedStrings(zip);
    if (!sst) throw new Error(`cell ${ref} is t="s" but the archive has no sharedStrings.xml`);
    return sst[Number(c.v)] ?? null;
  }
  return c.v;
}
