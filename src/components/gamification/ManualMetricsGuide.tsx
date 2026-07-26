import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  Scale,
  Sparkles,
  ToggleLeft,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toFaDigits } from "@/lib/i18n/formatters";

const WHAT_IS_IT = [
  "این فرم، عملکرد یک کارشناس در یک روز مشخص را ثبت می‌کند: مبلغ فروش، مبلغ سود، تعداد تماس ورودی و خروجی، و دقایق مکالمه.",
  "برای هر ترکیب «کارشناس + تاریخ» فقط یک رکورد وجود دارد؛ اگر رکوردی از قبل باشد، ثبت دوباره همان رکورد را ویرایش می‌کند (بَج «رکورد موجود — ویرایش می‌شود» را می‌بینید).",
  "بلافاصله بعد از ذخیره، امتیاز کارشناس دوباره حساب می‌شود و لیدربرد و تحلیل‌ها تازه می‌شوند.",
  "این داده‌ها ورودی خام گیمیفیکیشن‌اند؛ خودشان امتیاز نیستند. امتیاز از ضرب هر عدد در وزن آن متریک به‌دست می‌آید.",
];

const EDIT_WINDOW = [
  "ثبت و ویرایش فقط برای امروز و تا ۵ روز گذشته باز است.",
  "برای تاریخ آینده اصلاً ثبت انجام نمی‌شود — فرم قفل می‌شود.",
  "بعد از ۵ روز فرم برای کاربر عادی قفل می‌شود تا آمار گذشته دستکاری نشود.",
  "فقط مدیر سیستم (admin) می‌تواند رکوردهای قدیمی‌تر از ۵ روز را اصلاح کند؛ در آن حالت بَج «اصلاح مدیریتی» نمایش داده می‌شود.",
  "بَج کنار تاریخ همیشه وضعیت فعلی را می‌گوید: «قابل ویرایش»، «خارج از بازهٔ مجاز»، یا «تاریخ آینده».",
];

const SALES_SOURCE = [
  "سوییچ «منبع محاسبهٔ فروش کارشناسان» تعیین می‌کند مبلغ فروش از کجا خوانده شود.",
  "حالت «دستی»: مبلغ فروش همان است که در این صفحه وارد می‌کنید. برای جبران روزهای گذشته از همین فرم استفاده کنید.",
  "حالت «خودکار»: مبلغ فروش از پیش‌فاکتورهای پذیرفته‌شده محاسبه می‌شود و عددی که اینجا وارد کرده‌اید نادیده گرفته می‌شود — ولی حذف نمی‌شود. اگر دوباره به حالت دستی برگردید، همان عدد قبلی برمی‌گردد.",
  "در حالت خودکار، فیلد «مبلغ فروش» غیرفعال (خاکستری) می‌شود؛ این یعنی سوییچ روی خودکار است، نه اینکه دسترسی ندارید.",
  "سود همیشه دستی است، چون پیش‌فاکتور بهای تمام‌شده را ذخیره نمی‌کند. تماس‌ها و دقایق مکالمه هم در هر دو حالت دستی هستند.",
  "تغییر این سوییچ فقط از دست مدیر سیستم یا حسابدار برمی‌آید و روی امتیاز همهٔ کارشناسان اثر می‌گذارد.",
];

const WEIGHTS = [
  "وزن هر متریک در صفحهٔ «تنظیمات KPI گیمیفیکیشن» تنظیم می‌شود (فقط مدیر سیستم).",
  "امتیاز هر متریک ≈ مقدار واردشده × وزن آن متریک. پس وزن بزرگ‌تر یعنی اثر بیشتر روی رتبه.",
  "متریک‌های پولی (فروش و سود) وزن بسیار کوچکی دارند چون عددشان بزرگ است؛ متریک‌های شمارشی (تماس) وزن بزرگ‌تری دارند. این عمدی است تا مقیاس‌ها هم‌تراز بمانند.",
  "اگر متریکی در تنظیمات غیرفعال (disabled) باشد، هرچقدر هم مقدار وارد کنید امتیازی تولید نمی‌کند.",
  "بعد از تغییر وزن‌ها، امتیازها با ثبت بعدی یا بازخوانی لیدربرد به‌روز می‌شوند.",
];

