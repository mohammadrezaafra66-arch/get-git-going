import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * Phase 3 — directory filters on search_visible_persons (migration 299).
 */

const TAG = `${E2E_PREFIX}FILT299_`;

const P_CUST = "a2990001-0000-4000-8000-00000000a001";
const P_SUPP = "a2990001-0000-4000-8000-00000000a002";
const P_STAFF = "a2990001-0000-4000-8000-00000000a003";
const P_ACCT = "a2990001-0000-4000-8000-00000000a004";
const P_MULTI = "a2990001-0000-4000-8000-00000000a005";
const P_NONE = "a2990001-0000-4000-8000-00000000a006";
const P_INACT = "a2990001-0000-4000-8000-00000000a007";
const P_MISS = "a2990001-0000-4000-8000-00000000a008";
const P_HIDDEN = "a2990001-0000-4000-8000-00000000b009";

const C_CUST = "a2990001-0000-4000-8000-00000000c001";
const C_MULTI = "a2990001-0000-4000-8000-00000000c002";
const S_SUPP = "a2990001-0000-4000-8000-00000000d001";
const S_MULTI = "a2990001-0000-4000-8000-00000000d002";
const E_ACCT = "a2990001-0000-4000-8000-00000000e001";

const ALL_PERSONS = [P_CUST, P_SUPP, P_STAFF, P_ACCT, P_MULTI, P_NONE, P_INACT, P_MISS, P_HIDDEN];

type Row = { id: string; display_name: string; is_active: boolean; total_count: number };

async function rpc(
  jwt: string | null,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Row[] }> {
  const r = await rest<Row[]>(jwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({
      p_query: "",
      p_limit: 100,
      p_offset: 0,
      p_kind: null,
      ...body,
    }),
  });
  return { status: r.status, body: Array.isArray(r.body) ? r.body : [] };
}

