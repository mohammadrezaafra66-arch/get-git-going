import { Card, CardContent } from "@/components/ui/card";
import { Clock, ShieldX, ShieldCheck } from "lucide-react";

interface Props {
  status: "pending" | "rejected" | "loading";
}

export function BoardAccessPendingState({ status }: Props) {
  if (status === "loading") {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Clock className="h-10 w-10 animate-pulse text-muted-foreground" />
          <div className="text-sm text-muted-foreground">در حال بررسی دسترسی شما...</div>
        </CardContent>
      </Card>
    );
  }

  if (status === "rejected") {
    return (
      <Card className="mx-auto max-w-2xl border-destructive/30">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldX className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">دسترسی تأیید نشد</h2>
          <p className="text-sm text-muted-foreground">
            درخواست دسترسی شما به تابلوی قیمت امین حضور تأیید نشد.
            <br />
            برای پیگیری با مدیریت تماس بگیرید.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl border-primary/30">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <ShieldCheck className="h-12 w-12 text-primary" />
        <h2 className="text-xl font-bold">درخواست دسترسی شما ثبت شد</h2>
        <p className="text-sm text-muted-foreground">
          درخواست دسترسی شما به تابلوی قیمت امین حضور ثبت شد.
          <br />
          پس از بررسی و تأیید هویت توسط مدیریت، دسترسی شما فعال می‌شود.
        </p>
        <p className="text-xs text-muted-foreground">
          در صورت نیاز، مدیریت از طریق اطلاعات ثبت‌شده با شما تماس خواهد گرفت.
        </p>
      </CardContent>
    </Card>
  );
}
