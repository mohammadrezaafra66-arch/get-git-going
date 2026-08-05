import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import {
  ADMIN_USER_ID,
  mintJwt,
  rest,
  userWithRole,
} from "../helpers/pgrest";
import {
  formatReleaseNumber,
  formatReleasePublishedAt,
} from "../../src/lib/platform-releases/format";
import { getPageTitle } from "../../src/config/branding";

/**
 * Migration 302 — platform_releases RLS + publish numbering (real JWTs).
 */

const MARK = `${E2E_PREFIX}REL302`;

function rowOf<T extends { id: string }>(body: T[] | T | null | undefined): T {
  if (Array.isArray(body)) {
    expect(body.length).toBeGreaterThan(0);
    return body[0];
  }
  expect(body && typeof body === "object").toBeTruthy();
  return body as T;
}

let adminJwt: string;
let managerJwt: string;
let salesJwt: string;
let viewerJwt: string;
let accountantJwt: string;
let salesUserId: string;

/** Prefer a user who has `role` and is not also admin (LAN has a multi-role account). */
async function userWithRoleExclusive(adminJwt: string, role: string): Promise<string | null> {
  const listed = await rest<{ user_id: string }[]>(
    adminJwt,
    `/user_roles?select=user_id&role=eq.${role}&limit=20`,
  );
  for (const row of listed.body ?? []) {
    if (row.user_id === ADMIN_USER_ID) continue;
    const isAdmin = dbScalar(
      `select count(*)::text from user_roles where user_id='${row.user_id}' and role='admin'`,
    );
    if (isAdmin === "0") return row.user_id;
  }
  return userWithRole(adminJwt, role);
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);
  const managerId = await userWithRoleExclusive(adminJwt, "manager");
  const salesId = await userWithRoleExclusive(adminJwt, "sales");
  const viewerId = await userWithRoleExclusive(adminJwt, "viewer");
  const accountantId = await userWithRoleExclusive(adminJwt, "accountant");
  expect(managerId).toBeTruthy();
  expect(salesId).toBeTruthy();
  expect(viewerId).toBeTruthy();
  expect(accountantId).toBeTruthy();
  expect(salesId).not.toBe(ADMIN_USER_ID);
  salesUserId = salesId!;
  managerJwt = mintJwt(managerId!);
  salesJwt = mintJwt(salesId!);
  viewerJwt = mintJwt(viewerId!);
  accountantJwt = mintJwt(accountantId!);

  expect(
    dbScalar(
      `select count(*) from information_schema.tables
        where table_schema='public' and table_name='platform_releases'`,
    ),
  ).toBe("1");
  expect(
    dbScalar(`select count(*)::text from user_roles where user_id='${salesUserId}' and role='admin'`),
  ).toBe("0");
  expect(
    dbScalar(`select count(*)::text from user_roles where user_id='${managerId}' and role='admin'`),
  ).toBe("0");
});

test.afterAll(() => {
  dbExecE2e(`delete from platform_releases where title_fa like '${MARK}%';`);
});

test.describe("format helpers", () => {
  test("Jalali + Tehran display and title helper", () => {
    const sample = formatReleasePublishedAt("2026-08-05T22:00:00.000Z");
    expect(sample).toMatch(/ساعت/);
    expect(sample).not.toBe("—");
    expect(formatReleaseNumber(12)).toContain("۱۲");
    expect(getPageTitle("تغییرات و به‌روزرسانی‌ها")).toBe(
      "تغییرات و به‌روزرسانی‌ها | myafrakala.ir",
    );
  });
});

