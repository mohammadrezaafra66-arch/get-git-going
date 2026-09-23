/**
 * Didar contact export parser. Header-driven (never by column index), same
 * machinery as the Asan person workbook (`parse-workbook.ts`).
 *
 * «آدرس» and «ادرس» are both accepted. Owner / view-permission columns are
 * ignored (D3 / D10). Landline is never treated as mobile.
 */

import { buildHeaderIndex, cell, isBlankRow } from "../asan/parse-workbook";

export const DIDAR_CONTACT_HEADERS = {
  didar_id: "کد دیدار مشتری",
  mobile: "تلفن همراه مشتری",
  last_name: "نام خانوادگی مشتری",
  title: "عنوان مشتری",
  first_name: "نام مشتری",
  company: "نام شرکت",
  landline: "تلفن ثابت مشتری",
  national_id: "کد ملی مشتری",
  address: "آدرس",
  address_alt: "ادرس",
} as const;

export type DidarContactField = keyof typeof DIDAR_CONTACT_HEADERS;

export type ParsedDidarContactRow = {
  /** 1-based spreadsheet row; header occupies row 1. */
  row_number: number;
  didar_id: string | null;
  mobile_raw: string | null;
  display_name: string | null;
  landline_raw: string | null;
  national_id_raw: string | null;
  address: string | null;
  company_name: string | null;
};

export type DidarParseResult = {
  rows: ParsedDidarContactRow[];
  mapping: Record<DidarContactField, string | null>;
  ignoredHeaders: string[];
  warnings: string[];
};

function pickDisplayName(parts: {
  lastName: string | null;
  title: string | null;
  firstName: string | null;
  company: string | null;
}): string | null {
  if (parts.lastName) return parts.lastName;
  if (parts.title) return parts.title;
  const combined = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  if (combined.length > 0) return combined;
  if (parts.company) return parts.company;
  return null;
}

/**
 * @param matrix rows of raw cell values; `matrix[0]` must be the header row.
 */
export function parseDidarContacts(matrix: unknown[][]): DidarParseResult {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {
      rows: [],
      mapping: {
        didar_id: null,
        mobile: null,
        last_name: null,
        title: null,
        first_name: null,
        company: null,
        landline: null,
        national_id: null,
        address: null,
        address_alt: null,
      },
      ignoredHeaders: [],
      warnings: ["فایل خالی است"],
    };
  }

  const header = matrix[0] ?? [];
  const { mapping, index, ignoredHeaders, warnings } = buildHeaderIndex(
    header,
    DIDAR_CONTACT_HEADERS,
  );

  if (index.mobile === null) {
    warnings.push("بدون ستون «تلفن همراه مشتری» امکان ورود وجود ندارد");
  }

  const at = (row: unknown[], field: DidarContactField): string | null => {
    const i = index[field];
    return i === null ? null : cell(row[i]);
  };

  const rows: ParsedDidarContactRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (isBlankRow(row)) continue;
    const lastName = at(row, "last_name");
    const title = at(row, "title");
    const firstName = at(row, "first_name");
    const company = at(row, "company");
    rows.push({
      row_number: r + 1,
      didar_id: at(row, "didar_id"),
      mobile_raw: at(row, "mobile"),
      display_name: pickDisplayName({ lastName, title, firstName, company }),
      landline_raw: at(row, "landline"),
      national_id_raw: at(row, "national_id"),
      address: at(row, "address") ?? at(row, "address_alt"),
      company_name: company,
    });
  }

  return { rows, mapping, ignoredHeaders, warnings };
}
