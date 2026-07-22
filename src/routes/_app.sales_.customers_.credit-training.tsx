import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Coins,
  GraduationCap,
  ListChecks,
  Scale,
  UserCheck,
} from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

// مورد ۱۳۳.۱ — صفحهٔ آموزش ایجاد اعتبار. دسترسی هم‌سطح صفحهٔ مشتریان.
export const Route = createFileRoute("/_app/sales_/customers_/credit-training")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: CreditTrainingPage,
});

const PREREQUISITES = [
  "مشتری باید فعال باشد.",
  "مشتری باید کارشناس مسئول داشته باشد.",
  "اطلاعات پایهٔ مشتری درست ثبت شده باشد.",
  "اگر مشتری بدهی معوق داشته باشد، سقف اعتبار صفر می‌شود.",
];

const SCORING_STEPS = [
  "وارد صفحهٔ اعتبار مشتری شوید.",
  "بخش «امتیازدهی پویا — ماه جاری» را کامل کنید.",
  "برای هر پارامتر مقدار مناسب وارد کنید.",
  "هر مقدار باید ذخیره شود.",
];

const WEIGHT_RULES = [
  "هر پارامتر باید وزن فعال داشته باشد.",
  "اگر وزن‌ها برای دورهٔ فعلی معتبر نباشند، امتیاز وزنی صفر می‌شود.",
  "تاریخ اعتبار وزن‌ها باید با ماه محاسبه هماهنگ باشد.",
  "اگر مجموع وزن‌های فعال صفر باشد، سقف اعتبار محاسبه نمی‌شود.",
];

const CAPITAL_RULES = [
  "بعد از ثبت امتیازها و وزن‌ها باید تخصیص سرمایه روزانه اجرا شود.",
  "سرمایه ابتدا بین کارشناسان فروش تقسیم می‌شود.",
  "سپس سهم مشتریان هر کارشناس محاسبه می‌شود.",
  "اگر سرمایهٔ تخصیص‌یافته به کارشناس صفر باشد، اعتبار مشتری هم صفر می‌شود.",
];

const ZERO_REASONS = [
  "بدهی معوق",
  "نداشتن کارشناس مسئول",
  "صفر بودن سرمایهٔ کارشناس مسئول",
  "صفر بودن امتیاز وزنی",
  "نامعتبر بودن وزن پارامترها برای ماه جاری",
  "اجرا نشدن مجدد تخصیص سرمایه بعد از تغییرات",
  "ساخته نشدن رکورد تخصیص اعتبار برای مشتری",
];

const SUGGESTED_PATH = [
  "مشتری را ایجاد یا ویرایش کنید.",
  "کارشناس مسئول را مشخص کنید.",
  "وارد صفحهٔ اعتبار مشتری شوید.",
  "همهٔ پارامترهای امتیازدهی را وارد و ذخیره کنید.",
  "وزن پارامترها را بررسی کنید.",
  "تخصیص سرمایه روزانه را اجرا کنید.",
  "صفحهٔ اعتبار مشتری را refresh کنید.",
  "بخش «سقف اعتبار — محاسبه زنده» را بررسی کنید.",
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

function CreditTrainingPage() {
  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/sales/customers">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به مشتریان
          </Link>
        </Button>
      </div>

      <PageHeader
        title="آموزش ایجاد اعتبار برای مشتریان"
        description="در این صفحه مراحل لازم برای اینکه سقف اعتبار مشتری به‌درستی محاسبه شود توضیح داده شده است."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4 text-primary" />
              <span>بخش {toFaDigits(1)} — پیش‌نیازهای مشتری</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={PREREQUISITES} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              <span>بخش {toFaDigits(2)} — ثبت پارامترهای امتیازدهی</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BulletList items={SCORING_STEPS} />
            <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">توجه</AlertTitle>
              <AlertDescription className="text-xs leading-6">
                فقط پر کردن فرم کافی نیست؛ باید دکمهٔ ذخیرهٔ هر پارامتر زده شود.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-primary" />
              <span>بخش {toFaDigits(3)} — تنظیم وزن پارامترها</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={WEIGHT_RULES} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" />
              <span>بخش {toFaDigits(4)} — تخصیص سرمایه روزانه</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BulletList items={CAPITAL_RULES} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>بخش {toFaDigits(5)} — دلایل صفر شدن اعتبار</span>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-primary" />
            <span>بخش {toFaDigits(6)} — مسیر پیشنهادی</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm leading-7">
            {SUGGESTED_PATH.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {toFaDigits(i + 1)}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">
          بخش {toFaDigits(7)} — خطای رایج
        </AlertTitle>
        <AlertDescription className="text-sm leading-7">
          ممکن است همهٔ فیلدهای مشتری پر شده باشند، اما چون وزن‌ها برای دورهٔ فعلی معتبر نیستند یا
          سرمایهٔ کارشناس صفر است، سقف اعتبار همچنان صفر نمایش داده شود.
        </AlertDescription>
      </Alert>
    </div>
  );
}