test.describe("RLS published vs draft", () => {
  test("seeded published releases visible to authenticated roles", async () => {
    const forRole = async (jwt: string) => {
      const r = await rest<{ release_number: number; status: string }[]>(
        jwt,
        "/platform_releases?select=release_number,status&status=eq.published&order=release_number.desc",
      );
      expect(r.status, r.text).toBe(200);
      expect(r.body!.length).toBeGreaterThan(0);
      expect(r.body!.every((row) => row.status === "published")).toBeTruthy();
      return r.body!;
    };
    const adminRows = await forRole(adminJwt);
    const salesRows = await forRole(salesJwt);
    const viewerRows = await forRole(viewerJwt);
    const accountantRows = await forRole(accountantJwt);
    expect(salesRows.length).toBe(adminRows.length);
    expect(viewerRows[0].release_number).toBeGreaterThanOrEqual(salesRows[0].release_number);
    expect(accountantRows.length).toBeGreaterThan(0);
  });

  test("anonymous cannot read releases", async () => {
    const r = await rest(null, "/platform_releases?select=id&limit=1");
    expect([401, 403]).toContain(r.status);
  });

  test("non-admin cannot see or count drafts", async () => {
    const created = await rest<{ id: string; status: string }[]>(adminJwt, "/platform_releases", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title_fa: `${MARK} draft hidden`,
        summary_fa: "خلاصه آزمایشی پیش‌نویس",
        category: "بهبود",
        status: "draft",
        items: [{ item_number: 1, title_fa: "مورد یک", description_fa: "توضیح مورد یک" }],
      }),
    });
    expect(created.status, created.text).toBeLessThan(300);
    const draft = rowOf(created.body);
    expect(draft.status).toBe("draft");
    expect(dbScalar(`select status from platform_releases where id='${draft.id}'`)).toBe("draft");

    const salesById = await rest<{ id: string }[]>(
      salesJwt,
      `/platform_releases?select=id&id=eq.${draft.id}`,
    );
    expect(salesById.status).toBe(200);
    expect(salesById.body, `sales ${salesUserId} must not see draft`).toEqual([]);

    const salesDraftList = await rest<{ id: string }[]>(
      salesJwt,
      "/platform_releases?select=id&status=eq.draft",
    );
    expect(salesDraftList.body).toEqual([]);

    const managerById = await rest<{ id: string }[]>(
      managerJwt,
      `/platform_releases?select=id&id=eq.${draft.id}`,
    );
    expect(managerById.body).toEqual([]);

    const adminSee = await rest<{ id: string; status: string }[]>(
      adminJwt,
      `/platform_releases?select=id,status&id=eq.${draft.id}`,
    );
    expect(adminSee.body?.length).toBe(1);
    expect(adminSee.body![0].status).toBe("draft");
  });

  test("sales cannot insert or publish", async () => {
    const ins = await rest(salesJwt, "/platform_releases", {
      method: "POST",
      body: JSON.stringify({
        title_fa: `${MARK} sales insert`,
        summary_fa: "نباید ذخیره شود",
        category: "بهبود",
        status: "draft",
        items: [{ item_number: 1, title_fa: "x", description_fa: "y" }],
      }),
    });
    expect(ins.status).toBeGreaterThanOrEqual(400);

    const created = await rest<{ id: string }[]>(adminJwt, "/platform_releases", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title_fa: `${MARK} for sales publish deny`,
        summary_fa: "خلاصه",
        category: "بهبود",
        status: "draft",
        items: [{ item_number: 1, title_fa: "x", description_fa: "y" }],
      }),
    });
    const id = rowOf(created.body).id;
    const pub = await rest(salesJwt, "/rpc/publish_platform_release", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(pub.status).toBeGreaterThanOrEqual(400);
    expect(dbScalar(`select status from platform_releases where id='${id}'`)).toBe("draft");
  });

  test("admin publish assigns stable sequential number; published immutable", async () => {
    const before = Number(
      dbScalar(`select coalesce(max(release_number),0) from platform_releases`),
    );
    const created = await rest<{ id: string }[]>(adminJwt, "/platform_releases", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title_fa: `${MARK} publish me`,
        summary_fa: "خلاصه انتشار",
        category: "قابلیت جدید",
        status: "draft",
        items: [{ item_number: 1, title_fa: "مورد", description_fa: "توضیح" }],
      }),
    });
    expect(created.status, created.text).toBeLessThan(300);
    const id = rowOf(created.body).id;

    const pub = await rest<{ release_number: number; status: string; published_at: string }>(
      adminJwt,
      "/rpc/publish_platform_release",
      {
        method: "POST",
        body: JSON.stringify({ p_id: id }),
      },
    );
    expect(pub.status, pub.text).toBeLessThan(300);
    const published = rowOf(
      pub.body as unknown as {
        release_number: number;
        status: string;
        published_at: string;
      },
    );
    expect(published.status).toBe("published");
    // Sequence is not reset when test rows are deleted — only require monotonic growth.
    expect(published.release_number).toBeGreaterThan(before);
    expect(published.published_at).toBeTruthy();

    await rest(adminJwt, `/platform_releases?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title_fa: `${MARK} mutated` }),
    });
    expect(dbScalar(`select title_fa from platform_releases where id='${id}'`)).toBe(
      `${MARK} publish me`,
    );

    const arch = await rest(adminJwt, "/rpc/archive_platform_release", {
      method: "POST",
      body: JSON.stringify({ p_id: id }),
    });
    expect(arch.status, arch.text).toBeLessThan(300);
    expect(dbScalar(`select status from platform_releases where id='${id}'`)).toBe("archived");
    expect(dbScalar(`select release_number::text from platform_releases where id='${id}'`)).toBe(
      String(published.release_number),
    );

    const created2 = await rest<{ id: string }[]>(adminJwt, "/platform_releases", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title_fa: `${MARK} second`,
        summary_fa: "خلاصه دوم",
        category: "رفع اشکال",
        status: "draft",
        items: [{ item_number: 1, title_fa: "رفع", description_fa: "توضیح" }],
      }),
    });
    const id2 = rowOf(created2.body).id;
    const pub2 = await rest<{ release_number: number }>(adminJwt, "/rpc/publish_platform_release", {
      method: "POST",
      body: JSON.stringify({ p_id: id2 }),
    });
    expect(pub2.status, pub2.text).toBeLessThan(300);
    const published2 = rowOf(pub2.body as unknown as { release_number: number });
    expect(published2.release_number).toBe(published.release_number + 1);

    await rest(adminJwt, "/rpc/archive_platform_release", {
      method: "POST",
      body: JSON.stringify({ p_id: id2 }),
    });
  });
});
