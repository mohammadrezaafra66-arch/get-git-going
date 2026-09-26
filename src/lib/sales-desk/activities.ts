/**
 * Wave 4 activities on sales_interactions (ADR-4). Local casts — types.ts not regenerated.
 */
import { supabase } from "@/integrations/supabase/client";
import { salesDeskErrorMessage } from "./errors";
import { createSalesInteraction } from "./interactions";

export type SalesActivityType = {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
};

export type SalesActivityRow = {
  id: string;
  person_id: string;
  customer_id: string | null;
  kind: string;
  title: string | null;
  body: string;
  status: string;
  salesperson_id: string | null;
  author_id: string;
  deal_id: string | null;
  activity_type_id: string | null;
  due_at: string | null;
  due_has_time: boolean;
  original_due_at: string | null;
  done_at: string | null;
  result_note: string | null;
  reminder_enabled?: boolean | null;
  reminder_fired_at?: string | null;
  created_at: string;
  updated_at?: string;
  activity_type?: SalesActivityType | null;
  person?: { display_name: string } | null;
  salesperson?: { id: string; full_name: string | null } | null;
};

const ACTIVITY_SELECT =
  "id, person_id, customer_id, kind, title, body, status, salesperson_id, author_id, deal_id, activity_type_id, due_at, due_has_time, original_due_at, done_at, result_note, created_at, updated_at";

/** Call-like Didar sort_orders → kind=call; everything else → note. */
export function kindForActivitySortOrder(sortOrder: number): "call" | "note" {
  return sortOrder === 1 || sortOrder === 2 || sortOrder === 6 ? "call" : "note";
}

export async function listSalesActivityTypes(): Promise<SalesActivityType[]> {
  const { data, error } = await supabase
    .from("sales_activity_types" as never)
    .select("id, title, sort_order, is_active" as never)
    .eq("is_active" as never, true as never)
    .order("sort_order" as never, { ascending: true } as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data ?? []) as unknown as SalesActivityType[];
}

export type CreateSalesActivityInput = {
  personId: string;
  customerId?: string | null;
  dealId?: string | null;
  activityTypeId: string;
  title?: string | null;
  body?: string;
  salespersonId: string;
  dueAt?: string | null;
  dueHasTime?: boolean;
  durationMinutes?: number | null;
  reminderEnabled?: boolean;
  /** When true, set done_at + result_note on create. */
  markDone?: boolean;
  resultNote?: string | null;
};

export async function createSalesActivity(
  input: CreateSalesActivityInput,
): Promise<string> {
  const types = await listSalesActivityTypes();
  const type = types.find((t) => t.id === input.activityTypeId);
  if (!type) throw new Error("نوع فعالیت نامعتبر است");

  const kind = kindForActivitySortOrder(type.sort_order);
  let body = (input.body ?? "").trim();
  if (input.durationMinutes != null && input.durationMinutes > 0) {
    const line = `مدت انجام فعالیت (دقیقه): ${input.durationMinutes}`;
    body = body ? `${body}\n${line}` : line;
  }

  const id = await createSalesInteraction({
    personId: input.personId,
    kind,
    body: body || type.title,
    title: input.title?.trim() || type.title,
    customerId: input.customerId ?? null,
    salespersonId: input.salespersonId,
    nextFollowUpAt: input.dueAt ?? null,
    source: "manual",
    status: "open",
    dealId: input.dealId ?? null,
  });

  const patch: Record<string, unknown> = {
    activity_type_id: input.activityTypeId,
    salesperson_id: input.salespersonId,
    due_at: input.dueAt ?? null,
    due_has_time: Boolean(input.dueHasTime && input.dueAt),
    original_due_at: input.dueAt ?? null,
  };
  if (input.reminderEnabled != null) {
    patch.reminder_enabled = Boolean(
      input.reminderEnabled && input.dueHasTime && input.dueAt,
    );
  }

  const { error } = await supabase
    .from("sales_interactions" as never)
    .update(patch as never)
    .eq("id" as never, id as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));

  if (input.markDone) {
    await markActivityDone({
      id,
      resultNote: input.resultNote ?? "",
      actorId: input.salespersonId,
      ownerId: input.salespersonId,
    });
  }
  return id;
}

