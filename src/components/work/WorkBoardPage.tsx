import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Loader2,
  Plus,
  FolderKanban,
  RefreshCw,
  Settings2,
  ListTodo,
  Search,
} from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
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
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkMode,
  type WorkMorningSummary,
} from "@/lib/work";
import {
  MorningSummaryStrip,
  type MorningBucketKey,
} from "./MorningSummary";
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
  const [priority, setPriority] = useState<string>(ALL);
  const [openOnly, setOpenOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
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
        priority:
          priority === ALL ? undefined : (priority as WorkItemPriority),
        openOnly: status === ALL && openOnly ? true : undefined,
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
  }, [status, kind, bucket, workMode, group, search, priority, openOnly]);

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

  const activeMorningBucket: MorningBucketKey | null = openOnly
    ? "open"
    : bucket === "today_decide" ||
        bucket === "today_do" ||
        bucket === "waiting"
      ? bucket
      : null;

  function handleMorningBucketClick(key: MorningBucketKey) {
    if (key === "open") {
      if (openOnly && bucket === ALL) {
        setOpenOnly(false);
        return;
      }
      setBucket(ALL);
      setOpenOnly(true);
      return;
    }
    if (bucket === key && !openOnly) {
      setBucket(ALL);
      return;
    }
    setBucket(key);
    setOpenOnly(false);
  }

  function toggleChipOpen() {
    if (openOnly && status === ALL) {
      setOpenOnly(false);
      return;
    }
    setStatus(ALL);
    setOpenOnly(true);
  }

  function toggleChipTodayDo() {
    if (bucket === "today_do") {
      setBucket(ALL);
      return;
    }
    setBucket("today_do");
    setOpenOnly(false);
  }

  function toggleChipHighPriority() {
    setPriority((prev) => (prev === "high" ? ALL : "high"));
  }

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
      <div className="container max-w-5xl space-y-6 py-6 pb-24 md:pb-6">
        <PageHeader
          title="🎫 تیکت"
          description="نظرات، انتقادات و پیشنهادات خود را اینجا ثبت کنید تا بررسی و اعمال شوند."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild className="rounded-full border-slate-200 bg-white/90">
                <Link to="/operations/work/topics">
                  <FolderKanban className="me-1.5 h-4 w-4" />
                  موضوع‌ها
                </Link>
              </Button>
              {canManageTaxonomies ? (
                <Button variant="outline" size="sm" asChild className="rounded-full border-slate-200 bg-white/90">
                  <Link to="/operations/work/settings">
                    <Settings2 className="me-1.5 h-4 w-4" />
                    طبقه‌بندی
                  </Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-slate-200 bg-white/90"
                onClick={() => void refreshAll()}
              >
                <RefreshCw className="me-1.5 h-4 w-4" />
                تازه‌سازی
              </Button>
              <Button
                size="sm"
                className="hidden rounded-full bg-teal-700 text-white hover:bg-teal-800 md:inline-flex"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="me-1.5 h-4 w-4" />
                تیکت جدید
              </Button>
            </div>
          }
        />

        <section
          className="rounded-2xl border border-teal-100 bg-white/80 px-4 py-4 text-sm leading-7 text-slate-700 shadow-sm"
          aria-labelledby="ticket-intro-title"
        >
          <h2 id="ticket-intro-title" className="text-base font-semibold text-teal-900">
            اینجا چه کاری انجام می‌شود؟
          </h2>
          <p className="mt-2">
            این بخش برای ثبت <strong className="font-semibold text-slate-900">نظر، انتقاد و پیشنهاد</strong>{" "}
            شماست تا تیم بتواند آن‌ها را بررسی کند و در صورت نیاز اعمال کند. هر مورد به‌صورت یک
            «تیکت» ثبت می‌شود و تا بسته شدن قابل پیگیری است.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">آموزش کار با تیکت</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pe-5">
            <li>
              با دکمهٔ <span className="font-medium text-teal-800">«تیکت جدید»</span> موضوع را
              بنویسید؛ چند سوال کوتاه کمکتان می‌کند تا شرح کامل شود.
            </li>
            <li>
              در خلاصهٔ صبحگاهی و صف تصمیم، تیکت‌های امروز را ببینید و سطل تصمیم
              (امروز / بعداً / رد) را مشخص کنید.
            </li>
            <li>
              روی هر تیکت بروید، موعد ادعا‌شده و وضعیت را تنظیم کنید و تا انجام/بستن
              حلقه پیش ببرید.
            </li>
            <li>
              اگر چند تیکت شبیه هم بود، از پنل پیشنهاد ادغام برای یکی‌کردن استفاده کنید.
            </li>
          </ol>
        </section>

        <MorningSummaryStrip
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          activeBucket={activeMorningBucket}
          onBucketClick={handleMorningBucketClick}
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

        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ListTodo className="h-4 w-4 text-teal-700" />
            <span>📋 فهرست تیکت‌ها</span>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative min-w-[8rem] flex-1 space-y-1">
                <label className="text-xs text-slate-500">جستجو</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="عنوان…"
                    className="rounded-xl ps-8"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pb-0.5">
                <FilterChip
                  active={openOnly && status === ALL}
                  onClick={toggleChipOpen}
                  label="باز"
                />
                <FilterChip
                  active={bucket === "today_do"}
                  onClick={toggleChipTodayDo}
                  label="امروز انجام"
                />
                <FilterChip
                  active={priority === "high"}
                  onClick={toggleChipHighPriority}
                  label="اولویت بالا"
                />
              </div>
            </div>

            <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="work-filter-more"
                  className="h-8 gap-1 px-2 text-xs text-slate-600"
                >
                  فیلترهای بیشتر
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      moreFiltersOpen && "rotate-180",
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 flex flex-wrap items-end gap-2">
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
                    onChange={(v) => {
                      setStatus(v);
                      if (v !== ALL) setOpenOnly(false);
                    }}
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
                      ...ALL_KINDS.map((k) => ({
                        value: k,
                        label: KIND_LABELS[k],
                      })),
                    ]}
                  />
                  <FilterSelect
                    label="سطل تصمیم"
                    value={bucket}
                    onChange={(v) => {
                      setBucket(v);
                      if (v !== ALL) setOpenOnly(false);
                    }}
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
                      ...ALL_MODES.map((m) => ({
                        value: m,
                        label: MODE_LABELS[m],
                      })),
                    ]}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {itemsLoading && (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری تیکت‌ها…
            </div>
          )}
          {itemsError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {itemsError}
            </p>
          )}
          {!itemsLoading && !itemsError && items.length === 0 && (
            <div
              data-testid="work-board-empty"
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-teal-200 bg-teal-50/40 py-12 text-center"
            >
              <span className="text-3xl" aria-hidden>
                🌱
              </span>
              <p className="text-sm text-slate-600">
                هنوز تیکتی برای نمایش نیست. اولین نظر یا پیشنهاد را ثبت کنید تا فهرست زنده شود.
              </p>
              <Button
                size="sm"
                className="rounded-full bg-teal-700 hover:bg-teal-800"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="me-1.5 h-4 w-4" />
                ثبت اولین تیکت
              </Button>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
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

      <Button
        type="button"
        size="lg"
        data-testid="work-board-fab"
        className="fixed bottom-5 end-5 z-40 h-14 w-14 rounded-full p-0 shadow-lg md:hidden"
        aria-label="تیکت جدید"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>

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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition",
        active
          ? "border-teal-600 bg-teal-50 text-teal-900"
          : "border-slate-200 bg-white text-slate-600 hover:border-teal-300",
      )}
    >
      {label}
    </button>
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
