import { test, expect } from "@playwright/test";
import { createInquiryApi, seedInquiryGroup, asUuid } from "./_helpers/fixtures";
import { countSql, dbScalar, dbScalarOn } from "./_helpers/client";

/**
 * D6/D7 — SLA wiring via scheduled ticker only. Tag @slow.
 * Total wait ≤ 12 minutes, poll every 60s. NO manual tick_inquiries.
 */
test.describe("D6/D7 inquiry SLA @slow", () => {
  test("D6 SLA transitions and D7 penalty @slow", async () => {
    test.setTimeout(13 * 60_000);
    test.slow();

    const cronJob = dbScalarOn(
      "postgres",
      `select count(*)::text from cron.job where jobname='afrakala-tick-inquiries-1min' and active and database='afrakala'`,
    );
    const tickFn = dbScalar(
      `select count(*) from pg_proc where proname='tick_inquiries'`,
    );
    test.info().annotations.push({
      type: "D6-wire",
      description: `cron_job_active=${cronJob} tick_inquiries_fn=${tickFn}`,
    });
    expect(Number(cronJob), "cron job afrakala-tick-inquiries-1min must be active").toBeGreaterThan(0);

    const { groupId, purchaserId } = await seedInquiryGroup("D6");
    const created = await createInquiryApi("sales", groupId, purchaserId);
    expect(created.r.status, created.r.text).toBeLessThan(300);
    const inquiryId = asUuid(created.r.body);

    const timeline: { t: number; status: string; hist: number }[] = [];
    const start = Date.now();
    const deadline = start + 12 * 60_000;

    while (Date.now() < deadline) {
      // Observe only — scheduled ticker advances status; do NOT call tick_inquiries.
      const status = dbScalar(`select status::text from inquiries where id='${inquiryId}'`);
      const hist = countSql(
        `select count(*) from inquiry_status_history where inquiry_id='${inquiryId}' and reason='auto-tick'`,
      );
      timeline.push({ t: Math.round((Date.now() - start) / 1000), status, hist });
      if (
        status === "critical_10min" ||
        status === "transfer_available" ||
        status === "expired"
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 60_000));
    }

    test.info().annotations.push({
      type: "D6-timeline",
      description: JSON.stringify(timeline),
    });

    const finalStatus = timeline[timeline.length - 1]?.status ?? "";
    const statusesSeen = new Set(timeline.map((x) => x.status));
    const progressed =
      statusesSeen.has("warning_5min") ||
      statusesSeen.has("danger_8min") ||
      statusesSeen.has("critical_10min") ||
      statusesSeen.has("transfer_available");

    const penalties = countSql(
      `select count(*) from performance_penalties
       where inquiry_id='${inquiryId}'`,
    );
    const scoreEvents = countSql(
      `select count(*) from employee_score_events
       where employee_id='${purchaserId}'
         and triggered_at > now() - interval '20 minutes'`,
    );
    test.info().annotations.push({
      type: "D7",
      description: `penalties=${penalties} score_events_20m=${scoreEvents} final=${finalStatus} cron_job=${cronJob}`,
    });

    expect(progressed, `SLA never progressed without manual tick; timeline=${JSON.stringify(timeline)}`).toBe(
      true,
    );

    if (statusesSeen.has("critical_10min") || statusesSeen.has("transfer_available")) {
      expect(penalties + scoreEvents).toBeGreaterThan(0);
    }
  });
});
