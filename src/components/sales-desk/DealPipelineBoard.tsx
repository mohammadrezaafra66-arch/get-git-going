import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/i18n/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { followUpLightsForDeals, type FollowUpTrafficLight } from "@/lib/sales-desk/activities";
import { loadDealCapabilities, type DealCapabilities } from "@/lib/sales-desk/capabilities";
import {
  deleteSalesDeal,
  listSalesPipelineStages,
  listSalesPipelines,
  moveSalesDeal,
  restoreSalesDeal,
  type SalesPipeline,
  type SalesPipelineStage,
} from "@/lib/sales-desk/pipelines";
import { updateSalesInteractionStatus, salesDeskErrorMessage } from "@/lib/sales-desk";
import { FollowUpTrafficLightIcon } from "./FollowUpTrafficLightIcon";
import { LostReasonDialog, type LostReasonSubmit } from "./LostReasonDialog";
import { DealCreateDialog } from "@/components/deals/DealCreateDialog";
import { DealPageHeader, DealViewTabs, HealthCircle, soonToast } from "@/components/deals/DealChrome";

type StatusFilter = "open" | "won" | "lost" | "all" | "deleted";

type DealCard = {
  id: string;
  title: string | null;
  status: string;
  pipeline_id: string | null;
  stage_id: string | null;
  stage_entered_at: string | null;
  salesperson_id: string | null;
  person_id: string;
  person_name: string;
  salesperson_name: string;
  light: FollowUpTrafficLight;
  caps: DealCapabilities | null;
  latest_quote_amount: number;
  last_activity_age_days: number | null;
  health_circle: string | null;
};

const LIGHT_RANK: Record<FollowUpTrafficLight, number> = {
  yellow: 0,
  red: 1,
  green: 2,
  grey: 3,
};

function sortCards(a: DealCard, b: DealCard): number {
  const lr = LIGHT_RANK[a.light] - LIGHT_RANK[b.light];
  if (lr !== 0) return lr;
  return (a.stage_entered_at ?? "").localeCompare(b.stage_entered_at ?? "");
}

