import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, Settings2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { KnowledgeAskBox } from "@/components/knowledge/KnowledgeAskBox";
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
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_ACCESS_LABELS,
  type KnowledgeCategory,
  type KnowledgeAccessLevel,
} from "@/lib/knowledge/constants";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_app/knowledge")({
  beforeLoad: async () => {
    await requirePermission("knowledge", "view");
  },
  component: KnowledgeListPage,
});

function KnowledgeListPage() {
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "manager"]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<KnowledgeCategory | "all">("all");
  const [page, setPage] = useState(1);
  const debouncedRaw = useDebounce(search, 350);
  const debouncedNorm = normalizeSearchText(debouncedRaw);
  const debounced = debouncedNorm.length >= 2 ? debouncedNorm : "";

  const queryKey = useMemo(
    () => ["knowledge-documents", { search: debounced, category, page }],
    [debounced, category, page],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("knowledge_documents")
        .select("id, title, category, access_level, version, is_published, updated_at", {
          count: "exact",
        })
        .eq("is_published", true)
        .order("updated_at", { ascending: false })
        .range(from, to);
      if (category !== "all") q = q.eq("category", category);
      if (debounced.trim()) q = q.ilike("title", `%${debounced.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="دانش سازمانی"
        description="مقاله‌ها، قوانین و بخشنامه‌های داخلی شرکت"
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link to="/knowledge/manage">
                <Settings2 className="ms-1 h-4 w-4" />
                مدیریت اسناد
              </Link>
            </Button>
          ) : null
        }
      />

      <KnowledgeAskBox />

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
          value={category}
          onValueChange={(v) => {
            setCategory(v as KnowledgeCategory | "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="دسته‌بندی" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دسته‌ها</SelectItem>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="سندی یافت نشد"
          description="هیچ سند منتشرشده‌ای برای فیلترهای انتخاب‌شده وجود ندارد."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((d) => (
            <Link
              key={d.id}
              to="/knowledge/$documentId"
              params={{ documentId: d.id }}
              className="block"
            >
              <Card className="h-full transition hover:border-primary hover:shadow-sm">
                <CardHeader className="space-y-2 pb-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">
                      {KNOWLEDGE_CATEGORY_LABELS[d.category as KnowledgeCategory]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {KNOWLEDGE_ACCESS_LABELS[d.access_level as KnowledgeAccessLevel]}
                    </Badge>
                  </div>
                  <CardTitle className="text-base leading-relaxed">{d.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>نسخه {d.version}</span>
                  <span>{formatDateFa(d.updated_at)}</span>
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
