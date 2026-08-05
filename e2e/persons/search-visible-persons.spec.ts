import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

/**
 * Phase 2 — RLS-safe person search (migration 298).
 *
 * Direct PostgREST RPC with real JWTs. Existence-leak gate: searching a hidden
 * person's unique mobile/name must look identical to searching a random miss.
 */

const TAG = `${E2E_PREFIX}SEARCH298_`;
const PERSON_A = "a2980001-0000-4000-8000-00000000a001";
const PERSON_B = "a2980001-0000-4000-8000-00000000b002";
const CUSTOMER_A = "a2980001-0000-4000-8000-00000000c001";
const ID_A_MOBILE = "a2980001-0000-4000-8000-00000000d001";
const ID_A_NID = "a2980001-0000-4000-8000-00000000d002";
const ID_A_ASAN = "a2980001-0000-4000-8000-00000000d003";
const ID_B_MOBILE = "a2980001-0000-4000-8000-00000000d011";
const ID_B_NID = "a2980001-0000-4000-8000-00000000d012";
const ID_B_ASAN = "a2980001-0000-4000-8000-00000000d013";
const ALIAS_A = "a2980001-0000-4000-8000-00000000e001";
const ALIAS_B = "a2980001-0000-4000-8000-00000000e002";
const CTX_A = "a2980001-0000-4000-8000-00000000f001";

const NAME_A = `${TAG}VISIBLE_ALPHA`;
const NAME_B = `${TAG}HIDDEN_BETA`;
const ALIAS_A_TEXT = `${TAG}ALIAS_ALPHA`;
const ALIAS_B_TEXT = `${TAG}ALIAS_BETA`;
const MOBILE_A_RAW = "09121110001";
const MOBILE_B_RAW = "09121110002";
const NID_A = "0499370899";
const NID_B = "0013542419";
const ASAN_A = "998001";
const ASAN_B = "998002";
const NONEXISTENT = `${TAG}NO_SUCH_VALUE_ZZZ`;

type SearchRow = { id: string; display_name: string; matched_by: string | null; total_count: number };

