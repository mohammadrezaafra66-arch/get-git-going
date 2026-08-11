import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, XCircle } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { formatDateTimeFa, formatNumber } from "@/lib/i18n/formatters";
import {
  cancelPromotionNomination,
  getPromotionNominationQuota,
  listPromotionNominations,
  NOMINATION_REASON_FA,
  type NominationReasonCode,
} from "@/lib/sales/promotion-nominations";

export const Route = createFileRoute("/_app/sales/promotion-nominations")({
  beforeLoad: async () => {
    await requireAnyRole(["sales", "admin", "manager"]);
  },
  component: PromotionNominationsPage,
});

function PromotionNominationsPage() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isAdmin = hasAnyRole(roles, ["admin", "manager"]);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const quotaQ = useQuery({
    queryKey: ["promo-nom-quota"],
    queryFn: getPromotionNominationQuota,
  });

  const listQ = useQuery({
    queryKey: ["promo-nominations", user?.id, includeCancelled, showAll && isAdmin],
    enabled: !!user?.id,
    queryFn: () =>
      listPromotionNominations({
        onlyMine: !(showAll && isAdmin),
        userId: user?.id,
        includeCancelled,
        limit: 100,
      }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelPromotionNomination(id),
    onSuccess: (res) => {
      toast.success(`نامزدی لغو شد — باقی‌مانده امروز: ${formatNumber(res.remaining_today)}`);
      qc.invalidateQueries({ queryKey: ["promo-nominations"] });
      qc.invalidateQueries({ queryKey: ["promo-nom-quota"] });
    },
    onError: (e: Error) => {
      const key = (e.message || "").match(/[a-z_]+/)?.[0] ?? "";
      const fa: Record<string, string> = {
        nomination_not_found: "نامزدی یافت نشد.",
        forbidden: "فقط نامزدی امروزِ خودتان را می‌توانید لغو کنید.",
        unauthenticated: "نشست منقضی شده است.",
      };
      toast.error(fa[key] ?? e.message ?? "لغو ناموفق بود");
    },
  });

  return (
    <div className="container py-6 space-y-6" dir="rtl">
      <PageHeader
        title="نامزدی تبلیغ محصولات"
        description="پیشنهادهای روزانهٔ فروش برای تبلیغ. سهمیه و لغو از بک‌اند واقعی خوانده می‌شود."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/sales/search">جستجوی محصول برای نامزدی</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            سهمیه امروز
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {quotaQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : quotaQ.data ? (
            <span>
              مصرف‌شده: {formatNumber(quotaQ.data.used_today)} از{" "}
              {formatNumber(quotaQ.data.daily_quota)} — باقی‌مانده:{" "}
              <strong>{formatNumber(quotaQ.data.remaining_today)}</strong>
            </span>
          ) : (
            <span className="text-muted-foreground">سهمیه در دسترس نیست</span>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={includeCancelled}
            onCheckedChange={setIncludeCancelled}
            id="inc-cancel"
          />
          <Label htmlFor="inc-cancel">نمایش لغوشده‌ها</Label>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch checked={showAll} onCheckedChange={setShowAll} id="show-all" />
            <Label htmlFor="show-all">همهٔ فروشنده‌ها (مدیر)</Label>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">فهرست نامزدی‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (listQ.data ?? []).length === 0 ? (
            <EmptyState
              title="نامزدی ثبت نشده"
              description="از صفحهٔ جستجوی فروش، روی «پیشنهاد برای تبلیغ» بزنید."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>محصول</TableHead>
                    {showAll && isAdmin && <TableHead>فروشنده</TableHead>}
                    <TableHead>دلیل</TableHead>
                    <TableHead>کانال</TableHead>
                    <TableHead>روز</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(listQ.data ?? []).map((row) => {
                    const canCancel =
                      !row.cancelled_at && !!user?.id && row.nominated_by === user.id;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.product?.name ?? "—"}</div>
                          {row.product?.sku && (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {row.product.sku}
                            </div>
                          )}
                        </TableCell>
                        {showAll && isAdmin && (
                          <TableCell>{row.nominator?.full_name ?? "—"}</TableCell>
                        )}
                        <TableCell>
                          {NOMINATION_REASON_FA[row.reason_code as NominationReasonCode] ??
                            row.reason_code}
                          {row.reason_note && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {row.reason_note}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{row.channel?.name ?? "—"}</TableCell>
                        <TableCell>{formatDateTimeFa(row.created_at)}</TableCell>
                        <TableCell>
                          {row.cancelled_at ? (
                            <Badge variant="secondary">لغو شده</Badge>
                          ) : (
                            <Badge>فعال</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canCancel ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelMut.isPending}
                              onClick={() => cancelMut.mutate(row.id)}
                            >
                              {cancelMut.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 ms-1" />
                              )}
                              لغو
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
