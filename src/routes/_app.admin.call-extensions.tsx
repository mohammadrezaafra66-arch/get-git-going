import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, PhoneCall, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Wave 6 / C-3 — naming the phone extensions.
 *
 * Owner decision D-35: extensions are named from inside the assistant, by a person.
 * Nothing discovers this mapping from the phone system, and no migration seeds it —
 * `public.call_log_extensions` (migration 498) is created empty on purpose. This page
 * is the only way it is ever filled.
 *
 * It exists ahead of the importer it serves. C-4 (the CDR importer) is blocked on a
 * read-only MySQL user on Issabel that the owner has not created yet, so no call has
 * ever been imported. Until then this table is simply a phone list; the moment a CDR
 * arrives, `call_logs.extension` joins to it and every imported call gets an owner.
 *
 * A NOTE ON WHO CAN ASSIGN AN EMPLOYEE — measured, not assumed.
 * `call_log_extensions` lets admin and manager write, and this route is gated the same
 * way so the gate never promises something the database will refuse. But the employee
 * picker reads `public.profiles`, whose own RLS is admin-only:
 *
 *   permissive: "users read own profile" (auth.uid() = id) OR "admins read all profiles"
 *   restrictive: viewer_restricted
 *
 * Measured live: an admin sees 41 profiles, a manager sees 1 — their own. So a manager
 * can add an extension and label it but cannot pick a colleague for it. Rather than
 * showing a silently empty dropdown, the page says so. Widening `profiles` RLS is a
 * security change to an existing policy and is deliberately NOT made here.
 */

type ExtensionRow = {
  extension: string;
  employee_id: string | null;
  label: string | null;
  updated_at: string;
};

type StaffRow = { id: string; full_name: string | null };

/** Radix Select forbids an empty item value, so "unassigned" needs a sentinel. */
const UNASSIGNED = "__unassigned__";

/**
 * داخلی‌هایی که خودِ مرکز تلفن واقعاً گزارش کرده، با تعداد تماس ۹۰ روز.
 *
 * چرا ثابت است و از داده زنده ساخته نمی‌شود: منبعِ راستش جدول `cdr` روی MySQL
 * ایزابل است که فقط از سمت سرور خواندنی است، و ساختن یک route تازه صرفاً برای
 * پر کردن یک فهرست پیشنهاد، یک قابلیت جدید می‌شد نه یک راحتی. پس این‌ها یک
 * اندازه‌گیریِ تاریخ‌دارند، نه حدس:
 *
 *   اندازه‌گیری ۲۰۲۶-۰۹-۰۷ روی ۹۰ روز `cdr` — هر مقدار ۳ تا ۴ رقمی که بیش از
 *   ۲۰ بار در `src` یا `dst` دیده شده باشد.
 *
 * `411` عمداً اینجا نیست: در CDR اصلاً وجود ندارد.
 * داخلی‌های دیده‌شده در `call_logs` هم به این فهرست اضافه می‌شوند، پس هر داخلی
 * تازه‌ای که از این به بعد تماس بگیرد خودش ظاهر می‌شود و فهرست کهنه نمی‌ماند.
 */
const CDR_EXTENSIONS_90D: ReadonlyArray<{ ext: string; calls: number }> = [
  { ext: "405", calls: 422 },
  { ext: "406", calls: 13507 },
  { ext: "409", calls: 14058 },
  { ext: "410", calls: 382 },
  { ext: "412", calls: 13766 },
  { ext: "446", calls: 13477 },
  { ext: "447", calls: 13468 },
  { ext: "448", calls: 13469 },
  { ext: "449", calls: 13590 },
  { ext: "450", calls: 13671 },
];

/**
 * صف (ring group)، نه داخلیِ یک نفر. `6002` به‌تنهایی ۱۸۶٬۲۲۰ پا در ۹۰ روز دارد؛
 * نسبت دادنش به یک نفر یعنی گذاشتن ترافیک کل یک صف روی امتیاز یک کارمند.
 * فقط برای اطلاع نمایش داده می‌شوند و قابل انتخاب نیستند.
 * `909` هم داخلی نیست — اثر پیشوند شماره‌گیری خط بیرون است و اصلاً نمی‌آید.
 */
const CDR_QUEUES: ReadonlyArray<string> = ["6001", "6002", "6003"];

