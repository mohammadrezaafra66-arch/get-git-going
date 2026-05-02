import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Search, Tag } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/products/attributes")({
  beforeLoad: async () => { await requirePermission("products", "view"); },
  component: ProductAttributesPage,
});

type AttrType = "brand" | "category" | "color" | "capacity" | "model";

const TYPE_LABELS: Record<AttrType, string> = {
  brand: "برند",
  category: "دسته‌بندی",
  color: "رنگ",
  capacity: "ظرفیت",
  model: "مدل",
};

const TYPES: AttrType[] = ["brand", "category", "color", "capacity", "model"];
const DYN_TYPES: Exclude<AttrType, "brand" | "category">[] = ["color", "capacity", "model"];

interface UnifiedRow {
  id: string;
  type: AttrType;
  name: string;
  is_active: boolean;
  source: "brands" | "categories" | "product_attributes";
}

function slugify(s: string) {
  return s.trim().toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `item-${Date.now().toString(36)}`;
}

function ProductAttributesPage() {
  const { roles } = useAuth();
  const canWrite = hasPermission(roles, "products", "update");
  const qc = useQueryClient();

  const [filterType, setFilterType] = useState<AttrType | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UnifiedRow | null>(null);
  const [createType, setCreateType] = useState<AttrType | null>(null);
  const [tab, setTab] = useState<"attrs" | "naming">("attrs");

  const brandsQ = useQuery({
    queryKey: ["attr-brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands").select("id, name, is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const catsQ = useQuery({
    queryKey: ["attr-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("id, name, is_active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const dynQ = useQuery({
    queryKey: ["product-attributes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_attributes")
        .select("id, type, name, is_active")
        .order("type").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = brandsQ.isLoading || catsQ.isLoading || dynQ.isLoading;

  const allRows: UnifiedRow[] = useMemo(() => {
    const rows: UnifiedRow[] = [];
    for (const b of brandsQ.data ?? []) {
      rows.push({ id: b.id, type: "brand", name: b.name, is_active: b.is_active, source: "brands" });
    }
    for (const c of catsQ.data ?? []) {
      rows.push({ id: c.id, type: "category", name: c.name, is_active: c.is_active, source: "categories" });
    }
    for (const a of dynQ.data ?? []) {
      rows.push({ id: a.id, type: a.type as AttrType, name: a.name, is_active: a.is_active, source: "product_attributes" });
    }
    return rows;
  }, [brandsQ.data, catsQ.data, dynQ.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (term && !r.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allRows, filterType, search]);

  const grouped = useMemo(() => {
    const map = new Map<AttrType, UnifiedRow[]>();
    for (const t of TYPES) map.set(t, []);
    for (const r of filtered) map.get(r.type)?.push(r);
    return map;
  }, [filtered]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["attr-brands"] });
    qc.invalidateQueries({ queryKey: ["attr-categories"] });
    qc.invalidateQueries({ queryKey: ["product-attributes-all"] });
    qc.invalidateQueries({ queryKey: ["product-attributes-active"] });
    qc.invalidateQueries({ queryKey: ["brands-lite"] });
    qc.invalidateQueries({ queryKey: ["categories-lite"] });
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const toggleMut = useMutation({
    mutationFn: async (vars: { row: UnifiedRow; is_active: boolean }) => {
      const { error } = await supabase
        .from(vars.row.source)
        .update({ is_active: vars.is_active })
        .eq("id", vars.row.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "فعال شد" : "غیرفعال شد");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="ویژگی‌های محصول"
        description="مدیریت برند، دسته‌بندی، رنگ، ظرفیت و مدل برای فرم محصولات"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setCreateType("color")}>
                <Plus className="ms-1 h-4 w-4" />ویژگی جدید
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "attrs" | "naming")}>
        <TabsList>
          <TabsTrigger value="attrs">ویژگی‌ها</TabsTrigger>
          <TabsTrigger value="naming">استاندارد نام‌گذاری</TabsTrigger>
        </TabsList>
        <TabsContent value="attrs" className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">جستجو</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی نام ویژگی..."
                className="pr-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">فیلتر بر اساس نوع</Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as AttrType | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه انواع</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : filtered.length === 0 && !canWrite ? (
        <EmptyState icon={Tag} title="ویژگی‌ای یافت نشد" description="هنوز ویژگی‌ای ثبت نشده است." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {TYPES.map((t) => {
            const rows = grouped.get(t) ?? [];
            if (filterType !== "all" && filterType !== t) return null;
            return (
              <Card key={t}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{TYPE_LABELS[t]}</h3>
                      <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
                    </div>
                    {canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => setCreateType(t)}>
                        <Plus className="ms-1 h-4 w-4" />افزودن
                      </Button>
                    )}
                  </div>
                  {rows.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">موردی نیست</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {rows.map((r) => (
                        <li key={`${r.source}-${r.id}`} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <span className={`text-sm ${r.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                              {r.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {canWrite && (
                              <>
                                <Switch
                                  checked={r.is_active}
                                  onCheckedChange={(v) => toggleMut.mutate({ row: r, is_active: v })}
                                  disabled={toggleMut.isPending}
                                />
                                <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="ویرایش">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canWrite && (
        <AttrDialog
          mode={createType ? "create" : editing ? "edit" : null}
          initial={editing}
          defaultType={createType ?? undefined}
          onClose={() => { setCreateType(null); setEditing(null); }}
          onSaved={invalidateAll}
        />
      )}
        </TabsContent>
        <TabsContent value="naming" className="space-y-4">
          <CategoryNamingSection canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttrDialog({
  mode, initial, defaultType, onClose, onSaved,
}: {
  mode: "create" | "edit" | null;
  initial: UnifiedRow | null;
  defaultType?: AttrType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = mode !== null;
  const [name, setName] = useState("");
  const [type, setType] = useState<AttrType>("color");
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? defaultType ?? "color");
    setIsActive(initial?.is_active ?? true);
  }, [initial, defaultType, mode, open]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("نام الزامی است");

      if (mode === "edit" && initial) {
        const { error } = await supabase
          .from(initial.source)
          .update({ name: trimmed, is_active: isActive })
          .eq("id", initial.id);
        if (error) throw error;
        return;
      }

      // create
      if (type === "brand") {
        const { error } = await supabase
          .from("brands")
          .insert({ name: trimmed, slug: slugify(trimmed), is_active: isActive });
        if (error) throw error;
      } else if (type === "category") {
        const { error } = await supabase
          .from("categories")
          .insert({ name: trimmed, slug: slugify(trimmed), is_active: isActive });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_attributes")
          .insert({ name: trimmed, type, is_active: isActive });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "ذخیره شد" : "ویژگی جدید ساخته شد");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  // when editing, type is fixed; when creating, allow choosing among all 5
  const typeOptions: AttrType[] = mode === "edit" ? [type] : TYPES;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "ویرایش ویژگی" : "ویژگی جدید"}</DialogTitle>
          <DialogDescription>
            {type === "brand" || type === "category"
              ? "این مقدار در جدول مرجع ذخیره می‌شود."
              : "مقدار جدیدی برای استفاده در فرم محصولات تعریف کنید."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>نوع</Label>
            <Select value={type} onValueChange={(v) => setType(v as AttrType)} disabled={mode === "edit"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>نام</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: قرمز، ۱۰۰ لیتری، X200" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            فعال
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !name.trim()}>
            {saveMut.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// keep DYN_TYPES referenced (used implicitly via TYPES filtering)
void DYN_TYPES;
