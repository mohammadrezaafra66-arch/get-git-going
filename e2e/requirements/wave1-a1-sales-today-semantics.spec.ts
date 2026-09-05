/**
 * Wave 1 / A-1 — «فروش امروز» must mean something, and a failure must never
 * look like a quiet zero.
 *
 * The old hook did this:
 *
 *     const { data, error } = await supabase.from("invoices")...
 *     if (error || !data) return { count: 0, totalAmount: 0, issuedCount: 0 };
 *
 * `invoices` was dropped by migration 332 on 2026-08-08, so `error` was set on
 * every single call and the tile reported a confident 0 for weeks. The two
 * states that must never be confused are:
 *
 *   - nobody sold anything today          -> a real 0
 *   - the query failed                    -> the caller must be told
 *
 * There is no sales activity today (accepted_today = 0, latest accepted quote
 * 2026-08-31), so a screenshot of a zero proves nothing either way. That is why
 * the proof is here and not in the browser.
 *
 * Run:
 *   npx playwright test e2e/requirements/wave1-a1-sales-today-semantics.spec.ts \
 *     --workers=1 --reporter=line
 */
import { test, expect } from "@playwright/test";

import {
  bucketAcceptedByTehranDay,
  fetchTodaySales,
  lastTehranDayStarts,
  summariseAcceptedQuotes,
  tehranDayKey,
  tehranDayRange,
  tehranDayStart,
  type AcceptedQuoteRow,
} from "../../src/hooks/dashboard/salesSource";
import { rest, mintJwt, ADMIN_USER_ID } from "../helpers/pgrest";

const jwt = mintJwt(ADMIN_USER_ID);

test.describe("A-1 — an error is not a zero", () => {
  test("a query error is thrown, not folded into { count: 0 }", async () => {
    // This is the whole point of the row. React Query turns a throw into
    // `isError`, and `data` stays undefined, so the tile renders «—» rather
    // than «۰» (KpiCard.tsx treats null/undefined as an em dash).
    await expect(
      fetchTodaySales(async () => ({
        data: null,
        error: { code: "42P01", message: 'relation "public.invoices" does not exist' },
      })),
    ).rejects.toThrow(/42P01/);
  });

  test("a genuinely empty day is a real zero, not an error", async () => {
    const stats = await fetchTodaySales(async () => ({ data: [], error: null }));
    expect(stats).toEqual({ count: 0, totalAmount: 0, issuedCount: 0 });
  });

  test("amounts come from final_amount and are summed", () => {
    const rows: AcceptedQuoteRow[] = [
      { final_amount: 106_300_000, status: "accepted", accepted_at: "2026-08-31T12:47:18Z" },
      { final_amount: 110_000_000, status: "accepted", accepted_at: "2026-08-31T12:48:12Z" },
      { final_amount: null, status: "accepted", accepted_at: "2026-08-31T12:49:00Z" },
    ];
    expect(summariseAcceptedQuotes(rows)).toEqual({
      count: 3,
      totalAmount: 216_300_000,
      issuedCount: 3,
    });
  });
});

test.describe("A-1 — the day boundary is Tehran's, not the browser's", () => {
  test("a quote accepted at 21:00 UTC belongs to the NEXT Tehran day", () => {
    // Tehran is UTC+03:30, so 2026-08-31T21:00Z is 2026-09-01 00:30 local.
    // Reading the ISO string's first ten characters — which the old code did —
    // would have filed this under 2026-08-31.
    expect(tehranDayKey(new Date("2026-08-31T21:00:00Z"))).toBe("2026-09-01");
    expect(tehranDayKey(new Date("2026-08-31T20:29:00Z"))).toBe("2026-08-31");
  });

  test("the day range is a half-open [start, end) exactly 24h wide", () => {
    const { startIso, endIso } = tehranDayRange(new Date("2026-09-05T09:00:00Z"));
    expect(startIso).toBe("2026-09-04T20:30:00.000Z");
    expect(endIso).toBe("2026-09-05T20:30:00.000Z");
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(24 * 3_600_000);
  });

  test("the start of a Tehran day is midnight there, whatever the host offset", () => {
    expect(tehranDayStart(new Date("2026-09-05T23:59:59Z")).toISOString()).toBe(
      "2026-09-05T20:30:00.000Z",
    );
  });

  test("a 7-day window is 7 consecutive Tehran days ending today", () => {
    const days = lastTehranDayStarts(7, new Date("2026-09-05T09:00:00Z"));
    expect(days.map(tehranDayKey)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
});

test.describe("A-1 — the chart reproduces the real accepted-quote history", () => {
  test("2026-08-31 buckets to 4 quotes totalling 947,300,000 from live data", async () => {
    // A fixed window rather than "the last 7 days", so this assertion keeps
    // holding after 2026-08-31 falls out of a rolling window.
    const window = [
      tehranDayStart(new Date("2026-08-30T12:00:00Z")),
      tehranDayStart(new Date("2026-08-31T12:00:00Z")),
      tehranDayStart(new Date("2026-09-01T12:00:00Z")),
    ];
    const from = window[0].toISOString();
    const to = tehranDayStart(new Date("2026-09-02T12:00:00Z")).toISOString();

    const r = await rest<AcceptedQuoteRow[]>(
      jwt,
      `/sales_quotes?select=final_amount,status,accepted_at` +
        `&accepted_at=gte.${from}&accepted_at=lt.${to}`,
    );
    expect(r.status, r.text.slice(0, 200)).toBe(200);

    const buckets = bucketAcceptedByTehranDay(r.body ?? [], window);
    expect(buckets).toEqual([
      { date: "2026-08-30", amount: 0, count: 0 },
      { date: "2026-08-31", amount: 947_300_000, count: 4 },
      { date: "2026-09-01", amount: 0, count: 0 },
    ]);
  });

  test("`accepted_at` marks exactly the accepted quotes and no others", async () => {
    // The owner's definition leans on this: filtering by `accepted_at` and
    // filtering by status='accepted' must select the same rows. If that ever
    // stops being true the definition needs revisiting, so assert it.
    const byTimestamp = await rest<{ id: string }[]>(
      jwt,
      "/sales_quotes?select=id&accepted_at=not.is.null",
    );
    const byStatus = await rest<{ id: string }[]>(
      jwt,
      "/sales_quotes?select=id&status=eq.accepted",
    );
    expect(byTimestamp.status).toBe(200);
    expect(byStatus.status).toBe(200);
    const a = (byTimestamp.body ?? []).map((r) => r.id).sort();
    const b = (byStatus.body ?? []).map((r) => r.id).sort();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});
