/**
 * OG-66(c) — the contract the ledger wizard's new name fallback stands on.
 *
 * `src/features/ledger-wizard/lookup.ts` now falls back to `search_visible_persons` when every
 * exact identifier path has missed, and accepts the hit ONLY when it is unique. It asks for
 * `limit: 2` — enough to DETECT ambiguity, never enough to hide it — because `pickKind`
 * resolves exactly one party and a silent choice between two people attaches a receipt to the
 * wrong party while nothing looks wrong.
 *
 * That logic cannot be unit-tested from Node: `lookup.ts` imports the Supabase BROWSER client,
 * which reads `import.meta.env`. So this asserts the contract it depends on, through PostgREST,
 * as a real role — and says plainly that it does not drive the wizard's UI.
 *
 * Two-sided (A2.10):
 *   CLOSED — an ambiguous name must return >1, so the wizard refuses.
 *   OPEN   — a unique name must return exactly 1, so the wizard still resolves. A change that
 *            broke the fallback entirely would satisfy the closed half and must fail here.
 *
 * Both fixtures are COMPUTED from live data (A2.11), never pinned: the owner works in this
 * database and a hardcoded name would turn their data entry into a red test.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";

interface SearchRow {
  id: string;
  display_name: string | null;
  matched_by: string | null;
}

/** `token|hits`, counted the way the RPC matches: CONTAINS on display_name, not prefix. */
function tokenCounts(): { token: string; hits: number }[] {
  // dbRows returns string[], one line per row — so the columns are concatenated here rather
  // than cast to an object. Getting that wrong is what made an earlier draft of this spec skip
  // both halves silently while reporting success.
  return dbRows(`
    with tokens as (
      select distinct lower(btrim(w)) as token
        from public.persons p,
             lateral unnest(string_to_array(btrim(p.display_name), ' ')) as w
       where p.display_name is not null and length(btrim(w)) > 2
    )
    select t.token || '|' ||
           (select count(*) from public.persons q
             where q.display_name ilike '%' || t.token || '%')
      from tokens t
     order by 1
  `)
    .map((line) => {
      const [token, hits] = line.split("|");
      return { token: token.trim(), hits: Number(hits) };
    })
    .filter((r) => r.token && Number.isFinite(r.hits));
}

let adminJwt: string;

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test("⛔ an ambiguous name returns MORE than one, so the wizard must refuse to choose", async () => {
  const ambiguous = tokenCounts().find((r) => r.hits > 1);
  expect(
    ambiguous,
    "no token in the live database matches more than one person — the closed half of this gate would be vacuous",
  ).toBeTruthy();

  const res = await rest<SearchRow[]>(adminJwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({ p_query: ambiguous!.token, p_limit: 2, p_offset: 0 }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  expect(
    (res.body ?? []).length,
    `«${ambiguous!.token}» matches ${ambiguous!.hits} people; limit 2 must surface at least 2 so ambiguity is detectable`,
  ).toBeGreaterThan(1);
});

test("a unique name returns exactly one, so the wizard still resolves", async () => {
  const unique = tokenCounts().find((r) => r.hits === 1);
  expect(unique, "no token matches exactly one person — the open half would be vacuous").toBeTruthy();

  const res = await rest<SearchRow[]>(adminJwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({ p_query: unique!.token, p_limit: 2, p_offset: 0 }),
  });
  expect(res.status, res.text).toBeLessThan(300);
  expect(
    (res.body ?? []).length,
    `«${unique!.token}» matches one person, so the wizard must get exactly one hit and resolve it`,
  ).toBe(1);
});

test("the fallback inherits the caller's visibility — sales sees fewer people than admin", async () => {
  const s = await userWithRole(adminJwt, "sales");
  const salesId = (s as unknown as { id?: string }).id ?? String(s);
  const salesJwt = mintJwt(salesId);

  const asAdmin = await rest<SearchRow[]>(adminJwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({ p_query: null, p_limit: 500, p_offset: 0 }),
  });
  const asSales = await rest<SearchRow[]>(salesJwt, "/rpc/search_visible_persons", {
    method: "POST",
    body: JSON.stringify({ p_query: null, p_limit: 500, p_offset: 0 }),
  });
  expect(asAdmin.status, asAdmin.text).toBeLessThan(300);
  expect(asSales.status, asSales.text).toBeLessThan(300);

  const admins = (asAdmin.body ?? []).length;
  const sales = (asSales.body ?? []).length;

  // The point of wiring the wizard to this function rather than a bare table read: it is
  // SECURITY INVOKER, so RLS applies to the caller. Measured before wiring — admin 84,
  // sales 18 — so the wizard inherits the same limit the persons PAGE already applies.
  expect(admins, "admin must see people at all, or this proves nothing").toBeGreaterThan(0);
  expect(
    sales,
    "sales must not see everything admin sees — the wizard would otherwise widen visibility",
  ).toBeLessThan(admins);
});
