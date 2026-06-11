import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Stage = {
  id: string;
  title: string;
  order_index: number;
  is_active: boolean;
};

function useDebounce<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function WorkflowStagesPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("accountant");
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);

  const [editing, setEditing] = useState<Stage | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", order_index: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("invoice_workflow_stages")
      .select("id,title,order_index,is_active")
      .order("order_index", { ascending: true });
    if (debounced.trim()) q = q.ilike("title", `%${debounced.trim()}%`);
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast.error("خطا در بارگذاری");
      return;
    }
    setStages((data ?? []) as Stage[]);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [debounced]);

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-muted-foreground" dir="rtl">
        دسترسی غیرمجاز
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", order_index: (stages[stages.length - 1]?.order_index ?? 0) + 1 });
    setOpen(true);
  };

  const openEdit = (s: Stage) => {
    setEditing(s);
    setForm({ title: s.title, order_index: s.order_index });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("عنوان الزامی است");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("invoice_workflow_stages")
          .update({
            title: form.title.trim(),
            order_index: form.order_index,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editing.id);
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          entity_type: "invoice_workflow_stage",
          entity_id: editing.id,
          action: "invoice_workflow_stage_updated",
          actor_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          diff: { title: form.title, order_index: form.order_index },
        });
        toast.success("به‌روزرسانی شد");
      } else {
        const { data, error } = await supabase
          .from("invoice_workflow_stages")
          .insert({ title: form.title.trim(), order_index: form.order_index })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("audit_logs").insert({
          entity_type: "invoice_workflow_stage",
          entity_id: data!.id,
          action: "invoice_workflow_stage_created",
          actor_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          diff: { title: form.title, order_index: form.order_index },
        });
        toast.success("افزوده شد");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Stage) => {
    const { error } = await supabase
      .from("invoice_workflow_stages")
      .update({ is_active: !s.is_active, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) {
      toast.error("خطا");
      return;
    }
    toast.success("به‌روزرسانی شد");
    load();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مراحل کاری پیش‌فاکتور"
        description="تعریف و مدیریت مراحل گردش‌کار حسابداری"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="ml-2 h-4 w-4" /> افزودن مرحله
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>{editing ? "ویرایش مرحله" : "افزودن مرحله جدید"}</DialogTitle>
                <DialogDescription>عنوان و ترتیب مرحله را وارد کنید.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>عنوان</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>ترتیب</Label>
                  <Input
                    type="number"
                    value={form.order_index}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, order_index: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  انصراف
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  ذخیره
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Input
        placeholder="جستجوی نام مرحله..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">عنوان</TableHead>
              <TableHead className="text-right">ترتیب</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  در حال بارگذاری...
                </TableCell>
              </TableRow>
            ) : stages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                  مرحله‌ای یافت نشد
                </TableCell>
              </TableRow>
            ) : (
              stages.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.title}</TableCell>
                  <TableCell>{s.order_index}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "secondary" : "outline"}>
                      {s.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 space-x-reverse">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      ویرایش
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(s)}>
                      {s.is_active ? "غیرفعال" : "فعال"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/admin/workflow-stages")({
  component: WorkflowStagesPage,
});
