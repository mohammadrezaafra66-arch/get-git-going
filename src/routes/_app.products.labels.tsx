import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Trash2, Search } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermission } from "@/lib/rbac/roles";
import { labelSchema, type LabelFormValues } from "@/lib/products/schemas";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";

export const Route = createFileRoute("/_app/products/labels")({
  beforeLoad: async () => {
    await requirePermission("products", "view");
  },
  component: LabelsPage,
});

interface Lbl {
  id: string;
  title: string;
  color: string;
  description: string | null;
  is_active: boolean;
  weight: number;
  visibility: "public" | "internal";
}

const VISIBILITY_LABEL: Record<Lbl["visibility"], string> = { public: "عمومی", internal: "داخلی" };

const DEFAULT_LABEL_VALUES: LabelFormValues = {
  title: "",
  color: "#0ea5e9",
  description: "",
  is_active: true,
  weight: 0,
  visibility: "public",
};

const labelToFormValues = (label: Lbl | null): LabelFormValues =>
  label
    ? {
        title: label.title,
        color: label.color,
        description: label.description ?? "",
        is_active: label.is_active,
        weight: label.weight ?? 0,
        visibility: label.visibility ?? "public",
      }
    : DEFAULT_LABEL_VALUES;

function LabelsPage() {
  const { roles } = useAuth();
  const canWrite = hasPermission(roles, "products", "update");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lbl | null>(null);
  const [labelSearch, setLabelSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["labels-full"],
    queryFn: async (): Promise<Lbl[]> => {
      const { data, error } = await supabase
        .from("product_labels")
        .select("id, title, color, description, is_active, weight, visibility")
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Lbl[];
    },
  });

  const normalizedLabelSearch = normalizeSearchText(labelSearch).toLowerCase();
  const filteredData = useMemo(() => {
    if (!normalizedLabelSearch) return data ?? [];
    return (data ?? []).filter((label) =>
      normalizeSearchText(
        `${label.title} ${label.description ?? ""} ${VISIBILITY_LABEL[label.visibility]}`,
      )
        .toLowerCase()
        .includes(normalizedLabelSearch),
    );
  }, [data, normalizedLabelSearch]);

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["labels-full"] });
    qc.invalidateQueries({ queryKey: ["labels-lite"] });
  };

  const remove = async (l: Lbl) => {
    if (!confirm(`حذف برچسب "${l.title}"؟`)) return;
    const { error } = await supabase.from("product_labels").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else {
      toast.success("برچسب حذف شد");
      onSaved();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="برچسب‌های محصول"
        description="مدیریت برچسب‌ها برای دسته‌بندی نرم محصولات"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/products">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                برچسب جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={labelSearch}
              onChange={(e) => setLabelSearch(e.target.value)}
              placeholder="جستجو در عنوان یا توضیحات برچسب..."
              className="pe-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">برچسبی ثبت نشده.</div>
          ) : filteredData.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              برچسبی با این جست‌وجو پیدا نشد.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredData.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="inline-block h-5 w-5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: l.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.title}</span>
                        <Badge
                          variant="outline"
                          className={
                            l.visibility === "public"
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-purple-500/50 bg-purple-500/10 text-purple-700 dark:text-purple-400"
                          }
                        >
                          {VISIBILITY_LABEL[l.visibility]}
                        </Badge>
                        {!l.is_active && <Badge variant="outline">غیرفعال</Badge>}
                      </div>
                      {l.description && (
                        <div className="text-xs text-muted-foreground">{l.description}</div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.max(0, Math.min(100, l.weight))}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          وزن: {l.weight}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(l);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(l)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <LabelDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={onSaved} />
    </div>
  );
}

function LabelDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Lbl | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [values, setValues] = useState<LabelFormValues>(DEFAULT_LABEL_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
      setErrors({});
      return;
    }

    setValues(labelToFormValues(editing));
    setErrors({});
    setConfirmOpen(false);
  }, [editing, open]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setConfirmOpen(false);
      setErrors({});
    }
    onOpenChange(v);
  };

  const persist = async () => {
    const parsed = labelSchema.safeParse(values);
    if (!parsed.success) {
      const flat: Record<string, string> = {};
      for (const i of parsed.error.issues) flat[i.path.join(".")] = i.message;
      setErrors(flat);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("product_labels")
          .update(parsed.data)
          .eq("id", editing.id);
        if (error) throw error;
        // audit log برای تغییر وزن/نوع
        if (user?.id) {
          if (editing.weight !== parsed.data.weight) {
            await supabase.from("audit_logs").insert({
              actor_id: user.id,
              entity_type: "product_label",
              entity_id: editing.id,
              action: "product_label_weight_changed",
              diff: { old_weight: editing.weight, new_weight: parsed.data.weight },
            });
          }
          if (editing.visibility !== parsed.data.visibility) {
            await supabase.from("audit_logs").insert({
              actor_id: user.id,
              entity_type: "product_label",
              entity_id: editing.id,
              action: "product_label_visibility_changed",
              diff: { old: editing.visibility, new: parsed.data.visibility },
            });
          }
        }
        toast.success("برچسب به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("product_labels").insert(parsed.data);
        if (error) throw error;
        toast.success("برچسب ایجاد شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const submit = () => {
    // اگر در حال ویرایش بود و وزن/نوع تغییر کرد، تأیید بگیر
    if (editing && (editing.weight !== values.weight || editing.visibility !== values.visibility)) {
      setConfirmOpen(true);
    } else {
      void persist();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش برچسب" : "برچسب جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>عنوان *</Label>
              <Input
                value={values.title}
                onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
              />
              {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
            </div>
            <div>
              <Label>رنگ *</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={values.color}
                  onChange={(e) => setValues((s) => ({ ...s, color: e.target.value }))}
                  className="h-10 w-16 p-1"
                />
                <Input
                  dir="ltr"
                  value={values.color}
                  onChange={(e) => setValues((s) => ({ ...s, color: e.target.value }))}
                  className="flex-1"
                />
              </div>
              {errors.color && <p className="mt-1 text-xs text-destructive">{errors.color}</p>}
            </div>
            <div>
              <Label>توضیحات</Label>
              <Textarea
                value={values.description ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>وزن (۰ تا ۱۰۰)</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{values.weight}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={values.weight}
                  onChange={(e) => setValues((s) => ({ ...s, weight: Number(e.target.value) }))}
                  className="flex-1 accent-primary"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  dir="ltr"
                  value={values.weight}
                  onChange={(e) =>
                    setValues((s) => ({
                      ...s,
                      weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-20"
                />
              </div>
              {errors.weight && <p className="mt-1 text-xs text-destructive">{errors.weight}</p>}
            </div>
            <div>
              <Label>نوع نمایش</Label>
              <div className="mt-1 flex gap-2">
                {(["public", "internal"] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant={values.visibility === v ? "default" : "outline"}
                    size="sm"
                    onClick={() => setValues((s) => ({ ...s, visibility: v }))}
                  >
                    {VISIBILITY_LABEL[v]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={values.is_active}
                onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))}
              />
              <Label>فعال</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید تغییر</AlertDialogTitle>
            <AlertDialogDescription>
              تغییر وزن یا نوع نمایش برچسب می‌تواند روی امتیازدهی محصولات و دسترسی فروشندگان اثر
              بگذارد. ادامه می‌دهید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void persist()} disabled={loading}>
              تأیید و ذخیره
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
