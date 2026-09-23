/**
 * API fixtures that create messenger data via test-user JWTs (never direct DB write).
 */
import { expect } from "@playwright/test";
import { nameOf, PRODUCT, USER_IDS, type CollabRole } from "./constants";
import { countSql, dbScalar, jwtFor, rpc, rest } from "./client";

export function asUuid(body: unknown): string {
  if (typeof body === "string" && /^[0-9a-f-]{36}$/i.test(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["id", "inquiry_id", "group_id"]) {
      if (typeof o[k] === "string" && /^[0-9a-f-]{36}$/i.test(o[k] as string)) {
        return o[k] as string;
      }
    }
  }
  const s = String(body);
  if (/^[0-9a-f-]{36}$/i.test(s)) return s;
  throw new Error(`Expected uuid, got: ${JSON.stringify(body).slice(0, 200)}`);
}

export async function createGroup(
  as: CollabRole,
  type: "private" | "group" | "operational",
  label: string,
): Promise<string> {
  const jwt = jwtFor(as);
  const r = await rpc(jwt, "create_messenger_group", {
    p_name: nameOf(label, type),
    p_type: type,
  });
  expect(r.status, r.text).toBeLessThan(300);
  return asUuid(r.body);
}

export async function addMember(
  asAdmin: CollabRole,
  groupId: string,
  userId: string,
  role: "admin" | "member" | "viewer" | "purchaser" = "member",
): Promise<RestOk> {
  const jwt = jwtFor(asAdmin);
  const before = countSql(
    `select count(*) from messenger_group_members where group_id='${groupId}' and user_id='${userId}'`,
  );
  const r = await rpc(jwt, "add_messenger_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
    p_role: role,
  });
  return { r, before };
}

type RestOk = { r: Awaited<ReturnType<typeof rpc>>; before: number };

export async function sendMessage(
  as: CollabRole,
  groupId: string,
  content: string,
  replyTo?: string,
) {
  const jwt = jwtFor(as);
  const before = countSql(
    `select count(*) from messenger_messages where group_id='${groupId}'`,
  );
  const r = await rpc(jwt, "send_messenger_message", {
    p_group_id: groupId,
    p_content: content,
    ...(replyTo ? { p_reply_to: replyTo } : {}),
  });
  const after = countSql(
    `select count(*) from messenger_messages where group_id='${groupId}'`,
  );
  return { r, before, after, jwt };
}

export async function createInquiryApi(
  as: CollabRole,
  groupId: string,
  assignedTo: string,
  productId?: string,
) {
  const jwt = jwtFor(as);
  const pid =
    productId ??
    dbScalar(`
      select p.id::text from products p
      where p.sku like 'AFK-2026-%'
        and not exists (select 1 from inquiry_price_cache c where c.product_id = p.id)
      order by p.sku
      limit 1
    `);
  if (!/^[0-9a-f-]{36}$/i.test(pid)) {
    throw new Error(`No uncached AFK-2026 product available for inquiry (got ${pid})`);
  }
  const before = countSql(`select count(*) from inquiries where group_id='${groupId}'`);
  const r = await rpc(jwt, "create_inquiry", {
    p_group_id: groupId,
    p_product_id: pid,
    p_assigned_to: assignedTo,
  });
  const after = countSql(`select count(*) from inquiries where group_id='${groupId}'`);
  return { r, before, after, jwt, productId: pid };
}

export async function replyInquiryApi(as: CollabRole, inquiryId: string, price: number) {
  const jwt = jwtFor(as);
  const before = countSql(
    `select count(*) from inquiry_replies where inquiry_id='${inquiryId}'`,
  );
  const r = await rpc(jwt, "reply_inquiry", {
    p_inquiry_id: inquiryId,
    p_price: price,
    p_note: nameOf("reply-note"),
  });
  const after = countSql(
    `select count(*) from inquiry_replies where inquiry_id='${inquiryId}'`,
  );
  return { r, before, after };
}

/** Seed an isolated group: sales creates, manager as purchaser, sales2 as member. */
export async function seedInquiryGroup(label: string) {
  const groupId = await createGroup("sales", "operational", label);
  const addMgr = await addMember("sales", groupId, USER_IDS.manager, "purchaser");
  expect(addMgr.r.status, addMgr.r.text).toBeLessThan(300);
  const addS2 = await addMember("sales", groupId, USER_IDS.sales2, "member");
  expect(addS2.r.status, addS2.r.text).toBeLessThan(300);
  return { groupId, purchaserId: USER_IDS.manager, memberId: USER_IDS.sales2 };
}

export function memberRole(groupId: string, userId: string): string {
  return dbScalar(
    `select role from messenger_group_members where group_id='${groupId}' and user_id='${userId}' limit 1`,
  );
}

export async function selectAs(
  role: CollabRole | "anon",
  pathAndQuery: string,
) {
  if (role === "anon") return rest(null, pathAndQuery);
  return rest(jwtFor(role), pathAndQuery);
}