export async function markActivityDone(input: {
  id: string;
  resultNote: string;
  actorId: string;
  ownerId: string | null;
}): Promise<void> {
  if (!input.ownerId || input.ownerId !== input.actorId) {
    throw new Error("فقط مسئول انجام این فعالیت می‌تواند نتیجه را ثبت کند");
  }
  const note = input.resultNote.trim();
  if (!note) throw new Error("نتیجه‌ی فعالیت خود را یادداشت کنید");
  const { error } = await supabase
    .from("sales_interactions" as never)
    .update({
      done_at: new Date().toISOString(),
      result_note: note,
      status: "done",
    } as never)
    .eq("id" as never, input.id as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
}

export async function revertActivityDone(input: {
  id: string;
  actorId: string;
  ownerId: string | null;
}): Promise<void> {
  if (!input.ownerId || input.ownerId !== input.actorId) {
    throw new Error("فقط مسئول انجام این فعالیت می‌تواند وضعیت را برگرداند");
  }
  const { error } = await supabase
    .from("sales_interactions" as never)
    .update({
      done_at: null,
      result_note: null,
      status: "open",
    } as never)
    .eq("id" as never, input.id as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
}

export async function postponeActivityDue(input: {
  id: string;
  newDueAt: string;
  dueHasTime: boolean;
  actorId: string;
  ownerId: string | null;
  currentOriginalDueAt: string | null;
  currentDueAt: string | null;
}): Promise<void> {
  if (!input.ownerId || input.ownerId !== input.actorId) {
    throw new Error("فقط مسئول انجام این فعالیت می‌تواند موعد را تغییر دهد");
  }
  const patch: Record<string, unknown> = {
    due_at: input.newDueAt,
    due_has_time: input.dueHasTime,
  };
  // Keep original_due_at; set once on first due if null.
  if (!input.currentOriginalDueAt && input.currentDueAt) {
    patch.original_due_at = input.currentDueAt;
  } else if (!input.currentOriginalDueAt) {
    patch.original_due_at = input.newDueAt;
  }
  const { error } = await supabase
    .from("sales_interactions" as never)
    .update(patch as never)
    .eq("id" as never, input.id as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
}

export async function setActivityReminder(input: {
  id: string;
  enabled: boolean;
  dueHasTime: boolean;
}): Promise<void> {
  if (input.enabled && !input.dueHasTime) {
    throw new Error("افزودن یادآور برای فعالیت فقط وقتی ساعت مشخص است");
  }
  const { error } = await supabase
    .from("sales_interactions" as never)
    .update({ reminder_enabled: input.enabled } as never)
    .eq("id" as never, input.id as never);
  if (error) {
    // Column may be absent before mig 575 — soft-fail create path only.
    if (/reminder_enabled/i.test(error.message || "")) {
      throw new Error("ستون یادآور هنوز اعمال نشده است");
    }
    throw new Error(salesDeskErrorMessage(error.message));
  }
}

export type ActivityDoneFilter = "open" | "done" | "all";

export type ActivityBucket =
  | "past_to_today"
  | "overdue"
  | "today"
  | "tomorrow"
  | "rest_of_week"
  | "other";

/** Fetch Tehran calendar day from DB authority. */
export async function fetchTehranToday(): Promise<string> {
  const { data, error } = await supabase.rpc("tehran_today" as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error("tehran_today مقدار تاریخ برنگرداند");
  }
  return data;
}

function tehranDayOfIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+03:30`);
  d.setTime(d.getTime() + days * 86400000);
  return tehranDayOfIso(d.toISOString());
}

/** Friday = end of Iranian week (week starts Saturday). */
function endOfTehranWeekYmd(todayYmd: string): string {
  const dow = new Date(`${todayYmd}T12:00:00+03:30`).getDay(); // 0=Sun … 5=Fri 6=Sat
  // Days until Friday
  const untilFri = (5 - dow + 7) % 7;
  return addDaysYmd(todayYmd, untilFri);
}

export function bucketForDueAt(
  dueAt: string | null,
  todayYmd: string,
): ActivityBucket | null {
  if (!dueAt) return null;
  const day = tehranDayOfIso(dueAt);
  if (day < todayYmd) return "overdue";
  if (day === todayYmd) return "today";
  const tomorrow = addDaysYmd(todayYmd, 1);
  if (day === tomorrow) return "tomorrow";
  const weekEnd = endOfTehranWeekYmd(todayYmd);
  if (day > tomorrow && day <= weekEnd) return "rest_of_week";
  return "other";
}

export async function listActivities(opts: {
  doneFilter: ActivityDoneFilter;
  salespersonId?: string | null;
  limit?: number;
}): Promise<{ rows: SalesActivityRow[]; todayYmd: string }> {
  const todayYmd = await fetchTehranToday();
  let q = supabase
    .from("sales_interactions" as never)
    .select(ACTIVITY_SELECT as never)
    .not("activity_type_id" as never, "is" as never, null as never)
    .order("due_at" as never, { ascending: true, nullsFirst: false } as never)
    .limit(opts.limit ?? 200);

  if (opts.doneFilter === "open") {
    q = q.is("done_at" as never, null as never);
  } else if (opts.doneFilter === "done") {
    q = q.not("done_at" as never, "is" as never, null as never);
  }
  if (opts.salespersonId) {
    q = q.eq("salesperson_id" as never, opts.salespersonId as never);
  }

  const { data, error } = await q;
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  const rows = await enrichActivities((data ?? []) as unknown as SalesActivityRow[]);
  return { rows, todayYmd };
}

async function enrichActivities(
  rows: SalesActivityRow[],
): Promise<SalesActivityRow[]> {
  if (rows.length === 0) return rows;
  const typeIds = [
    ...new Set(rows.map((r) => r.activity_type_id).filter(Boolean) as string[]),
  ];
  const personIds = [...new Set(rows.map((r) => r.person_id))];
  const profileIds = [
    ...new Set(rows.map((r) => r.salesperson_id).filter(Boolean) as string[]),
  ];
  const [{ data: types }, { data: persons }, { data: profiles }] =
    await Promise.all([
      typeIds.length
        ? supabase
            .from("sales_activity_types" as never)
            .select("id, title, sort_order, is_active" as never)
            .in("id" as never, typeIds as never)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("persons").select("id, display_name").in("id", personIds),
      profileIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ]);
  const typeMap = new Map(
    ((types ?? []) as unknown as SalesActivityType[]).map((t) => [t.id, t]),
  );
  const personMap = new Map((persons ?? []).map((p) => [p.id, p]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    activity_type: r.activity_type_id
      ? typeMap.get(r.activity_type_id) ?? null
      : null,
    person: personMap.get(r.person_id) ?? null,
    salesperson: r.salesperson_id
      ? profileMap.get(r.salesperson_id) ?? null
      : null,
  }));
}

/**
 * Open activities due today or overdue — day boundary from tehran_today().
 * Prefers DB RPC count_open_activities_due_today_or_overdue (mig 574).
 */
export async function countOpenDueTodayOrOverdue(opts: {
  salespersonId: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc(
    "count_open_activities_due_today_or_overdue" as never,
    { p_salesperson_id: opts.salespersonId } as never,
  );
  if (!error && data != null) return Number(data);

  // Fallback if RPC absent
  const todayYmd = await fetchTehranToday();
  const endOfTodayIso = new Date(`${todayYmd}T23:59:59.999+03:30`).toISOString();
  const { count, error: qErr } = await supabase
    .from("sales_interactions" as never)
    .select("id" as never, { count: "exact", head: true } as never)
    .eq("salesperson_id" as never, opts.salespersonId as never)
    .is("done_at" as never, null as never)
    .not("activity_type_id" as never, "is" as never, null as never)
    .not("due_at" as never, "is" as never, null as never)
    .lte("due_at" as never, endOfTodayIso as never);
  if (qErr) throw new Error(salesDeskErrorMessage(qErr.message));
  return count ?? 0;
}

export async function listOpenDueTodayOrOverdue(opts: {
  salespersonId: string;
  limit?: number;
}): Promise<SalesActivityRow[]> {
  const todayYmd = await fetchTehranToday();
  const endOfTodayIso = new Date(`${todayYmd}T23:59:59.999+03:30`).toISOString();
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(ACTIVITY_SELECT as never)
    .eq("salesperson_id" as never, opts.salespersonId as never)
    .is("done_at" as never, null as never)
    .not("activity_type_id" as never, "is" as never, null as never)
    .not("due_at" as never, "is" as never, null as never)
    .lte("due_at" as never, endOfTodayIso as never)
    .order("due_at" as never, { ascending: true } as never)
    .limit(opts.limit ?? 50);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return enrichActivities((data ?? []) as unknown as SalesActivityRow[]);
}

export type FollowUpTrafficLight = "yellow" | "red" | "green" | "grey";

/**
 * Per open deal: yellow=no planned activity, red=overdue, green=today, grey=future.
 */
export async function followUpLightsForDeals(
  dealIds: string[],
): Promise<Map<string, FollowUpTrafficLight>> {
  const map = new Map<string, FollowUpTrafficLight>();
  for (const id of dealIds) map.set(id, "yellow");
  if (dealIds.length === 0) return map;

  const todayYmd = await fetchTehranToday();
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select("id, deal_id, due_at, done_at, activity_type_id" as never)
    .in("deal_id" as never, dealIds as never)
    .is("done_at" as never, null as never)
    .not("activity_type_id" as never, "is" as never, null as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));

  const byDeal = new Map<string, { due_at: string | null }[]>();
  for (const row of (data ?? []) as unknown as Array<{
    deal_id: string | null;
    due_at: string | null;
  }>) {
    if (!row.deal_id) continue;
    const list = byDeal.get(row.deal_id) ?? [];
    list.push({ due_at: row.due_at });
    byDeal.set(row.deal_id, list);
  }

  for (const dealId of dealIds) {
    const acts = byDeal.get(dealId);
    if (!acts || acts.length === 0) {
      map.set(dealId, "yellow");
      continue;
    }
    let hasOverdue = false;
    let hasToday = false;
    let hasFutureOrUndated = false;
    for (const a of acts) {
      if (!a.due_at) {
        hasFutureOrUndated = true;
        continue;
      }
      const b = bucketForDueAt(a.due_at, todayYmd);
      if (b === "overdue") hasOverdue = true;
      else if (b === "today") hasToday = true;
      else hasFutureOrUndated = true;
    }
    if (hasOverdue) map.set(dealId, "red");
    else if (hasToday) map.set(dealId, "green");
    else if (hasFutureOrUndated) map.set(dealId, "grey");
    else map.set(dealId, "yellow");
  }
  return map;
}

export async function dealIdsWithNoOpenActivity(
  dealIds: string[],
): Promise<Set<string>> {
  if (dealIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select("deal_id" as never)
    .in("deal_id" as never, dealIds as never)
    .is("done_at" as never, null as never)
    .not("activity_type_id" as never, "is" as never, null as never);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  const withAct = new Set(
    ((data ?? []) as unknown as Array<{ deal_id: string | null }>)
      .map((r) => r.deal_id)
      .filter(Boolean) as string[],
  );
  return new Set(dealIds.filter((id) => !withAct.has(id)));
}

export async function listDealNotes(dealId: string): Promise<SalesActivityRow[]> {
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(ACTIVITY_SELECT as never)
    .eq("deal_id" as never, dealId as never)
    .eq("kind" as never, "note" as never)
    .order("created_at" as never, { ascending: false } as never)
    .limit(50);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return (data ?? []) as unknown as SalesActivityRow[];
}

export async function listActivitiesForDeal(
  dealId: string,
): Promise<SalesActivityRow[]> {
  const { data, error } = await supabase
    .from("sales_interactions" as never)
    .select(ACTIVITY_SELECT as never)
    .eq("deal_id" as never, dealId as never)
    .not("activity_type_id" as never, "is" as never, null as never)
    .order("due_at" as never, { ascending: true, nullsFirst: false } as never)
    .limit(50);
  if (error) throw new Error(salesDeskErrorMessage(error.message));
  return enrichActivities((data ?? []) as unknown as SalesActivityRow[]);
}

/** Read-time reminder materialization (D6) — calls SECURITY DEFINER RPC if present. */
export async function materializeDueActivityReminders(): Promise<number> {
  const { data, error } = await supabase.rpc(
    "materialize_due_activity_reminders" as never,
  );
  if (error) {
    if (
      /function.*materialize_due_activity_reminders|Could not find.*function/i.test(
        error.message || "",
      )
    ) {
      return -1; // signal unavailable
    }
    throw new Error(salesDeskErrorMessage(error.message));
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}
