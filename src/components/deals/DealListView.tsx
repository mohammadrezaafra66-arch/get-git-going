import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import { updateSalesInteractionStatus, salesDeskErrorMessage } from "@/lib/sales-desk";
import {
  listSalesPipelineStages,
  listSalesPipelines,
  moveSalesDeal,
} from "@/lib/sales-desk/pipelines";
import { DealViewTabs, DealPageHeader, soonToast } from "./DealChrome";
import { DealCreateDialog } from "./DealCreateDialog";

const DEFAULT_COLS = [
  "status",
  "title",
  "tags",
  "person",
  "company",
  "owner",
  "pipeline",
  "stage",
] as const;

const ALL_COLS = [
  { id: "status", label: "وضعیت" },
  { id: "title", label: "عنوان" },
  { id: "tags", label: "برچسب" },
  { id: "created", label: "تاریخ ثبت" },
  { id: "person", label: "شخص" },
  { id: "company", label: "شرکت" },
  { id: "owner", label: "مسئول" },
  { id: "pipeline", label: "کاریز" },
  { id: "stage", label: "مرحله کاریز" },
  { id: "amount", label: "مبلغ" },
  { id: "probability", label: "احتمال موفقیت" },
  { id: "next_activity", label: "فعالیت بعدی" },
  { id: "lost_reason", label: "دلیل شکست" },
  { id: "won_at", label: "تاریخ موفق شدن" },
  { id: "lost_at", label: "تاریخ شکست خوردن" },
  { id: "mobile", label: "موبایل شخص" },
  { id: "last_activity", label: "تاریخ آخرین فعالیت" },
  { id: "activity_count", label: "تعداد فعالیت" },
  { id: "acquaintance", label: "شیوه آشنایی" },
  { id: "last_planned", label: "تاریخ آخرین فعالیت برنامه ریزی شده" },
  { id: "last_done", label: "تاریخ آخرین فعالیت انجام شده" },
  { id: "done_count", label: "تعداد فعالیت های انجام شده" },
  { id: "planned_count", label: "تعداد فعالیت های برنامه ریزی شده" },
] as const;

type Row = {
  id: string;
  status: string;
  title: string | null;
  created_at: string;
  person_id: string;
  company_person_id: string | null;
  salesperson_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  probability: number | null;
  won_at: string | null;
  lost_at: string | null;
  last_activity_at: string | null;
  register_time: string | null;
  deleted_at: string | null;
  acquaintance_id: string | null;
};

