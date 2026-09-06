import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Loader2,
  ShieldCheck,
  Check,
  ChevronsUpDown,
  X,
  Download,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/customers")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("sales", "view"). `allowed` is the LIVE
  // role_permissions.sales.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] } },
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: CustomersListPage,
});

const PAGE_SIZE = 20;

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  accounting_code: string | null;
  is_active: boolean;
  created_at: string;
  responsible_id: string | null;
  responsible: { id: string; full_name: string | null } | null;
}

function CustomersListPage() {
  const { roles } = useAuth();
  const canFilterByResponsible = roles.includes("admin") || roles.includes("manager");
  const canExport = roles.includes("admin") || roles.includes("manager");
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [responsibleFilter, setResponsibleFilter] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const debouncedRaw = useDebounce(search, 350);
  const debounced = normalizeSearchText(debouncedRaw);

  const { data, isFetching } = useQuery({
    queryKey: ["customers", "list", debounced, page, responsibleFilter?.id ?? null],
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select(
          "id, name, phone, city, accounting_code, is_active, created_at, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,accounting_code.ilike.%${term}%`);
      }
      if (responsibleFilter?.id) {
        q = q.eq("responsible_id", responsibleFilter.id);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as CustomerRow[], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async () => {
    if (!canExport) {
      toast.error("شما اجازه خروجی گرفتن از مشتریان را ندارید.");
      return;
    }
    setExporting(true);
    try {
      let q = supabase
        .from("customers")
        .select(
          "id, name, phone, city, accounting_code, responsible_id, responsible:profiles!customers_responsible_id_fkey(id, full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%,accounting_code.ilike.%${term}%`);
      }
      if (responsibleFilter?.id) {
        q = q.eq("responsible_id", responsibleFilter.id);
      }
      const { data: rows, error } = await q;
      if (error) throw error;

      const escape = (v: string | null | undefined): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = ["نام", "تلفن", "شهر", "کد حسابداری", "مسئول"].join(",");
      const lines = (rows ?? []).map((r: any) => {
        const phone = r.phone ? String(r.phone).replace(/[^\d]/g, "") : "";
        return [
          escape(r.name),
          escape(phone),
          escape(r.city),
          escape(r.accounting_code),
          escape(r.responsible?.full_name ?? null),
        ].join(",");
      });
      const csv = "\uFEFF" + header + "\n" + lines.join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5_000);

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("audit_logs").insert({
          action: "customers_exported",
          entity_type: "customers",
          entity_id: "list",
          actor_id: userData.user.id,
          diff: {
            row_count: rows?.length ?? 0,
            timestamp: new Date().toISOString(),
            filters: {
              search: term || null,
              responsible_id: responsibleFilter?.id ?? null,
            },
          },
        });
      }

      toast.success("خروجی با موفقیت آماده شد.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در تهیه خروجی.";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مشتریان"
        description="مدیریت لیست مشتریان"
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            {canExport && (
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="ml-2 h-4 w-4" />
                )}
                خروجی CSV
              </Button>
            )}
            {/* A-6 — /sales/customers/import was retired with CustomerImportForm; the one
                import surface is /admin/asan-import. */}
            <Button asChild variant="outline">
              <Link to="/sales/customers/credit-training">
                <GraduationCap className="ml-2 h-4 w-4" />
                آموزش اعتبار مشتریان
              </Link>
            </Button>
            <Button asChild>
              <Link to="/sales/customers/create">
                <Plus className="ml-2 h-4 w-4" />
                مشتری جدید
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">جستجو</Label>
              <Input
                placeholder="جستجو نام، تلفن یا کد حسابداری..."
                value={search}
                onChange={(e) => {
                  setPage(0);
                  setSearch(e.target.value);
                }}
                className="max-w-sm"
              />
            </div>
            {canFilterByResponsible && (
              <ResponsibleFilter
                value={responsibleFilter}
                onChange={(f) => {
                  setPage(0);
                  setResponsibleFilter(f);
                }}
              />
            )}
          </div>

          {isFetching && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>تلفن</TableHead>
                  <TableHead>شهر</TableHead>
                  <TableHead>کد حسابداری</TableHead>
                  <TableHead>مسئول</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {c.phone ? toFaDigits(c.phone) : "—"}
                    </TableCell>
                    <TableCell>{c.city || "—"}</TableCell>
                    <TableCell dir="ltr" className="text-right font-mono text-xs">
                      {c.accounting_code || "—"}
                    </TableCell>
                    <TableCell>
                      {c.responsible?.full_name ? (
                        <span>{c.responsible.full_name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/sales/customers/$customerId/edit" params={{ customerId: c.id }}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" title="پروفایل اعتباری">
                        <Link
                          to="/sales/customers/$customerId/credit"
                          params={{ customerId: c.id }}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isFetching && (data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      مشتری یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>مجموع: {toFaDigits(total)}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </Button>
              <span className="self-center">
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Responsible filter dropdown ---------- */

interface ResponsibleFilterProps {
  value: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
}

function ResponsibleFilter({ value, onChange }: ResponsibleFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);

  const { data: profiles = [] } = useQuery({
    queryKey: ["customers-filter-profiles", debounced],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(20);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) q = q.ilike("full_name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-1">
      <Label className="text-xs">فیلتر بر اساس مسئول</Label>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              size="sm"
              className={cn(
                "min-w-[200px] justify-between font-normal",
                !value && "text-muted-foreground",
              )}
            >
              {value ? value.label || "کاربر" : "همه"}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="نام کاربر..." value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>کاربری یافت نشد</CommandEmpty>
                <CommandGroup>
                  {profiles.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onChange({ id: p.id, label: p.full_name ?? "" });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          p.id === value?.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span>{p.full_name || "بدون نام"}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
            aria-label="پاک کردن فیلتر"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
