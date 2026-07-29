import { useState } from "react";
import { AlertTriangle, Calculator, Clock, ShieldCheck, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

export type QuoteExceptionType =
  | "overdue_salesperson_commitment"
  | "credit_shortfall_salesperson_commitment"
  | "accounting_approval";

export type QuoteBlockReason =
  | {
      kind: "stock";
      items: Array<{ productName: string; required: number; available: number }>;
    }
  | {
      kind: "overdue";
      availableCredit: number;
      finalAmount: number;
      overdueSince?: string | null;
    }
  | {
      kind: "credit_shortfall";
      availableCredit: number;
      finalAmount: number;
      shortage: number;
    }
  | {
      kind: "no_credit";
      finalAmount: number;
      detail: string;
    };

interface QuoteCreationBlockDialogProps {
  reason: QuoteBlockReason | null;
  onClose: () => void;
  onConfirmException: (exception: {
    type: QuoteExceptionType;
    minutes?: number | null;
    amount?: number | null;
    text: string;
  }) => void;
}

const OVERDUE_TEXT = (minutes: number) =>
  `اینجانب با توجه به شناختی که از مشتری خود دارم و بنا به تشخیص شخصی، متعهد می‌شوم که مشتری حداکثر تا ${toFaDigits(
    minutes,
  )} دقیقه دیگر مبلغ معوق خود را تسویه کرده و فیش واریزی را ارسال خواهد کرد. در صورتی که مشتری در مهلت مقرر بدهی قبلی خود را تسویه نکند، تمام مسئولیت خرید انجام‌شده و کالایی که بر اساس این پیش‌فاکتور توسط واحد خرید تهیه شده است، بر عهده اینجانب خواهد بود. همچنین در صورت کاهش قیمت کالا یا عدم فروش آن، موظف هستم حداکثر ظرف مدت ۱۰ روز کالا را به فروش برسانم و در غیر این صورت، خسارت و زیان وارده در پایان ماه از محل درآمد اینجانب کسر خواهد شد.`;

const creditShortfallText = (shortage: number) =>
  `اینجانب متعهد می‌شوم که مبلغ کسری اعتبار این پیش‌فاکتور به میزان ${formatNumber(
    shortage,
  )} تومان را تا پایان روز کاری توسط مشتری دریافت و برای ثبت مالی تحویل واحد حسابداری کنم. در صورت انجام نشدن این واریز، تمام مسئولیت ثبت پیش‌فاکتور بیش از اعتبار مشتری بر عهده اینجانب خواهد بود.`;

const ACCOUNTING_APPROVAL_TEXT =
  "اینجانب متعهد می‌شوم که تأییدیه ثبت این پیش‌فاکتور را از خانم ماهرو دریافت کرده‌ام و در صورتی که در آینده مشخص شود این تأییدیه اخذ نشده یا خلاف واقع اعلام شده است، تمام مسئولیت ثبت این پیش‌فاکتور بر عهده اینجانب خواهد بود.";

export function QuoteCreationBlockDialog({
  reason,
  onClose,
  onConfirmException,
}: QuoteCreationBlockDialogProps) {
  const [minutes, setMinutes] = useState(30);

  if (!reason) return null;

  const title =
    reason.kind === "stock"
      ? "ثبت پیش‌فاکتور به دلیل موجودی متوقف شد"
      : reason.kind === "overdue"
        ? "مشتری مانده معوق دارد"
        : reason.kind === "credit_shortfall"
          ? "مبلغ پیش‌فاکتور بیشتر از اعتبار مشتری است"
          : "مشتری اعتبار قابل استفاده ندارد";

  return (
    <Dialog open={!!reason} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>
            سیستم اجازه ثبت عادی نمی‌دهد. دلیل را بررسی کنید و فقط از مسیر مجاز ادامه دهید.
          </DialogDescription>
        </DialogHeader>

        {reason.kind === "stock" && (
          <div className="space-y-3">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-7">
              موجودی بعضی کالاها برای ثبت این پیش‌فاکتور کافی نیست. این مورد قابل تعهد یا دور زدن
              نیست؛ ابتدا موجودی انبار باید اصلاح شود.
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right">نام کالا</th>
                    <th className="p-2 text-right">تعداد درخواستی</th>
                    <th className="p-2 text-right">موجودی فعلی</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reason.items.map((item) => (
                    <tr key={item.productName}>
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2">{formatNumber(item.required)}</td>
                      <td className="p-2">{formatNumber(item.available)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reason.kind === "overdue" && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
              این مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست. اگر مشتری اعلام کرده تا چند
              دقیقه دیگر بدهی را واریز می‌کند، می‌توانید با تعهد شخصی ادامه دهید.
            </div>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="overdue_commitment_minutes">مهلت تسویه معوقه</Label>
                <Input
                  id="overdue_commitment_minutes"
                  type="number"
                  min={1}
                  max={240}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value) || 1)}
                />
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-xs leading-6">
                {OVERDUE_TEXT(minutes)}
              </div>
            </div>
          </div>
        )}

        {reason.kind === "credit_shortfall" && (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm sm:grid-cols-3">
              <InfoCell
                label="اعتبار قابل استفاده"
                value={`${formatNumber(reason.availableCredit)} تومان`}
              />
              <InfoCell
                label="مبلغ پیش‌فاکتور"
                value={`${formatNumber(reason.finalAmount)} تومان`}
              />
              <InfoCell label="کسری اعتبار" value={`${formatNumber(reason.shortage)} تومان`} />
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-xs leading-6">
              {creditShortfallText(reason.shortage)}
            </div>
          </div>
        )}

        {reason.kind === "no_credit" && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm leading-7">
              {reason.detail} ثبت عادی بدون بیعانه مجاز نیست. فقط اگر تأیید حسابداری گرفته شده باشد،
              می‌توانید با ثبت تعهد ادامه دهید.
            </div>
            <div className="rounded-md border bg-muted/20 p-3 text-xs leading-6">
              {ACCOUNTING_APPROVAL_TEXT}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            بستن و اصلاح اطلاعات
          </Button>
          {reason.kind === "overdue" && (
            <Button
              onClick={() =>
                onConfirmException({
                  type: "overdue_salesperson_commitment",
                  minutes,
                  text: OVERDUE_TEXT(minutes),
                })
              }
            >
              <Clock className="ml-2 h-4 w-4" />
              ثبت با تعهد کارشناس فروش
            </Button>
          )}
          {reason.kind === "credit_shortfall" && (
            <Button
              onClick={() =>
                onConfirmException({
                  type: "credit_shortfall_salesperson_commitment",
                  amount: reason.shortage,
                  text: creditShortfallText(reason.shortage),
                })
              }
            >
              <Calculator className="ml-2 h-4 w-4" />
              تعهد واریز کسری تا پایان روز
            </Button>
          )}
          {reason.kind === "no_credit" && (
            <Button
              onClick={() =>
                onConfirmException({
                  type: "accounting_approval",
                  text: ACCOUNTING_APPROVAL_TEXT,
                })
              }
            >
              <ShieldCheck className="ml-2 h-4 w-4" />
              ثبت با تأیید حسابداری
            </Button>
          )}
          {reason.kind === "stock" && (
            <Button variant="destructive" onClick={onClose}>
              <Warehouse className="ml-2 h-4 w-4" />
              متوجه شدم
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
