import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/unauthorized")({
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">دسترسی غیرمجاز</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          شما اجازه دسترسی به این بخش را ندارید. در صورت نیاز با مدیر سامانه تماس بگیرید.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            بازگشت به داشبورد
          </Link>
        </div>
      </div>
    </div>
  );
}
