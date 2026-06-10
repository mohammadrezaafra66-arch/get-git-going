import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Power, Pencil, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";

export const Route = createFileRoute("/_app/pricing/currencies")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: CurrenciesPage,
});

type CurrencyRow = {
  id: string;
  code: string;
  title: string;
  symbol: string | null;
  is_active: boolean;
  sort_order: number;
};

function CurrenciesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["currencies", "manage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("id, code, title, symbol, is_active, sort_order")
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CurrencyRow[];
    },
    staleTime: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["currencies"] });
    qc.invalidateQueries({ queryKey: ["currencies", "manage"] });
  };

  const toggleActive = async (c: CurrencyRow) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from("currencies")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(c.is_active ? "ارز غیرفعال شد" : "ارز فعال شد");
    refresh();
  };

  const remove = async (c: CurrencyRow) => {
    if (!canWrite) return;
    if (!confirm(`آیا از حذف ارز «${c.title}» مطمئن هستید؟`)) return;
    const { error } = await supabase.from("currencies").delete().eq("id", c.id);
    if (error) {
      const msg = String(error.message ?? "");
      if (/foreign key|violat|reference/i.test(msg)) {
        toast.error(
          "این ارز در محصولات استفاده شده و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.",
        );
      } else {
        toast.error(msg || "خطا در حذف ارز");
      }
      return;
    }
    toast.success("ارز حذف شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="ارزها"
        description="مدیریت ارزهای قابل استفاده در محصولات و قیمت‌گذاری. ارزهای جدید بلافاصله در فرم محصول قابل انتخاب خواهند بود."
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
                ارز جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              ارزی تعریف نشده است.
            </div>
          ) : (
            <ul className="divide-y">
              {data.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{c.title}</span>
                      <Badge variant="outline" className="font-mono uppercase">
                        {c.code}
                      </Badge>
                      {c.symbol && (
                        <span className="text-sm text-muted-foreground">({c.symbol})</span>
                      )}
                      {c.is_active ? (
                        <Badge variant="default">فعال</Badge>
                      ) : (
                        <Badge variant="outline">غیرفعال</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">ترتیب نمایش: {c.sort_order}</div>
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="ms-1 h-3 w-3" />
                        ویرایش
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => toggleActive(c)}
                      >
                        <Power
                          className={`ms-1 h-3 w-3 ${c.is_active ? "text-destructive" : ""}`}
                        />
                        {c.is_active ? "غیرفعال" : "فعال"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive"
                        onClick={() => remove(c)}
                      >
                        <Trash2 className="ms-1 h-3 w-3" />
                        حذف
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CurrencyDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={refresh} />
    </div>
  );
}

function CurrencyDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CurrencyRow | null;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [symbol, setSymbol] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState<string>("0");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(editing?.code ?? "");
      setTitle(editing?.title ?? "");
      setSymbol(editing?.symbol ?? "");
      setIsActive(editing?.is_active ?? true);
      setSortOrder(String(editing?.sort_order ?? 0));
    }
  }, [open, editing]);

  const submit = async () => {
    const cleanCode = code.trim().toLowerCase();
    if (!cleanCode || !/^[a-z0-9_-]{2,16}$/i.test(cleanCode)) {
      toast.error("کد ارز باید بین ۲ تا ۱۶ کاراکتر و فقط شامل حروف انگلیسی، عدد، _ یا - باشد.");
      return;
    }
    if (!title.trim()) {
      toast.error("عنوان ارز الزامی است.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        code: cleanCode,
        title: title.trim(),
        symbol: symbol.trim() || null,
        is_active: isActive,
        sort_order: Number(sortOrder) || 0,
      };
      const op = editing
        ? supabase.from("currencies").update(payload).eq("id", editing.id)
        : supabase.from("currencies").insert(payload);
      const { error } = await op;
      if (error) {
        if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
          throw new Error("ارزی با این کد قبلاً ثبت شده است.");
        }
        throw error;
      }
      toast.success(editing ? "ارز ویرایش شد" : "ارز جدید ثبت شد");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ذخیره ارز");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش ارز" : "ارز جدید"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>
              کد ارز * <span className="text-xs text-muted-foreground">(مثلاً eur، cny)</span>
            </Label>
            <Input
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="eur"
              disabled={!!editing}
            />
            {editing && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                کد ارز پس از ثبت قابل تغییر نیست.
              </p>
            )}
          </div>
          <div>
            <Label>عنوان فارسی *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="یورو" />
          </div>
          <div>
            <Label>نماد</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="€" />
          </div>
          <div>
            <Label>ترتیب نمایش</Label>
            <Input
              type="number"
              dir="ltr"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
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
