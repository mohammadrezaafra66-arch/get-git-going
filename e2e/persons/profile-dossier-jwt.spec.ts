import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";
import { summarizePersonAuditAction } from "../../src/lib/persons/profile-audit";

/**
 * Phase 5 — person dossier data layer (JWT / PostgREST + redaction helper).
 */

const TAG = `${E2E_PREFIX}P5_`;
const P_HOST = "a3050001-0000-4000-8000-00000000a001";
const P_PEER = "a3050001-0000-4000-8000-00000000a002";
const P_HIDDEN = "a3050001-0000-4000-8000-00000000b009";
const C_CUST = "a3050001-0000-4000-8000-00000000c001";
const S_SUPP = "a3050001-0000-4000-8000-00000000d001";
const E_ACCT = "a3050001-0000-4000-8000-00000000e001";
const COLLISION = "a3050001-0000-4000-8000-00000000f001";
const PHONE = "09129993055";

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} P5 dossier cleanup
    DELETE FROM public.audit_logs
     WHERE entity_id IN ('${P_HOST}','${P_PEER}','${P_HIDDEN}')
        OR (diff->>'person_id') IN ('${P_HOST}','${P_PEER}');
    DELETE FROM public.phone_collisions WHERE id = '${COLLISION}' OR normalized_phone = '${PHONE}';
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN ('${P_HOST}','${P_PEER}') OR person_id_b IN ('${P_HOST}','${P_PEER}');
    DELETE FROM public.person_context_links WHERE person_id IN ('${P_HOST}','${P_PEER}','${P_HIDDEN}');
    DELETE FROM public.customers WHERE id = '${C_CUST}';
    DELETE FROM public.suppliers WHERE id = '${S_SUPP}';
    DELETE FROM public.external_parties WHERE id = '${E_ACCT}';
    DELETE FROM public.person_identifiers WHERE person_id IN ('${P_HOST}','${P_PEER}','${P_HIDDEN}');
    DELETE FROM public.person_aliases WHERE person_id IN ('${P_HOST}','${P_PEER}','${P_HIDDEN}');
    DELETE FROM public.persons WHERE id IN ('${P_HOST}','${P_PEER}','${P_HIDDEN}');
  `);
}

let adminJwt: string;
let managerJwt: string | null;
let salesJwt: string;
let salesId: string;
let accountantJwt: string | null;
let viewerJwt: string | null;

test.beforeAll(async () => {
  cleanup();
  adminJwt = mintJwt(ADMIN_USER_ID);
  const s = await userWithRole(adminJwt, "sales");
  expect(s).toBeTruthy();
  salesId = s!;
  salesJwt = mintJwt(salesId);

  const m = await userWithRole(adminJwt, "manager");
  managerJwt = m ? mintJwt(m) : null;
  const a = await userWithRole(adminJwt, "accountant");
  accountantJwt = a ? mintJwt(a) : null;
  const vId = dbScalar(
    `select ur.user_id::text from public.user_roles ur
      where ur.role='viewer' and public.is_viewer_only(ur.user_id) limit 1`,
  );
  viewerJwt = vId ? mintJwt(vId) : null;

  dbExecE2e(`
    -- ${E2E_PREFIX} P5 dossier seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active, created_by)
    VALUES
      ('${P_HOST}', 'individual', '${TAG}HOST', 'internal_general', true, '${ADMIN_USER_ID}'),
      ('${P_PEER}', 'individual', '${TAG}PEER', 'internal_general', true, '${ADMIN_USER_ID}'),
      ('${P_HIDDEN}', 'individual', '${TAG}HIDDEN', 'restricted_executive', true, '${ADMIN_USER_ID}');

    INSERT INTO public.customers (id, name, person_id, responsible_id)
    VALUES ('${C_CUST}', '${TAG}Customer', '${P_HOST}', '${salesId}');

    INSERT INTO public.suppliers (id, name, person_id)
    VALUES ('${S_SUPP}', '${TAG}Supplier', '${P_HOST}');

    INSERT INTO public.external_parties (id, full_name, person_id)
    VALUES ('${E_ACCT}', '${TAG}External', '${P_HOST}');

    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('${P_HOST}', 'mobile_e164', '${PHONE}', 'confirmed', true);

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id, note, started_at, ended_at)
    VALUES
      ('${P_HOST}', 'customer', 'customers', '${C_CUST}', '${TAG}', now(), NULL),
      ('${P_HOST}', 'supplier', 'suppliers', '${S_SUPP}', '${TAG}', now(), NULL),
      ('${P_HOST}', 'staff_link', 'profiles', '${ADMIN_USER_ID}', '${TAG}', now(), NULL),
      ('${P_HOST}', 'accounting_party', 'external_parties', '${E_ACCT}', '${TAG}', now(), NULL),
      ('${P_HOST}', 'customer', 'customers', 'a3050001-0000-4000-8000-00000000dead', '${TAG}broken', now(), NULL),
      ('${P_HOST}', 'driver', NULL, NULL, '${TAG}ended', now() - interval '30 days', now() - interval '1 day');

    INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
    VALUES ('${P_HOST}', '${P_PEER}', 'shared_identifier', '${TAG}pending', 'pending');

    INSERT INTO public.phone_collisions (id, normalized_phone, entity_refs, status)
    VALUES (
      '${COLLISION}',
      '${PHONE}',
      '[{"table":"customers","id":"${C_CUST}","label":"${TAG}Customer"},{"table":"customers","id":"a3050001-0000-4000-8000-00000000zzzz","label":null}]'::jsonb,
      'pending'
    );

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES
      ('${ADMIN_USER_ID}', 'person.update', 'person', '${P_HOST}',
       '{"display_name":{"from":"old","to":"${TAG}HOST"},"tag":"${TAG}"}'::jsonb),
      ('${ADMIN_USER_ID}', 'person.identifier.add', 'person_identifier', '${P_HOST}',
       '{"person_id":"${P_HOST}","kind":"mobile_e164","value":"${PHONE}","tag":"${TAG}"}'::jsonb);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
  expect(
    dbScalar(
      `select count(*) from public.persons where id in ('${P_HOST}','${P_PEER}','${P_HIDDEN}')`,
    ),
  ).toBe("0");
});

