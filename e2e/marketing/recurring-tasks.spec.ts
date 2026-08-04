import { expect, test } from "@playwright/test";
import {
  ADMIN_USER_ID,
  appUrl,
  errMessage,
  lanEnv,
  mintJwt,
  rest,
  tehranToday,
  userWithRole,
} from "../helpers/pgrest";

/**
 * Phase 12 (f) — requirement 224: recurring marketing tasks.
 *
 * Asserts the owner's three binding guarantees end to end against the deployed
 * stack: the generation job is idempotent, completion reaches the person's
 * profile and the leaderboard, and an unfinished task does NOT roll over.
 *
 * API-level by design: every rule lives in the database (triggers + a partial
 * unique index) precisely so that no client path can dodge it, so the honest
 * test is the one that tries to dodge it.
 */

const TPL_ID = "dddddddd-0000-4000-8000-0000000e2e01";
const CHANNEL_TITLE = "E2E224 وظیفهٔ تکرارشونده";

let adminJwt: string;
let assigneeId: string;
let assigneeJwt: string;
let strangerJwt: string;
let channelId: string;
const today = tehranToday();

async function cleanup() {
  await rest(adminJwt, `/tasks?reference_id=eq.${TPL_ID}`, { method: "DELETE" });
  await rest(adminJwt, `/marketing_task_templates?id=eq.${TPL_ID}`, { method: "DELETE" });
}

test.beforeAll(async () => {
  adminJwt = mintJwt(ADMIN_USER_ID);

  const sales = await userWithRole(adminJwt, "sales");
  expect(sales, "a user with the sales role must exist on the test server").toBeTruthy();
  assigneeId = sales!;
  assigneeJwt = mintJwt(assigneeId);

  // A genuinely UNPRIVILEGED user. Picking "any other profile" is not enough:
  // this server has 14 admins, so a naive pick lands on one of them and the
  // permission test passes a template creation it was supposed to refuse.
  const privileged = await rest<{ user_id: string }[]>(
    adminJwt,
    "/user_roles?select=user_id&role=in.(admin,manager,accountant)",
  );
  const privilegedIds = new Set(privileged.body.map((r) => r.user_id));
  const candidates = await rest<{ id: string }[]>(adminJwt, "/profiles?select=id&limit=200");
  const stranger = candidates.body.find((p) => p.id !== assigneeId && !privilegedIds.has(p.id));
  expect(stranger, "an unprivileged profile must exist to test refusal").toBeTruthy();
  strangerJwt = mintJwt(stranger!.id);

  const ch = await rest<{ id: string }[]>(
    adminJwt,
    `/marketing_channels?select=id&is_active=eq.true&limit=1`,
  );
  expect(ch.body.length, "an active marketing channel must exist").toBeGreaterThan(0);
  channelId = ch.body[0].id;

  await cleanup();
});

test.afterAll(async () => {
  await cleanup();
  // Data hygiene: assert zero leftovers rather than assuming the delete worked.
  const tasks = await rest<unknown[]>(adminJwt, `/tasks?reference_id=eq.${TPL_ID}&select=id`);
  const tpl = await rest<unknown[]>(
    adminJwt,
    `/marketing_task_templates?id=eq.${TPL_ID}&select=id`,
  );
  expect(tasks.body).toHaveLength(0);
  expect(tpl.body).toHaveLength(0);
});

