import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { toError } from "@/lib/server-fn-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTimeFa } from "@/lib/i18n/formatters";
import {
  ALIAS_KINDS,
  ALIAS_KIND_LABEL,
  createPersonAlias,
  deletePersonAlias,
  listPersonAliases,
  updatePersonAlias,
  type AliasKind,
  type PersonAliasDTO,
} from "@/lib/persons/aliases.functions";

async function authHeaders(): Promise<{ Authorization: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("نشست کاربری معتبر نیست. لطفاً دوباره وارد شوید.");
  }
  return { Authorization: `Bearer ${token}` };
}

type Props = {
  personId: string;
  /** When false, list only — no add/edit/delete controls. */
  canManage: boolean;
};

export function PersonAliasesManager({ personId, canManage }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPersonAliases);
  const createFn = useServerFn(createPersonAlias);
  const updateFn = useServerFn(updatePersonAlias);
  const deleteFn = useServerFn(deletePersonAlias);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonAliasDTO | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [aliasKind, setAliasKind] = useState<AliasKind>("other");
  const [deleteTarget, setDeleteTarget] = useState<PersonAliasDTO | null>(null);

  const aliasesQuery = useQuery({
    queryKey: ["person", personId, "aliases"],
    queryFn: async () => {
      const headers = await authHeaders();
      return toError(listFn({ headers, data: { person_id: personId } }));
    },
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["person", personId, "aliases"] });
    await qc.invalidateQueries({ queryKey: ["persons"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const headers = await authHeaders();
      if (editing) {
        return toError(
          updateFn({
            headers,
            data: { id: editing.id, alias: aliasText, alias_kind: aliasKind },
          }),
        );
      }
      return toError(
        createFn({
          headers,
          data: { person_id: personId, alias: aliasText, alias_kind: aliasKind },
        }),
      );
    },
    onSuccess: async () => {
      toast.success(editing ? "نام دیگر به‌روزرسانی شد" : "نام دیگر افزوده شد");
      setFormOpen(false);
      setEditing(null);
      setAliasText("");
      setAliasKind("other");
      await invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message || "خطا در ذخیره نام دیگر");
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const headers = await authHeaders();
      return toError(deleteFn({ headers, data: { id } }));
    },
    onSuccess: async () => {
      toast.success("نام دیگر حذف شد");
      setDeleteTarget(null);
      await invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message || "خطا در حذف نام دیگر");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setAliasText("");
    setAliasKind("other");
    setFormOpen(true);
  };

  const openEdit = (row: PersonAliasDTO) => {
    setEditing(row);
    setAliasText(row.alias);
    setAliasKind(row.alias_kind);
    setFormOpen(true);
  };

  const rows = aliasesQuery.data ?? [];

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">نام‌های دیگر</h3>
        {canManage ? (
          <Button type="button" size="sm" variant="outline" onClick={openCreate}>
            <Plus className="ml-1 h-4 w-4" />
            افزودن نام دیگر
          </Button>
        ) : null}
      </div>

      {aliasesQuery.isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
      ) : aliasesQuery.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          بارگذاری نام‌های دیگر با خطا مواجه شد.
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">هیچ نام دیگری ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>تاریخ ایجاد</TableHead>
                {canManage ? <TableHead className="text-left">عملیات</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.alias}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ALIAS_KIND_LABEL[r.alias_kind] ?? r.alias_kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDateTimeFa(r.created_at)}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="ویرایش نام دیگر"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          aria-label="حذف نام دیگر"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش نام دیگر" : "افزودن نام دیگر"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="alias-text">نام</Label>
              <Input
                id="alias-text"
                value={aliasText}
                onChange={(e) => setAliasText(e.target.value)}
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>نوع</Label>
              <Select value={aliasKind} onValueChange={(v) => setAliasKind(v as AliasKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIAS_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ALIAS_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              انصراف
            </Button>
            <Button
              type="button"
              disabled={saveMut.isPending || !aliasText.trim()}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نام دیگر</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleteTarget?.alias}» مطمئن هستید؟ این عمل قابل بازگشت نیست و جستجو دیگر
              این نام را پیدا نمی‌کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMut.mutate(deleteTarget.id);
              }}
            >
              {deleteMut.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
