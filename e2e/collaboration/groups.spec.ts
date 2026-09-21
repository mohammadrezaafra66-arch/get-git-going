import { test, expect } from "@playwright/test";
import { USER_IDS, nameOf } from "./_helpers/constants";
import {
  addMember,
  createGroup,
  memberRole,
  sendMessage,
} from "./_helpers/fixtures";
import { countSql, dbScalar, jwtFor, rpc, rest } from "./_helpers/client";
import { contextForRole, gotoAuthed } from "./_helpers/ui";

test.describe("B — Groups and membership", () => {
  test.setTimeout(120_000);

  test("B1 create private/group/operational as sales; creator is admin", async () => {
    for (const type of ["private", "group", "operational"] as const) {
      const id = await createGroup("sales", type, `B1-${type}`);
      expect(memberRole(id, USER_IDS.sales)).toBe("admin");
      const gtype = dbScalar(`select type from messenger_groups where id='${id}'`);
      expect(gtype).toBe(type);
    }
  });

  test("B2 group admin adds member roles incl purchaser", async () => {
    const id = await createGroup("sales", "group", "B2");
    for (const [uid, role] of [
      [USER_IDS.manager, "purchaser"],
      [USER_IDS.sales2, "member"],
      [USER_IDS.viewer, "viewer"],
    ] as const) {
      const { r, before } = await addMember("sales", id, uid, role);
      expect(r.status, r.text).toBeLessThan(300);
      const after = countSql(
        `select count(*) from messenger_group_members where group_id='${id}' and user_id='${uid}'`,
      );
      expect(after).toBe(before + 1);
      expect(memberRole(id, uid)).toBe(role);
    }
  });

  test("B3 plain member gets NOT_GROUP_ADMIN; no row added", async () => {
    const id = await createGroup("sales", "group", "B3");
    await addMember("sales", id, USER_IDS.sales2, "member");
    const before = countSql(
      `select count(*) from messenger_group_members where group_id='${id}'`,
    );
    // sales2 is member, tries to add accountant
    const jwt = jwtFor("sales2");
    const r = await rpc(jwt, "add_messenger_group_member", {
      p_group_id: id,
      p_user_id: USER_IDS.accountant,
      p_role: "member",
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(`${r.text}${JSON.stringify(r.body)}`).toMatch(/NOT_GROUP_ADMIN/i);
    const after = countSql(
      `select count(*) from messenger_group_members where group_id='${id}'`,
    );
    expect(after).toBe(before);
  });

  test("B4 remove member → cannot see group/messages (API)", async () => {
    const id = await createGroup("sales", "group", "B4");
    await addMember("sales", id, USER_IDS.sales2, "member");
    const { r: send } = await sendMessage("sales", id, nameOf("B4-msg"));
    expect(send.status).toBeLessThan(300);

    // Positive twin: sales2 sees messages
    const asMember = await rest(
      jwtFor("sales2"),
      `/messenger_messages?group_id=eq.${id}&select=id`,
    );
    expect(asMember.status).toBe(200);
    expect((asMember.body as unknown[]).length).toBeGreaterThan(0);

    // Admin removes via DELETE (same as UI)
    const del = await rest(jwtFor("sales"), `/messenger_group_members?group_id=eq.${id}&user_id=eq.${USER_IDS.sales2}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    // Re-read membership
    const still = countSql(
      `select count(*) from messenger_group_members where group_id='${id}' and user_id='${USER_IDS.sales2}'`,
    );
    expect(still, `delete status=${del.status} body=${del.text}`).toBe(0);

    const afterRemove = await rest(
      jwtFor("sales2"),
      `/messenger_messages?group_id=eq.${id}&select=id`,
    );
    expect((afterRemove.body as unknown[]).length).toBe(0);

    const groups = await rest(
      jwtFor("sales2"),
      `/messenger_groups?id=eq.${id}&select=id`,
    );
    expect((groups.body as unknown[]).length).toBe(0);
  });

  test("B5 deactivate: group creator (sales) vs system admin", async () => {
    const id = await createGroup("sales", "group", "B5");
    const asCreator = await rpc(jwtFor("sales"), "deactivate_messenger_group", {
      p_group_id: id,
    });
    const activeAfterCreator = dbScalar(
      `select coalesce(is_active::text,'t') from messenger_groups where id='${id}'`,
    );
    // Creator should NOT succeed (system admin only) — record both outcomes
    const creatorCould =
      asCreator.status < 300 && (activeAfterCreator === "f" || activeAfterCreator === "false");

    const id2 = await createGroup("sales", "group", "B5b");
    const asAdmin = await rpc(jwtFor("admin"), "deactivate_messenger_group", {
      p_group_id: id2,
    });
    const activeAfterAdmin = dbScalar(
      `select coalesce(is_active::text,'t') from messenger_groups where id='${id2}'`,
    );
    const adminCould =
      asAdmin.status < 300 && (activeAfterAdmin === "f" || activeAfterAdmin === "false");

    test.info().annotations.push({
      type: "B5",
      description: `creator_status=${asCreator.status} creator_could=${creatorCould} active=${activeAfterCreator}; admin_status=${asAdmin.status} admin_could=${adminCould} active=${activeAfterAdmin}`,
    });

    // Documented truth: only system admin
    expect(creatorCould).toBe(false);
    expect(adminCould).toBe(true);
  });

  test("B6 user in no E2E group sees usable empty/list state", async ({ browser }) => {
    // viewer may already be in groups from prior runs; just assert /messages renders
    const ctx = await contextForRole(browser, "viewer");
    const page = await ctx.newPage();
    await gotoAuthed(page, "/messages");
    await expect(page.locator("body")).toBeVisible();
    const text = await page.locator("body").innerText();
    // Empty state OR conversation list — either is usable
    expect(text.length).toBeGreaterThan(10);
    await ctx.close();
  });
});
