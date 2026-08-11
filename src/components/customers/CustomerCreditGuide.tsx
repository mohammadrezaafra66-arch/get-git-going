import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Coins,
  FileText,
  GraduationCap,
  ListChecks,
  Scale,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

const CUSTOMER_PREP = [
  "مشتری باید فعال باشد و اطلاعات پایهٔ او درست ثبت شده باشد.",
  "مشتری باید کارشناس مسئول داشته باشد؛ مشتری بدون کارشناس در محاسبه اعتبار شرکت نمی‌کند.",
  "اگر مشتری بدهی معوق داشته باشد، سقف اعتبار او صفر می‌شود.",
  "بعد از هر تغییر مهم، صفحه اعتبار مشتری را دوباره بررسی کنید.",
];

const CUSTOMER_SCORING = [
  "وارد صفحهٔ اعتبار مشتری شوید.",
  "بخش «امتیازدهی پویا — ماه جاری» را کامل کنید.",
  "برای هر پارامتر مقدار مناسب وارد کنید و دکمه ذخیره همان پارامتر را بزنید.",
  "اگر وزن‌ها برای ماه جاری معتبر نباشند، امتیاز وزنی مشتری صفر می‌شود.",
];

const SALESPERSON_SCORING = [
  "برای هر کارشناس فروش باید پارامترهای امتیازدهی ثبت شود.",
  "امتیاز کارشناس تعیین می‌کند چه سهمی از سرمایه کل روز به او می‌رسد.",
  "اگر امتیاز کارشناس صفر باشد، هیچ سرمایه‌ای به او تخصیص نمی‌یابد.",
  "فقط کاربرانی که نقش فروش دارند در تخصیص سرمایه فروشندگان شرکت می‌کنند.",
];

const DAILY_CAPITAL = [
  "حسابدار سرمایه کل روز را در صفحهٔ تخصیص سرمایه روزانه وارد می‌کند.",
  "سیستم ابتدا سرمایه را بر اساس امتیاز بین کارشناسان فروش تقسیم می‌کند.",
  "سپس سهم هر کارشناس بین مشتریان همان کارشناس تقسیم می‌شود.",
  "برای اصلاح نتیجه یک تاریخ، snapshot همان تاریخ باید بازنویسی شود.",
];

const REVIEW_STEPS = [
  "در صفحه تخصیص سرمایه روز، سهم هر کارشناس را بررسی کنید.",
  "روی کارشناس کلیک کنید تا مشتریان او و سقف نهایی هر مشتری را ببینید.",
  "ستون قید نشان می‌دهد چرا سقف یک مشتری محدود یا صفر شده است.",
  "اگر هشدار زرد دیدید، اول امتیاز کارشناس، بعد امتیاز مشتری و سپس سرمایه روز را بررسی کنید.",
];

const ZERO_REASONS = [
  "سرمایه روز ثبت نشده است",
  "مشتری کارشناس مسئول ندارد",
  "کارشناس مسئول سرمایه نگرفته است",
  "امتیاز کارشناس صفر است",
  "امتیاز مشتری صفر است",
  "وزن پارامترها برای ماه جاری معتبر نیست",
  "مشتری بدهی معوق دارد",
  "تخصیص سرمایه بعد از تغییرات دوباره اجرا نشده",
];

const HOLD_FLOW = [
  "هنگام ثبت پیش‌فاکتور، سیستم بررسی می‌کند مشتری و کارشناس مانده سرمایه کافی داشته باشند.",
  "اگر کافی باشد، مبلغ پیش‌فاکتور از سرمایه مشتری رزرو می‌شود.",
  "رزرو یعنی مبلغ هنوز خرج نشده، اما برای آن پیش‌فاکتور کنار گذاشته شده است.",
  "با نهایی شدن فروش، مبلغ رزروشده به مصرف‌شده تبدیل می‌شود.",
  "اگر پیش‌فاکتور لغو شود، مبلغ رزروشده آزاد و به مانده برمی‌گردد.",
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

export function CustomerCreditGuide() {
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/sales/customers">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به مشتریان
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/accounting/dynamic-capital">
            <Coins className="ml-2 h-4 w-4" />
            تخصیص سرمایه روزانه
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/sales/credit-rules">
            <Scale className="ml-2 h-4 w-4" />
            قواعد امتیازدهی
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/users">
            <Users className="ml-2 h-4 w-4" />
            کاربران
          </Link>
        </Button>
      </div>

      <PageHeader
        title="آموزش اعتبار مشتریان"
        description="راهنمای کامل ایجاد اعتبار مشتری و تخصیص سرمایه روز، از آماده‌سازی مشتری تا رزرو و مصرف اعتبار در پیش‌فاکتور"
      />

      <Alert>
        <GraduationCap className="h-4 w-4" />
        <AlertTitle>خلاصه مسیر</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          اول مشتری و کارشناس را برای امتیازدهی آماده کنید، بعد سرمایه روز را ثبت کنید تا سیستم
          سهم کارشناسان و مشتریان را محاسبه کند.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideCard index={1} title="آماده‌سازی مشتری برای اعتبار" icon={UserCheck} items={CUSTOMER_PREP} />
        <GuideCard index={2} title="امتیازدهی مشتری" icon={ListChecks} items={CUSTOMER_SCORING} />
        <GuideCard index={3} title="امتیازدهی کارشناسان فروش" icon={Users} items={SALESPERSON_SCORING} />
        <GuideCard index={4} title="ثبت و اجرای سرمایه روز" icon={Coins} items={DAILY_CAPITAL} />
      </div>

      <GuideCard index={5} title="بررسی نتیجه تخصیص‌ها" icon={GraduationCap} items={REVIEW_STEPS} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>بخش {toFaDigits(6)} — دلایل صفر شدن اعتبار یا سرمایه</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ZERO_REASONS.map((reason) => (
              <Badge key={reason} variant="outline" className="text-xs font-normal">
                {reason}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <GuideCard index={7} title="استفاده اعتبار در پیش‌فاکتور" icon={FileText} items={HOLD_FLOW} />

      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">خطای رایج</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          پر بودن اطلاعات مشتری به‌تنهایی کافی نیست. اگر کارشناس امتیاز یا سرمایه نداشته باشد، یا
          سرمایه روز بعد از تغییرات دوباره اجرا نشده باشد، سقف اعتبار مشتری همچنان صفر می‌ماند.
        </AlertDescription>
      </Alert>
    </div>
  );
}
