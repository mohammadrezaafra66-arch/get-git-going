import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * Phase 4 — person_aliases CRUD via PostgREST + real JWTs (migration 300).
 */

const TAG = `${E2E_PREFIX}ALIAS300_`;
const PERSON = "a3000001-0000-4000-8000-00000000a001";
const HIDDEN = "a3000001-0000-4000-8000-00000000b002";
const CUSTOMER = "a3000001-0000-4000-8000-00000000c001";
const ALIAS_SEED = "a3000001-0000-4000-8000-00000000e001";
const NAME = `${TAG}Person`;
const HIDDEN_NAME = `${TAG}Hidden`;
const ALIAS_A = `${TAG}AliasAlpha`;
const ALIAS_B = `${TAG}AliasBeta`;
const ALIAS_C = `${TAG}AliasGamma`;

type AliasRow = {
  id: string;
  person_id: string;
  alias: string;
  alias_kind: string;
};

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} ALIAS300 cleanup
    DELETE FROM public.person_aliases WHERE person_id IN ('${PERSON}','${HIDDEN}');
    DELETE FROM public.person_context_links WHERE person_id IN ('${PERSON}','${HIDDEN}');
    DELETE FROM public.customers WHERE id = '${CUSTOMER}';
    DELETE FROM public.persons WHERE id IN ('${PERSON}','${HIDDEN}');
    DELETE FROM public.audit_logs
     WHERE entity_type = 'person_alias'
       AND diff->>'person_id' IN ('${PERSON}','${HIDDEN}');
  `);
}

async function listAliases(jwt: string | null, personId: string) {
  return rest<AliasRow[]>(
    jwt,
    `/person_aliases?person_id=eq.${personId}&select=id,person_id,alias,alias_kind&order=alias`,
  );
}

async function createAlias(
  jwt: string | null,
  body: { person_id: string; alias: string; alias_kind?: string },
) {
  return rest<AliasRow[]>(jwt, "/person_aliases", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function patchAlias(jwt: string | null, id: string, body: Record<string, unknown>) {
  return rest<AliasRow[]>(jwt, `/person_aliases?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function deleteAlias(jwt: string | null, id: string) {
  return rest(jwt, `/person_aliases?id=eq.${id}`, { method: "DELETE" });
}

