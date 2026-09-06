import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShieldAlert, Gavel } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useAdminPenalties,
  usePenaltyStats,
  type AdminPenaltyFilters,
} from "@/hooks/penalties/usePenalties";
import {
  PENALTY_TYPE_FA,
  PENALTY_SEVERITY_FA,
  APPEAL_STATUS_FA,
  SEVERITY_CLASS,
  APPEAL_STATUS_CLASS,
  penaltyTypeLabel,
  severityLabel,
} from "@/lib/penalties/labels";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { AppealReviewPanel } from "@/components/penalties/AppealReviewPanel";
import { CreatePenaltyDialog } from "@/components/penalties/CreatePenaltyDialog";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

const ALL = "__all__";
const PAGE_SIZE = 25;

function toPersianDigits(s: string | number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(s).replace(/[0-9]/g, (d) => map[Number(d)]);
}

function AdminPenaltiesPage() {
  const [userName, setUserName] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(0);

  const debouncedUserName = useDebounce(userName, 300);

  const filters: AdminPenaltyFilters = useMemo(
    () => ({
      userName: debouncedUserName,
      type: type === ALL ? null : type,
      severity: severity === ALL ? null : severity,
      fromIso: fromDate ? new Date(fromDate).toISOString() : null,
      toIso: toDate ? new Date(toDate + "T23:59:59").toISOString() : null,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [debouncedUserName, type, severity, fromDate, toDate, page],
  );

  const { data, isLoading, error } = useAdminPenalties(filters);
  const { data: stats } = usePenaltyStats();

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="مدیریت کارت‌های قرمز"
          description="مشاهده تخلف‌های ثبت‌شده در سامانه و رسیدگی به اعتراض‌ها."
        />
        <CreatePenaltyDialog />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">کارت قرمز این هفته</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              {toPersianDigits(stats?.week ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">کارت قرمز این ماه</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              {toPersianDigits(stats?.month ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="text-sm text-muted-foreground">اعتراض‌های در انتظار</div>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Gavel className="h-5 w-5 text-primary" />
              {toPersianDigits(stats?.pendingAppeals ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1">
            <Label>نام کاربر</Label>
            <Input
              placeholder="جست‌وجو..."
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>نوع تخلف</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {Object.entries(PENALTY_TYPE_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>شدت</Label>
            <Select
              value={severity}
              onValueChange={(v) => {
                setSeverity(v);
                setPage(0);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه</SelectItem>
                {Object.entries(PENALTY_SEVERITY_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>از تاریخ</Label>
            <JalaliDateInput
              value={fromDate}
              onChange={(iso) => {
                setFromDate(iso);
                setPage(0);
              }}
              placeholder="انتخاب تاریخ"
            />
          </div>
          <div className="space-y-1">
            <Label>تا تاریخ</Label>
            <JalaliDateInput
              value={toDate}
              onChange={(iso) => {
                setToDate(iso);
                setPage(0);
              }}
              placeholder="انتخاب تاریخ"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-red-700">خطا: {(error as Error).message}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">موردی یافت نشد.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">کاربر</TableHead>
                    <TableHead className="text-right">نوع تخلف</TableHead>
                    <TableHead className="text-right">شدت</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">اعتراض</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.user_name ?? "—"}</TableCell>
                      <TableCell>{penaltyTypeLabel(r.type)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SEVERITY_CLASS[r.severity]}>
                          {severityLabel(r.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatJalaliDateTime(r.created_at)}</TableCell>
                      <TableCell>
                        {r.is_active ? (
                          <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                            فعال
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-gray-300 bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                            غیرفعال
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.appeal_status ? (
                          <Badge variant="outline" className={APPEAL_STATUS_CLASS[r.appeal_status]}>
                            {APPEAL_STATUS_FA[r.appeal_status] ?? r.appeal_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
              <span>
                مجموع: {toPersianDigits(total)} — صفحه {toPersianDigits(page + 1)} از {toPersianDigits(totalPages)}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  قبلی
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  بعدی
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">اعتراض‌های در انتظار بررسی شما</h2>
        <AppealReviewPanel />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/penalties")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors the requireAnyRole call below, which is this route's own authority.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AdminPenaltiesPage,
});