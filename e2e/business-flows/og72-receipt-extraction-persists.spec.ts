/**
 * OG-72 / migration 398 — the receipt OCR extraction must actually be SAVED.
 *
 * `PaymentReceiptDocuments.tsx:719` writes the extraction result with
 * `.update(...).eq("id", doc.id)` on `payment_receipt_documents`. That table granted
 * PERMISSIVELY only SELECT, INSERT and DELETE; its only other policy, `viewer_restricted`, is
 * **RESTRICTIVE**, which narrows an existing grant and can never create one.
 *
 * So no permissive policy covered UPDATE — and under RLS an UPDATE with no matching policy
 * **does not raise**. It matches zero rows and reports success. The client saw `error: null`,
 * proceeded, and wrote an audit row saying the extraction had completed. `audit_logs` holds at
 * least five such rows (2026-08-07 → 08-19) while the surviving document row was still
 * `extraction_status='pending'` with `extracted_data` NULL — the exact state those rows deny.
 *
 * This gate exists because that failure is INVISIBLE to the code that causes it. It cannot be
 * caught by checking for an error; only by counting the rows the write actually reached.
 *
 * Two-sided (A2.10):
 *   CLOSED — an accountant/admin UPDATE must reach the row, or the silent no-op is back.
 *   OPEN   — a `sales` user must still be refused, so the fix did not widen the grant surface
 *            beyond the roles that could already insert and delete these rows.
 *
 * SAFETY: this writes `extraction_notes` back to the value it already holds, read immediately
 * beforehand. It is value-preserving by construction — the row is touched, never changed — and
 * the read-back asserts that. The owner works in this database and a gate is not entitled to
 * alter their data to prove a point.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

interface DocRow {
  id: string;
  extraction_notes: string | null;
}

let adminJwt: string;

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

async function anyDocument(): Promise<DocRow | null> {
  const r = await rest<DocRow[]>(
    adminJwt,
    "/payment_receipt_documents?select=id,extraction_notes&limit=1",
  );
  return r.body?.[0] ?? null;
}

test("an admin UPDATE reaches the row — the silent no-op is fixed", async () => {
  const doc = await anyDocument();
  test.skip(!doc, "no payment_receipt_documents row exists to exercise the policy against");

  const res = await rest<DocRow[]>(adminJwt, `/payment_receipt_documents?id=eq.${doc!.id}`, {
    method: "PATCH",
    // Written back as-is. The point under test is whether the write REACHES the row, not what
    // it contains, so the safest possible payload is the value already there.
    body: JSON.stringify({ extraction_notes: doc!.extraction_notes }),
    headers: { Prefer: "return=representation" },
  });

  expect(res.status, res.text).toBeLessThan(300);
  // The whole gate. Before migration 398 this array was EMPTY and the status was still 2xx —
  // that is precisely how the bug hid. Asserting the status alone would reproduce the bug.
  expect(
    (res.body ?? []).length,
    "the UPDATE returned success but reached ZERO rows — this is the silent RLS no-op that discarded every extraction",
  ).toBeGreaterThan(0);

  const after = await rest<DocRow[]>(
    adminJwt,
    `/payment_receipt_documents?select=id,extraction_notes&id=eq.${doc!.id}`,
  );
  expect(after.body?.[0]?.extraction_notes ?? null, "the gate must not alter the row").toBe(
    doc!.extraction_notes,
  );
});

test("⛔ a sales user is still refused — the fix did not widen the grant surface", async () => {
  const doc = await anyDocument();
  test.skip(!doc, "no payment_receipt_documents row exists to exercise the policy against");

  const salesId = await userWithRole(adminJwt, "sales");
  test.skip(!salesId, "no sales user exists to test the closed half with");
  const salesJwt = mintJwt(salesId!);

  const res = await rest<DocRow[]>(salesJwt, `/payment_receipt_documents?id=eq.${doc!.id}`, {
    method: "PATCH",
    body: JSON.stringify({ extraction_notes: doc!.extraction_notes }),
    headers: { Prefer: "return=representation" },
  });

  // Either an outright refusal, or a 2xx that reaches zero rows — RLS produces both shapes and
  // both mean "denied". What must never happen is a sales user's write landing on the row.
  const reached = res.status < 300 ? (res.body ?? []).length : 0;
  expect(
    reached,
    `sales must not be able to modify a receipt document (status ${res.status})`,
  ).toBe(0);
});

test("every command on payment_receipt_documents has a PERMISSIVE policy", () => {
  // The catalogue half, and the one that catches a future migration dropping a policy. A
  // command covered ONLY by the restrictive `viewer_restricted` is denied for everyone,
  // silently — exactly the state this gate was written for.
  //
  // It reads the catalogue directly rather than through an RPC: an assertion that depends on
  // a helper which may not exist would skip itself forever and report green, which is the
  // failure mode this entire spec is about.
  const cmds = dbRows(`
    select pol.polcmd::text
      from pg_policy pol
     where pol.polrelid = 'public.payment_receipt_documents'::regclass
       and pol.polpermissive
     order by 1
  `);
  expect(
    cmds,
    `commands missing a permissive policy are silently denied; found only [${cmds.join(", ")}]`,
  ).toEqual(["a", "d", "r", "w"]);
});
