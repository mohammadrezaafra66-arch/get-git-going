import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Coins,
  FileText,
  GraduationCap,
  ListChecks,
  Scale,
  Users,
} from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

// Item 141.3 — end-to-end guide for the capital and credit allocation flow.
export const Route = createFileRoute("/_app/sales_/customers_/credit-allocation-guide")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: CreditAllocationGuidePage,
});

const SCORING_RULES = [
  "قواعد امتیازدهی تعیین می‌کنند هر پارامتر چقدر در امتیاز نهایی اثر دارد.",
  "هر پارامتر باید فعال باشد و وزن معتبر برای دورهٔ جاری داشته باشد.",
  "مجموع وزن پارامترهای فعال هر نوع موجودیت باید برابر یک باشد.",
  "اگر وزن‌ها برای ماه جاری معتبر نباشند، امتیاز وزنی صفر می‌شود.",
];

const SALESPERSON_SCORING = [
  "برای هر کارشناس فروش باید پارامترهای امتیازدهی ثبت شود.",
  "امتیاز کارشناس تعیین می‌کند چه سهمی از سرمایه کل روز به او می‌رسد.",
  "اگر امتیاز کارشناس صفر باشد، هیچ سرمایه‌ای به او تخصیص نمی‌یابد.",
  "اگر هیچ کارشناسی امتیاز نداشته باشد، کل تخصیص صفر می‌شود.",
];

const CUSTOMER_SCORING = [
  "برای هر مشتری باید پارامترهای امتیازدهی وارد و ذخیره شود.",
  "امتیاز مشتری تعیین می‌کند چه سهمی از سرمایه کارشناس مسئولش به او می‌رسد.",
  "هر مشتری باید کارشناس مسئول داشته باشد، وگرنه در تقسیم شرکت داده نمی‌شود.",
  "فقط پر کردن فرم کافی نیست؛ باید دکمهٔ ذخیرهٔ هر پارامتر زده شود.",
];

const DAILY_CAPITAL = [
  "حسابدار سرمایه کل روز را در صفحهٔ تخصیص سرمایه روزانه وارد می‌کند.",
  "برای هر تاریخ فقط یک snapshot ثبت می‌شود.",
  "اگر سرمایه روز ثبت نشود، سقف اعتبار هیچ مشتری‌ای محاسبه نمی‌شود.",
  "برای اصلاح یک تاریخ، snapshot موجود باید بازنویسی شود.",
];

const REVIEW_STEPS = [
  "بعد از اجرای محاسبه، جدول تخصیص هر کارشناس را ببینید.",
  "روی هر کارشناس کلیک کنید تا مشتریان و سقف نهایی هرکدام نمایش داده شود.",
  "ستون قید نشان می‌دهد چرا سقف یک مشتری محدود شده است.",
  "هشدارهای بالای صفحه، علت صفر بودن تخصیص را فهرست می‌کنند.",
];

const ZERO_REASONS = [
  "سرمایه روز ثبت نشده است",
  "پارامتر امتیازدهی کارشناس تعریف نشده",
  "امتیاز کارشناس صفر است",
  "امتیاز مشتری صفر است",
  "مشتری کارشناس مسئول ندارد",
  "وزن پارامترها برای ماه جاری معتبر نیست",
  "مشتری بدهی معوق دارد",
  "تخصیص سرمایه بعد از تغییرات دوباره اجرا نشده",
];

const HOLD_FLOW = [
  "وقتی پیش‌فاکتور ثبت می‌شود، مبلغ آن از سرمایه در دسترس مشتری «رزرو» می‌شود.",
  "رزرو یعنی مبلغ هنوز خرج نشده ولی برای این پیش‌فاکتور کنار گذاشته شده است.",
  "با تسویه شدن پیش‌فاکتور، مبلغ رزروشده به «مصرف‌شده» تبدیل می‌شود.",
  "اگر پیش‌فاکتور لغو شود، مبلغ رزروشده آزاد و به مانده برمی‌گردد.",
  "مانده = تخصیص − رزرو − مصرف‌شده.",
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
  icon: typeof Coins;
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

function CreditAllocationGuidePage() {
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
          <Link to="/sales/customers/credit-training">
            <FileText className="ml-2 h-4 w-4" />
            آموزش ایجاد اعتبار
          </Link>
        </Button>
      </div>

      <PageHeader
        title="آموزش تخصیص اعتبار"
        description="از تعریف قواعد امتیازدهی تا رزرو و مصرف سرمایه توسط پیش‌فاکتورها"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideCard index={1} title="قواعد امتیازدهی" icon={Scale} items={SCORING_RULES} />
        <GuideCard index={2} title="امتیازدهی کارشناسان" icon={Users} items={SALESPERSON_SCORING} />
        <GuideCard index={3} title="امتیازدهی مشتریان" icon={ListChecks} items={CUSTOMER_SCORING} />
        <GuideCard index={4} title="ثبت سرمایه روزانه" icon={Coins} items={DAILY_CAPITAL} />
      </div>

      <GuideCard index={5} title="بررسی تخصیص‌ها" icon={GraduationCap} items={REVIEW_STEPS} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>بخش {toFaDigits(6)} — چرا اعتبار یا سرمایه صفر می‌شود</span>
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

      <GuideCard
        index={7}
        title="رزرو و مصرف سرمایه توسط پیش‌فاکتور"
        icon={FileText}
        items={HOLD_FLOW}
      />

      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">خطای رایج</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          ممکن است همهٔ پارامترهای مشتری پر شده باشد، اما چون سرمایه روز ثبت نشده یا امتیاز کارشناس
          مسئول صفر است، سقف اعتبار مشتری همچنان صفر بماند. همیشه از بالا به پایین بررسی کنید: اول
          سرمایه روز، بعد امتیاز کارشناس، بعد امتیاز مشتری.
        </AlertDescription>
      </Alert>
    </div>
  );
}