function statusFa(s: string) {
  if (s === "open") return "جاری";
  if (s === "won") return "موفق";
  if (s === "lost") return "ناموفق";
  return s;
}

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function DealListView() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const bounds = monthBounds();
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("all");
  const [ownerId, setOwnerId] = useState(profile?.id ?? "");
  const [from, setFrom] = useState(bounds.start);
  const [to, setTo] = useState(bounds.end);
  const [cols, setCols] = useState<string[]>([...DEFAULT_COLS]);
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [andOr, setAndOr] = useState<"and" | "or">("and");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines"],
    queryFn: () => listSalesPipelines({ activeOnly: true }),
  });
  const activePipe = pipelineId || pipesQ.data?.[0]?.id || "";
  const stagesQ = useQuery({
    queryKey: ["sales-desk", "pipeline-stages", activePipe],
    enabled: !!activePipe,
    queryFn: () => listSalesPipelineStages({ pipelineId: activePipe, activeOnly: true }),
  });

  const listQ = useQuery({
    queryKey: ["sales-desk", "deal-list", activePipe, stageId, ownerId, from, to, includeDeleted],
    enabled: !!activePipe,
    queryFn: () => loadList(activePipe, stageId, ownerId, from, to, includeDeleted),
  });

  const rows = listQ.data?.rows ?? [];
  const totals = listQ.data?.totals ?? { all: 0, won: 0, lost: 0, open: 0 };
  const names = listQ.data?.names ?? {};

  const visibleCols = useMemo(
    () => ALL_COLS.filter((c) => cols.includes(c.id)),
    [cols],
  );

  const resetDefault = () => {
    setPipelineId(pipesQ.data?.[0]?.id ?? "");
    setStageId("all");
    setOwnerId(profile?.id ?? "");
    const b = monthBounds();
    setFrom(b.start);
    setTo(b.end);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <DealPageHeader title="لیست معاملات">
        <div className="flex flex-wrap items-center gap-2">
          <DealViewTabs active="list" />
          <Button type="button" onClick={() => setCreateOpen(true)}>
            افزودن معامله
          </Button>
        </div>
      </DealPageHeader>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={activePipe || undefined} onValueChange={setPipelineId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="کاریز" />
          </SelectTrigger>
          <SelectContent>
            {(pipesQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="همه مراحل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه مراحل</SelectItem>
            {(stagesQ.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center text-sm md:grid-cols-4">
        <div className="rounded border p-2">تعداد کل {totals.all}</div>
        <div className="rounded border p-2">معامله موفق {totals.won}</div>
        <div className="rounded border p-2">معامله ناموفق {totals.lost}</div>
        <div className="rounded border p-2">معامله جاری {totals.open}</div>
      </div>

      <p className="text-xs text-muted-foreground">بازگشت به لیست قدیم (در دسترس تا آذر ماه)</p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border px-2 py-1">
          کاریز معامله برابر باشد با {pipesQ.data?.find((p) => p.id === activePipe)?.title ?? "کاریز افراکالا"}
        </span>
        <span className="rounded-full border px-2 py-1">تاریخ ثبت معامله مساوی یا بعد از {formatDateFa(from)}</span>
        <span className="rounded-full border px-2 py-1">تاریخ ثبت معامله مساوی یا قبل از {formatDateFa(to)}</span>
        <span className="rounded-full border px-2 py-1">
          مسئول معامله برابر باشد با {profile?.full_name ?? "من"}
        </span>
        <span className="rounded-full border px-2 py-1">
          کاربر مرتبط معامله برابر باشد با {profile?.full_name ?? "من"}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAndOr(andOr === "and" ? "or" : "and")}>
          {andOr === "and" ? "و" : "یا"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => toast.message("افزودن شرط")}>
          افزودن شرط
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setChooser((v) => !v)}>
          نمایش ستون ها
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={resetDefault}>
          بازگشت به فیلتر پیش‌فرض
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOwnerId(""); setStageId("all"); }}>
          حذف فیلتر
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
          فیلتر پیشرفته
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <Checkbox checked={includeDeleted} onCheckedChange={(v) => setIncludeDeleted(!!v)} />
          معاملات حذف شده
        </label>
      </div>

      {chooser ? (
        <div className="flex flex-wrap gap-2 rounded border p-2 text-xs">
          {ALL_COLS.map((c) => (
            <label key={c.id} className="flex items-center gap-1">
              <Checkbox
                checked={cols.includes(c.id)}
                onCheckedChange={(v) =>
                  setCols((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                }
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
          <span>تغییرات {selected.length} معامله انتخابی</span>
          <Button type="button" size="sm" variant="outline" onClick={soonToast}>
            ویرایش گروهی معاملات
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              Promise.all(
                selected.map((id) =>
                  updateSalesInteractionStatus({ id, status: "won" }).catch((e: Error) =>
                    toast.error(salesDeskErrorMessage(e.message)),
                  ),
                ),
              ).then(() => {
                toast.success("بروزرسانی");
                void qc.invalidateQueries({ queryKey: ["sales-desk"] });
              })
            }
          >
            بروزرسانی
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
            اکسپورت {selected.length} معامله انتخابی
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
            ارسال پیامک به اشخاص {selected.length} معامله انتخابی
          </Button>
          <label className="flex items-center gap-1 text-xs">
            <Checkbox /> فعالیت ها و یادداشت ها هم اکسپورت گرفته شود
          </label>
          <label className="flex items-center gap-1 text-xs">
            <Checkbox /> محصولات هم اکسپورت گرفته شود
          </label>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
            بستن
          </Button>
          {activePipe && stagesQ.data?.[0] ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                Promise.all(
                  selected.map((id) =>
                    moveSalesDeal({
                      id,
                      pipelineId: activePipe,
                      stageId: stagesQ.data![0].id,
                    }),
                  ),
                )
                  .then(() => {
                    toast.success("کاریز");
                    void qc.invalidateQueries({ queryKey: ["sales-desk"] });
                  })
                  .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
              }
            >
              کاریز
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-2">
                <Checkbox
                  checked={rows.length > 0 && selected.length === rows.length}
                  onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])}
                  aria-label={`انتخاب این صفحه (${rows.length} معامله)`}
                />
              </th>
              {visibleCols.map((c) => (
                <th key={c.id} className="p-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="p-8 text-center text-muted-foreground">
                  دیتایی یافت نشد! از صحت فیلترها اطمینان حاصل کنید.
                  <div>
                    <Button type="button" variant="link" onClick={resetDefault}>
                      بازگشت به فیلتر پیش‌فرض
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">
                    <Checkbox
                      checked={selected.includes(r.id)}
                      onCheckedChange={(v) =>
                        setSelected((prev) =>
                          v ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                        )
                      }
                    />
                  </td>
                  {visibleCols.map((c) => (
                    <td key={c.id} className="p-2">
                      {cell(c.id, r, names)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DealCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function cell(
  col: string,
  r: Row,
  names: Record<string, string>,
) {
  switch (col) {
    case "status":
      return statusFa(r.status);
    case "title":
      return (
        <Link
          to="/deal/$dealId"
          params={{ dealId: r.id }}
          className="text-primary underline-offset-2 hover:underline"
        >
          {r.title ?? "—"}
        </Link>
      );
    case "tags":
      return "—";
    case "created":
      return formatDateFa(r.register_time ?? r.created_at);
    case "person":
      return names[r.person_id] ?? "—";
    case "company":
      return r.company_person_id ? names[r.company_person_id] ?? "—" : "—";
    case "owner":
      return r.salesperson_id ? names[r.salesperson_id] ?? "—" : "—";
    case "pipeline":
      return r.pipeline_id ? names[r.pipeline_id] ?? "—" : "—";
    case "stage":
      return r.stage_id ? names[r.stage_id] ?? "—" : "—";
    case "amount":
      return formatNumber(0);
    case "probability":
      return r.probability != null ? `${r.probability}٪` : "—";
    case "won_at":
      return formatDateFa(r.won_at);
    case "lost_at":
      return formatDateFa(r.lost_at);
    case "last_activity":
      return formatDateFa(r.last_activity_at);
    default:
      return "—";
  }
}

async function loadList(
  pipelineId: string,
  stageId: string,
  ownerId: string,
  from: string,
  to: string,
  includeDeleted = false,
) {
  let q = supabase
    .from("sales_interactions" as never)
    .select(
      "id, status, title, created_at, person_id, company_person_id, salesperson_id, pipeline_id, stage_id, probability, won_at, lost_at, last_activity_at, register_time, deleted_at, acquaintance_id" as never,
    )
    .eq("kind" as never, "request" as never)
    .eq("pipeline_id" as never, pipelineId as never)
    .gte("created_at" as never, from as never)
    .lte("created_at" as never, to as never)
    .limit(400);
  if (!includeDeleted) q = q.is("deleted_at" as never, null as never);
  else q = q.not("deleted_at" as never, "is" as never, null as never);
  if (stageId !== "all") q = q.eq("stage_id" as never, stageId as never);
  if (ownerId) q = q.eq("salesperson_id" as never, ownerId as never);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];

  const countQ = await supabase
    .from("sales_interactions" as never)
    .select("status" as never)
    .eq("kind" as never, "request" as never)
    .eq("pipeline_id" as never, pipelineId as never)
    .is("deleted_at" as never, null as never);
  const allRows = (countQ.data ?? []) as unknown as Array<{ status: string }>;
  const totals = {
    all: allRows.length,
    won: allRows.filter((r) => r.status === "won").length,
    lost: allRows.filter((r) => r.status === "lost").length,
    open: allRows.filter((r) => r.status === "open").length,
  };

  const personIds = [...new Set(rows.flatMap((r) => [r.person_id, r.company_person_id].filter(Boolean) as string[]))];
  const profileIds = [...new Set(rows.map((r) => r.salesperson_id).filter(Boolean) as string[])];
  const [persons, profiles, pipes, stages] = await Promise.all([
    personIds.length
      ? supabase.from("persons").select("id, display_name").in("id", personIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    listSalesPipelines(),
    listSalesPipelineStages(),
  ]);
  const names: Record<string, string> = {};
  for (const p of (persons.data ?? []) as { id: string; display_name: string }[]) names[p.id] = p.display_name;
  for (const p of (profiles.data ?? []) as { id: string; full_name: string | null }[])
    names[p.id] = p.full_name ?? "—";
  for (const p of pipes) names[p.id] = p.title;
  for (const s of stages) names[s.id] = s.title;
  return { rows, totals, names };
}
