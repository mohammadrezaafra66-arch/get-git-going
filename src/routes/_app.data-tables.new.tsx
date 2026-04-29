import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import {
  DYNAMIC_COLUMN_DATA_TYPES, DYNAMIC_COLUMN_DATA_TYPE_LABELS,
  SLUG_REGEX, COLUMN_KEY_REGEX, type DynamicColumnDataType,
  DYNAMIC_TABLE_ACCESS_LEVELS, DYNAMIC_TABLE_ACCESS_LEVEL_LABELS,
  type DynamicTableAccessLevel,
} from "@/lib/data-tables/constants";

export const Route = createFileRoute("/_app/data-tables/new")({
  beforeLoad: async () => { await requirePermission("data-tables", "create"); },
  component: NewDataTablePage,
});

interface ColumnDraft {
  label: string;
  column_key: string;
  data_type: DynamicColumnDataType;
  is_required: boolean;
  is_filterable: boolean;
  is_editable_by_bot: boolean;
}

function emptyCol(): ColumnDraft {
  return { label: "", column_key: "", data_type: "text", is_required: false, is_filterable: false, is_editable_by_bot: false };
}

function NewDataTablePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState<DynamicTableAccessLevel>("all");
  const [columns, setColumns] = useState<ColumnDraft[]>([emptyCol()]);

  const updateCol = (i: number, patch: Partial<ColumnDraft>) =>
    setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCol = () => setColumns((cs) => [...cs, emptyCol()]);
  const removeCol = (i: number) => setColumns((cs) => cs.filter((_, idx) => idx !== i));

  const createMut = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim();
      if (!trimmedName) throw new Error("نام جدول الزامی است.");
      if (!SLUG_REGEX.test(trimmedSlug) || trimmedSlug.length < 2) {
        throw new Error("شناسه (slug) فقط حروف انگلیسی کوچک، عدد و خط تیره مجاز است.");
      }
      if (columns.length < 1) throw new Error("حداقل یک ستون لازم است.");
      const seen = new Set<string>();
      for (const c of columns) {
        const key = c.column_key.trim();
        const lab = c.label.trim();
        if (!lab) throw new Error("عنوان همه ستون‌ها الزامی است.");
        if (!COLUMN_KEY_REGEX.test(key)) throw new Error(`شناسه ستون نامعتبر است: ${lab}`);
        if (seen.has(key)) throw new Error(`شناسه ستون تکراری است: ${key}`);
        seen.add(key);
      }

      const { data: ins, error: e1 } = await supabase
        .from("dynamic_tables")
        .insert({
          name: trimmedName,
          slug: trimmedSlug,
          description: description.trim() || null,
          access_level: accessLevel,
        } as never)
        .select("id")
        .single();
      if (e1) throw e1;
      const tableId = ins.id as string;

      const colsPayload = columns.map((c, idx) => ({
        table_id: tableId,
        column_key: c.column_key.trim(),
        label: c.label.trim(),
        data_type: c.data_type,
        is_required: c.is_required,
        is_filterable: c.is_filterable,
        is_editable_by_bot: c.is_editable_by_bot,
        sort_order: idx,
      }));
      const { error: e2 } = await supabase.from("dynamic_table_columns").insert(colsPayload);
      if (e2) throw e2;

      return tableId;
    },
    onSuccess: (id) => {
      toast.success("جدول ساخته شد.");
      navigate({ to: "/data-tables/$tableId", params: { tableId: id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در ایجاد جدول"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="جدول داده پویا جدید"
        description="نام، شناسه و ستون‌های اولیه جدول را تعیین کنید."
        actions={
          <Button asChild variant="outline">
            <Link to="/data-tables"><ArrowRight className="ml-2 h-4 w-4" />بازگشت</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>نام جدول *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مخاطبان طلای عمومی" />
            </div>
            <div className="space-y-1.5">
              <Label>شناسه (slug) *</Label>
              <Input
                dir="ltr"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="general-gold-contacts"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">فقط حروف انگلیسی کوچک، عدد و خط تیره</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>توضیح (اختیاری)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>سطح دسترسی</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as DynamicTableAccessLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DYNAMIC_TABLE_ACCESS_LEVELS.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>{DYNAMIC_TABLE_ACCESS_LEVEL_LABELS[lvl]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">مشخص کنید کدام نقش‌ها مجاز به مشاهده و کار با این جدول هستند.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">ستون‌های اولیه</h2>
            <Button size="sm" variant="outline" onClick={addCol}><Plus className="ml-2 h-4 w-4" />ستون جدید</Button>
          </div>

          <div className="space-y-3">
            {columns.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>عنوان نمایشی</Label>
                    <Input value={c.label} onChange={(e) => updateCol(i, { label: e.target.value })} placeholder="نام و نام خانوادگی" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>شناسه ستون</Label>
                    <Input
                      dir="ltr"
                      value={c.column_key}
                      onChange={(e) => updateCol(i, { column_key: e.target.value.toLowerCase() })}
                      placeholder="full_name"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>نوع داده</Label>
                    <Select value={c.data_type} onValueChange={(v) => updateCol(i, { data_type: v as DynamicColumnDataType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DYNAMIC_COLUMN_DATA_TYPES.map((dt) => (
                          <SelectItem key={dt} value={dt}>{DYNAMIC_COLUMN_DATA_TYPE_LABELS[dt]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={c.is_required} onCheckedChange={(v) => updateCol(i, { is_required: !!v })} />
                    اجباری
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={c.is_filterable} onCheckedChange={(v) => updateCol(i, { is_filterable: !!v })} />
                    قابل فیلتر
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={c.is_editable_by_bot} onCheckedChange={(v) => updateCol(i, { is_editable_by_bot: !!v })} />
                    قابل ویرایش توسط ربات
                  </label>
                  <div className="ms-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCol(i)}
                      disabled={columns.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
          {createMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ایجاد جدول
        </Button>
      </div>
    </div>
  );
}