async function runJob(forDate?: string) {
  const res = await fetch(`${appUrl()}/api/public/hooks/generate-marketing-tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lanEnv().MARKETING_TASKS_WORKER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: forDate ? JSON.stringify({ for_date: forDate }) : undefined,
  });
  return { status: res.status, body: (await res.json()) as Record<string, number | string> };
}

test.describe("224 — recurring marketing tasks", () => {
  test("the cron endpoint rejects a missing or wrong token", async () => {
    const noToken = await fetch(`${appUrl()}/api/public/hooks/generate-marketing-tasks`, {
      method: "POST",
    });
    expect(noToken.status).toBe(401);

    const badToken = await fetch(`${appUrl()}/api/public/hooks/generate-marketing-tasks`, {
      method: "POST",
      headers: { Authorization: "Bearer definitely-not-the-token" },
    });
    expect(badToken.status).toBe(401);
  });

  test("only admin/manager/accountant can define a template", async () => {
    const denied = await rest(strangerJwt, "/marketing_task_templates", {
      method: "POST",
      body: JSON.stringify({
        channel_id: channelId,
        title: "E2E224 نفوذی",
        assigned_to: assigneeId,
        recurs_on_days: [0, 1, 2, 3, 4, 5, 6],
      }),
    });
    expect(denied.status, `expected a refusal, got ${denied.status}`).toBeGreaterThanOrEqual(400);

    // Belt and braces: if it somehow succeeded, do not leave it behind to
    // poison the idempotency test that follows.
    await rest(
      adminJwt,
      "/marketing_task_templates?title=eq.E2E224%20%D9%86%D9%81%D9%88%D8%B0%DB%8C",
      {
        method: "DELETE",
      },
    );
  });

  test("running the job twice for the same day creates exactly one set", async () => {
    const created = await rest(adminJwt, "/marketing_task_templates", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: TPL_ID,
        channel_id: channelId,
        title: CHANNEL_TITLE,
        assigned_to: assigneeId,
        recurs_on_days: [0, 1, 2, 3, 4, 5, 6],
      }),
    });
    expect(created.status).toBe(201);

    const first = await runJob();
    const second = await runJob();

    expect(first.status).toBe(200);
    // The whole point: a second run adds nothing.
    expect(Number(second.body.generated)).toBe(0);

    // ⛔ `generated` and `skipped_existing` are GLOBAL counters — the job runs for every active
    // template, not just this spec's. They were asserted as absolute 1s when this spec was
    // written, which was only true because `marketing_task_templates` happened to hold zero rows
    // at the time. The owner has since configured a real template, so the absolutes became wrong
    // the moment the feature was actually used — and the first failure then cascaded, because
    // Playwright re-runs `beforeAll` (and therefore `cleanup()`) after a failure, wiping the
    // fixture out from under the five tests that follow.
    //
    // What the test is really about is this spec's own template, so that is what is asserted
    // exactly; the global counter is only required to be consistent with it.
    expect(Number(second.body.skipped_existing)).toBeGreaterThanOrEqual(1);
    expect(
      Number(first.body.generated) + Number(first.body.skipped_existing ?? 0),
      "the first run must have accounted for this template one way or the other",
    ).toBeGreaterThanOrEqual(1);

    // The date is decided by the database in Asia/Tehran, not by the server clock.
    expect(first.body.for_date).toBe(today);

    const rows = await rest<
      { due_date: string; assigned_queue: string; proof_requirement: string }[]
    >(
      adminJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=id,due_date,assigned_queue,proof_requirement`,
    );
    expect(rows.body).toHaveLength(1);
    expect(rows.body[0].due_date).toBe(today);
    expect(rows.body[0].assigned_queue).toBe("marketing");
    // Owner rule: tickable with no evidence required.
    expect(rows.body[0].proof_requirement).toBe("none");
  });

  test("a stranger cannot see or tick someone else's task", async () => {
    const mine = await rest<{ id: string }[]>(
      assigneeJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=id`,
    );
    expect(mine.body).toHaveLength(1);

    const theirs = await rest<unknown[]>(strangerJwt, `/tasks?reference_id=eq.${TPL_ID}&select=id`);
    expect(theirs.body).toHaveLength(0);

    const tick = await rest(strangerJwt, "/rpc/complete_marketing_task", {
      method: "POST",
      body: JSON.stringify({ p_task_id: mine.body[0].id }),
    });
    expect(tick.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(tick.body)).toContain("فقط مسئول همین وظیفه");
  });

  test("the rollover back door is closed: due_date cannot be moved", async () => {
    const mine = await rest<{ id: string }[]>(
      assigneeJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=id`,
    );
    const moved = await rest(assigneeJwt, `/tasks?id=eq.${mine.body[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ due_date: "2999-01-01" }),
    });
    expect(moved.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(moved.body)).toContain("منتقل نمی‌شود");
  });

  test("completion reaches the person's score, breakdown and the leaderboard", async () => {
    // Asserted as a DELTA in the promotion KPI, not as an absolute score.
    // `employee_scores` is a cache that survives between runs and cannot be
    // cleared through the API (no DELETE policy on the scoring tables), so a
    // ">" on the absolute total silently depends on leftovers from a previous
    // run. The KPI count is exact and self-contained.
    const beforeEv = await rest<unknown[]>(
      adminJwt,
      `/employee_score_events?employee_id=eq.${assigneeId}&event_type=eq.promotion_completed&select=id`,
    );
    const beforeCount = beforeEv.body.length;

    const beforeScores = await rest<{ breakdown: { promotions_completed?: { value: number } } }[]>(
      adminJwt,
      `/employee_scores?employee_id=eq.${assigneeId}&select=breakdown`,
    );
    const beforeKpi = Number(beforeScores.body?.[0]?.breakdown?.promotions_completed?.value ?? 0);

    const mine = await rest<{ id: string }[]>(
      assigneeJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=id`,
    );
    const done = await rest(assigneeJwt, "/rpc/complete_marketing_task", {
      method: "POST",
      body: JSON.stringify({ p_task_id: mine.body[0].id }),
    });
    expect(done.status).toBe(200);

    // Reuses the EXISTING gamification path — no new scoring mechanism.
    // `promotion_completed` was already an enabled KPI and an active XP rule
    // that nothing had ever emitted; this is the first emitter.
    const ev = await rest<{ payload: { origin: string } }[]>(
      adminJwt,
      `/employee_score_events?employee_id=eq.${assigneeId}&event_type=eq.promotion_completed&select=payload`,
    );
    expect(ev.body.length, "exactly one new scoring event").toBe(beforeCount + 1);
    expect(ev.body.some((e) => e.payload?.origin === "marketing_recurring_task")).toBe(true);

    const after = await rest<
      { total_score: string; breakdown: Record<string, { value: number }> }[]
    >(adminJwt, `/employee_scores?employee_id=eq.${assigneeId}&select=total_score,breakdown`);
    expect(after.body, "the person now has a score row — their profile").toHaveLength(1);
    expect(after.body[0].breakdown.promotions_completed.value).toBe(beforeKpi + 1);
    expect(Number(after.body[0].total_score)).toBeGreaterThan(0);

    const lb = await rest<{ employee_id: string }[]>(adminJwt, "/rpc/get_leaderboard_daily", {
      method: "POST",
      body: JSON.stringify({ _limit: 500, _offset: 0 }),
    });
    expect(lb.body.some((r) => r.employee_id === assigneeId)).toBe(true);
  });

  test("a completed task cannot be ticked again or reopened", async () => {
    const mine = await rest<{ id: string }[]>(
      assigneeJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=id`,
    );
    const again = await rest(assigneeJwt, "/rpc/complete_marketing_task", {
      method: "POST",
      body: JSON.stringify({ p_task_id: mine.body[0].id }),
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(again.body)).toContain("قبلاً تکمیل شده");

    const reopen = await rest(assigneeJwt, `/tasks?id=eq.${mine.body[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "pending" }),
    });
    expect(reopen.status).toBeGreaterThanOrEqual(400);
  });

  test("an unfinished task does not roll over: it expires and is not recreated", async () => {
    // Build yesterday's set and leave it untouched.
    const y = new Date(`${today}T00:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);

    await runJob(yesterday);
    const afterYesterday = await rest<{ due_date: string; status: string }[]>(
      adminJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=due_date,status&order=due_date.asc`,
    );
    expect(afterYesterday.body.some((r) => r.due_date === yesterday)).toBe(true);

    // Now run "today" again. Yesterday's unfinished task must EXPIRE, and must
    // not appear again with today's date.
    await runJob();

    const rows = await rest<{ due_date: string; status: string }[]>(
      adminJwt,
      `/tasks?reference_id=eq.${TPL_ID}&select=due_date,status&order=due_date.asc`,
    );

    // Exactly one row per day — nothing was carried forward or duplicated.
    const perDay = new Map<string, number>();
    rows.body.forEach((r) => perDay.set(r.due_date, (perDay.get(r.due_date) ?? 0) + 1));
    for (const [, n] of perDay) expect(n).toBe(1);

    const yesterdayRow = rows.body.find((r) => r.due_date === yesterday);
    expect(yesterdayRow?.status, "yesterday's unfinished task must be expired").toBe("expired");

    // And it can never be ticked afterwards.
    const expired = await rest<{ id: string }[]>(
      adminJwt,
      `/tasks?reference_id=eq.${TPL_ID}&due_date=eq.${yesterday}&select=id`,
    );
    const tickExpired = await rest(assigneeJwt, "/rpc/complete_marketing_task", {
      method: "POST",
      body: JSON.stringify({ p_task_id: expired.body[0].id }),
    });
    expect(tickExpired.status).toBeGreaterThanOrEqual(400);
    expect(errMessage(tickExpired.body)).toContain("منقضی");
  });
});
