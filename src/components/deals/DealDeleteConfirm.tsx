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
import { formatDealNumber } from "@/lib/deals/format";

export function DealDeleteConfirm(props: {
  open: boolean;
  count: number;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const title =
    props.count > 1
      ? `آیا از حذف ${formatDealNumber(props.count)} معامله مطمئن هستید؟`
      : "آیا از حذف این معامله مطمئن هستید؟";
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent dir="rtl" className="z-[60]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            پس از حذف، معامله در فهرست «معاملات حذف شده» می‌ماند.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>انصراف</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={props.pending}
            onClick={(e) => {
              e.preventDefault();
              props.onConfirm();
            }}
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
