/**
 * Wave 6 B-3(c) — «درخواست‌های افزایش اعتبار», credit requests.
 *
 * `credit_requests` had a table, RLS and zero references anywhere in `src/`. This is the screen
 * for both halves of the workflow, because they are the same short list seen from two sides:
 *
 * - D-45, the REQUEST side: a salesperson asks for a higher ceiling on behalf of a customer.
 * - D-53, the REVIEW side: admin, manager or accountant approves or rejects.
 *
 * ## The gate
 *
 * `staticData.gate` AND `beforeLoad`, both naming `["admin","manager","accountant","sales"]` —
 * exactly the roles whose live `role_permissions` row for module `sales` has `can_view = true`.
 * `beforeLoad` runs only on the server, so on a cold direct navigation it never runs in the
 * browser and `staticData.gate` is what `RouteRoleGate` enforces client-side. A route with only
 * one of the two is the security-wave-2 defect.
 *
 * There is no new permission table and no new module: `sales.can_approve` is already true for
 * admin/manager/accountant and false for sales, which is D-45 and D-53 exactly.
 *
 * ## Approving is narrower than viewing, and the database is what enforces it
 *
 * `review_credit_request` raises 42501 for anyone who is not admin/manager/accountant, whatever
 * this page renders. The approve controls are hidden from a salesperson as a courtesy, not as a
 * permission check — and the refusal, if it is ever reached, arrives as the database's own
 * message rather than a guess made here.
 *
 * ## Waiting for permissions instead of guessing (X-3)
 *
 * Wave 6 X-3 removed the static PERMISSIONS matrix, so `hasPermissionEx` returns `false` while
 * `role_permissions` is still in flight — safe, but not a true answer. This page holds on
 * `permissionsLoading` and renders a spinner rather than briefly drawing a refusal and then
 * correcting itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import {
  createCreditRequest,
  listCreditRequests,
  reviewCreditRequest,
  searchCustomersForCredit,
  type CreditRequestRow,
  type CreditRequestStatus,
} from "@/lib/credit/requests";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/sales/credit-requests")({
  // Mirrors the requireAnyRole call below. The shared guard cannot decide during SSR or while
  // roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant", "sales"]);
  },
  component: CreditRequestsPage,
});

const STATUS_FA: Record<CreditRequestStatus, string> = {
  pending: "در انتظار بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
};

const STATUS_VARIANT: Record<CreditRequestStatus, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
};

function formatToman(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${toFaDigits(Math.round(value).toLocaleString("en-US"))} ریال`;
}

function CreditRequestsPage() {
  const { roles, permissionsLoading } = useAuth();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<CreditRequestStatus | "all">("all");
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const canApprove = hasPermissionEx(roles, "sales", "approve");
  const canRequest = hasPermissionEx(roles, "sales", "create");

  const requestsQuery = useQuery({
    queryKey: ["credit-requests", statusFilter],
    queryFn: () => listCreditRequests({ status: statusFilter }),
  });

  // Only fetched for someone who can actually file a request.
  const customersQuery = useQuery({
    queryKey: ["credit-requests", "customers", customerTerm],
    queryFn: () => searchCustomersForCredit(customerTerm),
    enabled: canRequest && !permissionsLoading,
  });

  const createMutation = useMutation({
    mutationFn: createCreditRequest,
    onSuccess: () => {
      toast.success("درخواست ثبت شد");
      setCustomerId("");
      setAmount("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["credit-requests"] });
    },
    onError: (e: Error) => toast.error("ثبت درخواست ناموفق بود", { description: e.message }),
  });

  const reviewMutation = useMutation({
    mutationFn: reviewCreditRequest,
    onSuccess: (_d, vars) => {
      toast.success(vars.decision === "approved" ? "درخواست تأیید شد" : "درخواست رد شد");
      void queryClient.invalidateQueries({ queryKey: ["credit-requests"] });
    },
    // The database's own Persian refusal, not a guess made here.
    onError: (e: Error) => toast.error("بررسی درخواست ناموفق بود", { description: e.message }),
  });

  const rows = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  const amountValue = Number(amount.replace(/[^\d.]/g, ""));
  const canSubmit =
    canRequest && Boolean(customerId) && Number.isFinite(amountValue) && amountValue > 0;

  // X-3: hold rather than draw a refusal that may be wrong.
  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>در حال بررسی دسترسی…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <PageHeader
        title="درخواست‌های افزایش اعتبار"
        description="ثبت درخواست سقف اعتبار برای مشتری و بررسی درخواست‌های ثبت‌شده"
      />

      {canRequest && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-base font-semibold">ثبت درخواست جدید</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cr-customer-search">جست‌وجوی مشتری</Label>
                <Input
                  id="cr-customer-search"
                  value={customerTerm}
                  onChange={(e) => setCustomerTerm(e.target.value)}
                  placeholder="نام مشتری"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cr-customer">مشتری</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="cr-customer">
                    <SelectValue placeholder="انتخاب مشتری" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name ?? "بدون نام"}
                        {c.manual_credit_floor !== null
                          ? ` — سقف دستی فعلی: ${formatToman(c.manual_credit_floor)}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cr-amount">مبلغ درخواستی (ریال)</Label>
                <Input
                  id="cr-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="۰"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cr-notes">توضیحات</Label>
              <Textarea
                id="cr-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="دلیل درخواست افزایش اعتبار"
                rows={2}
              />
            </div>
            <Button
              onClick={() =>
                createMutation.mutate({
                  customerId,
                  amount: amountValue,
                  notes: notes.trim() || null,
                })
              }
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="ml-2 h-4 w-4" />
              )}
              ثبت درخواست
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              درخواست‌ها
              {pendingCount > 0 && (
                <Badge variant="secondary" className="mr-2">
                  {toFaDigits(String(pendingCount))} در انتظار
                </Badge>
              )}
            </h2>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as CreditRequestStatus | "all")}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="pending">در انتظار بررسی</SelectItem>
                <SelectItem value="approved">تأیید شده</SelectItem>
                <SelectItem value="rejected">رد شده</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requestsQuery.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : requestsQuery.isError ? (
            <p className="p-6 text-sm text-destructive">
              خطا در بارگذاری: {(requestsQuery.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">درخواستی ثبت نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="p-2 font-medium">مشتری</th>
                    <th className="p-2 font-medium">مبلغ درخواستی</th>
                    <th className="p-2 font-medium">وضعیت</th>
                    <th className="p-2 font-medium">تاریخ ثبت</th>
                    <th className="p-2 font-medium">تاریخ بررسی</th>
                    {canApprove && <th className="p-2 font-medium">اقدام</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: CreditRequestRow) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">{r.customer?.name ?? "نامشخص"}</td>
                      <td className="p-2">{formatToman(r.requested_amount)}</td>
                      <td className="p-2">
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_FA[r.status]}</Badge>
                      </td>
                      <td className="p-2">{formatDateFa(r.created_at)}</td>
                      <td className="p-2">{r.reviewed_at ? formatDateFa(r.reviewed_at) : "—"}</td>
                      {canApprove && (
                        <td className="p-2">
                          {r.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  reviewMutation.mutate({
                                    requestId: r.id,
                                    decision: "approved",
                                  })
                                }
                                disabled={reviewMutation.isPending}
                              >
                                <Check className="ml-1 h-4 w-4" />
                                تأیید
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  reviewMutation.mutate({
                                    requestId: r.id,
                                    decision: "rejected",
                                  })
                                }
                                disabled={reviewMutation.isPending}
                              >
                                <X className="ml-1 h-4 w-4" />
                                رد
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        تأیید درخواست، سقف اعتبار دستی مشتری را ثبت می‌کند و فرمول تخصیص سرمایه از آن پس این سقف را
        به‌عنوان کف در نظر می‌گیرد.
      </p>
    </div>
  );
}
