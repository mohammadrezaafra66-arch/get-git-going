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
  const [tab, setTab] = useState<"attrs" | "naming" | "category-attrs">("attrs");

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "attrs" | "naming" | "category-attrs")}>
        <TabsList>
          <TabsTrigger value="attrs">ویژگی‌های عمومی</TabsTrigger>
          <TabsTrigger value="naming">استاندارد نام‌گذاری</TabsTrigger>
          <TabsTrigger value="category-attrs">ویژگی‌های اختصاصی دسته‌بندی</TabsTrigger>
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
        <TabsContent value="category-attrs" className="space-y-4">
          <CategoryAttributesSection canWrite={canWrite} />
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

// =====================================================================
// Category-Specific Product Attribute Definitions (Phase 12.4)
// =====================================================================

const CPA_INPUT_TYPES = ["text", "number", "select", "boolean", "date"] as const;
type CpaInputType = (typeof CPA_INPUT_TYPES)[number];
const CPA_INPUT_LABELS: Record<CpaInputType, string> = {
  text: "متن",
  number: "عدد",
  select: "انتخابی (لیست)",
  boolean: "بله/خیر",
  date: "تاریخ",
};

interface CpaRow {
  id: string;
  category_id: string;
  attribute_key: string;
  label_fa: string;
  input_type: CpaInputType;
  is_required: boolean;
  is_active: boolean;
  use_in_product_name: boolean;
  sort_order: number;
  options: unknown;
  help_text: string | null;
}

function normalizeAttrKey(s: string): string {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 60);
}

function parseOptionsInput(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function logCpaAudit(
  action:
    | "category_product_attribute_created"
    | "category_product_attribute_updated"
    | "category_product_attribute_enabled"
    | "category_product_attribute_disabled",
  entityId: string,
  diff: Record<string, unknown>,
) {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      entity_type: "category_product_attribute",
      entity_id: entityId,
      action,
      actor_id: u.user?.id ?? null,
      diff: diff as any,
    });
  } catch {
    // audit failure should not block UX
  }
}