function ids(rows: Row[]): string[] {
  return rows.map((r) => r.id);
}

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} FILT299 cleanup
    DELETE FROM public.person_context_links
     WHERE person_id = ANY(ARRAY[
       '${P_CUST}','${P_SUPP}','${P_STAFF}','${P_ACCT}','${P_MULTI}',
       '${P_NONE}','${P_INACT}','${P_MISS}','${P_HIDDEN}'
     ]::uuid[]);
    DELETE FROM public.customers WHERE id IN ('${C_CUST}','${C_MULTI}');
    DELETE FROM public.suppliers WHERE id IN ('${S_SUPP}','${S_MULTI}');
    DELETE FROM public.external_parties WHERE id = '${E_ACCT}';
    DELETE FROM public.person_identifiers
     WHERE person_id = ANY(ARRAY[
       '${P_CUST}','${P_SUPP}','${P_STAFF}','${P_ACCT}','${P_MULTI}',
       '${P_NONE}','${P_INACT}','${P_MISS}','${P_HIDDEN}'
     ]::uuid[]);
    DELETE FROM public.persons
     WHERE id = ANY(ARRAY[
       '${P_CUST}','${P_SUPP}','${P_STAFF}','${P_ACCT}','${P_MULTI}',
       '${P_NONE}','${P_INACT}','${P_MISS}','${P_HIDDEN}'
     ]::uuid[]);
  `);
}

let adminJwt: string;
let salesJwt: string;
let salesId: string;

test.beforeAll(async () => {
  cleanup();
  adminJwt = mintJwt(ADMIN_USER_ID);
  const s = await userWithRole(adminJwt, "sales");
  expect(s).toBeTruthy();
  salesId = s!;
  salesJwt = mintJwt(salesId);

  dbExecE2e(`
    -- ${E2E_PREFIX} FILT299 seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES
      ('${P_CUST}', 'individual', '${TAG}CUST', 'internal_general', true),
      ('${P_SUPP}', 'individual', '${TAG}SUPP', 'internal_general', true),
      ('${P_STAFF}', 'individual', '${TAG}STAFF', 'internal_general', true),
      ('${P_ACCT}', 'individual', '${TAG}ACCT', 'internal_general', true),
      ('${P_MULTI}', 'individual', '${TAG}MULTI', 'internal_general', true),
      ('${P_NONE}', 'individual', '${TAG}NONE', 'internal_general', true),
      ('${P_INACT}', 'individual', '${TAG}INACT', 'internal_general', false),
      ('${P_MISS}', 'individual', '${TAG}MISS', 'internal_general', true),
      ('${P_HIDDEN}', 'individual', '${TAG}HIDDEN', 'restricted_executive', true);

    INSERT INTO public.customers (id, name, person_id, responsible_id)
    VALUES
      ('${C_CUST}', '${TAG}c1', '${P_CUST}', '${salesId}'),
      ('${C_MULTI}', '${TAG}c2', '${P_MULTI}', '${salesId}');

    INSERT INTO public.suppliers (id, name, person_id)
    VALUES
      ('${S_SUPP}', '${TAG}s1', '${P_SUPP}'),
      ('${S_MULTI}', '${TAG}s2', '${P_MULTI}');

    INSERT INTO public.external_parties (id, full_name, person_id)
    VALUES ('${E_ACCT}', '${TAG}e1', '${P_ACCT}');

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id, note)
    VALUES
      ('${P_CUST}', 'customer', 'customers', '${C_CUST}', '${TAG}'),
      ('${P_SUPP}', 'supplier', 'suppliers', '${S_SUPP}', '${TAG}'),
      ('${P_STAFF}', 'staff_link', NULL, NULL, '${TAG}'),
      ('${P_ACCT}', 'accounting_party', 'external_parties', '${E_ACCT}', '${TAG}'),
      ('${P_MULTI}', 'customer', 'customers', '${C_MULTI}', '${TAG}'),
      ('${P_MULTI}', 'supplier', 'suppliers', '${S_MULTI}', '${TAG}');

    -- P_MISS has no identifiers; P_CUST has mobile only (missing nid+asan)
    INSERT INTO public.person_identifiers
      (person_id, kind, value_raw, status, is_primary)
    VALUES
      ('${P_CUST}', 'mobile_e164', '09129990001', 'confirmed', true),
      ('${P_HIDDEN}', 'mobile_e164', '09129990099', 'confirmed', true),
      ('${P_HIDDEN}', 'asan_person_code', '991199', 'confirmed', false);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test.describe("search_visible_persons — context filters", () => {
  test("customer filter returns customer-linked persons once", async () => {
    const r = await rpc(adminJwt, { p_context_kinds: ["customer"] });
    expect(r.status).toBe(200);
    expect(ids(r.body)).toEqual(expect.arrayContaining([P_CUST, P_MULTI]));
    expect(ids(r.body)).not.toContain(P_SUPP);
    expect(ids(r.body).filter((id) => id === P_MULTI)).toHaveLength(1);
  });

  test("supplier + customer is OR", async () => {
    const r = await rpc(adminJwt, { p_context_kinds: ["customer", "supplier"] });
    expect(ids(r.body)).toEqual(expect.arrayContaining([P_CUST, P_SUPP, P_MULTI]));
    expect(ids(r.body)).not.toContain(P_NONE);
  });

  test("staff_link and accounting_party and no_context", async () => {
    const staff = await rpc(adminJwt, { p_context_kinds: ["staff_link"] });
    expect(ids(staff.body)).toContain(P_STAFF);

    const acct = await rpc(adminJwt, { p_context_kinds: ["accounting_party"] });
    expect(ids(acct.body)).toContain(P_ACCT);

    const none = await rpc(adminJwt, { p_context_kinds: ["no_context"] });
    expect(ids(none.body)).toContain(P_NONE);
    expect(ids(none.body)).toContain(P_MISS);
    expect(ids(none.body)).not.toContain(P_CUST);
  });

  test("no_context OR customer matches either", async () => {
    const r = await rpc(adminJwt, { p_context_kinds: ["no_context", "customer"] });
    expect(ids(r.body)).toEqual(expect.arrayContaining([P_NONE, P_CUST, P_MULTI]));
    expect(ids(r.body)).not.toContain(P_SUPP);
  });
});