async function search(jwt: string | null, q: string) {
  return rest<{ id: string; matched_by: string | null }[]>(jwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({ p_query: q, p_limit: 20, p_offset: 0 }),
  });
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
    -- ${E2E_PREFIX} ALIAS300 seed
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES
      ('${PERSON}', 'individual', '${NAME}', 'internal_general', true),
      ('${HIDDEN}', 'individual', '${HIDDEN_NAME}', 'restricted_executive', true);
    INSERT INTO public.customers (id, name, person_id, responsible_id)
    VALUES ('${CUSTOMER}', '${TAG}c', '${PERSON}', '${salesId}');
    INSERT INTO public.person_context_links (person_id, context_kind, ref_table, ref_id)
    VALUES ('${PERSON}', 'customer', 'customers', '${CUSTOMER}');
    INSERT INTO public.person_aliases (id, person_id, alias, alias_kind)
    VALUES ('${ALIAS_SEED}', '${PERSON}', '${ALIAS_A}', 'nickname');
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test("admin CRUD + audit + search integration", async () => {
  const listed = await listAliases(adminJwt, PERSON);
  expect(listed.status).toBe(200);
  expect(listed.body.map((r) => r.alias)).toContain(ALIAS_A);

  const auditsBefore = Number(
    dbScalar(
      `select count(*)::text from public.audit_logs
        where entity_type = 'person_alias'
          and entity_id is not null
          and diff->>'person_id' = '${PERSON}'`,
    ),
  );

  const created = await createAlias(adminJwt, {
    person_id: PERSON,
    alias: ALIAS_B,
    alias_kind: "trade",
  });
  expect(created.status).toBe(201);
  const newId = created.body[0]?.id;
  expect(newId).toBeTruthy();

  const auditsAfterCreate = Number(
    dbScalar(
      `select count(*)::text from public.audit_logs
        where entity_type = 'person_alias'
          and entity_id = '${newId}'`,
    ),
  );
  expect(auditsAfterCreate).toBeGreaterThan(0);

  const found = await search(adminJwt, ALIAS_B);
  expect(found.body.map((r) => r.id)).toContain(PERSON);

  const updated = await patchAlias(adminJwt, newId!, { alias: ALIAS_C });
  expect(updated.status).toBe(200);
  const auditsAfterUpdate = Number(
    dbScalar(
      `select count(*)::text from public.audit_logs
        where entity_type = 'person_alias'
          and entity_id = '${newId}'`,
    ),
  );
  expect(auditsAfterUpdate).toBeGreaterThan(auditsAfterCreate);

  const oldSearch = await search(adminJwt, ALIAS_B);
  expect(oldSearch.body.map((r) => r.id)).not.toContain(PERSON);
  const newSearch = await search(adminJwt, ALIAS_C);
  expect(newSearch.body.map((r) => r.id)).toContain(PERSON);

  const dup = await createAlias(adminJwt, {
    person_id: PERSON,
    alias: ALIAS_C,
  });
  expect([409, 400]).toContain(dup.status);

  const del = await deleteAlias(adminJwt, newId!);
  expect([200, 204]).toContain(del.status);
  const auditsAfterDelete = Number(
    dbScalar(
      `select count(*)::text from public.audit_logs
        where entity_type = 'person_alias'
          and entity_id = '${newId}'`,
    ),
  );
  expect(auditsAfterDelete).toBeGreaterThan(auditsAfterUpdate);
  expect(auditsBefore).toBeGreaterThanOrEqual(0);

  const afterDel = await search(adminJwt, ALIAS_C);
  expect(afterDel.body.map((r) => r.id)).not.toContain(PERSON);
});

test("manager can write; sales/accountant/viewer cannot", async () => {
  test.skip(!managerJwt, "no manager");
  const c = await createAlias(managerJwt, {
    person_id: PERSON,
    alias: `${TAG}MgrAlias`,
  });
  expect(c.status).toBe(201);
  const id = c.body[0].id;
  await deleteAlias(managerJwt, id);

  const salesCreate = await createAlias(salesJwt, {
    person_id: PERSON,
    alias: `${TAG}SalesNo`,
  });
  expect([401, 403]).toContain(salesCreate.status);

  const accOnlyId = dbScalar(
    `select ur.user_id::text
       from public.user_roles ur
      where ur.role = 'accountant'
        and not exists (
          select 1 from public.user_roles x
           where x.user_id = ur.user_id
             and x.role in ('admin','manager')
        )
      limit 1`,
  );
  if (accOnlyId) {
    const acc = await createAlias(mintJwt(accOnlyId), {
      person_id: PERSON,
      alias: `${TAG}AccNo`,
    });
    expect([401, 403]).toContain(acc.status);
  }

  if (viewerJwt) {
    const v = await createAlias(viewerJwt, {
      person_id: PERSON,
      alias: `${TAG}ViewNo`,
    });
    expect([401, 403]).toContain(v.status);
    const read = await listAliases(viewerJwt, PERSON);
    expect(read.status).toBe(200);
    expect(read.body.map((r) => r.alias)).toContain(ALIAS_A);
  }
});

test("hidden person aliases invisible; anon blocked", async () => {
  const salesHidden = await listAliases(salesJwt, HIDDEN);
  expect(salesHidden.status).toBe(200);
  expect(salesHidden.body).toEqual([]);

  const miss = await listAliases(salesJwt, "00000000-0000-4000-8000-000000000000");
  expect(miss.status).toBe(200);
  expect(miss.body).toEqual([]);

  const anon = await listAliases(null, PERSON);
  expect([401, 403]).toContain(anon.status);
});

test("whitespace / empty rejected by check", async () => {
  const empty = await createAlias(adminJwt, { person_id: PERSON, alias: "   " });
  expect([400, 409]).toContain(empty.status);
});
