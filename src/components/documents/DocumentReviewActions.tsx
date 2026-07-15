import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useReviewDocument,
  type DocumentRow,
} from "@/hooks/documents/useDocuments";

export function DocumentReviewActions({ document }: { document: DocumentRow }) {
  const { roles } = useAuth();
  const mutation = useReviewDocument();
  const [openKind, setOpenKind] = useState<null | "confirmed" | "rejected">(null);
  const [note, setNote] = useState("");

  const canReview =
    roles.includes("admin") ||
    roles.includes("manager") ||
    roles.includes("accountant");
  if (!canReview) return null;
  if (document.status !== "pending_review") return null;

  const submit = async () => {
    if (!openKind) return;
    await mutation.mutateAsync({
      document_id: document.id,
      decision: openKind,
      note: note.trim() || null,
    });
    setNote("");
    setOpenKind(null);
  };

  return (
    <div className="flex gap-2" dir="rtl">
      <AlertDialog
        open={openKind === "confirmed"}
        onOpenChange={(o) => !o && setOpenKind(null)}
      >
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setOpenKind("confirmed")}
          >
            <Check className="ml-1 h-4 w-4" />
            آمد
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید سند</AlertDialogTitle>
            <AlertDialogDescription>
              این سند به‌عنوان «آمد» ثبت خواهد شد. در صورت تمایل یادداشت اضافه کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="یادداشت..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              تأیید
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openKind === "rejected"}
        onOpenChange={(o) => !o && setOpenKind(null)}
      >
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
            onClick={() => setOpenKind("rejected")}
          >
            <X className="ml-1 h-4 w-4" />
            نیامد
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>رد سند</AlertDialogTitle>
            <AlertDialogDescription>
              این سند به‌عنوان «نیامد» ثبت خواهد شد. در صورت تمایل دلیل را وارد کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="دلیل رد..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={submit}
              disabled={mutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {mutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              رد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}