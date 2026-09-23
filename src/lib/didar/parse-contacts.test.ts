/**
 * Synthetic Didar parser cases. Real customer data is never used.
 * Run: npx --yes tsx --test src/lib/didar/parse-contacts.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDidarContacts } from "./parse-contacts.ts";

const H = {
  didar: "کد دیدار مشتری",
  mobile: "تلفن همراه مشتری",
  last: "نام خانوادگی مشتری",
  title: "عنوان مشتری",
  first: "نام مشتری",
  company: "نام شرکت",
  landline: "تلفن ثابت مشتری",
  nid: "کد ملی مشتری",
  address: "آدرس",
  addressAlt: "ادرس",
  owner: "مسئول مشتری",
  view: "مجوز مشاهده مشتری",
};

function matrixFrom(headers: string[], rows: Record<string, unknown>[]): unknown[][] {
  return [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
}

describe("parseDidarContacts", () => {
  it("maps by header text in shuffled column order", () => {
    const headers = [
      H.view,
      H.landline,
      H.company,
      H.mobile,
      H.didar,
      H.first,
      H.address,
      H.last,
      H.title,
      H.nid,
      H.owner,
    ];
    const result = parseDidarContacts(
      matrixFrom(headers, [
        {
          [H.didar]: "D-100",
          [H.mobile]: "09121234567",
          [H.last]: "احمدی",
          [H.title]: "آقای احمدی",
          [H.first]: "علی",
          [H.company]: "شرکت نمونه",
          [H.landline]: "02112345678",
          [H.nid]: "0012345678",
          [H.address]: "تهران",
          [H.owner]: "باید نادیده گرفته شود",
          [H.view]: "همه",
        },
      ]),
    );
    assert.equal(result.rows.length, 1);
    const row = result.rows[0];
    assert.equal(row.didar_id, "D-100");
    assert.equal(row.mobile_raw, "09121234567");
    assert.equal(row.display_name, "احمدی");
    assert.equal(row.landline_raw, "02112345678");
    assert.equal(row.national_id_raw, "0012345678");
    assert.equal(row.address, "تهران");
    assert.equal(row.company_name, "شرکت نمونه");
    assert.ok(result.ignoredHeaders.includes(H.owner));
    assert.ok(result.ignoredHeaders.includes(H.view));
  });

  it("does not treat landline as mobile when mobile is missing", () => {
    const result = parseDidarContacts(
      matrixFrom([H.mobile, H.landline, H.last], [
        { [H.mobile]: "", [H.landline]: "02199999999", [H.last]: "بدون موبایل" },
      ]),
    );
    assert.equal(result.rows[0].mobile_raw, null);
    assert.equal(result.rows[0].landline_raw, "02199999999");
  });

  it("keeps a dirty mobile as raw text", () => {
    const dirty = "0911 بهروز پدر";
    const result = parseDidarContacts(
      matrixFrom([H.mobile, H.last], [{ [H.mobile]: dirty, [H.last]: "کثیف" }]),
    );
    assert.equal(result.rows[0].mobile_raw, dirty);
  });

  it("falls back display_name: last name, then title, then first+last, then company", () => {
    const headers = [H.mobile, H.last, H.title, H.first, H.company];
    const result = parseDidarContacts(
      matrixFrom(headers, [
        { [H.mobile]: "09120000001", [H.last]: "رضایی" },
        { [H.mobile]: "09120000002", [H.title]: "خانم رضایی" },
        { [H.mobile]: "09120000003", [H.first]: "سارا" },
        { [H.mobile]: "09120000004", [H.company]: "افراکالا" },
      ]),
    );
    assert.equal(result.rows[0].display_name, "رضایی");
    assert.equal(result.rows[1].display_name, "خانم رضایی");
    assert.equal(result.rows[2].display_name, "سارا");
    assert.equal(result.rows[3].display_name, "افراکالا");
  });

  it("reads آدرس and ادرس", () => {
    const withCanonical = parseDidarContacts(
      matrixFrom([H.mobile, H.last, H.address], [
        { [H.mobile]: "09120000005", [H.last]: "الف", [H.address]: "آدرس رسمی" },
      ]),
    );
    assert.equal(withCanonical.rows[0].address, "آدرس رسمی");

    const withAlt = parseDidarContacts(
      matrixFrom([H.mobile, H.last, H.addressAlt], [
        { [H.mobile]: "09120000006", [H.last]: "ب", [H.addressAlt]: "ادرس جایگزین" },
      ]),
    );
    assert.equal(withAlt.rows[0].address, "ادرس جایگزین");

    const both = parseDidarContacts(
      matrixFrom([H.mobile, H.last, H.address, H.addressAlt], [
        {
          [H.mobile]: "09120000007",
          [H.last]: "ج",
          [H.address]: "اولویت آدرس",
          [H.addressAlt]: "نادیده",
        },
      ]),
    );
    assert.equal(both.rows[0].address, "اولویت آدرس");
  });

  it("skips blank rows and records a missing-mobile warning only when the column is absent", () => {
    const missingCol = parseDidarContacts([[H.last], ["نامی"]]);
    assert.ok(missingCol.warnings.some((w) => w.includes("تلفن همراه مشتری")));
    const withBlank = parseDidarContacts(
      matrixFrom([H.mobile, H.last], [
        { [H.mobile]: "", [H.last]: "" },
        { [H.mobile]: "09120000008", [H.last]: "تنها" },
      ]),
    );
    assert.equal(withBlank.rows.length, 1);
    assert.equal(withBlank.rows[0].display_name, "تنها");
  });
});