export function DealPipelineBoard() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [pipelineId, setPipelineId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<DealCard | null>(null);
  const [moveFor, setMoveFor] = useState<DealCard | null>(null);
  const [deleteFor, setDeleteFor] = useState<DealCard | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [dateChip, setDateChip] = useState<"all" | "due">("due");
  const [ownerId, setOwnerId] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [noActivity, setNoActivity] = useState(false);
  const [rottenOnly, setRottenOnly] = useState(false);

  const pipesQ = useQuery({
    queryKey: ["sales-desk", "pipelines"],
    queryFn: () => listSalesPipelines({ activeOnly: true }),
  });

  const activePipelineId = pipelineId || pipesQ.data?.[0]?.id || "";

  const stagesQ = useQuery({
    queryKey: ["sales-desk", "pipeline-stages", activePipelineId],
    enabled: !!activePipelineId,
    queryFn: () => listSalesPipelineStages({ pipelineId: activePipelineId, activeOnly: true }),
  });

  const dealsQ = useQuery({
    queryKey: ["sales-desk", "pipeline-deals", activePipelineId, statusFilter],
    enabled: !!activePipelineId,
    queryFn: () => loadBoardDeals(activePipelineId, statusFilter),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sales-desk"] });
  };

  const moveMut = useMutation({
    mutationFn: (input: { id: string; pipelineId: string; stageId: string }) =>
      moveSalesDeal(input),
    onSuccess: invalidate,
    onError: (e: Error) => {
      toast.error(salesDeskErrorMessage(e.message));
    },
  });

  const statusMut = useMutation({
    mutationFn: (input: {
      id: string;
      status: "won" | "lost" | "open";
      lost?: LostReasonSubmit;
    }) =>
      updateSalesInteractionStatus({
        id: input.id,
        status: input.status,
        lostReasonId: input.lost?.lostReasonId,
        lostReasonNote: input.lost?.lostReasonNote,
        lostReasonOther: input.lost?.lostReasonOther,
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(salesDeskErrorMessage(e.message)),
  });

  const cards = dealsQ.data ?? [];
  const stages = stagesQ.data ?? [];
  const dragging = cards.find((c) => c.id === draggingId) ?? null;

  const byStage = useMemo(() => {
    const map = new Map<string, DealCard[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of cards) {
      if (ownerId && c.salesperson_id !== ownerId) continue;
      if (vipOnly && !(c as DealCard & { is_vip?: boolean }).is_vip) continue;
      if (noActivity && (c.last_activity_age_days ?? 0) < 1) continue;
      if (rottenOnly && c.health_circle !== "red") continue;
      if (dateChip === "due" && c.light === "grey") continue;
      if (c.stage_id && map.has(c.stage_id)) map.get(c.stage_id)!.push(c);
    }
    for (const list of map.values()) list.sort(sortCards);
    return map;
  }, [cards, stages, ownerId, vipOnly, noActivity, rottenOnly, dateChip]);

  if (statusFilter === "deleted") {
    return (
      <div className="space-y-3" dir="rtl">
        <BoardFilters
          pipes={pipesQ.data ?? []}
          pipelineId={activePipelineId}
          onPipeline={setPipelineId}
          statusFilter={statusFilter}
          onStatus={setStatusFilter}
          ownerId={ownerId}
          onOwner={setOwnerId}
          vipOnly={vipOnly}
          onVip={setVipOnly}
          noActivity={noActivity}
          onNoActivity={setNoActivity}
          rottenOnly={rottenOnly}
          onRotten={setRottenOnly}
          profileId={profile?.id ?? ""}
          onClear={() => {
            setOwnerId("");
            setVipOnly(false);
            setNoActivity(false);
            setRottenOnly(false);
            setDateChip("due");
          }}
        />
        {dealsQ.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> …
          </p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">معاملهٔ حذف‌شده‌ای نیست.</p>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <Link
                  to="/operations/sales-desk/deals/$dealId"
                  params={{ dealId: c.id }}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {c.title || "بدون عنوان"}
                </Link>
                <span>{c.person_name}</span>
                {c.caps?.can_restore ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      restoreSalesDeal(c.id)
                        .then(() => {
                          toast.success("بازیابی شد");
                          invalidate();
                        })
                        .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)))
                    }
                  >
                    بازیابی
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      <DealPageHeader title="کاریز معاملات">
        <div className="flex flex-wrap items-center gap-2">
          <DealViewTabs active="kanban" />
          <Button type="button" onClick={() => setCreateOpen(true)}>
            افزودن معامله
          </Button>
          <Button type="button" variant="outline" onClick={() => void dealsQ.refetch()}>
            بروزرسانی سریع صفحه
          </Button>
          <Button type="button" variant="ghost" onClick={() => void (window.location.href = "/settings/sales-pipelines")}>
            ویرایش کاریز
          </Button>
          <Button type="button" variant="ghost" onClick={() => void (window.location.href = "/settings/sales-pipelines")}>
            ایجاد کاریز
          </Button>
        </div>
      </DealPageHeader>
      <div className="flex flex-wrap gap-2 text-sm">
        <Button type="button" size="sm" variant={dateChip === "all" ? "default" : "outline"} onClick={() => setDateChip("all")}>
          همه
        </Button>
        <Button type="button" size="sm" variant={dateChip === "due" ? "default" : "outline"} onClick={() => setDateChip("due")}>
          امروز و تاریخ گذشته
        </Button>
      </div>
      <BoardFilters
        pipes={pipesQ.data ?? []}
        pipelineId={activePipelineId}
        onPipeline={setPipelineId}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
        ownerId={ownerId}
        onOwner={setOwnerId}
        vipOnly={vipOnly}
        onVip={setVipOnly}
        noActivity={noActivity}
        onNoActivity={setNoActivity}
        rottenOnly={rottenOnly}
        onRotten={setRottenOnly}
        profileId={profile?.id ?? ""}
        onClear={() => {
          setOwnerId("");
          setVipOnly(false);
          setNoActivity(false);
          setRottenOnly(false);
          setDateChip("due");
        }}
      />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const col = byStage.get(s.id) ?? [];
          const sum = col.reduce((n, c) => n + c.latest_quote_amount, 0);
          return (
            <section
              key={s.id}
              className="min-w-[16rem] flex-1 rounded-lg border bg-muted/20"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/deal-id") || draggingId;
                if (!id) return;
                const card = cards.find((c) => c.id === id);
                if (!card?.caps?.can_move) {
                  toast.error("انتقال این معامله مجاز نیست.");
                  setDraggingId(null);
                  return;
                }
                moveMut.mutate(
                  { id, pipelineId: activePipelineId, stageId: s.id },
                  { onSettled: () => setDraggingId(null) },
                );
              }}
            >
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
                <strong>{s.title}</strong>
                <span className="text-xs text-muted-foreground">
                  ({col.length} عدد ، IRR {formatNumber(sum)})
                </span>
              </header>
              {s.sort_order === 1 ? (
                <button
                  type="button"
                  className="mx-2 mt-2 w-[calc(100%-1rem)] rounded border border-dashed py-2 text-sm"
                  onClick={() => setQuickOpen(true)}
                >
                  + افزودن سریع معامله
                </button>
              ) : (
                <button
                  type="button"
                  className="mx-2 mt-2 w-[calc(100%-1rem)] rounded border border-dashed py-2 text-sm"
                  onClick={() => setQuickOpen(true)}
                >
                  +
                </button>
              )}
              <div className="space-y-2 p-2">
                {col.map((c) => (
                  <article
                    key={c.id}
                    draggable={!!c.caps?.can_move}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/deal-id", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(c.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className="cursor-grab rounded-md border bg-background p-2 text-sm shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <Link
                        to="/deal/$dealId"
                        params={{ dealId: c.id }}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        title="در یک نگاه"
                      >
                        {c.title || "بدون عنوان"}
                      </Link>
                      <span className="flex items-center gap-1">
                        <HealthCircle circle={c.health_circle} />
                        <FollowUpTrafficLightIcon light={c.light} />
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      با {c.person_name}
                    </p>
                    <p className="text-xs">IRR {formatNumber(c.latest_quote_amount)}</p>
                    {c.last_activity_age_days != null ? (
                      <p className="text-xs text-muted-foreground">{c.last_activity_age_days} روز پیش</p>
                    ) : null}
                    {c.caps?.show_rejected_quote_notice ? (
                      <Badge variant="destructive" className="mt-1 text-[10px]">
                        پیش‌فاکتور رد شد
                      </Badge>
                    ) : null}
                  </article>
                ))}
              </div>
              <footer className="px-3 pb-2 text-xs text-muted-foreground">
                نمایش {col.length} از {col.length} معامله این مرحله
              </footer>
            </section>
          );
        })}
      </div>
      {dragging ? (
        <div className="sticky bottom-2 z-10 flex flex-wrap justify-center gap-2 rounded-lg border bg-background/95 p-2 shadow">
          <DropAction
            enabled={!!dragging.caps?.can_set_won}
            label="موفق شد"
            onDrop={() => statusMut.mutate({ id: dragging.id, status: "won" })}
          />
          <DropAction
            enabled={!!dragging.caps?.can_set_lost}
            label="ناموفق شد"
            onDrop={() => setLostFor(dragging)}
          />
          <DropAction
            enabled={!!dragging.caps?.can_delete}
            label="حذف فرصت"
            onDrop={() => setDeleteFor(dragging)}
          />
          <DropAction
            enabled={!!dragging.caps?.can_move}
            label="انتقال به کاریز دیگر"
            onDrop={() => setMoveFor(dragging)}
          />
        </div>
      ) : null}

      <AlertDialog
        open={!!deleteFor}
        onOpenChange={(o) => {
          if (!o && !deletePending) setDeleteFor(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>آیا از حذف این معامله مطمئن هستید؟</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              آیا از حذف این معامله مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending || !deleteFor}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteFor) return;
                setDeletePending(true);
                deleteSalesDeal(deleteFor.id)
                  .then(() => {
                    toast.success("حذف شد");
                    setDeleteFor(null);
                    invalidate();
                  })
                  .catch((err: Error) => toast.error(salesDeskErrorMessage(err.message)))
                  .finally(() => setDeletePending(false));
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LostReasonDialog
        open={!!lostFor}
        onOpenChange={(o) => {
          if (!o) setLostFor(null);
        }}
        openActivityCount={lostFor?.caps?.open_activity_count ?? 0}
        pending={statusMut.isPending}
        onConfirm={(lost) => {
          if (!lostFor) return;
          statusMut.mutate(
            { id: lostFor.id, status: "lost", lost },
            { onSettled: () => setLostFor(null) },
          );
        }}
      />
      <MovePipelineDialog
        open={!!moveFor}
        deal={moveFor}
        pipes={pipesQ.data ?? []}
        onClose={() => setMoveFor(null)}
        onMoved={() => {
          setMoveFor(null);
          invalidate();
        }}
      />
      <DealCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DealCreateDialog open={quickOpen} onOpenChange={setQuickOpen} quick />
    </div>
  );
}

