import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { invalidateRolePermissionsCache } from "@/lib/rbac/dynamic-permissions";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_app/admin/roles")({
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: AdminRolesPage,
});

const MODULES = [
  "dashboard",
  "products",
  "pricing",
  "purchases",
  "sales",
  "invoices",
  "price-lists",
  "users",
  "roles",
  "reports",
  "knowledge",
  "feedback",
  "messages",
  "audit-logs",
  "data-tables",
  "bot-api-keys",
  "suppliers",
  "academy",
] as const;

const MODULE_LABELS: Record<string, string> = {
  dashboard: "داشبورد",
  products: "محصولات",
  pricing: "قیمت‌گذاری",
  purchases: "خرید",
  sales: "فروش",
  invoices: "فاکتورها",
  "price-lists": "لیست قیمت",
  users: "کاربران",
  roles: "نقش‌ها",
  reports: "گزارش‌ها",
  knowledge: "دانش",
  feedback: "بازخورد",
  messages: "پیام‌ها",
  "audit-logs": "حسابرسی",
  "data-tables": "جداول پویا",
  "bot-api-keys": "کلیدهای ربات",
  suppliers: "تأمین‌کنندگان",
  academy: "آکادمی",
};

const ACTIONS = [
  { key: "can_view", label: "مشاهده" },
  { key: "can_create", label: "ایجاد" },
  { key: "can_update", label: "ویرایش" },
  { key: "can_delete", label: "حذف" },
  { key: "can_approve", label: "تأیید" },
  { key: "can_export", label: "خروجی" },
  { key: "can_view_sensitive", label: "اطلاعات حساس" },
] as const;

type ActionKey = (typeof ACTIONS)[number]["key"];

interface CustomRole {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
}

interface PermRow {
  id: string;
  role_name: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  can_view_sensitive: boolean;
}

function AdminRolesPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="مدیریت نقش‌ها و مجوزها"
        description="ساخت نقش جدید، فعال/غیرفعال‌سازی نقش‌ها و تنظیم دقیق مجوز هر نقش روی هر ماژول."
      />
      <Tabs defaultValue="roles" dir="rtl">
        <TabsList>
          <TabsTrigger value="roles">نقش‌ها</TabsTrigger>
          <TabsTrigger value="permissions">ماتریس مجوزها</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="mt-4">
          <RolesSection />
        </TabsContent>
        <TabsContent value="permissions" className="mt-4">
          <PermissionsMatrixSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RolesSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);
  const [openCreate, setOpenCreate] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; name: string; next: boolean } | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["custom-roles", debounced],
    queryFn: async () => {
      let q = supabase
        .from("custom_roles" as never)
        .select("*")
        .order("is_system", { ascending: false })
        .order("name");
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CustomRole[];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["user-roles-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data ?? []) map.set(r.role as string, (map.get(r.role as string) ?? 0) + 1);
      return map;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (v: { id: string; next: boolean }) => {
      const { error } = await supabase.rpc(
        "toggle_custom_role_status" as never,
        {
          _role_id: v.id,
          _is_active: v.next,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("وضعیت نقش به‌روز شد");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      invalidateRolePermissionsCache();
    },
    onError: (e: Error) => toast.error("خطا", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">فهرست نقش‌ها</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نقش..."
              className="pr-8"
            />
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="ml-1 h-4 w-4" /> افزودن نقش
              </Button>
            </DialogTrigger>
            <CreateRoleDialog onClose={() => setOpenCreate(false)} />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !roles || roles.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">نقشی یافت نشد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">نام</th>
                  <th className="p-3 font-medium">برچسب</th>
                  <th className="p-3 font-medium">نوع</th>
                  <th className="p-3 text-center font-medium">کاربران</th>
                  <th className="p-3 text-center font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const userCount = counts?.get(r.name) ?? 0;
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{r.name}</td>
                      <td className="p-3">{r.display_name ?? "—"}</td>
                      <td className="p-3">
                        {r.is_system ? (
                          <Badge variant="secondary">سیستمی</Badge>
                        ) : (
                          <Badge>سفارشی</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">{userCount}</td>
                      <td className="p-3 text-center">
                        {r.is_system ? (
                          <Badge variant="outline">همیشه فعال</Badge>
                        ) : (
                          <Switch
                            checked={r.is_active}
                            disabled={toggleStatus.isPending}
                            onCheckedChange={(v) => {
                              if (!v && userCount > 0) {
                                setConfirm({ id: r.id, name: r.name, next: v });
                              } else {
                                toggleStatus.mutate({ id: r.id, next: v });
                              }
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال‌سازی نقش</AlertDialogTitle>
            <AlertDialogDescription>
              این نقش به کاربرانی متصل است. غیرفعال‌سازی باعث می‌شود دسترسی این کاربران از طریق این
              نقش قطع شود. ادامه می‌دهید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) toggleStatus.mutate({ id: confirm.id, next: confirm.next });
                setConfirm(null);
              }}
            >
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CreateRoleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!/^[a-z_][a-z0-9_]*$/.test(name))
        throw new Error("نام فقط حروف انگلیسی کوچک، عدد و زیرخط");
      if (name.length < 2 || name.length > 50) throw new Error("طول نام بین ۲ تا ۵۰ کاراکتر");
      const { error } = await supabase.rpc(
        "create_custom_role" as never,
        {
          _name: name,
          _display_name: displayName || null,
          _description: description || null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("نقش جدید ایجاد شد");
      qc.invalidateQueries({ queryKey: ["custom-roles"] });
      qc.invalidateQueries({ queryKey: ["all-roles-combined"] });
      qc.invalidateQueries({ queryKey: ["roles-matrix"] });
      invalidateRolePermissionsCache();
      onClose();
    },
    onError: (e: Error) => toast.error("خطا", { description: e.message }),
  });

  return (
    <DialogContent dir="rtl">
      <DialogHeader>
        <DialogTitle>افزودن نقش جدید</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>نام (انگلیسی، unique)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: sales_manager"
            dir="ltr"
          />
        </div>
        <div>
          <Label>برچسب نمایشی (فارسی)</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="مثلاً: مدیر فروش"
          />
        </div>
        <div>
          <Label>توضیح</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          انصراف
        </Button>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
          {create.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
          ایجاد
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PermissionsMatrixSection() {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [edits, setEdits] = useState<Map<string, Record<ActionKey, boolean>>>(new Map());

  const { data: roles } = useQuery({
    queryKey: ["custom-roles-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles" as never)
        .select("name,display_name,is_active")
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as {
        name: string;
        display_name: string | null;
        is_active: boolean;
      }[];
    },
  });

  const { data: perms, isLoading } = useQuery({
    queryKey: ["role-permissions", selectedRole],
    enabled: !!selectedRole,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions" as never)
        .select("*")
        .eq("role_name", selectedRole);
      if (error) throw error;
      return (data ?? []) as unknown as PermRow[];
    },
  });

  const merged = useMemo(() => {
    const byModule = new Map<string, Record<ActionKey, boolean>>();
    for (const m of MODULES) {
      const existing = perms?.find((p) => p.module === m);
      const base: Record<ActionKey, boolean> = {
        can_view: existing?.can_view ?? false,
        can_create: existing?.can_create ?? false,
        can_update: existing?.can_update ?? false,
        can_delete: existing?.can_delete ?? false,
        can_approve: existing?.can_approve ?? false,
        can_export: existing?.can_export ?? false,
        can_view_sensitive: existing?.can_view_sensitive ?? false,
      };
      const override = edits.get(m);
      byModule.set(m, override ? { ...base, ...override } : base);
    }
    return byModule;
  }, [perms, edits]);

  const setCell = (module: string, action: ActionKey, value: boolean) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(module) ?? ({} as Record<ActionKey, boolean>);
      next.set(module, { ...current, [action]: value });
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = MODULES.map((m) => ({ module: m, ...merged.get(m)! }));
      const { error } = await supabase.rpc(
        "update_role_permissions" as never,
        {
          _role_name: selectedRole,
          _permissions: payload,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("مجوزها ذخیره شد");
      setEdits(new Map());
      qc.invalidateQueries({ queryKey: ["role-permissions", selectedRole] });
      invalidateRolePermissionsCache();
    },
    onError: (e: Error) => toast.error("خطا در ذخیره", { description: e.message }),
  });

  const isAdminRole = selectedRole === "admin";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Label className="shrink-0">نقش:</Label>
          <Select
            value={selectedRole}
            onValueChange={(v) => {
              setSelectedRole(v);
              setEdits(new Map());
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(roles ?? []).map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.display_name || r.name}{" "}
                  <span className="mr-2 text-xs text-muted-foreground" dir="ltr">
                    ({r.name})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || edits.size === 0 || isAdminRole}
        >
          {save.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
          ذخیره تغییرات {edits.size > 0 && `(${edits.size})`}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isAdminRole && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            نقش admin به‌صورت پیش‌فرض دسترسی کامل دارد و قابل تغییر نیست.
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">ماژول</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="p-3 text-center font-medium">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => {
                    const row = merged.get(m)!;
                    return (
                      <tr key={m} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{MODULE_LABELS[m] ?? m}</td>
                        {ACTIONS.map((a) => (
                          <td key={a.key} className="p-3 text-center">
                            <Checkbox
                              checked={row[a.key]}
                              disabled={isAdminRole}
                              onCheckedChange={(v) => setCell(m, a.key, Boolean(v))}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <div className="space-y-2 p-3 md:hidden">
              {MODULES.map((m) => {
                const row = merged.get(m)!;
                return (
                  <details key={m} className="rounded-md border">
                    <summary className="cursor-pointer p-3 text-sm font-medium">
                      {MODULE_LABELS[m] ?? m}
                    </summary>
                    <div className="grid grid-cols-2 gap-2 border-t p-3">
                      {ACTIONS.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={row[a.key]}
                            disabled={isAdminRole}
                            onCheckedChange={(v) => setCell(m, a.key, Boolean(v))}
                          />
                          <span>{a.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