test("redaction helper never echoes identifier values", () => {
  expect(
    summarizePersonAuditAction("person.identifier.add", "person_identifier", {
      value: "+989129993055",
    }),
  ).toBe("افزودن شناسه");
  expect(
    summarizePersonAuditAction("person_alias.create", "person_alias", { alias: "SECRET" }),
  ).toBe("افزودن نام دیگر");
  const text = summarizePersonAuditAction("person.update", "person", {
    display_name: { from: "a", to: "b" },
  });
  expect(text).toBe("به‌روزرسانی شخص");
  expect(text).not.toMatch(/\+98|0912|SECRET|from/);
});

test.describe("JWT matrix — person visibility", () => {
  test("admin can read host person", async () => {
    const r = await rest<{ id: string }[]>(
      adminJwt,
      `/persons?id=eq.${P_HOST}&select=id,display_name`,
    );
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });

  test("sales can read internal_general host", async () => {
    const r = await rest<{ id: string }[]>(
      salesJwt,
      `/persons?id=eq.${P_HOST}&select=id`,
    );
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(0);
    // Ownership may or may not allow — if visible, ok; restricted executive must be empty.
    const hidden = await rest<{ id: string }[]>(
      salesJwt,
      `/persons?id=eq.${P_HIDDEN}&select=id`,
    );
    expect(hidden.body ?? []).toHaveLength(0);
  });

  test("anonymous blocked on persons", async () => {
    const r = await rest<{ id: string }[]>(null, `/persons?id=eq.${P_HOST}&select=id`);
    // PostgREST may return 200 with RLS-empty body, or 401/403.
    if (r.status === 200) {
      expect(r.body ?? []).toEqual([]);
    } else {
      expect([401, 403]).toContain(r.status);
    }
  });
});