function BoardFilters(props: {
  pipes: SalesPipeline[];
  pipelineId: string;
  onPipeline: (id: string) => void;
  statusFilter: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  ownerId: string;
  onOwner: (id: string) => void;
  vipOnly: boolean;
  onVip: (v: boolean) => void;
  noActivity: boolean;
  onNoActivity: (v: boolean) => void;
  rottenOnly: boolean;
  onRotten: (v: boolean) => void;
  onClear: () => void;
  profileId: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label>کاریز</Label>
        <Select value={props.pipelineId || undefined} onValueChange={props.onPipeline}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="کاریز" />
          </SelectTrigger>
          <SelectContent>
            {props.pipes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>وضعیت</Label>
        <Select
          value={props.statusFilter}
          onValueChange={(v) => props.onStatus(v as StatusFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">جاری</SelectItem>
            <SelectItem value="won">موفق</SelectItem>
            <SelectItem value="lost">ناموفق</SelectItem>
            <SelectItem value="all">همه</SelectItem>
            <SelectItem value="deleted">معاملات حذف شده</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        variant={props.ownerId ? "default" : "ghost"}
        onClick={() => props.onOwner(props.ownerId ? "" : (props.profileId || ""))}
      >
        مسئول
      </Button>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={props.vipOnly} onChange={(e) => props.onVip(e.target.checked)} /> مشتری ویژه
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" /> بدون برچسب
      </label>
      <span className="text-xs">برچسب:</span>
      <span className="text-xs">شیوه آشنایی:</span>
      <span className="text-xs">زمان ثبت معامله / ۶ ماه گذشته</span>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={props.noActivity} onChange={(e) => props.onNoActivity(e.target.checked)} /> معاملاتی که فعالیتی روی آن‌ها نیست
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={props.rottenOnly} onChange={(e) => props.onRotten(e.target.checked)} /> نمایش معاملات فاسد شده
      </label>
      <Button type="button" size="sm" variant="ghost" onClick={props.onClear}>
        حذف فیلتر
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={soonToast}>
        فیلتر پیشرفته
      </Button>
    </div>
  );
}

function DropAction(props: { enabled: boolean; label: string; onDrop: () => void }) {
  return (
    <button
      type="button"
      disabled={!props.enabled}
      onDragOver={(e) => {
        if (props.enabled) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (props.enabled) props.onDrop();
      }}
      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
    >
      {props.label}
    </button>
  );
}

function MovePipelineDialog(props: {
  open: boolean;
  deal: DealCard | null;
  pipes: SalesPipeline[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [pipe, setPipe] = useState("");
  const [stage, setStage] = useState("");
  const stagesQ = useQuery({
    queryKey: ["sales-desk", "move-stages", pipe],
    enabled: props.open && !!pipe,
    queryFn: () => listSalesPipelineStages({ pipelineId: pipe, activeOnly: true }),
  });
  return (
    <Dialog open={props.open} onOpenChange={(o) => (!o ? props.onClose() : null)}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>انتقال به کاریز دیگر</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>کاریز</Label>
            <Select
              value={pipe || undefined}
              onValueChange={(v) => {
                setPipe(v);
                setStage("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="کاریز" />
              </SelectTrigger>
              <SelectContent>
                {props.pipes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>مرحله</Label>
            <Select value={stage || undefined} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue placeholder="مرحله" />
              </SelectTrigger>
              <SelectContent>
                {(stagesQ.data ?? []).map((s: SalesPipelineStage) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose}>
            انصراف
          </Button>
          <Button
            type="button"
            disabled={!props.deal || !pipe || !stage}
            onClick={() => {
              if (!props.deal) return;
              moveSalesDeal({ id: props.deal.id, pipelineId: pipe, stageId: stage })
                .then(props.onMoved)
                .catch((e: Error) => toast.error(salesDeskErrorMessage(e.message)));
            }}
          >
            انتقال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function loadBoardDeals(
  pipelineId: string,
  statusFilter: StatusFilter,
): Promise<DealCard[]> {
  let q = supabase
    .from("sales_interactions" as never)
    .select(
      "id, title, status, pipeline_id, stage_id, stage_entered_at, salesperson_id, person_id, deleted_at, is_vip, last_activity_at" as never,
    )
    .eq("kind" as never, "request" as never)
    .eq("pipeline_id" as never, pipelineId as never)
    .limit(400);
  if (statusFilter === "deleted") {
    q = q.not("deleted_at" as never, "is" as never, null as never);
  } else {
    q = q.is("deleted_at" as never, null as never);
    if (statusFilter !== "all") q = q.eq("status" as never, statusFilter as never);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    title: string | null;
    status: string;
    pipeline_id: string | null;
    stage_id: string | null;
    stage_entered_at: string | null;
    salesperson_id: string | null;
    person_id: string;
    is_vip?: boolean;
    last_activity_at?: string | null;
  }>;
  const ids = rows.map((r) => r.id);
  const [caps, lights, persons, profiles, quotes, health] = await Promise.all([
    loadDealCapabilities(ids),
    followUpLightsForDeals(ids),
    rows.length
      ? supabase
          .from("persons")
          .select("id, display_name")
          .in("id", [...new Set(rows.map((r) => r.person_id))])
      : Promise.resolve({ data: [] }),
    rows.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in(
            "id",
            [...new Set(rows.map((r) => r.salesperson_id).filter(Boolean) as string[])],
          )
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("sales_quotes" as never)
          .select("id, interaction_id, final_amount, created_at" as never)
          .in("interaction_id" as never, ids as never)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("sales_deal_health" as never)
          .select("id, last_activity_age_days, health_circle" as never)
          .in("id" as never, ids as never)
      : Promise.resolve({ data: [] }),
  ]);
  const personMap = new Map(
    ((persons.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p]),
  );
  const profileMap = new Map(
    ((profiles.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p]),
  );
  const latestAmount = new Map<string, { at: string; amount: number }>();
  for (const qrow of (quotes.data ?? []) as Array<{
    interaction_id: string | null;
    final_amount: number | null;
    created_at: string;
  }>) {
    if (!qrow.interaction_id) continue;
    const prev = latestAmount.get(qrow.interaction_id);
    if (!prev || qrow.created_at > prev.at) {
      latestAmount.set(qrow.interaction_id, {
        at: qrow.created_at,
        amount: Number(qrow.final_amount ?? 0),
      });
    }
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    pipeline_id: r.pipeline_id,
    stage_id: r.stage_id,
    stage_entered_at: r.stage_entered_at,
    salesperson_id: r.salesperson_id,
    person_id: r.person_id,
    person_name: personMap.get(r.person_id)?.display_name ?? "—",
    salesperson_name: r.salesperson_id
      ? profileMap.get(r.salesperson_id)?.full_name ?? "—"
      : "—",
    light: lights.get(r.id) ?? "yellow",
    caps: caps.get(r.id) ?? null,
    latest_quote_amount: latestAmount.get(r.id)?.amount ?? 0,
    last_activity_age_days:
      ((health.data ?? []) as Array<{ id: string; last_activity_age_days: number | null }>).find(
        (h) => h.id === r.id,
      )?.last_activity_age_days ?? null,
    health_circle:
      ((health.data ?? []) as Array<{ id: string; health_circle: string | null }>).find(
        (h) => h.id === r.id,
      )?.health_circle ?? null,
  }));
}
