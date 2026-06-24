import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NewGroupDialog({ onCreated }: { onCreated?: (groupId: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"private" | "group" | "operational">("group");

  const createGroup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_messenger_group", {
        p_name: name.trim(),
        p_type: type,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("گروه ایجاد شد");
      qc.invalidateQueries({ queryKey: ["messenger-groups"] });
      setOpen(false);
      setName("");
      setType("group");
      onCreated?.(id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطا در ایجاد گروه";
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-2">
          <Plus className="h-4 w-4" />
          گروه جدید
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>ایجاد گروه جدید</DialogTitle>
          <DialogDescription>یک گروه گفت‌وگو بسازید و سپس اعضا را اضافه کنید.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">نام گروه</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: تیم فروش"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label>نوع گروه</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">گروهی</SelectItem>
                <SelectItem value="private">خصوصی</SelectItem>
                <SelectItem value="operational">عملیاتی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={createGroup.isPending}>
            انصراف
          </Button>
          <Button
            onClick={() => createGroup.mutate()}
            disabled={!name.trim() || createGroup.isPending}
            className="gap-2"
          >
            {createGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            ایجاد گروه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}