function CategoryAttributesSection({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState<string>("");
  const [editing, setEditing] = useState<CpaRow | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  const catsQ = useQuery({
    queryKey: ["cpa-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const attrsQ = useQuery({
    queryKey: ["cpa-attrs", categoryId],
    enabled: !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_product_attributes")
        .select("id, category_id, attribute_key, label_fa, input_type, is_required, is_active, use_in_product_name, sort_order, options, help_text")
        .eq("category_id", categoryId)
        .order("sort_order")
        .order("label_fa");
      if (error) throw error;
      return (data ?? []) as CpaRow[];
    },
  });

  const toggleMut = useMutation({
    mutationFn: async (vars: { row: CpaRow; is_active: boolean }) => {
      const { error } = await supabase
        .from("category_product_attributes")
        .update({ is_active: vars.is_active })
        .eq("id", vars.row.id);
      if (error) throw error;
      await logCpaAudit(
        vars.is_active ? "category_product_attribute_enabled" : "category_product_attribute_disabled",
        vars.row.id,
        {
          category_id: vars.row.category_id,
          before: { is_active: vars.row.is_active },
          after: { is_active: vars.is_active },
        },
      );
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "فعال شد" : "غیرفعال شد");
      qc.invalidateQueries({ queryKey: ["cpa-attrs", categoryId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">انتخاب دسته‌بندی</Label>
            <Select value={categoryId || undefined} onValueChange={(v) => setCategoryId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="یک دسته‌بندی انتخاب کنید..." />
              </SelectTrigger>
              <SelectContent>
                {(catsQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{!c.is_active ? " (غیرفعال)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            {canWrite && (
              <Button
                size="sm"
                disabled={!categoryId}
                onClick={() => { setEditing(null); setCreating(true); }}
              >
                <Plus className="ms-1 h-4 w-4" />ویژگی جدید
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!categoryId ? (
        <EmptyState
          icon={Tag}
          title="ابتدا دسته‌بندی را انتخاب کنید"
          description="ویژگی‌های اختصاصی برای هر دسته جداگانه تعریف می‌شوند."
        />
      ) : attrsQ.isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : (attrsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={Tag}
          title="هیچ ویژگی‌ای برای این دسته تعریف نشده"
          description="با دکمه «ویژگی جدید» اولین ویژگی را اضافه کنید."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {(attrsQ.data ?? []).map((r) => {
                const opts = Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [];
                return (
                  <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${r.is_active ? "" : "text-muted-foreground line-through"}`}>
                          {r.label_fa}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">{r.attribute_key}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{CPA_INPUT_LABELS[r.input_type]}</Badge>
                        {r.is_required && <Badge className="text-[10px]">الزامی</Badge>}
                        {r.use_in_product_name && <Badge variant="outline" className="text-[10px]">در نام محصول</Badge>}
                        {!r.is_active && <Badge variant="outline" className="text-[10px]">غیرفعال</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">ترتیب: {r.sort_order}</div>
                      {r.input_type === "select" && opts.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          گزینه‌ها: <span className="text-foreground">{opts.join("، ")}</span>
                        </div>
                      )}
                      {r.help_text && (
                        <div className="text-xs text-muted-foreground">راهنما: {r.help_text}</div>
                      )}
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => toggleMut.mutate({ row: r, is_active: v })}
                          disabled={toggleMut.isPending}
                        />
                        <Button size="sm" variant="outline" onClick={() => { setCreating(false); setEditing(r); }}>
                          <Pencil className="ms-1 h-4 w-4" />ویرایش
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {canWrite && (creating || editing) && (
        <CpaEditDialog
          categoryId={categoryId}
          row={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["cpa-attrs", categoryId] })}
        />
      )}
    </div>
  );
}

function CpaEditDialog({
  categoryId, row, onClose, onSaved,
}: {
  categoryId: string;
  row: CpaRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [labelFa, setLabelFa] = useState(row?.label_fa ?? "");
  const [attrKey, setAttrKey] = useState(row?.attribute_key ?? "");
  const [inputType, setInputType] = useState<CpaInputType>(row?.input_type ?? "text");
  const [isRequired, setIsRequired] = useState<boolean>(row?.is_required ?? false);
  const [useInName, setUseInName] = useState<boolean>(row?.use_in_product_name ?? false);
  const [isActive, setIsActive] = useState<boolean>(row?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 0);
  const [optionsText, setOptionsText] = useState<string>(
    Array.isArray(row?.options) ? (row?.options as unknown[]).map(String).join("\n") : "",
  );
  const [helpText, setHelpText] = useState<string>(row?.help_text ?? "");

  // auto slug from label when creating and key untouched
  useEffect(() => {
    if (isEdit) return;
    if (!attrKey || attrKey === normalizeAttrKey(attrKey)) {
      // user hasn't deviated; suggest from label
      const suggestion = normalizeAttrKey(labelFa.replace(/[\u0600-\u06FF]/g, ""));
      // only auto-fill when key is empty
      if (!attrKey && suggestion) setAttrKey(suggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelFa]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const cleanLabel = labelFa.trim();
      const cleanKey = normalizeAttrKey(attrKey);
      const cleanHelp = helpText.trim();
      const opts = inputType === "select" ? parseOptionsInput(optionsText) : [];

      if (!cleanLabel) throw new Error("عنوان فارسی الزامی است");
      if (!cleanKey) throw new Error("کلید ویژگی الزامی است (فقط حروف انگلیسی، عدد و _)");
      if (cleanKey.length > 60) throw new Error("کلید نباید بیش از ۶۰ کاراکتر باشد");
      if (cleanLabel.length > 120) throw new Error("عنوان نباید بیش از ۱۲۰ کاراکتر باشد");
      if (cleanHelp.length > 500) throw new Error("راهنما نباید بیش از ۵۰۰ کاراکتر باشد");
      if (sortOrder < 0 || !Number.isInteger(sortOrder)) throw new Error("ترتیب باید عدد صحیح غیرمنفی باشد");
      if (inputType === "select" && opts.length === 0) {
        throw new Error("برای نوع «انتخابی» حداقل یک گزینه وارد کنید");
      }

      const payload = {
        category_id: categoryId,
        attribute_key: cleanKey,
        label_fa: cleanLabel,
        input_type: inputType,
        is_required: isRequired,
        is_active: isActive,
        use_in_product_name: useInName,
        sort_order: sortOrder,
        options: opts,
        help_text: cleanHelp || null,
      };

      if (isEdit && row) {
        const before = {
          attribute_key: row.attribute_key,
          label_fa: row.label_fa,
          input_type: row.input_type,
          is_required: row.is_required,
          is_active: row.is_active,
          use_in_product_name: row.use_in_product_name,
          sort_order: row.sort_order,
          options: row.options,
          help_text: row.help_text,
        };
        const { error } = await supabase
          .from("category_product_attributes")
          .update(payload)
          .eq("id", row.id);
        if (error) throw error;
        await logCpaAudit("category_product_attribute_updated", row.id, {
          category_id: categoryId,
          before,
          after: payload,
        });
      } else {
        const { data, error } = await supabase
          .from("category_product_attributes")
          .insert(payload)
          .select("id")
          .single();
        if (error) {
          if ((error as any).code === "23505") {
            throw new Error("این کلید قبلاً برای این دسته تعریف شده است");
          }
          throw error;
        }
        await logCpaAudit("category_product_attribute_created", data!.id, {
          category_id: categoryId,
          before: null,
          after: payload,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "ذخیره شد" : "ویژگی جدید ساخته شد");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "ویرایش ویژگی" : "ویژگی جدید"}</DialogTitle>
          <DialogDescription>
            ویژگی فقط برای دسته انتخاب‌شده ذخیره می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>عنوان فارسی</Label>
              <Input value={labelFa} onChange={(e) => setLabelFa(e.target.value)} maxLength={120} placeholder="مثلاً: ظرفیت" />
            </div>
            <div className="space-y-1.5">
              <Label>کلید (لاتین)</Label>
              <Input
                value={attrKey}
                dir="ltr"
                onChange={(e) => setAttrKey(normalizeAttrKey(e.target.value))}
                maxLength={60}
                placeholder="capacity"
                disabled={isEdit}
                className="font-mono"
              />
              {!isEdit && <p className="text-[11px] text-muted-foreground">فقط حروف انگلیسی، عدد و _</p>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نوع ورودی</Label>
              <Select value={inputType} onValueChange={(v) => setInputType(v as CpaInputType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CPA_INPUT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CPA_INPUT_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ترتیب نمایش</Label>
              <Input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
              />
            </div>
          </div>

          {inputType === "select" && (
            <div className="space-y-1.5">
              <Label>گزینه‌ها</Label>
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
                placeholder={"هر گزینه در یک خط، یا با کاما جدا کنید\nمثال: اینورتر, معمولی"}
              />
              <p className="text-[11px] text-muted-foreground">حداقل یک گزینه لازم است.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>راهنما (اختیاری)</Label>
            <Textarea
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="توضیح کوتاه برای کاربر..."
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
              الزامی
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={useInName} onCheckedChange={setUseInName} />
              در نام محصول
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              فعال
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Category Naming Standards (Phase 12.2)
// =====================================================================

const SAMPLE_VALUES: Record<string, string> = {
  category: "کولر گازی",
  brand: "جنرال گلد",
  primary_spec: "24000",
  model: "GG-S24000",
  capacity: "24000",
  color: "سفید",
  sku: "AFK-2026-00001",
};

const ALLOWED_TOKENS = ["category", "brand", "primary_spec", "model", "capacity", "color", "sku"] as const;

function renderTemplate(tpl: string, values: Record<string, string>): string {
  if (!tpl) return "";
  return tpl.replace(/\{(\w+)\}/g, (_m, key) => values[key] ?? "");
}

function sanitizePlain(s: string): string {
  // strip control chars and angle brackets to avoid html/script injection
  return s.replace(/[<>]/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

interface CategoryNamingRow {
  id: string;
  name: string;
  is_active: boolean;
  naming_template: string | null;
  primary_spec_label: string | null;
}

function CategoryNamingSection({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["categories-naming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, is_active, naming_template, primary_spec_label")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CategoryNamingRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return q.data ?? [];
    return (q.data ?? []).filter((c) => c.name.toLowerCase().includes(term));
  }, [q.data, search]);

  const editingRow = useMemo(
    () => (editingId ? (q.data ?? []).find((c) => c.id === editingId) ?? null : null),
    [q.data, editingId],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">توکن‌های قابل استفاده در الگو:</div>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED_TOKENS.map((t) => (
              <Badge key={t} variant="outline" className="font-mono text-[11px]">
                {`{${t}}`}
              </Badge>
            ))}
          </div>
          <div>
            مثال: <span className="font-mono">{"{category} {brand} {primary_spec} مدل {model}"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی دسته..."
              className="pr-8"
            />
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">در حال بارگذاری...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Tag} title="دسته‌ای یافت نشد" description="هنوز دسته‌بندی‌ای ثبت نشده است." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filtered.map((c) => {
                const preview = c.naming_template
                  ? renderTemplate(c.naming_template, SAMPLE_VALUES)
                  : "—";
                return (
                  <li key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${c.is_active ? "" : "text-muted-foreground line-through"}`}>
                          {c.name}
                        </span>
                        {!c.is_active && <Badge variant="outline" className="text-[10px]">غیرفعال</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        برچسب اسپک اصلی: <span className="text-foreground">{c.primary_spec_label || "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        الگو: <span className="font-mono text-foreground">{c.naming_template || "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        پیش‌نمایش: <span className="text-foreground">{preview}</span>
                      </div>
                    </div>
                    {canWrite && (
                      <Button size="sm" variant="outline" onClick={() => setEditingId(c.id)}>
                        <Pencil className="ms-1 h-4 w-4" />ویرایش
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {canWrite && editingRow && (
        <NamingEditDialog
          row={editingRow}
          onClose={() => setEditingId(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["categories-naming"] })}
        />
      )}
    </div>
  );
}

function NamingEditDialog({
  row, onClose, onSaved,
}: {
  row: CategoryNamingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [template, setTemplate] = useState(row.naming_template ?? "");
  const [specLabel, setSpecLabel] = useState(row.primary_spec_label ?? "");

  useEffect(() => {
    setTemplate(row.naming_template ?? "");
    setSpecLabel(row.primary_spec_label ?? "");
  }, [row.id, row.naming_template, row.primary_spec_label]);

  const cleanTemplate = sanitizePlain(template);
  const cleanSpec = sanitizePlain(specLabel);
  const tplTooLong = cleanTemplate.length > 300;
  const specTooLong = cleanSpec.length > 80;
  const preview = cleanTemplate ? renderTemplate(cleanTemplate, SAMPLE_VALUES) : "—";

  const saveMut = useMutation({
    mutationFn: async () => {
      if (tplTooLong) throw new Error("الگو نباید از ۳۰۰ کاراکتر بیشتر باشد");
      if (specTooLong) throw new Error("برچسب اسپک نباید از ۸۰ کاراکتر بیشتر باشد");

      const before = {
        naming_template: row.naming_template,
        primary_spec_label: row.primary_spec_label,
      };
      const after = {
        naming_template: cleanTemplate ? cleanTemplate : null,
        primary_spec_label: cleanSpec ? cleanSpec : null,
      };

      const { error } = await supabase
        .from("categories")
        .update(after)
        .eq("id", row.id);
      if (error) throw error;

      try {
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("audit_logs").insert({
          entity_type: "category",
          entity_id: row.id,
          action: "product_category_naming_settings_updated",
          actor_id: u.user?.id ?? null,
          diff: { before, after },
        });
      } catch {
        // audit log failure should not block the save
      }
    },
    onSuccess: () => {
      toast.success("تنظیمات نام‌گذاری ذخیره شد");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا"),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>استاندارد نام‌گذاری — {row.name}</DialogTitle>
          <DialogDescription>
            الگوی نام‌گذاری و برچسب اسپک اصلی این دسته را تعیین کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>برچسب اسپک اصلی</Label>
            <Input
              value={specLabel}
              onChange={(e) => setSpecLabel(e.target.value)}
              placeholder="مثلاً: ظرفیت، سایز، توان"
              maxLength={120}
            />
            {specTooLong && <p className="text-xs text-destructive">حداکثر ۸۰ کاراکتر</p>}
          </div>
          <div className="space-y-1.5">
            <Label>الگوی نام‌گذاری</Label>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{category} {brand} {primary_spec} مدل {model}"
              rows={3}
              maxLength={400}
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>توکن‌ها:</span>
              {ALLOWED_TOKENS.map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-[10px]">{`{${t}}`}</Badge>
              ))}
            </div>
            {tplTooLong && <p className="text-xs text-destructive">حداکثر ۳۰۰ کاراکتر</p>}
            <p className="text-xs text-muted-foreground">
              اگر خالی باشد، بعداً از الگوی پیش‌فرض سیستم استفاده می‌شود.
            </p>
          </div>
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-1 text-xs text-muted-foreground">پیش‌نمایش با مقادیر نمونه:</div>
            <div className="text-sm">{preview}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>انصراف</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || tplTooLong || specTooLong}>
            {saveMut.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
