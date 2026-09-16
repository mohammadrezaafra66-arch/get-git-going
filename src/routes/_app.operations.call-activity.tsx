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
import { Loader2, PhoneIncoming } from "lucide-react";
import { toast } from "sonner";
import { formatDateFa, toFaDigits } from "@/lib/i18n/formatters";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
import { SalesDeskShell, SalesDeskTiltCard } from "@/components/sales-desk";

/**
 * Wave 6 / C-8 — گزارش فعالیت تلفنی به تفکیک داخلی.
 *
 * داده از دو view مهاجرت ۵۱۴ می‌آید (`v_call_extension_daily` و
 * `v_call_extension_hourly`). این صفحه هیچ شمارشی خودش انجام نمی‌دهد و هرگز
 * مستقیم به `call_logs` نمی‌زند — چون گارد دسترسی داخل خودِ view است، نه اینجا.
 *
 * گارد، دو نیمه دارد و هر دو نیمه لازم‌اند:
 *  ۱) این مسیر با `staticData.gate` و `requireAnyRole` به admin و manager و
 *     sales باز است؛
 *  ۲) خودِ view تصمیم می‌گیرد هر کس چه می‌بیند — admin و manager همه چیز،
 *     و هر کس دیگر فقط داخلی‌هایی که در `call_log_extensions` به او نگاشت
 *     شده‌اند. اگر این صفحه دور زده شود و کسی مستقیم به PostgREST بزند، باز
 *     همان محدودیت اعمال می‌شود.
 *
 * اندازه‌گیری‌شده در یک تراکنش برگشتی: کاربر sale ای که هیچ داخلی‌ای به او نگاشت
 * نشده **صفر ردیف** می‌بیند، نه همه چیز؛ و وقتی داخلی ۴۱۳ به او نگاشت شد،
 * دقیقاً ۴۱۳ را دید و ۴۰۱/۴۰۳/۴۰۴/۴۰۷/۴۴۹ را ندید.
 *
 * قاعدهٔ ۱۱ پروژه (کوئری بزرگ): امروز ۱۴۲۹ تماس است ولی با ~۸۸۷ تماس در روز
 * سالانه ~۳۲۴ هزار می‌شود. پس بازهٔ تاریخ همیشه بسته است، صفحه‌بندی دارد،
 * ورودی‌های فیلتر debounce شده‌اند، و ایندکس
 * `idx_call_logs_extension_started` در همان مهاجرت ۵۱۴ ساخته شد.
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

const PAGE_SIZE = 50;
const ALL = "__all__";
const FILTER_DEBOUNCE_MS = 400;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // روزِ تهران، نه روزِ UTC — همان قراردادی که viewها استفاده می‌کنند.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
}

export const Route = createFileRoute("/_app/operations/call-activity")({
  // نیمهٔ سمت کاربرِ گارد. `beforeLoad` فقط روی سرور اجرا می‌شود و نشست
  // localStorage را نمی‌بیند، پس RouteRoleGate این را می‌خواند.
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
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);

  // فیلترهای debounce شده — هر حرفی که در تاریخ تایپ می‌شود یک کوئری نمی‌زند.
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

    // انتخاب ساعت فقط در نمای ساعتی معنی دارد.
    const useHourly = applied.mode === "hourly" || applied.hour !== ALL;
    const viewName = useHourly ? "v_call_extension_hourly" : "v_call_extension_daily";

    // viewهای مهاجرت ۵۱۴ در types.ts تولیدشده نیستند؛ همان قرارداد موجود repo
    // برای این فاصله (مثل _app.admin.call-extensions.tsx) — نه خطای خاموش‌شده.
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

  // فهرست داخلی‌ها از خودِ view می‌آید، پس کاربری که فقط یک داخلی می‌بیند
  // در این فهرست هم فقط همان یکی را می‌بیند.
  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      const { data } = await supabase
        .from("v_call_extension_daily" as never)
        .select("extension")
        .limit(1000);
      const list = [
        ...new Set(((data ?? []) as unknown as { extension: string }[]).map((r) => r.extension)),
      ].sort();
      setExtensions(list);
    })();
  }, [allowed]);

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
      description="شمار تماس‌های ورودی، خروجی، داخلی و بی‌پاسخ و دقایق مکالمه، به تفکیک داخلی و روز — تاریخ‌ها شمسی."
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
                  {toFaDigits(e)}
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
              rows.map((r) => (
                <TableRow
                  key={`${r.extension}-${r.call_date}-${(r as HourlyRow).call_hour ?? "d"}`}
                >
                  <TableCell className="font-medium tabular-nums">
                    {toFaDigits(r.extension)}
                  </TableCell>
                  <TableCell>{formatDateFa(r.call_date)}</TableCell>
                  {showingHourly ? (
                    <TableCell className="tabular-nums">
                      {toFaDigits(String((r as HourlyRow).call_hour).padStart(2, "0"))}:۰۰
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
              ))
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
    </SalesDeskShell>
  );
}
