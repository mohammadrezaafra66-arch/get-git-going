import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Calculator,
  Camera,
  GraduationCap,
  ListChecks,
  Receipt,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

const RECEIPT_TYPES: { label: string; when: string; needsQuote: boolean }[] = [
  {
    label: "پرداخت پیش‌فاکتور",
    when: "مشتری بابت یک یا چند پیش‌فاکتور مشخص پول واریز کرده است. تنها نوعی که باید پیش‌فاکتور را انتخاب کنید.",
    needsQuote: true,
  },
  {
    label: "پرداخت بدهی",
    when: "مشتری بدهی قبلی خود را تسویه می‌کند و پول به پیش‌فاکتور مشخصی مربوط نیست. انتخاب پیش‌فاکتور لازم نیست.",
    needsQuote: false,
  },
  {
    label: "پیش‌واریز",
    when: "مشتری پیش از هر خریدی پول واریز کرده است. مبلغ به عنوان پیش‌واریز مشتری ثبت می‌شود.",
    needsQuote: false,
  },
  {
    label: "اعتبار مثبت مستقل",
    when: "مبلغ باید به عنوان اعتبار مثبت مستقل به حساب مشتری بنشیند و به سند فروش خاصی وصل نیست.",
    needsQuote: false,
  },
];

const ALLOCATION_RULES = [
  "فقط پیش‌فاکتورهای «تأییدشده» همان مشتری که مانده پرداخت‌نشده دارند در فهرست تخصیص می‌آیند. پیش‌فاکتور پیش‌نویس، ارسال‌شده، لغوشده یا ردشده در این فهرست نیست.",
  "مانده هر پیش‌فاکتور یعنی مبلغ نهایی آن منهای مجموع تخصیص‌های فیش‌های «تأییدشده». فیشی که هنوز در انتظار بررسی است مانده را کم نمی‌کند.",
  "مجموع تخصیص‌ها نمی‌تواند از مبلغ خود فیش بیشتر شود.",
  "هیچ تخصیصی نمی‌تواند از مانده همان پیش‌فاکتور بیشتر باشد.",
  "یک فیش را می‌توانید بین چند پیش‌فاکتور تقسیم کنید؛ مثلاً فیش ۱۰۰ میلیونی را ۶۰ میلیون روی یک پیش‌فاکتور و ۴۰ میلیون روی پیش‌فاکتور دیگر.",
  "لازم نیست کل مبلغ فیش تخصیص داده شود، اما برای نوع «پرداخت پیش‌فاکتور» حداقل یک تخصیص اجباری است.",
  "این محدودیت‌ها علاوه بر فرم، در خود دیتابیس هم کنترل می‌شوند؛ اگر پیامی درباره بیشتر بودن مبلغ از مانده دیدید، عدد را اصلاح کنید و دوباره ثبت کنید.",
];

const OCR_AUTO_FILLED = [
  "مبلغ",
  "شماره پیگیری",
  "تاریخ واریز",
  "ساعت",
  "بانک مبدأ",
  "بانک مقصد",
  "نام واریزکننده روی فیش",
  "نام دریافت‌کننده روی فیش",
  "نوع انتقال",
];

const OCR_MANUAL_CHECKS = [
  "سیستم فقط فیلدهای خالی را پر می‌کند؛ هر چیزی که خودتان تایپ کرده باشید دست‌نخورده می‌ماند.",
  "مبلغ و شماره پیگیری را حتماً با تصویر فیش مقابله کنید؛ خواندن خودکار ممکن است رقم را اشتباه بخواند.",
  "تاریخ خوانده‌شده اگر مربوط به آینده باشد اصلاً پر نمی‌شود و باید دستی وارد شود.",
  "انتخاب مشتری، نوع فیش و تخصیص پیش‌فاکتور هیچ‌وقت خودکار پر نمی‌شوند و کاملاً با شماست.",
  "کد حسابداری پرداخت‌کننده و دریافت‌کننده از تصویر استخراج نمی‌شود.",
  "اگر پیام «OCR در دسترس نیست» دیدید، یعنی سرویس خواندن تصویر خاموش است و باید همه فیلدها را دستی وارد کنید.",
];