async function search(
  jwt: string | null,
  query: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: SearchRow[]; text: string }> {
  const r = await rest<SearchRow[]>(jwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({
      p_query: query,
      p_limit: 50,
      p_offset: 0,
      p_kind: null,
      ...extra,
    }),
  });
  return { status: r.status, body: Array.isArray(r.body) ? r.body : [], text: r.text };
}

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup for search 298
    DELETE FROM public.person_context_links WHERE id = '${CTX_A}' OR person_id IN ('${PERSON_A}','${PERSON_B}');
    DELETE FROM public.customers WHERE id = '${CUSTOMER_A}';
    DELETE FROM public.person_identifiers WHERE person_id IN ('${PERSON_A}','${PERSON_B}');
    DELETE FROM public.person_aliases WHERE person_id IN ('${PERSON_A}','${PERSON_B}');
    DELETE FROM public.persons WHERE id IN ('${PERSON_A}','${PERSON_B}');
  `);
}

let adminJwt: string;
let salesJwt: string;
let salesId: string;
let viewerJwt: string | null;

test.beforeAll(async () => {
  cleanup();
  adminJwt = mintJwt(ADMIN_USER_ID);
  const s = await userWithRole(adminJwt, "sales");
  expect(s, "need a sales user").toBeTruthy();
  salesId = s!;
  salesJwt = mintJwt(salesId);
  const v = await userWithRole(adminJwt, "viewer");
  viewerJwt = v ? mintJwt(v) : null;

  // Seed as supabase_admin via docker — bypasses RLS for fixture setup only.
  dbExecE2e(`
    -- ${E2E_PREFIX} seed visible (A) + hidden executive (B)
    INSERT INTO public.persons (id, kind, display_name, legal_name, visibility_scope, is_active)
    VALUES
      ('${PERSON_A}', 'individual', '${NAME_A}', '${NAME_A} LEGAL', 'internal_general', true),
      ('${PERSON_B}', 'individual', '${NAME_B}', '${NAME_B} LEGAL', 'restricted_executive', true);

    INSERT INTO public.person_aliases (id, person_id, alias, alias_kind)
    VALUES
      ('${ALIAS_A}', '${PERSON_A}', '${ALIAS_A_TEXT}', 'nickname'),
      ('${ALIAS_B}', '${PERSON_B}', '${ALIAS_B_TEXT}', 'nickname');

    INSERT INTO public.person_identifiers
      (id, person_id, kind, value_raw, status, is_primary)
    VALUES
      ('${ID_A_MOBILE}', '${PERSON_A}', 'mobile_e164', '${MOBILE_A_RAW}', 'confirmed', true),
      ('${ID_A_NID}', '${PERSON_A}', 'national_id_ir', '${NID_A}', 'confirmed', false),
      ('${ID_A_ASAN}', '${PERSON_A}', 'asan_person_code', '${ASAN_A}', 'confirmed', false),
      ('${ID_B_MOBILE}', '${PERSON_B}', 'mobile_e164', '${MOBILE_B_RAW}', 'confirmed', true),
      ('${ID_B_NID}', '${PERSON_B}', 'national_id_ir', '${NID_B}', 'confirmed', false),
      ('${ID_B_ASAN}', '${PERSON_B}', 'asan_person_code', '${ASAN_B}', 'confirmed', false);

    INSERT INTO public.customers (id, name, person_id, responsible_id)
    VALUES ('${CUSTOMER_A}', '${TAG}customer_A', '${PERSON_A}', '${salesId}');

    INSERT INTO public.person_context_links
      (id, person_id, context_kind, ref_table, ref_id, note)
    VALUES
      ('${CTX_A}', '${PERSON_A}', 'customer', 'customers', '${CUSTOMER_A}', '${TAG}link');
  `);

  // Prove identifiers normalized.
  expect(
    dbScalar(
      `select value_normalized from person_identifiers where id='${ID_A_MOBILE}'`,
    ),
  ).toBe("+989121110001");
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test.describe("search_visible_persons — salesperson", () => {
  test("finds owned person A by every searchable field", async () => {
    for (const q of [
      NAME_A,
      ALIAS_A_TEXT,
      MOBILE_A_RAW,
      "+989121110001",
      "۰۹۱۲۱۱۱۰۰۰۱",
      NID_A,
      ASAN_A,
    ]) {
      const r = await search(salesJwt, q);
      expect(r.status, `q=${q} ${r.text}`).toBe(200);
      expect(r.body.map((x) => x.id), `q=${q}`).toContain(PERSON_A);
      expect(r.body.map((x) => x.id), `q=${q}`).not.toContain(PERSON_B);
    }
  });

  test("hidden person B is invisible by every field — same shape as a miss", async () => {
    const miss = await search(salesJwt, NONEXISTENT);
    expect(miss.status).toBe(200);
    expect(miss.body).toHaveLength(0);

    for (const q of [NAME_B, ALIAS_B_TEXT, MOBILE_B_RAW, NID_B, ASAN_B]) {
      const r = await search(salesJwt, q);
      expect(r.status, `q=${q}`).toBe(miss.status);
      expect(r.body, `q=${q}`).toHaveLength(0);
      expect(JSON.stringify(r.body), `q=${q}`).not.toContain(PERSON_B);
      expect(JSON.stringify(r.body), `q=${q}`).not.toContain(NAME_B);
      expect(JSON.stringify(r.body), `q=${q}`).not.toContain(MOBILE_B_RAW);
      expect(r.text.toLowerCase(), `q=${q}`).not.toContain("restrict");
    }
  });

  test("one person returned once when alias and name both match", async () => {
    const r = await search(salesJwt, TAG);
    expect(r.status).toBe(200);
    const ids = r.body.map((x) => x.id);
    expect(ids.filter((id) => id === PERSON_A)).toHaveLength(1);
    expect(ids).not.toContain(PERSON_B);
  });
});

test.describe("search_visible_persons — admin / viewer / anon", () => {
  test("admin finds both A and B", async () => {
    const a = await search(adminJwt, NAME_A);
    const b = await search(adminJwt, NAME_B);
    expect(a.body.map((x) => x.id)).toContain(PERSON_A);
    expect(b.body.map((x) => x.id)).toContain(PERSON_B);
  });

  test("viewer-only account can name-search but not by mobile (281)", async () => {
    const viewerOnlyId = dbScalar(
      `select ur.user_id::text
         from public.user_roles ur
        where ur.role = 'viewer'
          and public.is_viewer_only(ur.user_id)
        limit 1`,
    );
    test.skip(!viewerOnlyId, "no viewer-only user on this server");
    const vJwt = mintJwt(viewerOnlyId);

    const byName = await search(vJwt, NAME_A);
    expect(byName.status).toBe(200);
    expect(byName.body.map((x) => x.id)).toContain(PERSON_A);

    const byMobile = await search(vJwt, MOBILE_A_RAW);
    expect(byMobile.status).toBe(200);
    expect(byMobile.body.map((x) => x.id)).not.toContain(PERSON_A);

    const hidden = await search(vJwt, NAME_B);
    expect(hidden.body.map((x) => x.id)).not.toContain(PERSON_B);
  });

  test("anonymous cannot execute the RPC", async () => {
    const r = await search(null, NAME_A);
    if (r.status === 200) expect(r.body).toHaveLength(0);
    else expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

test.describe("search_visible_persons — functional guards", () => {
  test("wildcard characters do not broaden the match", async () => {
    // Unescaped, '___' would ILIKE-match almost every name. After escape it is literal.
    const r2 = await search(adminJwt, "___");
    expect(r2.status).toBe(200);
    expect(r2.body.map((x) => x.id)).not.toContain(PERSON_A);
    expect(r2.body.map((x) => x.id)).not.toContain(PERSON_B);
  });

  test("empty query returns a paginated visible directory", async () => {
    const r = await search(adminJwt, "", { p_limit: 5, p_offset: 0 });
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.length).toBeLessThanOrEqual(5);
    expect(Number(r.body[0].total_count)).toBeGreaterThanOrEqual(r.body.length);
  });

  test("limit is capped at 100", async () => {
    const r = await search(adminJwt, "", { p_limit: 500, p_offset: 0 });
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(100);
  });

  test("apostrophe in query does not error", async () => {
    const r = await search(adminJwt, "O'Brien");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });
});