test.describe("search_visible_persons — active + missing", () => {
  test("active / inactive / all", async () => {
    const act = await rpc(adminJwt, { p_active_status: "active", p_query: TAG });
    expect(ids(act.body)).toContain(P_CUST);
    expect(ids(act.body)).not.toContain(P_INACT);

    const ina = await rpc(adminJwt, { p_active_status: "inactive", p_query: TAG });
    expect(ids(ina.body)).toContain(P_INACT);
    expect(ids(ina.body)).not.toContain(P_CUST);

    const all = await rpc(adminJwt, { p_active_status: "all", p_query: TAG });
    expect(ids(all.body)).toEqual(expect.arrayContaining([P_CUST, P_INACT]));
  });

  test("missing mobile / national_id / asan", async () => {
    const noMobile = await rpc(adminJwt, {
      p_missing_identifier_kinds: ["mobile_e164"],
      p_query: TAG,
    });
    expect(ids(noMobile.body)).toContain(P_MISS);
    expect(ids(noMobile.body)).not.toContain(P_CUST);

    const noNid = await rpc(adminJwt, {
      p_missing_identifier_kinds: ["national_id_ir"],
      p_query: TAG,
    });
    expect(ids(noNid.body)).toEqual(expect.arrayContaining([P_MISS, P_CUST]));

    const noAsan = await rpc(adminJwt, {
      p_missing_identifier_kinds: ["asan_person_code"],
      p_query: TAG,
    });
    expect(ids(noAsan.body)).toEqual(expect.arrayContaining([P_MISS, P_CUST]));
  });

  test("combined missing filters are AND", async () => {
    const r = await rpc(adminJwt, {
      p_missing_identifier_kinds: ["mobile_e164", "asan_person_code"],
      p_query: TAG,
    });
    expect(ids(r.body)).toContain(P_MISS);
    expect(ids(r.body)).not.toContain(P_CUST); // has mobile
  });

  test("search + context + active + missing", async () => {
    const r = await rpc(adminJwt, {
      p_query: `${TAG}MISS`,
      p_context_kinds: ["no_context"],
      p_active_status: "active",
      p_missing_identifier_kinds: ["mobile_e164"],
    });
    expect(r.status).toBe(200);
    expect(ids(r.body)).toEqual([P_MISS]);
    expect(Number(r.body[0].total_count)).toBe(1);
  });
});

test.describe("search_visible_persons — privacy", () => {
  test("hidden executive never appears for sales", async () => {
    const byCtx = await rpc(salesJwt, { p_context_kinds: ["no_context"], p_query: TAG });
    expect(ids(byCtx.body)).not.toContain(P_HIDDEN);

    const byMiss = await rpc(salesJwt, {
      p_missing_identifier_kinds: ["national_id_ir"],
      p_query: TAG,
    });
    expect(ids(byMiss.body)).not.toContain(P_HIDDEN);

    const byName = await rpc(salesJwt, { p_query: `${TAG}HIDDEN` });
    expect(ids(byName.body)).not.toContain(P_HIDDEN);
  });

  test("viewer-only ignores missing filters (no identifier oracle)", async () => {
    const viewerOnlyId = dbScalar(
      `select ur.user_id::text
         from public.user_roles ur
        where ur.role = 'viewer'
          and public.is_viewer_only(ur.user_id)
        limit 1`,
    );
    test.skip(!viewerOnlyId, "no viewer-only user");
    const vJwt = mintJwt(viewerOnlyId);

    // Without missing filter, MISS is visible by name.
    const base = await rpc(vJwt, { p_query: `${TAG}MISS` });
    expect(ids(base.body)).toContain(P_MISS);

    // With missing mobile — ignored for viewer → still finds MISS (and would
    // also find CUST if queried). Comparing: missing filter must not shrink
    // the set relative to an unrestricted name search of the same query.
    const withMiss = await rpc(vJwt, {
      p_query: `${TAG}MISS`,
      p_missing_identifier_kinds: ["mobile_e164"],
    });
    expect(withMiss.status).toBe(base.status);
    expect(ids(withMiss.body)).toEqual(ids(base.body));
    expect(Number(withMiss.body[0]?.total_count ?? 0)).toBe(
      Number(base.body[0]?.total_count ?? 0),
    );
  });

  test("anonymous cannot execute", async () => {
    const r = await rpc(null, { p_context_kinds: ["customer"] });
    expect([401, 403]).toContain(r.status);
  });

  test("empty arrays and junk tokens are no-ops / stripped", async () => {
    const empty = await rpc(adminJwt, {
      p_context_kinds: [],
      p_missing_identifier_kinds: [],
      p_query: `${TAG}CUST`,
    });
    expect(ids(empty.body)).toContain(P_CUST);

    const junk = await rpc(adminJwt, {
      p_context_kinds: ["not_a_kind", "customer"],
      p_active_status: "bogus",
      p_query: TAG,
    });
    expect(junk.status).toBe(200);
    expect(ids(junk.body)).toContain(P_CUST);
  });

  test("admin finds hidden; fixtures stay unique", async () => {
    const r = await rpc(adminJwt, { p_query: `${TAG}HIDDEN` });
    expect(ids(r.body)).toContain(P_HIDDEN);
    expect(ALL_PERSONS).toHaveLength(9);
  });
});