const COMMON_MISTAKES = [
  "انتخاب نوع «پرداخت پیش‌فاکتور» بدون انتخاب هیچ پیش‌فاکتوری — ثبت انجام نمی‌شود و پیام خطا می‌گیرید. اگر پول به پیش‌فاکتور مشخصی مربوط نیست، نوع درست را انتخاب کنید.",
  "ثبت فیش روی مشتری اشتباه — پول به اعتبار شخص دیگری می‌نشیند. پیش از ثبت، نام و شماره مشتری انتخاب‌شده را با فیش مقابله کنید.",
  "تاریخ فیش امروز نیست — سیستم هشدار می‌دهد. اگر واقعاً واریز روز دیگری بوده اشکالی ندارد، اما اگر اشتباه تایپی است همان‌جا اصلاح کنید.",
  "ثبت دوباره یک فیش — اگر شماره پیگیری، مبلغ، تاریخ و بانک با فیش قبلی یکی باشد سیستم هشدار تکراری می‌دهد. پیش از ادامه، فیش قبلی را ببینید.",
  "رها کردن شماره پیگیری — بدون شماره پیگیری فیش قابل پیگیری بانکی نیست و هشدار «مهم» می‌گیرد.",
];

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-7">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function GuideCard({
  index,
  title,
  icon: Icon,
  items,
}: {
  index: number;
  title: string;
  icon: LucideIcon;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          <span>
            بخش {toFaDigits(index)} — {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BulletList items={items} />
      </CardContent>
    </Card>
  );
}

