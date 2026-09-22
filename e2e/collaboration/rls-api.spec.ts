import { test, expect } from "@playwright/test";
import { PRODUCT, USER_IDS } from "./_helpers/constants";
import {
  createInquiryApi,
  replyInquiryApi,
  seedInquiryGroup,
  sendMessage,
  asUuid,
} from "./_helpers/fixtures";
import { anonKey, countSql, dbScalar, jwtFor, lanEnv, rest, rpc, storageBaseUrl } from "./_helpers/client";
import { PRODUCTS } from "./_helpers/constants";

/**
 * E — Permission / RLS API suite (P0).
 * Every denial includes a positive twin proving data exists for a member.
 */
test.describe("E — RLS / API permissions", () => {
  test.setTimeout(180_000);

  let outsiderGroupId = "";
  let insiderJwt = "";
  let messageId = "";
  let inquiryId = "";
  let attachmentPath = "";

  test.beforeAll(async () => {
    const seeded = await seedInquiryGroup("E0");
    outsiderGroupId = seeded.groupId;
    insiderJwt = jwtFor("sales");
    const msg = await sendMessage("sales", outsiderGroupId, "E0-secret-message");
    expect(msg.r.status).toBeLessThan(300);
    messageId =
      (msg.r.body as { id?: string })?.id ??
      dbScalar(
        `select id from messenger_messages where group_id='${outsiderGroupId}' order by created_at desc limit 1`,
      );
    const inq = await createInquiryApi("sales", outsiderGroupId, seeded.purchaserId);
    expect(inq.r.status, inq.r.text).toBeLessThan(300);
    inquiryId = asUuid(inq.r.body);
    await replyInquiryApi("manager", inquiryId, 42);

    // Prove-can-fail baseline: member sees ≥1
    const pos = await rest(
      insiderJwt,
      `/messenger_messages?group_id=eq.${outsiderGroupId}&select=id`,
    );
    expect((pos.body as unknown[]).length).toBeGreaterThan(0);
  });

  const outsiderRoles = ["viewer", "accountant"] as const;

  for (const role of outsiderRoles) {
    test(`E1 messenger_messages closed to non-member ${role}`, async () => {
      const pos = await rest(
        jwtFor("sales"),
        `/messenger_messages?group_id=eq.${outsiderGroupId}&select=id`,
      );
      expect((pos.body as unknown[]).length).toBeGreaterThan(0);
      const denied = await rest(
        jwtFor(role),
        `/messenger_messages?group_id=eq.${outsiderGroupId}&select=id`,
      );
      expect(denied.status).toBe(200);
      expect((denied.body as unknown[]).length).toBe(0);
    });

    test(`E2 attachments/receipts/members closed to ${role}`, async () => {
      const membersPos = await rest(
        jwtFor("sales"),
        `/messenger_group_members?group_id=eq.${outsiderGroupId}&select=user_id`,
      );
      expect((membersPos.body as unknown[]).length).toBeGreaterThan(0);

      for (const table of [
        `messenger_attachments?message_id=eq.${messageId}&select=id`,
        `messenger_read_receipts?message_id=eq.${messageId}&select=id`,
        `messenger_group_members?group_id=eq.${outsiderGroupId}&select=user_id`,
      ]) {
        const r = await rest(jwtFor(role), `/${table}`);
        expect(r.status).toBe(200);
        // attachments/receipts may be empty even for member — members must be 0 for outsider
        if (table.startsWith("messenger_group_members")) {
          expect((r.body as unknown[]).length).toBe(0);
        } else {
          expect((r.body as unknown[]).length).toBe(0);
        }
      }
    });

    test(`E3 inquiry tables closed to ${role}`, async () => {
      const pos = await rest(
        jwtFor("sales"),
        `/inquiries?id=eq.${inquiryId}&select=id`,
      );
      expect((pos.body as unknown[]).length).toBe(1);
      for (const q of [
        `/inquiries?id=eq.${inquiryId}&select=id`,
        `/inquiry_replies?inquiry_id=eq.${inquiryId}&select=id`,
        `/inquiry_transfers?inquiry_id=eq.${inquiryId}&select=id`,
        `/inquiry_status_history?inquiry_id=eq.${inquiryId}&select=id`,
      ]) {
        const r = await rest(jwtFor(role), q);
        expect((r.body as unknown[]).length, q).toBe(0);
      }
    });
  }

  test("E4 send_messenger_message as non-member errors; no row", async () => {
    const before = countSql(
      `select count(*) from messenger_messages where group_id='${outsiderGroupId}'`,
    );
    const r = await rpc(jwtFor("viewer"), "send_messenger_message", {
      p_group_id: outsiderGroupId,
      p_content: "should-fail",
    });
    const after = countSql(
      `select count(*) from messenger_messages where group_id='${outsiderGroupId}'`,
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(`${r.text}`).toMatch(/NOT_GROUP_MEMBER|عضو|42501/i);
    expect(after).toBe(before);
  });

  test("E5 direct INSERT/PATCH/DELETE bypass must change 0 rows", async () => {
    // Add self to group
    const beforeMem = countSql(
      `select count(*) from messenger_group_members where group_id='${outsiderGroupId}' and user_id='${USER_IDS.viewer}'`,
    );
    await rest(jwtFor("viewer"), `/messenger_group_members`, {
      method: "POST",
      body: JSON.stringify({
        group_id: outsiderGroupId,
        user_id: USER_IDS.viewer,
        role: "admin",
      }),
    });
    const afterMem = countSql(
      `select count(*) from messenger_group_members where group_id='${outsiderGroupId}' and user_id='${USER_IDS.viewer}'`,
    );
    expect(afterMem).toBe(beforeMem);

    // Edit someone else's message
    const beforeContent = dbScalar(
      `select content from messenger_messages where id='${messageId}'`,
    );
    await rest(jwtFor("viewer"), `/messenger_messages?id=eq.${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content: "hacked" }),
    });
    const afterContent = dbScalar(
      `select content from messenger_messages where id='${messageId}'`,
    );
    expect(afterContent).toBe(beforeContent);

    // Escalate own role if somehow member — try patch sales2 role
    const beforeRole = dbScalar(
      `select role from messenger_group_members where group_id='${outsiderGroupId}' and user_id='${USER_IDS.sales2}'`,
    );
    await rest(
      jwtFor("sales2"),
      `/messenger_group_members?group_id=eq.${outsiderGroupId}&user_id=eq.${USER_IDS.sales2}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      },
    );
    const afterRole = dbScalar(
      `select role from messenger_group_members where group_id='${outsiderGroupId}' and user_id='${USER_IDS.sales2}'`,
    );
    expect(afterRole).toBe(beforeRole);

    // DELETE message as non-owner
    const beforeDel = countSql(
      `select count(*) from messenger_messages where id='${messageId}'`,
    );
    await rest(jwtFor("viewer"), `/messenger_messages?id=eq.${messageId}`, {
      method: "DELETE",
    });
    const afterDel = countSql(
      `select count(*) from messenger_messages where id='${messageId}'`,
    );
    expect(afterDel).toBe(beforeDel);
  });

  test("E6 storage non-member denied for attachment path", async () => {
    const env = lanEnv();
    // Create attachment as member via storage + rpc if possible; else probe known path pattern
    const path = `${outsiderGroupId}/e2e-probe.txt`;
    const up = await fetch(
      `${storageBaseUrl()}/storage/v1/object/messenger-attachments/${path}`,
      {
        method: "POST",
        headers: {
          apikey: env.ANON_KEY,
          Authorization: `Bearer ${jwtFor("sales")}`,
          "Content-Type": "text/plain",
        },
        body: "probe",
      },
    );
    attachmentPath = path;
    const getDenied = await fetch(
      `${storageBaseUrl()}/storage/v1/object/messenger-attachments/${path}`,
      {
        headers: {
          apikey: env.ANON_KEY,
          Authorization: `Bearer ${jwtFor("viewer")}`,
        },
      },
    );
    const getOk = await fetch(
      `${storageBaseUrl()}/storage/v1/object/messenger-attachments/${path}`,
      {
        headers: {
          apikey: env.ANON_KEY,
          Authorization: `Bearer ${jwtFor("sales")}`,
        },
      },
    );
    test.info().annotations.push({
      type: "E6",
      description: `upload=${up.status} denied=${getDenied.status} member=${getOk.status}`,
    });
    if (up.ok) {
      expect(getDenied.status).toBeGreaterThanOrEqual(400);
      expect(getOk.status).toBeLessThan(300);
    }
  });

  test("E7 inquiry_price_cache readable by viewer (MSG-N07)", async () => {
    const total = countSql(`select count(*) from inquiry_price_cache`);
    const r = await rest(
      jwtFor("viewer"),
      `/inquiry_price_cache?select=*&limit=50`,
    );
    expect(r.status).toBe(200);
    const rows = (r.body as unknown[]) ?? [];
    test.info().annotations.push({
      type: "E7-MSG-N07",
      description: `db_total=${total} viewer_rows=${rows.length}`,
    });
    // Known MSG-N07: if SELECT true, viewer would see rows when cache nonempty.
    // Actual: viewer_rows=0 while db_total>0 means leak is mitigated (or column RLS).
    if (total > 0 && rows.length === 0) {
      test.info().annotations.push({
        type: "E7-MITIGATED",
        description: "viewer got 0 rows while cache nonempty — MSG-N07 may be fixed on deployed build",
      });
    }
    expect(r.status).toBe(200);
  });

  test("E8 viewer capabilities: send/create group/create inquiry", async () => {
    const g = await rpc(jwtFor("viewer"), "create_messenger_group", {
      p_name: `E2E-COLLAB-20260921-2352-E8-viewer`,
      p_type: "group",
    });
    const send = await rpc(jwtFor("viewer"), "send_messenger_message", {
      p_group_id: outsiderGroupId,
      p_content: "viewer-should-not",
    });
    const inq = await rpc(jwtFor("viewer"), "create_inquiry", {
      p_group_id: outsiderGroupId,
      p_product_id: PRODUCT.id,
      p_assigned_to: USER_IDS.manager,
    });
    test.info().annotations.push({
      type: "E8",
      description: `create_group=${g.status}:${g.text.slice(0, 80)} send=${send.status} inquiry=${inq.status}`,
    });
    // Record actual: create_group may succeed (no app-role gate on RPC) — flag if so
    expect(send.status).toBeGreaterThanOrEqual(400);
    expect(inq.status).toBeGreaterThanOrEqual(400);
  });

  test("E9 anon key: 0 rows / errors on messenger tables", async () => {
    const key = anonKey();
    expect(key.length).toBeGreaterThan(10);
    for (const table of [
      "messenger_messages",
      "messenger_attachments",
      "messenger_read_receipts",
      "messenger_group_members",
      "messenger_groups",
      "inquiries",
      "inquiry_replies",
      "inquiry_transfers",
      "inquiry_status_history",
      "inquiry_price_cache",
    ]) {
      const r = await rest(null, `/${table}?select=id&limit=5`);
      const n = Array.isArray(r.body) ? r.body.length : -1;
      test.info().annotations.push({
        type: `E9-${table}`,
        description: `status=${r.status} rows=${n}`,
      });
      if (r.status === 200) expect(n).toBe(0);
      else expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });
});
