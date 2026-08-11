import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, ShoppingCart, ShieldAlert, FileCheck, FileText, Trophy, type LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import type { AppRole } from "@/lib/rbac/roles";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  useUnreadMessagesCount,
  usePendingPurchaseCount,
  useActivePenaltyCount,
  usePendingReceiptCount,
  usePendingDocCount,
  useGamificationBadgeCount,
} from "@/hooks/collaboration/useHubCounts";

function toPersianDigits(n: number): string {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
}

interface HubItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  badge: number;
  allowedRoles: AppRole[];
}

function CollaborationPage() {
  const { user, roles } = useAuth();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email ||
    "همکار گرامی";
  const today = formatJalaliDateTime(new Date().toISOString()).split(" ")[0];

  const unread = useUnreadMessagesCount();
  const purchase = usePendingPurchaseCount().data ?? 0;
  const penalty = useActivePenaltyCount().data ?? 0;
  const receipts = usePendingReceiptCount().data ?? 0;
  const docs = usePendingDocCount().data ?? 0;
  const gamification = useGamificationBadgeCount();

  const items: HubItem[] = [
    {
      to: "/messages",
      label: "پیام‌ها",
      description: "گفتگوهای تیمی و خصوصی",
      icon: MessageSquare,
      gradient: "from-blue-500 to-blue-600",
      badge: unread,
      allowedRoles: ["admin", "manager", "sales", "accountant", "viewer"],
    },
    {
      to: "/purchase",
      label: "فضای خرید",
      description: "درخواست و پیگیری خرید",
      icon: ShoppingCart,
      gradient: "from-emerald-500 to-emerald-600",
      badge: purchase,
      allowedRoles: ["admin", "manager", "sales"],
    },
    {
      to: "/my-penalties",
      label: "کارت‌های قرمز من",
      description: "تخلف‌ها و اعتراض‌ها",
      icon: ShieldAlert,
      gradient: "from-red-500 to-red-600",
      badge: penalty,
      allowedRoles: ["admin", "manager", "sales", "accountant"],
    },
    {
      to: "/delivery-receipts",
      label: "رسیدهای تحویل",
      description: "آپلود و تأیید رسیدها",
      icon: FileCheck,
      gradient: "from-violet-500 to-violet-600",
      badge: receipts,
      allowedRoles: ["admin", "manager", "sales"],
    },
    {
      to: "/documents",
      label: "اسناد",
      description: "بیجک، فاکتور و حواله",
      icon: FileText,
      gradient: "from-amber-500 to-amber-600",
      badge: docs,
      allowedRoles: ["admin", "manager", "accountant"],
    },
    {
      to: "/gamification",
      label: "امتیازها",
      description: "رتبه‌بندی و نشان‌های تیم",
      icon: Trophy,
      gradient: "from-yellow-500 to-amber-600",
      badge: gamification,
      allowedRoles: ["admin", "manager", "sales", "accountant", "viewer"],
    },
  ];

  const visibleItems = items.filter((item) =>
    roles.some((role) => item.allowedRoles.includes(role as AppRole))
  );

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-8rem)] -m-4 p-4 md:p-8 rounded-lg"
      style={{
        background:
          "linear-gradient(135deg, rgba(18,50,86,0.08), rgba(15,118,110,0.08))",
      }}
    >
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          سلام، {displayName} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">امروز: {today}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br ${item.gradient} bg-opacity-10 p-4 md:p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
              style={{
                backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))`,
              }}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-10 pointer-events-none`}
              />
              <div className="relative flex flex-col items-start gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-white shadow-md`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-base md:text-lg font-bold text-foreground">
                    {item.label}
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    {item.description}
                  </p>
                </div>
              </div>
              {item.badge > 0 && (
                <span className="absolute top-3 left-3 inline-flex min-w-[1.5rem] h-6 items-center justify-center rounded-full bg-red-600 px-2 text-xs font-bold text-white shadow">
                  {toPersianDigits(item.badge)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/collaboration")({
  beforeLoad: async () => {
    await requirePermission("messages", "view");
  },
  component: CollaborationPage,
});