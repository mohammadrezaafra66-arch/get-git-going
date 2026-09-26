import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, PhoneIncoming } from "lucide-react";
import { toast } from "sonner";
import { formatDateFa, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { SalesDeskShell, SalesDeskTiltCard } from "@/components/sales-desk";
import { CallTranscriptPanel } from "@/components/calls/CallTranscriptPanel";

/**
 * Wave 6 / C-8 — گزارش فعالیت تلفنی به تفکیک داخلی.
 *
 * دادهٔ جمع از viewهای مهاجرت ۵۱۴؛ ریز مکالمه از `call_logs` با همان گارد RLS.
 * نام کنار داخلی از `call_log_extensions.label` (فهرست داخلی دفتر).
 */

type DailyRow = {
  extension: string;
  call_date: string;
  total_calls: number;
  inbound_count: number;
  outbound_count: number;
  internal_count: number;
  missed_count: number;
  talk_minutes: number;
};

type HourlyRow = DailyRow & { call_hour: number };

type ExtensionInfo = { label: string | null };

type CallDetail = {
  id: string;
  started_at: string;
  direction: string;
  is_missed: boolean | null;
  disposition: string | null;
  duration_seconds: number | null;
  extension: string | null;
  metadata: Record<string, unknown> | null;
};

type DetailFilter = "all" | "inbound" | "outbound" | "missed";

type SelectedBucket = {
  extension: string;
  call_date: string;
  call_hour?: number;
};

const PAGE_SIZE = 50;
const DETAIL_LIMIT = 200;
const ALL = "__all__";
const FILTER_DEBOUNCE_MS = 400;

/** Asia/Tehran بدون DST از ۲۰۲۲ — همان قرارداد promotion-suggestions. */
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
}

