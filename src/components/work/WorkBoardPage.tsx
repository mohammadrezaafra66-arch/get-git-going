import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, FolderKanban, RefreshCw, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acceptMerge,
  dismissMerge,
  getMorningSummary,
  listActiveTaxonomies,
  listMergeSuggestions,
  listWorkItems,
  setDecisionBucket,
  type WorkDecisionBucket,
  type WorkItem,
  type WorkItemKind,
  type WorkItemStatus,
  type WorkMode,
  type WorkMorningSummary,
} from "@/lib/work";
import { MorningSummaryStrip } from "./MorningSummary";
import { DecisionQueue } from "./DecisionQueue";
import { MergePanel, type MergeSuggestionView } from "./MergePanel";
import { CreateWorkWizard } from "./CreateWorkWizard";
import {
  ALL_BUCKETS,
  ALL_KINDS,
  ALL_MODES,
  ALL_STATUSES,
  BUCKET_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
} from "./labels";

const ALL = "__all__";

function todayTehran(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(
    new Date(),
  );
}

export function WorkBoardPage() {
  const { roles } = useAuth();
  const canManageTaxonomies =
    roles.includes("admin") || roles.includes("manager");
  const [createOpen, setCreateOpen] = useState(false);
  const [group, setGroup] = useState(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [bucket, setBucket] = useState<string>(ALL);
  const [workMode, setWorkMode] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [taxonomyGroups, setTaxonomyGroups] = useState<string[]>([]);

  const [summary, setSummary] = useState<WorkMorningSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [items, setItems] = useState<WorkItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [queue, setQueue] = useState<WorkItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState<string | null>(null);

  const [merges, setMerges] = useState<MergeSuggestionView[]>([]);
  const [mergesLoading, setMergesLoading] = useState(true);
  const [mergesError, setMergesError] = useState<string | null>(null);
  const [mergeBusy, setMergeBusy] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      setSummary(await getMorningSummary());
    } catch (e: unknown) {
      setSummaryError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const rows = await listWorkItems({
        status:
          status === ALL ? undefined : (status as WorkItemStatus),
        kind: kind === ALL ? undefined : (kind as WorkItemKind),
        decision_bucket:
          bucket === ALL ? undefined : (bucket as WorkDecisionBucket),
        search: search.trim() || undefined,
        limit: 100,
      });
      let filtered = rows;
      if (workMode !== ALL) {
        filtered = filtered.filter((r) => r.work_mode === (workMode as WorkMode));
      }
      if (group !== ALL) {
        filtered = filtered.filter((r) => (r.group_name ?? "") === group);
      }
      setItems(filtered);
    } catch (e: unknown) {
      setItemsError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setItemsLoading(false);
    }
  }, [status, kind, bucket, workMode, group, search]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const rows = await listWorkItems({
        decision_bucket: "today_decide",
        decision_bucket_date: todayTehran(),
        openOnly: true,
        limit: 50,
      });
      setQueue(rows);
    } catch (e: unknown) {
      setQueueError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const loadMerges = useCallback(async () => {
    setMergesLoading(true);
    setMergesError(null);
    try {
      const pending = await listMergeSuggestions({ status: "pending", limit: 50 });
      const ids = Array.from(
        new Set(pending.flatMap((p) => [p.source_item_id, p.target_item_id])),
      );
      const titleMap = new Map<string, string>();
      if (ids.length > 0) {
        const related = await listWorkItems({ limit: 200 });
        for (const r of related) {
          if (ids.includes(r.id)) titleMap.set(r.id, r.title);
        }
      }
      setMerges(
        pending.map((p) => ({
          ...p,
          sourceTitle: titleMap.get(p.source_item_id),
          targetTitle: titleMap.get(p.target_item_id),
        })),
      );
    } catch (e: unknown) {
      setMergesError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setMergesLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadItems(), loadQueue(), loadMerges()]);
  }, [loadSummary, loadItems, loadQueue, loadMerges]);

  useEffect(() => {
    void loadSummary();
    void loadQueue();
    void loadMerges();
  }, [loadSummary, loadQueue, loadMerges]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listActiveTaxonomies("group");
        if (!cancelled) setTaxonomyGroups(rows.map((r) => r.name));
      } catch {
        if (!cancelled) setTaxonomyGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupOptions = useMemo(() => {
    const set = new Set<string>(taxonomyGroups);
    for (const i of items) {
      if (i.group_name) set.add(i.group_name);
    }
    for (const i of queue) {
      if (i.group_name) set.add(i.group_name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fa"));
  }, [items, queue, taxonomyGroups]);

  async function handleQueueBucket(
    itemId: string,
    next: "today_do" | "waiting" | null,
  ) {
    setQueueBusy(itemId);
    try {
      await setDecisionBucket(itemId, next);
      toast.success(
        next === "today_do"
          ? "به «امروز انجام» منتقل شد."
          : next === "waiting"
            ? "به «انتظار» منتقل شد."
            : "سطل تصمیم پاک شد.",
      );
      await Promise.all([loadQueue(), loadSummary(), loadItems()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "به‌روزرسانی ناموفق بود.");
    } finally {
      setQueueBusy(null);
    }
  }

  async function handleAcceptMerge(suggestionId: string, keepItemId: string) {
    setMergeBusy(suggestionId);
    try {
      await acceptMerge(suggestionId, keepItemId);
      toast.success("ادغام با تأیید شما انجام شد.");
      await Promise.all([loadMerges(), loadItems(), loadSummary(), loadQueue()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ادغام ناموفق بود.");
    } finally {
      setMergeBusy(null);
    }
  }

  async function handleDismissMerge(suggestionId: string) {
    setMergeBusy(suggestionId);
    try {
      await dismissMerge(suggestionId);
      toast.success("پیشنهاد رد شد.");
      await loadMerges();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "رد پیشنهاد ناموفق بود.");
    } finally {
      setMergeBusy(null);
    }
  }

  return (
    <div
      className="relative min-h-[70vh] bg-[radial-gradient(ellipse_at_top,_rgba(14,116,144,0.08),_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#f0fdfa_100%)]"
      dir="rtl"
    >
      <div className="container max-w-5xl space-y-6 py-6">
        <PageHeader
          title="دستیار کار"
          description="تابلوی آرام برای تصمیم امروز، انجام کار و بستن حلقه — بدون شلوغی."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/operations/work/topics">
                  <FolderKanban className="h-4 w-4" />
                  موضوع‌ها
                </Link>
              </Button>
              {canManageTaxonomies ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/operations/work/settings">
                    <Settings2 className="h-4 w-4" />
                    طبقه‌بندی
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshAll()}
              >
                <RefreshCw className="h-4 w-4" />
                تازه‌سازی
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                کار جدید
              </Button>
            </div>
          }
        />

        <MorningSummaryStrip
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
        />

        <DecisionQueue
          items={queue}
          loading={queueLoading}
          error={queueError}
          busyId={queueBusy}
          onSetBucket={handleQueueBucket}
        />

        <MergePanel
          suggestions={merges}
          loading={mergesLoading}
          error={mergesError}
          busyId={mergeBusy}
          onAccept={handleAcceptMerge}
          onDismiss={handleDismissMerge}
        />

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[8rem] flex-1 space-y-1">
              <label className="text-xs text-slate-500">جستجو</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="عنوان…"
              />
            </div>
            <FilterSelect
              label="گروه"
              value={group}
              onChange={setGroup}
              options={[
                { value: ALL, label: "همه" },
                ...groupOptions.map((g) => ({ value: g, label: g })),
              ]}
            />
            <FilterSelect
              label="وضعیت"
              value={status}
              onChange={setStatus}
              options={[
                { value: ALL, label: "همه" },
                ...ALL_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                })),
              ]}
            />
            <FilterSelect
              label="نوع"
              value={kind}
              onChange={setKind}
              options={[
                { value: ALL, label: "همه" },
                ...ALL_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
              ]}
            />
            <FilterSelect
              label="سطل تصمیم"
              value={bucket}
              onChange={setBucket}
              options={[
                { value: ALL, label: "همه" },
                ...ALL_BUCKETS.map((b) => ({
                  value: b,
                  label: BUCKET_LABELS[b],
                })),
              ]}
            />
            <FilterSelect
              label="حالت کار"
              value={workMode}
              onChange={setWorkMode}
              options={[
                { value: ALL, label: "همه" },
                ...ALL_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] })),
              ]}
            />
          </div>

          {itemsLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری کارها…
            </div>
          )}
          {itemsError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {itemsError}
            </p>
          )}
          {!itemsLoading && !itemsError && items.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              کاری با این فیلترها پیدا نشد.
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link
                    to="/operations/work/$itemId"
                    params={{ itemId: item.id }}
                    className="block truncate font-medium text-slate-800 hover:text-teal-800"
                  >
                    {item.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{STATUS_LABELS[item.status]}</Badge>
                    <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                    <Badge variant="outline">{PRIORITY_LABELS[item.priority]}</Badge>
                    {item.decision_bucket && (
                      <Badge variant="outline">
                        {BUCKET_LABELS[item.decision_bucket]}
                      </Badge>
                    )}
                    <Badge variant="outline">{MODE_LABELS[item.work_mode]}</Badge>
                    {item.group_name && (
                      <Badge variant="outline">{item.group_name}</Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link
                    to="/operations/work/$itemId"
                    params={{ itemId: item.id }}
                  >
                    جزئیات
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <CreateWorkWizard
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(_id, pendingMerges) => {
          void refreshAll();
          if (pendingMerges > 0) {
            toast.message("پیشنهاد ادغام آماده است — پنل ادغام را ببینید.", {
              action: {
                label: "برو",
                onClick: () => {
                  document
                    .getElementById("work-merge-panel")
                    ?.scrollIntoView({ behavior: "smooth" });
                },
              },
            });
          }
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-[7.5rem] space-y-1">
      <label className="text-xs text-slate-500">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