export const Route = createFileRoute("/_app/admin/call-extensions")({
  // The client half of the guard below. `beforeLoad` runs only on the server for a direct
  // navigation and cannot see a localStorage session, so RouteRoleGate reads this instead.
  // Mirrors the requireAnyRole call below, and both mirror call_log_extensions' RLS.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: CallExtensionsPage,
});

function CallExtensionsPage() {
  const { roles, user, loading, rolesLoading, profileLoading, permissionsLoading } = useAuth();

  // Agent X removed the static PERMISSIONS matrix this wave, so a role check made before
  // the live tables have been read returns a confident "no". Decide nothing until every
  // auth flag has settled — otherwise this page flashes "دسترسی ندارید" at a real admin.
  const settled = !loading && !rolesLoading && !profileLoading && !permissionsLoading;
  const isAdmin = roles.includes("admin");
  const allowed = settled && (isAdmin || roles.includes("manager"));

  const [rows, setRows] = useState<ExtensionRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Per-row pending edits, keyed by extension.
  const [draftLabel, setDraftLabel] = useState<Record<string, string>>({});
  const [draftEmployee, setDraftEmployee] = useState<Record<string, string>>({});

  // The "add a new extension" form.
  const [newExtension, setNewExtension] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newEmployee, setNewEmployee] = useState<string>(UNASSIGNED);

  // داخلی‌هایی که در تماس‌های واردشده دیده شده‌اند — نیمهٔ زندهٔ فهرست پیشنهاد.
  const [seenInCallLogs, setSeenInCallLogs] = useState<string[]>([]);

  const staffName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.full_name?.trim() || "بدون نام");
    return m;
  }, [staff]);

  /**
   * عنوان‌های تکراری. فقط نشان داده می‌شوند — نه ادغام، نه هشدارِ خطا.
   * دو داخلی برای یک نفر در این شرکت عادی است؛ اینکه هر دو به یک کارمند وصل
   * شوند یا به دو نفر، تصمیم کسی است که نگاشت را انجام می‌دهد، نه این صفحه.
   */
  const duplicateLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const l = (r.label ?? "").trim();
      if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([l]) => l));
  }, [rows]);

  const unmappedCount = useMemo(
    () => rows.filter((r) => !r.employee_id).length,
    [rows],
  );

  /** داخلی‌های شناخته‌شدهٔ مرکز تلفن که هنوز در این جدول نیستند. */
  const suggestions = useMemo(() => {
    const known = new Set(rows.map((r) => r.extension));
    const merged = new Map<string, number | null>();
    for (const c of CDR_EXTENSIONS_90D) if (!known.has(c.ext)) merged.set(c.ext, c.calls);
    for (const e of seenInCallLogs) {
      if (!known.has(e) && !merged.has(e) && !CDR_QUEUES.includes(e)) merged.set(e, null);
    }
    return [...merged.entries()]
      .map(([ext, calls]) => ({ ext, calls }))
      .sort((a, b) => a.ext.localeCompare(b.ext));
  }, [rows, seenInCallLogs]);

  const load = useCallback(async () => {
    setListLoading(true);

    // `call_log_extensions` is newer than the generated Supabase types, so the table name
    // and payloads are cast. This is the repo's existing convention for that gap
    // (see _app.admin.validation-rules.tsx) — not a suppressed type error.
    const [extRes, staffRes] = await Promise.all([
      supabase
        .from("call_log_extensions" as never)
        .select("extension, employee_id, label, updated_at")
        .order("extension", { ascending: true }),
      supabase.from("profiles").select("id, full_name").eq("status", "active").order("full_name"),
    ]);

    if (extRes.error) {
      toast.error(`خواندن فهرست داخلی‌ها ناموفق بود: ${extRes.error.message}`);
    } else {
      const list = (extRes.data ?? []) as unknown as ExtensionRow[];
      setRows(list);
      setDraftLabel(Object.fromEntries(list.map((r) => [r.extension, r.label ?? ""])));
      setDraftEmployee(
        Object.fromEntries(list.map((r) => [r.extension, r.employee_id ?? UNASSIGNED])),
      );
    }

    if (staffRes.error) {
      toast.error(`خواندن فهرست کارکنان ناموفق بود: ${staffRes.error.message}`);
    } else {
      setStaff((staffRes.data ?? []) as StaffRow[]);
    }

    setListLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  // داخلی‌های واقعاً دیده‌شده در تماس‌های واردشده. این نیمه زنده است، پس فهرست
  // پیشنهاد با گذشت زمان خودش کامل می‌شود و به عدد ثابت بالا گیر نمی‌کند.
  useEffect(() => {
    if (!allowed) return;
    void (async () => {
      // `call_logs.extension` (مهاجرت ۴۹۷) هنوز در types.ts تولیدشده نیست —
      // همان قرارداد cast که بالای همین فایل برای call_log_extensions هست.
      const { data } = await supabase
        .from("call_logs" as never)
        .select("extension")
        .not("extension", "is", null)
        .limit(2000);
      const list = [
        ...new Set(
          ((data ?? []) as unknown as { extension: string | null }[])
            .map((r) => r.extension)
            .filter((e): e is string => Boolean(e)),
        ),
      ];
      setSeenInCallLogs(list);
    })();
  }, [allowed]);

  async function addExtension() {
    const ext = newExtension.trim();
    if (!ext) {
      toast.error("شمارهٔ داخلی را وارد کنید.");
      return;
    }
    if (rows.some((r) => r.extension === ext)) {
      toast.error("این داخلی از قبل ثبت شده است.");
      return;
    }
    setBusy("new");
    const { error } = await supabase.from("call_log_extensions" as never).insert({
      extension: ext,
      label: newLabel.trim() || null,
      employee_id: newEmployee === UNASSIGNED ? null : newEmployee,
      updated_by: user?.id ?? null,
    } as never);
    setBusy(null);
    if (error) {
      toast.error(`ثبت داخلی ناموفق بود: ${error.message}`);
      return;
    }
    toast.success("داخلی ثبت شد.");
    setNewExtension("");
    setNewLabel("");
    setNewEmployee(UNASSIGNED);
    void load();
  }

  async function saveRow(row: ExtensionRow) {
    setBusy(row.extension);
    const chosen = draftEmployee[row.extension] ?? UNASSIGNED;
    const { error } = await supabase
      .from("call_log_extensions" as never)
      .update({
        label: draftLabel[row.extension]?.trim() || null,
        employee_id: chosen === UNASSIGNED ? null : chosen,
        updated_by: user?.id ?? null,
      } as never)
      .eq("extension", row.extension);
    setBusy(null);
    if (error) {
      toast.error(`ذخیره ناموفق بود: ${error.message}`);
      return;
    }
    toast.success(`داخلی ${row.extension} ذخیره شد.`);
    void load();
  }

  async function removeRow(row: ExtensionRow) {
    setBusy(row.extension);
    const { error } = await supabase
      .from("call_log_extensions" as never)
      .delete()
      .eq("extension", row.extension);
    setBusy(null);
    if (error) {
      toast.error(`حذف ناموفق بود: ${error.message}`);
      return;
    }
    toast.success(`داخلی ${row.extension} حذف شد.`);
    void load();
  }

  // The permission verdict is never rendered before the auth flags settle.
  if (!settled) {
    return (
      <div
        className="flex items-center gap-2 p-6 text-muted-foreground"
        data-testid="call-extensions-checking"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بررسی دسترسی…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 text-muted-foreground" data-testid="call-extensions-denied">
        دسترسی ندارید.
      </div>
    );
  }

  const canPickEmployee = staff.length > 1;

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader title="داخلی‌های تلفن" description="هر شمارهٔ داخلی متعلق به کدام همکار است" />

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        این فهرست را خودتان پر می‌کنید؛ سامانه آن را از مرکز تلفن نمی‌خواند. تا وقتی این جدول خالی
        باشد، تماس‌های واردشده به هیچ همکاری نسبت داده نمی‌شوند.
      </div>

      {!canPickEmployee && !isAdmin ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          شما می‌توانید داخلی را ثبت و نام‌گذاری کنید، ولی فهرست کارکنان برای نقش شما قابل مشاهده
          نیست، بنابراین انتخاب همکار برای یک داخلی از عهدهٔ مدیر سیستم برمی‌آید.
        </div>
      ) : null}

      {/* چرا آمار تماس هنوز از CDR محاسبه نمی‌شود — و چه چیزی این را تمام می‌کند. */}
      {rows.length > 0 && unmappedCount === rows.length ? (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          تا وقتی داخلی‌ها به کارمندان نسبت داده نشوند، آمار تماس از CDR محاسبه نمی‌شود و ثبت
          دستی آمار تماس ادامه پیدا می‌کند. عنوان گذاشتن روی یک داخلی کافی نیست؛ باید همکارِ آن
          داخلی هم از فهرست «همکار» انتخاب و ذخیره شود.
        </div>
      ) : null}

      {/* داخلی‌هایی که مرکز تلفن گزارش کرده ولی هنوز اینجا ثبت نشده‌اند */}
      {suggestions.length > 0 ? (
        <div className="rounded-md border p-4">
          <div className="mb-2 text-sm font-medium">
            داخلی‌هایی که مرکز تلفن گزارش کرده ولی هنوز اینجا ثبت نشده‌اند
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            عدد کنار هر داخلی، تعداد تماس آن در ۹۰ روز گذشته است — یک میز واقعی از یک آیفون
            درِ ورودی با همین عدد قابل تشخیص است. برای ثبت، روی داخلی بزنید تا فرم بالا پر شود.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Button
                key={s.ext}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setNewExtension(s.ext)}
              >
                <span className="font-mono">{s.ext}</span>
                <span className="mr-2 text-xs text-muted-foreground">
                  {s.calls === null ? "دیده‌شده در تماس‌ها" : `${s.calls.toLocaleString("fa-IR")} تماس`}
                </span>
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            صف‌ها ({CDR_QUEUES.join("، ")}) داخلیِ یک نفر نیستند و پیشنهاد نمی‌شوند؛ ترافیک یک صف
            روی چند نفر پخش می‌شود و نسبت دادنش به یک کارمند امتیاز او را غلط بالا می‌برد.
          </p>
        </div>
      ) : null}

      {/* Add a new extension */}
      <div className="rounded-md border p-4">
        <div className="mb-3 text-sm font-medium">افزودن داخلی تازه</div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_1fr_auto]">
          <Input
            placeholder="شمارهٔ داخلی"
            value={newExtension}
            onChange={(e) => setNewExtension(e.target.value)}
            className="font-mono"
            inputMode="numeric"
          />
          <Input
            placeholder="عنوان (اختیاری) — مثلاً پذیرش"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Select value={newEmployee} onValueChange={setNewEmployee} disabled={!canPickEmployee}>
            <SelectTrigger>
              <SelectValue placeholder="همکار" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>بدون همکار</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name?.trim() || "بدون نام"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addExtension} disabled={busy === "new"}>
            {busy === "new" ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="ml-2 h-4 w-4" />
            )}
            افزودن
          </Button>
        </div>
      </div>

      {listLoading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
          <PhoneCall className="h-8 w-8" />
          هنوز هیچ داخلی ثبت نشده است.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>داخلی</TableHead>
                <TableHead>عنوان</TableHead>
                <TableHead>همکار</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>آخرین تغییر</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.extension}>
                  <TableCell className="font-mono whitespace-nowrap">{row.extension}</TableCell>
                  <TableCell className="min-w-[12rem]">
                    <Input
                      value={draftLabel[row.extension] ?? ""}
                      placeholder="بدون عنوان"
                      onChange={(e) =>
                        setDraftLabel((d) => ({ ...d, [row.extension]: e.target.value }))
                      }
                    />
                  </TableCell>
                  <TableCell className="min-w-[12rem]">
                    {canPickEmployee ? (
                      <Select
                        value={draftEmployee[row.extension] ?? UNASSIGNED}
                        onValueChange={(v) =>
                          setDraftEmployee((d) => ({ ...d, [row.extension]: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="همکار" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>بدون همکار</SelectItem>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name?.trim() || "بدون نام"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {row.employee_id ? (staffName.get(row.employee_id) ?? "—") : "بدون همکار"}
                      </span>
                    )}
                  </TableCell>
                  {/* یک ردیف با عنوان ولی بدون کارمند نباید «تمام‌شده» به نظر برسد —
                      دقیقاً همین بود که این جدول را کامل نشان داد در حالی که هیچ
                      تماسی به کسی نسبت داده نمی‌شد. */}
                  <TableCell className="min-w-[13rem]">
                    {row.employee_id ? (
                      <span className="text-xs text-muted-foreground">نسبت داده شده</span>
                    ) : (
                      <span className="inline-flex items-center rounded-md border border-amber-500/60 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        کارمند انتخاب نشده
                      </span>
                    )}
                    {duplicateLabels.has((row.label ?? "").trim()) ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        عنوان «{(row.label ?? "").trim()}» روی بیش از یک داخلی ثبت شده است.
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.updated_at).toLocaleString("fa-IR")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === row.extension}
                        onClick={() => void saveRow(row)}
                      >
                        <Save className="ml-2 h-4 w-4" />
                        ذخیره
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.extension}
                        onClick={() => void removeRow(row)}
                      >
                        <Trash2 className="ml-2 h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
