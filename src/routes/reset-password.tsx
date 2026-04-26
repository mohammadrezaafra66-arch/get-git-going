import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    if (password !== confirmPassword) {
      setError("تکرار رمز عبور با رمز جدید یکسان نیست.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("لینک بازیابی نامعتبر یا منقضی شده است. لطفاً دوباره لینک بازیابی بگیرید.");
        toast.error("تنظیم رمز ناموفق بود");
        return;
      }

      setDone(true);
      toast.success("رمز عبور با موفقیت تغییر کرد");
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/login" }), 1200);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-primary/5 via-background to-accent/10 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            {done ? <CheckCircle2 className="h-7 w-7" /> : <KeyRound className="h-7 w-7" />}
          </div>
          <CardTitle>تنظیم رمز جدید</CardTitle>
          <CardDescription>رمز جدید حساب خود را وارد کنید.</CardDescription>
        </CardHeader>
        <CardContent>
          {checkingSession ? (
            <p className="text-center text-sm text-muted-foreground">در حال بررسی لینک بازیابی...</p>
          ) : !hasRecoverySession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                لینک بازیابی معتبر نیست یا منقضی شده است. از صفحه ورود دوباره لینک تنظیم رمز دریافت کنید.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">بازگشت به ورود</Link>
              </Button>
            </div>
          ) : done ? (
            <p className="text-center text-sm text-muted-foreground">رمز تغییر کرد؛ در حال انتقال به صفحه ورود...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="new-password">رمز جدید</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">تکرار رمز جدید</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting}>
                {submitting ? "در حال ذخیره..." : "ذخیره رمز جدید"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}