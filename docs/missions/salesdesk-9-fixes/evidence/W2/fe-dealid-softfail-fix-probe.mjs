/**
 * B5 fix probe: isMissingDealIdColumnError must not soft-hide FK.
 * Run: npx --yes tsx docs/missions/salesdesk-9-fixes/evidence/W2/fe-dealid-softfail-fix-probe.mjs
 */
import assert from "node:assert/strict";
import { isMissingDealIdColumnError } from "../../../../../src/lib/sales-desk/interactions.ts";

const cases = [
  { msg: "column deal_id does not exist", expectSoft: true },
  { msg: "Could not find the column deal_id", expectSoft: true },
  {
    msg: "Could not find the 'deal_id' column of 'sales_interactions' in the schema cache",
    expectSoft: true,
  },
  {
    msg: "violates foreign key constraint sales_interactions_deal_id_fkey",
    expectSoft: false,
  },
  {
    msg: 'insert or update on table "sales_interactions" violates foreign key constraint "sales_interactions_deal_id_fkey"',
    expectSoft: false,
  },
  { msg: "new row violates row-level security policy", expectSoft: false },
  { msg: "permission denied", expectSoft: false },
];

let fkSoftHidden = false;
for (const c of cases) {
  const soft = isMissingDealIdColumnError(c.msg);
  console.log(JSON.stringify({ msg: c.msg, soft, expectSoft: c.expectSoft }));
  assert.equal(soft, c.expectSoft, c.msg);
  if (/foreign key|deal_id_fkey/i.test(c.msg) && soft) fkSoftHidden = true;
}

console.log(`FK_ERROR_SOFT_HIDDEN=${fkSoftHidden ? "YES" : "NO"}`);
assert.equal(fkSoftHidden, false);
console.log("PROBE_B5_FIX=PASS");