const COMMON_MISTAKES = [
  "وارد کردن فروش در حالت خودکار — عدد ذخیره می‌شود ولی در امتیاز اثر ندارد",
  "انتظار تغییر امتیاز بدون فعال بودن متریک در تنظیمات KPI",
  "تلاش برای ثبت روزهای قدیمی‌تر از ۵ روز بدون دسترسی مدیر",
  "ثبت سود به‌عنوان همان مبلغ فروش (سود = فروش منهای بهای تمام‌شده)",
  "وارد کردن دقایق مکالمه به‌صورت ساعت به‌جای دقیقه",
];

const STEPS = [
  "کارشناس را از فهرست انتخاب کنید.",
  "تاریخ را با تقویم شمسی انتخاب کنید و بَج وضعیت ویرایش را چک کنید.",
  "اگر رکورد قبلی وجود داشته باشد، فرم خودکار با مقادیر همان رکورد پر می‌شود.",
  "مقادیر را وارد کنید؛ فیلدهای پولی به تومان و دقایق مکالمه به دقیقه است.",
  "در صورت نیاز توضیح یک‌خطی بنویسید تا بعداً دلیل عدد مشخص باشد.",
  "دکمهٔ «ثبت و به‌روزرسانی امتیاز» را بزنید.",
  "در جدول «رکوردهای اخیر» روی هر ردیف کلیک کنید تا همان تاریخ در فرم باز شود.",
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

export function ManualMetricsGuide() {
  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/gamification/admin/manual-metrics">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به فرم ثبت عملکرد
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/gamification/settings">
            <Scale className="ml-2 h-4 w-4" />
            تنظیمات وزن KPI
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/gamification">
            <Trophy className="ml-2 h-4 w-4" />
            لیدربرد و گیمیفیکیشن
          </Link>
        </Button>
      </div>

      <PageHeader
        title="راهنمای ثبت دستی عملکرد روزانه"
        description="این صفحه به زبان ساده توضیح می‌دهد فرم متریک دستی چه می‌کند، بازهٔ ۵ روزهٔ ویرایش چطور کار می‌کند، سوییچ خودکار/دستی فروش چه اثری دارد، و وزن هر متریک کجا تنظیم می‌شود."
      />

      <Alert>
        <GraduationCap className="h-4 w-4" />
        <AlertTitle>خلاصه در یک جمله</AlertTitle>
        <AlertDescription className="text-sm leading-7">
          شما «عدد خام» یک روز را ثبت می‌کنید؛ سیستم آن را در «وزن» همان متریک ضرب می‌کند و نتیجه،
          امتیاز کارشناس در لیدربرد می‌شود.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <GuideCard
          index={1}
          title="این فرم چیست و چه می‌کند"
          icon={ClipboardList}
          items={WHAT_IS_IT}
        />
        <GuideCard index={2} title="بازهٔ ویرایش ۵ روزه" icon={CalendarClock} items={EDIT_WINDOW} />
        <GuideCard
          index={3}
          title="سوییچ خودکار/دستی فروش"
          icon={ToggleLeft}
          items={SALES_SOURCE}
        />
        <GuideCard index={4} title="وزن متریک‌ها و اثرشان بر امتیاز" icon={Scale} items={WEIGHTS} />
      </div>

      <GuideCard index={5} title="مسیر گام‌به‌گام ثبت" icon={Sparkles} items={STEPS} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>بخش {toFaDigits(6)} — خطاهای رایج</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {COMMON_MISTAKES.map((m) => (
              <Badge key={m} variant="outline" className="text-xs font-normal">
                {m}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">
          چرا امتیاز تغییر نکرد؟
        </AlertTitle>
        <AlertDescription className="text-sm leading-7">
          سه دلیل شایع: متریک در تنظیمات KPI غیرفعال است؛ سوییچ فروش روی «خودکار» است و عدد دستی
          نادیده گرفته می‌شود؛ یا وزن آن متریک صفر است. ابتدا صفحهٔ تنظیمات وزن KPI را بررسی کنید.
        </AlertDescription>
      </Alert>
    </div>
  );
}