export function PaymentReceiptGuide() {
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/accounting/receipts">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به فیش‌های واریزی
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/accounting/receipts/create">
            <Receipt className="ml-2 h-4 w-4" />
            ثبت فیش واریزی
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/accounting/receivables">
            <Wallet className="ml-2 h-4 w-4" />
            مطالبات مشتریان
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/sales/quotes">
            <ListChecks className="ml-2 h-4 w-4" />
            پیش‌فاکتورها
          </Link>
        </Button>
      </div>

      <PageHeader
        title="آموزش فیش‌های واریزی و پرداخت‌ها"
        description="راهنمای کامل ثبت فیش واریزی: انتخاب نوع درست، تخصیص روی پیش‌فاکتور، معنی هشدارهای پیش از ثبت و کارهایی که باید دستی بررسی شوند"
      />

      <Alert>
        <GraduationCap className="h-4 w-4" />
        <AlertTitle>خلاصه مسیر</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          اول مشتری را انتخاب کنید، بعد نوع فیش را درست تعیین کنید، سپس اگر نوع «پرداخت پیش‌فاکتور»
          است مبلغ را روی پیش‌فاکتورهای تأییدشده تقسیم کنید، تصویر فیش را پیوست کنید و در پایان
          هشدارهای پیش از ثبت را بخوانید و در صورت درست بودن ثبت کنید.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" />
            <span>بخش {toFaDigits(1)} — چهار نوع فیش و کاربرد هرکدام</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {RECEIPT_TYPES.map((t, i) => (
            <div key={t.label} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {toFaDigits(i + 1)}. {t.label}
                </span>
                {t.needsQuote ? (
                  <Badge variant="default" className="text-xs font-normal">
                    انتخاب پیش‌فاکتور اجباری
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs font-normal">
                    بدون انتخاب پیش‌فاکتور
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.when}</p>
            </div>
          ))}
          <p className="text-sm leading-7">
            از میان این چهار نوع، فقط «پرداخت پیش‌فاکتور» تخصیص می‌خواهد. سه نوع دیگر بدون هیچ
            تخصیصی ثبت می‌شوند و مبلغشان به حساب اعتبار مشتری می‌نشیند.
          </p>
        </CardContent>
      </Card>

      <GuideCard
        index={2}
        title="تخصیص مبلغ روی پیش‌فاکتورها"
        icon={Calculator}
        items={ALLOCATION_RULES}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span>بخش {toFaDigits(3)} — پنجره هشدار پیش از ثبت</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7">
          <p>
            پیش از ثبت، سیستم فیش را بررسی می‌کند و اگر موردی پیدا کند پنجره «هشدارهای امنیتی فیش»
            باز می‌شود. هر مورد یک برچسب دارد:
          </p>
          <div className="space-y-2">
            <div className="rounded-md border p-3">
              <Badge variant="outline" className="text-xs font-normal">
                استاندارد
              </Badge>
              <p className="mt-2">
                قاعده‌ای است که مدیر سیستم در «قوانین اعتبارسنجی» تعریف کرده و شدت آن «هشدار» است.
                یعنی خلاف سیاست داخلی شرکت است، اما ثبت را متوقف نمی‌کند.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <Badge variant="outline" className="text-xs font-normal">
                متوسط
              </Badge>
              <p className="mt-2">
                نشانه‌ای که معمولاً اشتباه ثبت است و نه تقلب: تاریخ فیش امروز نیست، نام واریزکننده
                روی فیش مشخص نیست، یا فیش پرفراژ ندارد. اگر واقعاً همین‌طور است می‌توانید ادامه
                دهید.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <Badge variant="outline" className="text-xs font-normal">
                مهم
              </Badge>
              <p className="mt-2">
                نشانه‌ای که ارزش توقف دارد: شماره پیگیری خالی است، فیش تایپی است، انتقال از طریق
                «پل» انجام شده، یا مبلغ و شماره پیگیری خوانده‌شده از تصویر با چیزی که ثبت کرده‌اید
                یکی نیست. پیش از ادامه، اصل فیش را ببینید.
              </p>
            </div>
          </div>
          <p>
            دکمه «بازگشت و اصلاح» فرم را باز نگه می‌دارد تا عدد را درست کنید. دکمه «ثبت با تأیید
            حسابدار» فیش را ثبت می‌کند و همین هشدارها را روی فیش و در گزارش تغییرات ذخیره می‌کند —
            یعنی تأیید شما ثبت و قابل پیگیری است.
          </p>
          <p className="font-medium">
            پنجره «ثبت ممکن نیست» فرق دارد: آن موارد اجباری هستند و تا اصلاح نشوند فیش اصلاً ثبت
            نمی‌شود.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-primary" />
            <span>بخش {toFaDigits(4)} — پیوست تصویر فیش و خواندن خودکار</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-7">
            به‌محض پیوست تصویر، سیستم متن آن را می‌خواند و این فیلدها را در صورت خالی بودن پر
            می‌کند:
          </p>
          <div className="flex flex-wrap gap-2">
            {OCR_AUTO_FILLED.map((f) => (
              <Badge key={f} variant="outline" className="text-xs font-normal">
                {f}
              </Badge>
            ))}
          </div>
          <p className="text-sm font-medium leading-7">آنچه همچنان باید دستی بررسی شود:</p>
          <BulletList items={OCR_MANUAL_CHECKS} />
        </CardContent>
      </Card>

      <GuideCard index={5} title="اشتباه‌های رایج" icon={AlertTriangle} items={COMMON_MISTAKES} />

      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">مهم‌ترین نکته</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          ثبت فیش به‌تنهایی پول را جابه‌جا نمی‌کند. تا وقتی فیش «تأییدشده» نشود، مانده پیش‌فاکتور کم
          نمی‌شود، اعتبار مشتری بالا نمی‌رود و سند حسابداری صادر نمی‌شود. بنابراین بعد از ثبت، وضعیت
          فیش را در فهرست فیش‌ها دنبال کنید.
        </AlertDescription>
      </Alert>
    </div>
  );
}
