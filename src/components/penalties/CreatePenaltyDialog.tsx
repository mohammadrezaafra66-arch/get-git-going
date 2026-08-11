import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { useCreateManualPenalty } from "@/hooks/penalties/usePenalties";
import { PENALTY_TYPE_FA, PENALTY_SEVERITY_FA } from "@/lib/penalties/labels";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert, Search } from "lucide-react";

type Profile = { id: string; full_name: string | null };

export function CreatePenaltyDialog() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 300);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [type, setType] = useState<string>("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "">("");
  const [description, setDescription] = useState("");

  const create = useCreateManualPenalty();

  const { data: profiles, isFetching } = useQuery({
    queryKey: ["penalty-user-picker", debounced],
    enabled: open && !selected,
    staleTime: 30_000,
    queryFn: async (): Promise<Profile[]> => {
      const term = debounced.trim();
      let query = supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true })
        .limit(30);
      if (term.length > 0) query = query.ilike("full_name", `%${term}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Profile[];
    },
  });

  const reset = () => {
    setQ("");
    setSelected(null);
    setType("");
    setSeverity("");
    setDescription("");
  };

  const submit = async () => {
    if (!selected || !type || !severity) return;
    await create.mutateAsync({
      userId: selected.id,
      type,
      severity,
      description: description.trim() || undefined,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <ShieldAlert className="h-4 w-4" />
          ثبت کارت قرمز جدید
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت دستی کارت قرمز</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>کاربر هدف</Label>
            {selected ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{selected.full_name || "بدون نام"}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  تغییر
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="جست‌وجوی نام کاربر…"
                    className="pr-9"
                  />
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                  {isFetching && (
                    <div className="flex items-center justify-center py-3 text-sm text-muted-foreground">
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جست‌وجو…
                    </div>
                  )}
                  {!isFetching && (profiles?.length ?? 0) === 0 && (
                    <div className="py-3 text-center text-sm text-muted-foreground">کاربری یافت نشد</div>
                  )}
                  {!isFetching &&
                    (profiles ?? []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelected(p)}
                        className="block w-full border-b px-3 py-2 text-right text-sm last:border-b-0 hover:bg-muted"
                      >
                        {p.full_name || "بدون نام"}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>نوع تخلف</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
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
            <Select value={severity} onValueChange={(v) => setSeverity(v as "low" | "medium" | "high")}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب کنید" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PENALTY_SEVERITY_FA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>توضیحات (اختیاری)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="توضیح کوتاه درباره تخلف…"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            انصراف
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !selected || !type || !severity}
          >
            {create.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            ثبت کارت قرمز
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}