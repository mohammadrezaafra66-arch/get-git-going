import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2, Search, Tag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import {
  OWNER_ASSIGNABLE_LABEL_VISIBILITY,
  OWNER_LABEL_PAGE_SIZE,
  OWNER_LABEL_STALE_TIME_MS,
} from "@/lib/products/owner-label-config";
import { getOwnerLabelOverview } from "@/lib/products/owner-label-queries";
import { canPersistOwnerLabels } from "@/lib/products/owner-label-mutations";
import { OwnerScopedLabelsDialog } from "@/components/products/OwnerScopedLabelsDialog";
import { OwnerLabelStrategyCard } from "./OwnerLabelStrategyCard";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OwnerLabelQuotaMeter } from "./OwnerLabelQuotaMeter";

const ID_QUERY_CAP = 1000;

type TaggedState = "all" | "tagged" | "untagged" | "recommended";

interface OwnerLabelProductRow {
  id: string;
  name: string;
  sku: string | null;
  model: string | null;
  updated_at: string | null;
  internalLabels: Array<{ id: string; title: string; color: string | null }>;
  isTagged: boolean;
}

interface PageResult {
  rows: OwnerLabelProductRow[];
  total: number;
  capped: boolean;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_,()]/g, (m) => `\\${m}`);
}

async function fetchOwnerProductsPage(params: {
  eligibleProductIds: string[];
  taggedProductIds: string[];
  page: number;
  pageSize: number;
  search: string;
  taggedState: TaggedState;
}): Promise<PageResult> {
  const { eligibleProductIds, taggedProductIds, page, pageSize, search, taggedState } = params;
  const taggedSet = new Set(taggedProductIds);

  let target = eligibleProductIds;
  if (taggedState === "tagged") {
    target = eligibleProductIds.filter((id) => taggedSet.has(id));
  } else if (taggedState === "untagged" || taggedState === "recommended") {
    target = eligibleProductIds.filter((id) => !taggedSet.has(id));
  }

  if (target.length === 0) {
    return { rows: [], total: 0, capped: false };
  }

  let capped = false;
  let targetIds = target;
  if (target.length > ID_QUERY_CAP) {
    targetIds = target.slice(0, ID_QUERY_CAP);
    capped = true;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // در حالت «پیشنهادی» قدیمی‌ترها اول می‌آیند تا محصولاتی که مدتی است
  // بدون رسیدگی مانده‌اند زودتر در دسترس مسئول قرار بگیرند.
  const ascending = taggedState === "recommended";

  let q = supabase
    .from("products")
    .select(
      `id, name, sku, model, updated_at,
       product_label_links(label_id, product_labels(id, title, color, visibility, is_active))`,
      { count: "exact" },
    )
    .in("id", targetIds)
    .order("updated_at", { ascending })
    .range(from, to);

  const term = search.trim();
  if (term.length > 0) {
    const safe = escapeLike(term);
    q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,model.ilike.%${safe}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const rows: OwnerLabelProductRow[] = (data ?? []).map((r: any) => {
    const links = Array.isArray(r.product_label_links) ? r.product_label_links : [];
    const internalLabels = links
      .map((l: any) => l?.product_labels)
      .filter(
        (lb: any) =>
          lb &&
          lb.is_active === true &&
          lb.visibility === OWNER_ASSIGNABLE_LABEL_VISIBILITY,
      )
      .map((lb: any) => ({ id: lb.id, title: lb.title, color: lb.color ?? null }));
    return {
      id: r.id,
      name: r.name,
      sku: r.sku ?? null,
      model: r.model ?? null,
      updated_at: r.updated_at ?? null,
      internalLabels,
      isTagged: taggedSet.has(r.id),
    };
  });

  return { rows, total: count ?? rows.length, capped };
}

export function OwnerLabelQuotaTab() {
  const { user, initialized, roles } = useAuth();
  const canWrite = canPersistOwnerLabels(roles ?? []);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [taggedState, setTaggedState] = useState<TaggedState>("all");
  const [page, setPage] = useState(1);
  const pageSize = OWNER_LABEL_PAGE_SIZE;
  const [dialogProductId, setDialogProductId] = useState<string | null>(null);
  const [dialogProductName, setDialogProductName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const overviewQ = useQuery({
    queryKey: ["owner-label-summary", user?.id ?? null],
    queryFn: () => getOwnerLabelOverview(user!.id),
    enabled: !!user?.id,
    staleTime: OWNER_LABEL_STALE_TIME_MS,
  });

  const eligibleIds = overviewQ.data?.eligibleProductIds ?? [];
  const taggedIds = overviewQ.data?.taggedProductIds ?? [];

  const productsQ = useQuery({
    queryKey: [
      "owner-label-products",
      user?.id ?? null,
      page,
      pageSize,
      debouncedSearch,
      taggedState,
      eligibleIds.length,
      taggedIds.length,
    ],
    queryFn: () =>
      fetchOwnerProductsPage({
        eligibleProductIds: eligibleIds,
        taggedProductIds: taggedIds,
        page,
        pageSize,
        search: debouncedSearch,
        taggedState,
      }),
    enabled: overviewQ.isSuccess && eligibleIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const summary = overviewQ.data?.summary;
  const remaining = summary?.remaining ?? 0;
  const exhausted = summary?.isMet ?? false;

  function resetPage() {
    setPage(1);
  }

  function handleManageLabels(row: OwnerLabelProductRow) {
    setDialogProductId(row.id);
    setDialogProductName(row.name);
    setDialogOpen(true);
  }

  function goToTagged() {
    setTaggedState("tagged");
    setPage(1);
  }

  // --- Loading / auth states ---
  if (!initialized) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground" dir="rtl">
        <Loader2 className="ms-2 h-5 w-5 animate-spin" />
        در حال بارگذاری سهمیه برچسب‌ها...
      </div>
    );
  }
  if (!user) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground" dir="rtl">
        برای مشاهده سهمیه برچسب‌ها ابتدا وارد حساب خود شوید.
      </div>
    );
  }

  if (overviewQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground" dir="rtl">
        <Loader2 className="ms-2 h-5 w-5 animate-spin" />
        در حال بارگذاری سهمیه برچسب‌ها...
      </div>
    );
  }
  if (overviewQ.error) {
    return (
      <div className="space-y-2" dir="rtl">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          خطا در دریافت داده‌ها
        </div>
        <Button variant="outline" size="sm" onClick={() => overviewQ.refetch()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }

  if (eligibleIds.length === 0) {
    return (
      <div className="space-y-4" dir="rtl">
        {summary && (
          <OwnerLabelQuotaMeter
            eligibleCount={summary.eligibleCount}
            taggedCount={summary.taggedCount}
            quotaMax={summary.quota}
            remaining={summary.remaining}
            exhausted={summary.isMet}
          />
        )}
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground space-y-1">
          <p>در فاز اول فقط محصولات فعال و تک‌مسئول وارد سهمیه می‌شوند.</p>
          <p className="text-xs">
            اگر محصولی به شما منسوب شده اما اینجا نمی‌بینید، ممکن است محصول مشترک، غیرفعال یا خارج از وضعیت فعال باشد.
          </p>
        </div>
      </div>
    );
  }

  const rows = productsQ.data?.rows ?? [];
  const excludedSharedCount = overviewQ.data?.excludedSharedCount ?? 0;

  return (
    <div className="space-y-4" dir="rtl">
      {summary && (
        <OwnerLabelQuotaMeter
          eligibleCount={summary.eligibleCount}
          taggedCount={summary.taggedCount}
          quotaMax={summary.quota}
          remaining={summary.remaining}
          exhausted={summary.isMet}
        />
      )}

      {summary && (
        <OwnerLabelStrategyCard
          eligibleCount={summary.eligibleCount}
          taggedCount={summary.taggedCount}
          quota={summary.quota}
          remaining={summary.remaining}
          excludedSharedCount={excludedSharedCount}
          exhausted={summary.isMet}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="جستجو در نام، SKU یا مدل..."
            className="ps-8"
          />
        </div>
        <ToggleGroup
          type="single"
          value={taggedState}
          onValueChange={(v) => {
            if (!v) return;
            setTaggedState(v as TaggedState);
            resetPage();
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">همه</ToggleGroupItem>
          <ToggleGroupItem value="tagged">برچسب‌خورده</ToggleGroupItem>
          <ToggleGroupItem value="untagged">بدون برچسب</ToggleGroupItem>
          <ToggleGroupItem value="recommended">پیشنهادی</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">فقط برچسب‌های داخلی در سهمیه حساب می‌شوند</Badge>
        <Badge variant="outline">
          {excludedSharedCount > 0
            ? `${formatNumber(excludedSharedCount)} محصول مشترک در این فاز از سهمیه خارج شده‌اند`
            : "محصولات مشترک در این فاز از سهمیه خارج‌اند"}
        </Badge>
        {summary && (
          remaining > 0 ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              {`${formatNumber(remaining)} جای خالی برای تکمیل سبد تمرکز باقی مانده است`}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
              سبد تمرکز فعلی تکمیل شده است
            </Badge>
          )
        )}
        {productsQ.data?.capped && (
          <Badge variant="destructive">
            تعداد نتایج زیاد است؛ برای نتیجه دقیق‌تر از جستجو استفاده کنید.
          </Badge>
        )}
      </div>

      <Card className="overflow-hidden">
        {productsQ.isLoading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="ms-2 h-5 w-5 animate-spin" />
            در حال بارگذاری...
          </div>
        ) : productsQ.error ? (
          <div className="space-y-2 p-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              خطا در دریافت داده‌ها
            </div>
            <Button variant="outline" size="sm" onClick={() => productsQ.refetch()}>
              تلاش دوباره
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyResults
            search={debouncedSearch}
            taggedState={taggedState}
            remaining={remaining}
            onGoToTagged={goToTagged}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">محصول</TableHead>
                <TableHead className="text-right">SKU</TableHead>
                <TableHead className="text-right">آخرین تغییر</TableHead>
                <TableHead className="text-right">برچسب‌های فعلی</TableHead>
                <TableHead className="text-right">وضعیت سهمیه</TableHead>
                <TableHead className="text-right">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const statusBadge = r.isTagged ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">داخل سبد تمرکز</Badge>
                ) : remaining > 0 ? (
                  <Badge variant="outline" className="border-sky-500/40 text-sky-700 dark:text-sky-300">
                    کاندید برچسب‌گذاری
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                    نیازمند آزادسازی سهمیه
                  </Badge>
                );

                let actionText = "مدیریت برچسب";
                let actionTitle = "ویرایش برچسب‌های داخلی این محصول";
                if (!canWrite) {
                  actionText = "مشاهده برچسب";
                  actionTitle = "برای نقش شما ثبت نهایی برچسب فعال نیست؛ فقط مشاهده می‌کنید.";
                } else if (!r.isTagged && remaining > 0) {
                  actionText = "افزودن به سبد";
                  actionTitle = "انتخاب برچسب داخلی برای این محصول";
                } else if (!r.isTagged && remaining === 0) {
                  actionText = "بررسی";
                  actionTitle = "سهمیه شما پر است؛ برای افزودن محصول جدید، ابتدا یکی از محصولات قبلی را آزاد کنید.";
                }

                return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div>{r.name}</div>
                    {r.model && (
                      <div className="text-xs text-muted-foreground">{r.model}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.updated_at ? formatDateFa(r.updated_at) : "—"}
                  </TableCell>
                  <TableCell>
                    {r.internalLabels.length === 0 ? (
                      <span className="text-xs text-muted-foreground">بدون برچسب داخلی</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.internalLabels.map((lb) => (
                          <Badge
                            key={lb.id}
                            variant="secondary"
                            className="text-[11px]"
                            style={
                              lb.color
                                ? { backgroundColor: `${lb.color}20`, color: lb.color, borderColor: `${lb.color}40` }
                                : undefined
                            }
                          >
                            <Tag className="ms-1 h-3 w-3" />
                            {lb.title}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {statusBadge}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleManageLabels(r)}
                      title={actionTitle}
                    >
                      {actionText}
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || productsQ.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            قبلی
          </Button>
          <span className="text-muted-foreground">
            صفحه {formatNumber(page)} از {formatNumber(totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || productsQ.isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            بعدی
          </Button>
        </div>
      )}

      {summary && (
        <OwnerScopedLabelsDialog
          productId={dialogProductId}
          productName={dialogProductName}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          summary={{
            taggedCount: summary.taggedCount,
            quota: summary.quota,
            remaining: summary.remaining,
            isMet: summary.isMet,
          }}
        />
      )}
    </div>
  );
}

function EmptyResults({
  search,
  taggedState,
  remaining,
  onGoToTagged,
}: {
  search: string;
  taggedState: TaggedState;
  remaining: number;
  onGoToTagged: () => void;
}) {
  if (search.trim().length > 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        نتیجه‌ای برای این جستجو پیدا نشد.
      </div>
    );
  }
  if (taggedState === "recommended") {
    if (remaining === 0) {
      return (
        <div className="space-y-3 p-8 text-center text-sm">
          <p className="text-amber-700 dark:text-amber-300">
            سهمیه شما تکمیل شده است. برای اضافه‌کردن محصول جدید، ابتدا از بخش برچسب‌خورده‌ها یکی از محصولات قبلی را آزاد کنید.
          </p>
          <Button size="sm" variant="outline" onClick={onGoToTagged}>
            مشاهده برچسب‌خورده‌ها
          </Button>
        </div>
      );
    }
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        فعلاً محصول پیشنهادی جدیدی برای تکمیل سهمیه پیدا نشد.
      </div>
    );
  }
  if (taggedState === "tagged") {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        هنوز محصولی با برچسب داخلی ندارید.
      </div>
    );
  }
  if (taggedState === "untagged") {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        همه محصولات واجد شرایط فعلی برچسب داخلی دارند.
      </div>
    );
  }
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      هنوز محصول واجد شرایطی برای برچسب‌گذاری ندارید.
    </div>
  );
}

export default OwnerLabelQuotaTab;