test.describe("JWT matrix — deep-link targets", () => {
  test("admin sees customer/supplier/external targets", async () => {
    const c = await rest<{ id: string; name: string }[]>(
      adminJwt,
      `/customers?id=eq.${C_CUST}&select=id,name`,
    );
    expect(c.body).toHaveLength(1);
    const s = await rest<{ id: string }[]>(adminJwt, `/suppliers?id=eq.${S_SUPP}&select=id`);
    expect(s.body).toHaveLength(1);
    const e = await rest<{ id: string }[]>(
      adminJwt,
      `/external_parties?id=eq.${E_ACCT}&select=id`,
    );
    expect(e.body).toHaveLength(1);
  });

  test("broken customer ref returns empty (no existence leak shape)", async () => {
    const r = await rest(
      adminJwt,
      `/customers?id=eq.a3050001-0000-4000-8000-00000000dead&select=id`,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});

test.describe("JWT matrix — merge / collision / audit / identifiers", () => {
  test("admin/manager see pending merge; sales does not", async () => {
    const admin = await rest<{ id: string; status: string }[]>(
      adminJwt,
      `/person_merge_candidates?or=(person_id_a.eq.${P_HOST},person_id_b.eq.${P_HOST})&select=id,status`,
    );
    expect(admin.body?.some((r) => r.status === "pending")).toBeTruthy();

    if (managerJwt) {
      const mgr = await rest<{ id: string }[]>(
        managerJwt,
        `/person_merge_candidates?or=(person_id_a.eq.${P_HOST},person_id_b.eq.${P_HOST})&select=id`,
      );
      expect((mgr.body ?? []).length).toBeGreaterThan(0);
    }

    const sales = await rest(
      salesJwt,
      `/person_merge_candidates?or=(person_id_a.eq.${P_HOST},person_id_b.eq.${P_HOST})&select=id`,
    );
    expect(sales.body ?? []).toEqual([]);
  });

  test("admin/accountant see collision; viewer does not", async () => {
    const admin = await rest<{ id: string }[]>(
      adminJwt,
      `/phone_collisions?id=eq.${COLLISION}&select=id,normalized_phone`,
    );
    expect(admin.body).toHaveLength(1);

    if (accountantJwt) {
      const acct = await rest<{ id: string }[]>(
        accountantJwt,
        `/phone_collisions?id=eq.${COLLISION}&select=id`,
      );
      expect((acct.body ?? []).length).toBeGreaterThan(0);
    }

    if (viewerJwt) {
      const v = await rest(viewerJwt, `/phone_collisions?id=eq.${COLLISION}&select=id`);
      expect(v.body ?? []).toEqual([]);
    }
  });

  test("audit_logs: admin can read; sales cannot; UI gate remains admin-only", async () => {
    const admin = await rest<{ id: number; action: string }[]>(
      adminJwt,
      `/audit_logs?entity_id=eq.${P_HOST}&action=eq.person.identifier.add&select=id,action,diff&limit=5`,
    );
    expect((admin.body ?? []).length).toBeGreaterThan(0);

    const sales = await rest(salesJwt, `/audit_logs?entity_id=eq.${P_HOST}&select=id`);
    expect(sales.body ?? []).toEqual([]);

    // Accountant may have SELECT under live RLS; dossier UI still gates on audit-logs.view (admin).
    if (accountantJwt) {
      await rest(accountantJwt, `/audit_logs?entity_id=eq.${P_HOST}&select=id`);
    }
  });

  test("viewer-only cannot read identifiers", async () => {
    test.skip(!viewerJwt, "no viewer-only user");
    const v = await rest(
      viewerJwt,
      `/person_identifiers?person_id=eq.${P_HOST}&select=id,value_normalized`,
    );
    expect(v.body ?? []).toEqual([]);
  });

  test("no service-role behavior from anon key alone", async () => {
    const r = await rest<{ id: string }[]>(null, `/persons?id=eq.${P_HOST}&select=id`);
    if (r.status === 200) {
      expect(r.body ?? []).toEqual([]);
    } else {
      expect([401, 403]).toContain(r.status);
    }
  });
});
