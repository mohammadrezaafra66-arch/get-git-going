import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Power, Search } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { changeReasonSchema, type ChangeReasonFormValues } from "@/lib/pricing/schemas";

export const Route = createFileRoute("/_app/pricing/change-reasons")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: ChangeReasonsPage,
});

interface Reason {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
}
const PAGE_SIZE = 20;

function ChangeReasonsPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reason | null>(null);
  const [search, setSearch] = useState("");
  const dSearch = useDebounce(search, 350);
  const [page, setPage] = useState(0);
  const [toggleTarget, setToggleTarget] = useState<Reason | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["price-change-reasons-admin"],
    queryFn: async (): Promise<Reason[]> => {
      const { data, error } = await supabase
        .from("price_change_reasons")
        .select("id, title, description, is_active")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["price-change-reasons-admin"] });
    qc.invalidateQueries({ queryKey: ["change-reasons-active"] });
  };

  const toggleStatus = async (r: Reason) => {
    const { error } = await supabase
      .from("price_change_reasons")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success(r.is_active ? "دلیل غیرفعال شد" : "دلیل فعال شد");
      onSaved();
    }
    setToggleTarget(null);
  };

  const filtered = useMemo(() => {
    const list = data ?? [];
    const q = dSearch.trim().toLowerCase();
    return q.length >= 2 ? list.filter((r) => r.title.toLowerCase().includes(q)) : list;
  }, [data, dSearch]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        title="دلایل تغییر قیمت"
        description="فهرست دلایل قابل انتخاب هنگام ثبت قیمت خرید"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
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
                دلیل جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="جستجوی عنوان دلیل (حداقل ۲ کاراکتر)"
              className="pr-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : paged.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">دلیلی ثبت نشده.</div>
          ) : (
            <ul className="divide-y divide-border">
              {paged.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      {r.is_active ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                          فعال
                        </Badge>
                      ) : (
                        <Badge variant="destructive">غیرفعال</Badge>
                      )}
                    </div>
                    {r.description && (
                      <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToggleTarget(r)}
                        title={r.is_active ? "غیرفعال" : "فعال"}
                      >
                        <Power
                          className={`h-4 w-4 ${r.is_active ? "text-destructive" : "text-emerald-600"}`}
                        />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            صفحه {page + 1} از {totalPages} ({total} مورد)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
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

      <ReasonDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={onSaved} />

      <AlertDialog open={!!toggleTarget} onOpenChange={(v) => !v && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? "غیرفعال‌سازی دلیل" : "فعال‌سازی دلیل"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `آیا از غیرفعال‌کردن «${toggleTarget?.title}» اطمینان دارید؟ این دلیل در فرم‌های جدید نمایش داده نخواهد شد.`
                : `آیا از فعال‌کردن «${toggleTarget?.title}» اطمینان دارید؟`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleTarget && toggleStatus(toggleTarget)}>
              تایید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Reason | null;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<ChangeReasonFormValues>({
    title: "",
    description: "",
    is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setValues(
        editing
          ? {
              title: editing.title,
              description: editing.description ?? "",
              is_active: editing.is_active,
            }
          : { title: "", description: "", is_active: true },
      );
      setErrors({});
    }
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = changeReasonSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const payload = {
        title: parsed.data.title,
        description: parsed.data.description || null,
        is_active: parsed.data.is_active,
      };
      if (editing) {
        const { error } = await supabase
          .from("price_change_reasons")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("price_change_reasons").insert(payload);
        if (error) throw error;
        toast.success("ثبت شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش دلیل" : "دلیل جدید"}</DialogTitle>
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
            <Label>توضیحات</Label>
            <Textarea
              value={values.description ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))}
              rows={3}
            />
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
  );
}
