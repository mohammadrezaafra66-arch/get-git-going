/**
 * Synthetic Asan person parser cases. Real customer data is never used.
 * Run: npx --yes tsx --test src/lib/asan/parse-persons.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAsanPersons } from "./parse-persons.ts";
import {
  ASAN_SAMPLE_HEADERS,
  ASAN_SAMPLE_REQUIRED_HEADERS,
  asanSampleMatrix,
} from "./sample-workbook.ts";

const H = {
  code: "کد حساب",
  name: "نام حساب",
  mobile: "موبایل",
  landline: "تلفن",
  nid: "کد ملی",
  address: "آدرس",
  city: "شهر",
  province: "استان",
};

function matrixFrom(headers: string[], rows: Record<string, unknown>[]): unknown[][] {
  return [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
}

describe("parseAsanPersons", () => {
  it("reads optional شهر/استان and does not warn when they are absent", () => {
    const withCity = parseAsanPersons(
      matrixFrom([H.code, H.name, H.mobile, H.city, H.province], [
        {
          [H.code]: "2001",
          [H.name]: "با شهر",
          [H.mobile]: "09120000021",
          [H.city]: "مشهد",
          [H.province]: "خراسان رضوی",
        },
      ]),
    );
    assert.equal(withCity.rows[0].city, "مشهد");
    assert.equal(withCity.rows[0].province, "خراسان رضوی");

    const without = parseAsanPersons(
      matrixFrom([H.code, H.name, H.mobile], [
        { [H.code]: "2002", [H.name]: "بدون شهر", [H.mobile]: "09120000022" },
      ]),
    );
    assert.equal(without.rows[0].city, null);
    assert.equal(without.rows[0].province, null);
    assert.ok(!without.warnings.some((w) => w.includes("شهر") || w.includes("استان")));
  });

  it("sample workbook headers match the parser", () => {
    assert.deepEqual([...ASAN_SAMPLE_REQUIRED_HEADERS], ["کد حساب", "موبایل"]);
    assert.deepEqual([...ASAN_SAMPLE_HEADERS], [
      "کد حساب",
      "نام حساب",
      "موبایل",
      "تلفن",
      "کد ملی",
      "آدرس",
      "شهر",
      "استان",
    ]);
    const result = parseAsanPersons(asanSampleMatrix());
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].city, "تهران");
    assert.equal(result.rows[0].province, "تهران");
    assert.equal(result.rows[1].city, null);
    assert.ok(!result.warnings.some((w) => w.includes("شهر") || w.includes("استان")));
  });
});
