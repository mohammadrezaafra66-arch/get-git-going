import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SaleListHeader } from "@/components/public/sale-list-header";
import { SaleListTable } from "@/components/public/sale-list-table";
import {
  getPublicSaleList,
  PUBLIC_PAGE_SIZE,
  type PublicSaleList,
} from "@/lib/public/get-public-sale-list";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/public/sale-lists/$listId")({
  loader: async ({ params }) => {
    const data = await getPublicSaleList(params.listId, 1);
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name} — لیست فروش افراکالا` : "لیست فروش افراکالا";
    const description =
      loaderData?.description ??
      (loaderData
        ? `لیست فروش «${loaderData.name}» شامل محصولات منتشرشده افراکالا با قیمت‌های به‌روز.`
        : "لیست فروش منتشرشدهٔ افراکالا شامل محصولات و قیمت‌های به‌روز برای مشتریان.");
    const url = loaderData
      ? `https://get-git-going.lovable.app/public/sale-lists/${loaderData.id ?? ""}`
      : "https://get-git-going.lovable.app/";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "robots", content: "noindex, nofollow" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: loaderData
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                name: loaderData.name,
                description,
                url,
                inLanguage: "fa-IR",
                isPartOf: {
                  "@type": "WebSite",
                  name: "افراکالا",
                  url: "https://get-git-going.lovable.app",
                },
              }),
            },
          ]
        : [],
    };
  },
  notFoundComponent: PublicNotFound,
  component: PublicSaleListPage,
});

function PublicNotFound() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-foreground">۴۰۴</h1>
        <h2 className="mt-3 text-lg font-semibold">لیست فروش یافت نشد</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          این لیست وجود ندارد یا هنوز منتشر نشده است.
        </p>
      </div>
    </div>
  );
}

function PublicSaleListPage() {
  const initial = Route.useLoaderData() as PublicSaleList;
  const { listId } = Route.useParams();
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["public-sale-list", listId, page],
    queryFn: async () => {
      const data = await getPublicSaleList(listId, page);
      if (!data) throw new Error("not_found");
      return data;
    },
    initialData: page === 1 ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const data = q.data ?? initial;
  const totalPages = Math.max(1, Math.ceil(data.total_items / PUBLIC_PAGE_SIZE));

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <SaleListHeader
        name={data.name}
        versionNumber={data.version_number}
        publishedAt={data.published_at}
        salePriceTypeTitle={data.sale_price_type_title}
        description={data.description}
      />

      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-6">
        {q.isFetching && q.isPlaceholderData ? (
          <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> در حال بارگذاری...
          </div>
        ) : null}

        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <SaleListTable items={data.items} />
        )}

        {totalPages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-2 text-xs sm:text-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || q.isFetching}
            >
              صفحه قبل
            </Button>
            <span className="text-muted-foreground">
              صفحه {formatNumber(page)} از {formatNumber(totalPages)} • {formatNumber(data.total_items)} محصول
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || q.isFetching}
            >
              صفحه بعد
            </Button>
          </div>
        ) : null}
      </main>

      <footer className="mt-6 border-t border-border bg-card">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-5 text-xs text-muted-foreground sm:text-sm">
          {data.terms_text ? (
            <div className="whitespace-pre-wrap leading-6">{data.terms_text}</div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-2 text-[11px]">
            <span>افراکالا</span>
            <span>نسخه {formatNumber(data.version_number)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}