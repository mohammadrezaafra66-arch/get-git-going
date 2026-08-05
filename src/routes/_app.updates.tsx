import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Settings2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { PlatformReleaseList } from "@/components/platform-releases/PlatformReleaseList";
import { listPublishedReleases } from "@/lib/platform-releases/api";
import { PAGE_SIZE } from "@/lib/platform-releases/constants";
import { getPageTitle } from "@/config/branding";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/updates")({
  beforeLoad: async () => {
    await requirePermission("platform-releases", "view");
  },
  head: () => ({ meta: [{ title: getPageTitle("تغییرات و به‌روزرسانی‌ها") }] }),
  component: UpdatesPage,
});

function UpdatesPage() {
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin"]);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["platform-releases", "published", page],
    queryFn: () => listPublishedReleases(page, PAGE_SIZE),
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5" data-testid="platform-updates-page">
      <PageHeader
        title="تغییرات و به‌روزرسانی‌ها"
        description="فهرست تغییرات منتشرشدهٔ سامانه — از جدید به قدیم"
        actions={
          canManage ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/platform-releases">
                <Settings2 className="ms-1 h-4 w-4" />
                مدیریت نسخه‌ها
              </Link>
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">خطا در بارگذاری به‌روزرسانی‌ها</p>
          <p className="mt-1 text-muted-foreground">
            {error instanceof Error ? error.message : "لطفاً دوباره تلاش کنید."}
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={() => void refetch()}>
            تلاش دوباره
          </Button>
        </div>
      ) : (
        <>
          <PlatformReleaseList releases={data?.rows ?? []} />
          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                    aria-disabled={page <= 1}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 text-sm text-muted-foreground">
                    صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(totalPages, p + 1));
                    }}
                    aria-disabled={page >= totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}

      {!isLoading && !isError && (data?.count ?? 0) > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          فقط نسخه‌های منتشرشده نمایش داده می‌شوند.
        </p>
      ) : null}
    </div>
  );
}
