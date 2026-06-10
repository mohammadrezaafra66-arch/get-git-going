import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search, Plus } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { formatDateFa } from "@/lib/i18n/formatters";
import {
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
  type FeedbackType,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/feedback")({
  beforeLoad: async () => {
    await requirePermission("feedback", "view");
  },
  component: FeedbackListPage,
});

function FeedbackListPage() {
  const { user, roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<FeedbackType | "all">("all");
  const [status, setStatus] = useState<FeedbackStatus | "all">("all");
  const [page, setPage] = useState(1);
  const debouncedRaw = useDebounce(search, 350);
  const debounced = normalizeSearchText(debouncedRaw);

  const queryKey = useMemo(
    () => ["feedback-items", { search: debounced, type, status, page, canManage, uid: user?.id }],
    [debounced, type, status, page, canManage, user?.id],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("feedback_items")
        .select("id, title, type, status, submitted_by, created_at, updated_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (type !== "all") q = q.eq("type", type);
      if (status !== "all") q = q.eq("status", status);
      if (debounced.trim()) q = q.ilike("title", `%${debounced.trim()}%`);
      // RLS already filters; no need to add submitted_by filter for non-managers.
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="مرکز بازخورد و بهبود"
        description={canManage ? "همه بازخوردهای ثبت‌شده توسط کارکنان" : "بازخوردهای ثبت‌شده شما"}
        actions={
          <Button asChild size="sm">
            <Link to="/feedback/create">
              <Plus className="ms-1 h-4 w-4" />
              بازخورد جدید
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="جستجوی عنوان..."
            className="pe-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as FeedbackType | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="نوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه انواع</SelectItem>
            {FEEDBACK_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as FeedbackStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="بازخوردی یافت نشد"
          description="هنوز بازخوردی برای فیلترهای انتخاب‌شده ثبت نشده است."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((d) => (
            <Link
              key={d.id}
              to="/feedback/$feedbackId"
              params={{ feedbackId: d.id }}
              className="block"
            >
              <Card className="h-full transition hover:border-primary hover:shadow-sm">
                <CardHeader className="space-y-2 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{FEEDBACK_TYPE_LABELS[d.type as FeedbackType]}</Badge>
                    <Badge
                      variant="outline"
                      className={FEEDBACK_STATUS_COLORS[d.status as FeedbackStatus]}
                    >
                      {FEEDBACK_STATUS_LABELS[d.status as FeedbackStatus]}
                    </Badge>
                  </div>
                  <CardTitle className="text-base leading-relaxed">{d.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {formatDateFa(d.created_at)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.max(1, p - 1));
                }}
                aria-disabled={page === 1}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-3 text-sm">
                صفحه {page} از {totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                aria-disabled={page === totalPages}
                className={
                  page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
