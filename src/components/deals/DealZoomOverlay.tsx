import type { ReactNode } from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DealZoomOverlay(props: {
  title: string;
  personName: string;
  amountLabel: string;
  ageLabel?: string | null;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="min-h-10 text-right font-medium text-primary underline-offset-2 hover:underline"
        title="در یک نگاه"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {props.title}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl" aria-label="در یک نگاه">
          <DialogHeader>
            <DialogTitle>در یک نگاه</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-7">
            <p className="text-lg font-semibold">{props.title}</p>
            <p>با {props.personName}</p>
            <p>{props.amountLabel}</p>
            {props.ageLabel ? <p>{props.ageLabel}</p> : null}
            {props.children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