function tehranDayRangeIso(isoDate: string): { gte: string; lt: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d) - TEHRAN_OFFSET_MS;
  return {
    gte: new Date(start).toISOString(),
    lt: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function tehranHourRangeIso(isoDate: string, hour: number): { gte: string; lt: string } {
  const day = tehranDayRangeIso(isoDate);
  const start = new Date(day.gte).getTime() + hour * 3_600_000;
  return {
    gte: new Date(start).toISOString(),
    lt: new Date(start + 3_600_000).toISOString(),
  };
}

function extensionCaption(extension: string, map: Map<string, ExtensionInfo>): string {
  const label = map.get(extension)?.label?.trim();
  return label ? `${toFaDigits(extension)} · ${label}` : toFaDigits(extension);
}

function phoneFromMeta(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  if (typeof meta.raw_number === "string" && meta.raw_number.trim()) return meta.raw_number.trim();
  if (typeof meta.stripped_number === "string" && meta.stripped_number.trim()) {
    return meta.stripped_number.trim();
  }
  return null;
}

function directionLabel(direction: string, isMissed: boolean | null): string {
  if (isMissed) return "بی‌پاسخ";
  if (direction === "inbound") return "ورودی";
  if (direction === "outbound") return "خروجی";
  if (direction === "internal") return "داخلی";
  return direction || "—";
}

export const Route = createFileRoute("/_app/operations/call-activity")({
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: CallActivityPage,
});

function CallActivityPage() {
  const { roles, loading, rolesLoading, profileLoading, permissionsLoading } = useAuth();
  const settled = !loading && !rolesLoading && !profileLoading && !permissionsLoading;
  const isPrivileged = roles.includes("admin") || roles.includes("manager");
  const allowed = settled && (isPrivileged || roles.includes("sales"));

  const [mode, setMode] = useState<"daily" | "hourly">("daily");
  const [fromDate, setFromDate] = useState(() => isoDaysAgo(7));
  const [toDate, setToDate] = useState(() => isoDaysAgo(0));
  const [extension, setExtension] = useState<string>(ALL);
  const [hour, setHour] = useState<string>(ALL);
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<(DailyRow | HourlyRow)[]>([]);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [extensionMap, setExtensionMap] = useState<Map<string, ExtensionInfo>>(new Map());
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);

  const [selected, setSelected] = useState<SelectedBucket | null>(null);
  const [detailFilter, setDetailFilter] = useState<DetailFilter>("all");
  const [details, setDetails] = useState<CallDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [applied, setApplied] = useState({ fromDate, toDate, extension, hour, mode });
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied({ fromDate, toDate, extension, hour, mode });
      setPage(0);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [fromDate, toDate, extension, hour, mode]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setListLoading(true);

    const useHourly = applied.mode === "hourly" || applied.hour !== ALL;
    const viewName = useHourly ? "v_call_extension_hourly" : "v_call_extension_daily";

    let q = supabase
      .from(viewName as never)
      .select("*", { count: "exact" })
      .gte("call_date", applied.fromDate)
      .lte("call_date", applied.toDate);

    if (applied.extension !== ALL) q = q.eq("extension", applied.extension);
    if (useHourly && applied.hour !== ALL) q = q.eq("call_hour", Number(applied.hour));

    q = q
      .order("call_date", { ascending: false })
      .order("extension", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (useHourly) q = q.order("call_hour", { ascending: true });

    const { data, error, count } = await q;

    if (error) {
      toast.error(`خواندن گزارش تماس‌ها ناموفق بود: ${error.message}`);
      setRows([]);
      setTotal(0);
    } else {
      setRows((data ?? []) as unknown as (DailyRow | HourlyRow)[]);
      setTotal(count ?? 0);
    }
    setListLoading(false);
  }, [allowed, applied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      const [{ data: daily }, { data: maps }] = await Promise.all([
        supabase.from("v_call_extension_daily" as never).select("extension").limit(1000),
        supabase
          .from("call_log_extensions" as never)
          .select("extension, label")
          .limit(500),
      ]);

      const list = [
        ...new Set(((daily ?? []) as unknown as { extension: string }[]).map((r) => r.extension)),
      ].sort();
      setExtensions(list);

      const map = new Map<string, ExtensionInfo>();
      for (const row of (maps ?? []) as unknown as { extension: string; label: string | null }[]) {
        if (row.extension) map.set(row.extension, { label: row.label });
      }
      setExtensionMap(map);
    })();
  }, [allowed]);

  useEffect(() => {
    if (!selected || !allowed) {
      setDetails([]);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    void (async () => {
      const range =
        selected.call_hour != null
          ? tehranHourRangeIso(selected.call_date, selected.call_hour)
          : tehranDayRangeIso(selected.call_date);

      let q = supabase
        .from("call_logs" as never)
        .select(
          "id, started_at, direction, is_missed, disposition, duration_seconds, extension, metadata",
        )
        .eq("extension" as never, selected.extension as never)
        .gte("started_at" as never, range.gte as never)
        .lt("started_at" as never, range.lt as never)
        .order("started_at" as never, { ascending: false } as never)
        .limit(DETAIL_LIMIT);

      if (detailFilter === "inbound") q = q.eq("direction" as never, "inbound" as never);
      if (detailFilter === "outbound") q = q.eq("direction" as never, "outbound" as never);
      if (detailFilter === "missed") q = q.eq("is_missed" as never, true as never);

      const { data, error } = await q;
      if (cancelled) return;

      if (error) {
        toast.error(`خواندن ریز مکالمات ناموفق بود: ${error.message}`);
        setDetails([]);
      } else {
        setDetails((data ?? []) as unknown as CallDetail[]);
      }
      setDetailLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, detailFilter, allowed]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        total: acc.total + Number(r.total_calls ?? 0),
        inbound: acc.inbound + Number(r.inbound_count ?? 0),
        outbound: acc.outbound + Number(r.outbound_count ?? 0),
        internal: acc.internal + Number(r.internal_count ?? 0),
        missed: acc.missed + Number(r.missed_count ?? 0),
        minutes: acc.minutes + Number(r.talk_minutes ?? 0),
      }),
      { total: 0, inbound: 0, outbound: 0, internal: 0, missed: 0, minutes: 0 },
    );
  }, [rows]);

  const showingHourly = applied.mode === "hourly" || applied.hour !== ALL;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!settled) {
    return (
      <div dir="rtl" className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div dir="rtl" className="p-6 text-center text-muted-foreground">
        دسترسی لازم برای دیدن این گزارش را ندارید.
      </div>
    );
  }

  return (
    <SalesDeskShell
      title="فعالیت تلفنی داخلی‌ها"
      description="شمار تماس‌های ورودی، خروجی، داخلی و بی‌پاسخ و دقایق مکالمه، به تفکیک داخلی و روز — روی هر ردیف بزنید تا ریز مکالمات همان داخلی را ببینید."
      fallbackTo="/operations/sales-desk"
      actions={
        <Button asChild variant="outline" size="sm" className="bg-white/70 backdrop-blur-sm">
          <Link to="/operations/sales-desk">میز فروش</Link>
        </Button>
      }
    >
      {!isPrivileged ? (
        <p className="rounded-xl border border-teal-800/10 bg-white/70 p-3 text-sm text-muted-foreground backdrop-blur-sm">
          شما فقط آمار داخلی خودتان را می‌بینید. اگر چیزی نمایش داده نمی‌شود، یعنی هنوز داخلی‌ای به
          نام شما ثبت نشده است.
        </p>
      ) : null}

      <SalesDeskTiltCard delayMs={60}>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">از تاریخ (شمسی)</Label>
            <PersianDatePicker
              value={fromDate}
              onChange={(v) => setFromDate(v ?? isoDaysAgo(7))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">تا تاریخ (شمسی)</Label>
            <PersianDatePicker
              value={toDate}
              onChange={(v) => setToDate(v ?? isoDaysAgo(0))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">داخلی</label>
            <Select value={extension} onValueChange={setExtension}>
              <SelectTrigger>
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه داخلی‌ها</SelectItem>
                {extensions.map((e) => (
                  <SelectItem key={e} value={e}>
                    {extensionCaption(e, extensionMap)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">ساعت</label>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger>
                <SelectValue placeholder="همه ساعت‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه ساعت‌ها</SelectItem>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {toFaDigits(String(h).padStart(2, "0"))}:۰۰
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">نما</label>
            <Select value={mode} onValueChange={(v) => setMode(v as "daily" | "hourly")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">روزانه</SelectItem>
                <SelectItem value="hourly">ساعتی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SalesDeskTiltCard>

      <SalesDeskTiltCard delayMs={140}>
        <div className="overflow-x-auto p-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">داخلی</TableHead>
                <TableHead className="text-right">تاریخ</TableHead>
                {showingHourly ? <TableHead className="text-right">ساعت</TableHead> : null}
                <TableHead className="text-right">کل</TableHead>
                <TableHead className="text-right">ورودی</TableHead>
                <TableHead className="text-right">خروجی</TableHead>
                <TableHead className="text-right">داخلی</TableHead>
                <TableHead className="text-right">بی‌پاسخ</TableHead>
                <TableHead className="text-right">دقایق مکالمه</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={showingHourly ? 9 : 8} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showingHourly ? 9 : 8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    <PhoneIncoming className="mx-auto mb-2 h-5 w-5" />
                    در این بازه تماسی ثبت نشده است.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const callHour = (r as HourlyRow).call_hour;
                  return (
                    <TableRow
                      key={`${r.extension}-${r.call_date}-${callHour ?? "d"}`}
                      className="cursor-pointer transition-colors hover:bg-teal-50/70"
                      onClick={() => {
                        setDetailFilter("all");
                        setSelected({
                          extension: r.extension,
                          call_date: r.call_date,
                          call_hour: showingHourly ? callHour : undefined,
                        });
                      }}
                    >
                      <TableCell className="font-medium">
                        {extensionCaption(r.extension, extensionMap)}
                      </TableCell>
                      <TableCell>{formatDateFa(r.call_date)}</TableCell>
                      {showingHourly ? (
                        <TableCell className="tabular-nums">
                          {toFaDigits(String(callHour).padStart(2, "0"))}:۰۰
                        </TableCell>
                      ) : null}
                      <TableCell className="tabular-nums">{toFaDigits(r.total_calls)}</TableCell>
                      <TableCell className="tabular-nums">{toFaDigits(r.inbound_count)}</TableCell>
                      <TableCell className="tabular-nums">{toFaDigits(r.outbound_count)}</TableCell>
                      <TableCell className="tabular-nums">{toFaDigits(r.internal_count)}</TableCell>
                      <TableCell className="tabular-nums">{toFaDigits(r.missed_count)}</TableCell>
                      <TableCell className="tabular-nums">
                        {toFaDigits(Math.round(r.talk_minutes * 10) / 10)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SalesDeskTiltCard>

      {rows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          جمع این صفحه — کل: {toFaDigits(totals.total)} · ورودی: {toFaDigits(totals.inbound)} ·
          خروجی: {toFaDigits(totals.outbound)} · داخلی: {toFaDigits(totals.internal)} · بی‌پاسخ:{" "}
          {toFaDigits(totals.missed)} · دقایق مکالمه:{" "}
          {toFaDigits(Math.round(totals.minutes * 10) / 10)}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {toFaDigits(total)} ردیف · صفحه {toFaDigits(page + 1)} از {toFaDigits(pageCount)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || listLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            قبلی
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount || listLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      </div>

      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent side="left" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg" dir="rtl">
          <SheetHeader className="border-b p-4 text-right">
            <SheetTitle>
              ریز مکالمات{" "}
              {selected ? extensionCaption(selected.extension, extensionMap) : ""}
            </SheetTitle>
            <SheetDescription className="text-right">
              {selected
                ? `${formatDateFa(selected.call_date)}${
                    selected.call_hour != null
                      ? ` · ساعت ${toFaDigits(String(selected.call_hour).padStart(2, "0"))}`
                      : ""
                  }`
                : null}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-wrap gap-2 border-b p-3">
            {(
              [
                ["all", "همه"],
                ["inbound", "ورودی"],
                ["outbound", "خروجی"],
                ["missed", "بی‌پاسخ"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={detailFilter === value ? "default" : "outline"}
                onClick={() => setDetailFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {detailLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                در حال بارگذاری…
              </div>
            ) : details.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                تماسی در این فیلتر نیست.
              </p>
            ) : (
              <ul className="space-y-2">
                {details.map((call) => {
                  const phone = phoneFromMeta(call.metadata);
                  const secs = Number(call.duration_seconds ?? 0);
                  const mins = Math.floor(secs / 60);
                  const rem = secs % 60;
                  return (
                    <li
                      key={call.id}
                      className="rounded-xl border border-teal-900/10 bg-white/80 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium tabular-nums">
                            {formatDateTimeFa(call.started_at)}
                          </p>
                          <p className="tabular-nums text-muted-foreground">
                            {phone ? toFaDigits(phone) : "شماره نامشخص"}
                          </p>
                        </div>
                        <div className="shrink-0 text-left text-xs">
                          <span
                            className={
                              call.is_missed
                                ? "rounded-md bg-amber-100 px-2 py-0.5 text-amber-900"
                                : call.direction === "inbound"
                                  ? "rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-900"
                                  : call.direction === "outbound"
                                    ? "rounded-md bg-sky-100 px-2 py-0.5 text-sky-900"
                                    : "rounded-md bg-slate-100 px-2 py-0.5 text-slate-700"
                            }
                          >
                            {directionLabel(call.direction, call.is_missed)}
                          </span>
                          <p className="mt-1 tabular-nums text-muted-foreground">
                            {toFaDigits(mins)}:{toFaDigits(String(rem).padStart(2, "0"))}
                          </p>
                          {call.disposition ? (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {call.disposition}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2">
                        <CallTranscriptPanel callLogId={call.id} pollMs={5000} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!detailLoading && details.length >= DETAIL_LIMIT ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                فقط {toFaDigits(DETAIL_LIMIT)} تماس اول نشان داده شد.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </SalesDeskShell>
  );
}
