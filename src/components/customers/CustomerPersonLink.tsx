import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Link2Off, Loader2, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { linkCustomerToPerson, unlinkCustomerFromPerson } from "@/lib/customers/functions";
import { getPerson, searchPersons } from "@/lib/persons/functions";

const KIND_LABEL: Record<string, string> = {
  individual: "حقیقی",
  organization: "حقوقی",
};

/**
 * Item 169 — UI for the customer↔person bridge.
 * The backend already existed (`customer_set_person` / `customer_clear_person`
 * behind linkCustomerToPerson / unlinkCustomerFromPerson); only the UI was missing.
 */
export function CustomerPersonLink({
  customerId,
  personId,
}: {
  customerId: string;
  personId: string | null;
}) {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchPersons);
  const getPersonFn = useServerFn(getPerson);
  const linkFn = useServerFn(linkCustomerToPerson);
  const unlinkFn = useServerFn(unlinkCustomerFromPerson);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 350);

  const linkedQ = useQuery({
    queryKey: ["customer-linked-person", personId],
    enabled: Boolean(personId),
    queryFn: () => getPersonFn({ data: { id: personId as string } }),
    staleTime: 60_000,
  });

  // searchPersons already returns [] for terms shorter than 2 chars.
  const resultsQ = useQuery({
    queryKey: ["persons-picker", debouncedQuery],
    enabled: !personId && debouncedQuery.trim().length >= 2,
    queryFn: () => searchFn({ data: { query: debouncedQuery } }),
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer", customerId] });
    qc.invalidateQueries({ queryKey: ["customer-linked-person"] });
  };

  const link = useMutation({
    mutationFn: (targetPersonId: string) =>
      linkFn({ data: { customer_id: customerId, person_id: targetPersonId } }),
    onSuccess: () => {
      toast.success("مشتری به پروندهٔ شخص متصل شد");
      setQuery("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "اتصال ناموفق بود"),
  });

  const unlink = useMutation({
    mutationFn: () => unlinkFn({ data: { customer_id: customerId } }),
    onSuccess: (r) => {
      toast.success(r?.changed ? "اتصال قطع شد" : "این مشتری اتصالی نداشت");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "قطع اتصال ناموفق بود"),
  });

  const busy = link.isPending || unlink.isPending;

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-primary" />
          اتصال به پروندهٔ شخص
        </CardTitle>
        <CardDescription>
          پروندهٔ شخص، هویت واحد یک فرد یا سازمان در کل سیستم است. با اتصال، سوابق این مشتری به همان
          پرونده نسبت داده می‌شود.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {personId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              {linkedQ.isLoading ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری پروندهٔ شخص…
                </span>
              ) : linkedQ.isError ? (
                <span className="text-sm text-destructive">
                  پروندهٔ متصل قابل خواندن نیست (ممکن است سطح دسترسی آن محدود باشد).
                </span>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{linkedQ.data?.display_name ?? "—"}</span>
                    {linkedQ.data?.kind && (
                      <Badge variant="secondary" className="text-[10px]">
                        {KIND_LABEL[linkedQ.data.kind] ?? linkedQ.data.kind}
                      </Badge>
                    )}
                    {linkedQ.data && !linkedQ.data.is_active && (
                      <Badge variant="outline" className="text-[10px]">
                        غیرفعال
                      </Badge>
                    )}
                  </div>
                  {linkedQ.data?.legal_name && (
                    <div className="text-xs text-muted-foreground">
                      نام حقوقی: {linkedQ.data.legal_name}
                    </div>
                  )}
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => unlink.mutate()}
              className="text-destructive"
            >
              {unlink.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2Off className="ml-2 h-4 w-4" />
              )}
              قطع اتصال
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>جستجوی شخص</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pr-8"
                  placeholder="نام نمایشی یا نام حقوقی (حداقل ۲ کاراکتر)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {debouncedQuery.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">برای جستجو حداقل ۲ کاراکتر وارد کنید.</p>
            ) : resultsQ.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> در حال جستجو…
              </p>
            ) : resultsQ.isError ? (
              <p className="text-sm text-destructive">جستجوی اشخاص با خطا مواجه شد.</p>
            ) : (resultsQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">شخصی با این عبارت پیدا نشد.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {resultsQ.data!.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{p.display_name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {KIND_LABEL[p.kind] ?? p.kind}
                        </Badge>
                      </div>
                      {p.legal_name && (
                        <div className="truncate text-xs text-muted-foreground">{p.legal_name}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => link.mutate(p.id)}
                      aria-label={`اتصال به ${p.display_name}`}
                    >
                      {link.isPending && link.variables === p.id ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="ml-2 h-4 w-4" />
                      )}
                      اتصال
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
