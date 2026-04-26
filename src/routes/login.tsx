import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const loginInFlight = useRef(false);
  const signupInFlight = useRef(false);
  const resetInFlight = useRef(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  const [resetEmail, setResetEmail] = useState("");

  const translateAuthError = (msg: string | null | undefined): string => {
    if (!msg) return "خطای نامشخص در ورود";
    const m = msg.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid credentials")) {
      return "ایمیل یا رمز عبور اشتباه است.";
    }
    if (m.includes("email not confirmed")) return "ایمیل شما هنوز تأیید نشده است.";
    if (m.includes("rate limit") || m.includes("too many")) {
      return "تعداد تلاش‌ها زیاد است. لحظاتی بعد دوباره تلاش کنید.";
    }
    if (m.includes("network") || m.includes("fetch")) {
      return "خطای شبکه. اتصال اینترنت را بررسی کنید.";
    }
    return msg;
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loginInFlight.current) return;

    // Read directly from the form to capture browser autofill values reliably.
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const email = ((fd.get("email") as string | null) ?? loginEmail).trim();
    const password = (fd.get("password") as string | null) ?? loginPassword;

    setLoginError(null);

    if (!email || !password) {
      setLoginError("لطفاً ایمیل و رمز عبور را وارد کنید.");
      return;
    }

    loginInFlight.current = true;
    setLoginSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        const fa = translateAuthError(error);
        setLoginError(fa);
        toast.error("ورود ناموفق", { description: fa });
        return;
      }
      // Refresh identity so profile/roles are loaded before redirect.
      try { await refreshRoles(); } catch { /* non-blocking */ }
      toast.success("خوش آمدید");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const fa = translateAuthError(err instanceof Error ? err.message : null);
      setLoginError(fa);
      toast.error("ورود ناموفق", { description: fa });
    } finally {
      loginInFlight.current = false;
      setLoginSubmitting(false);
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (signupInFlight.current) return;

    const fd = new FormData(e.currentTarget);
    const email = ((fd.get("email") as string | null) ?? signupEmail).trim();
    const password = (fd.get("password") as string | null) ?? signupPassword;
    const fullName = ((fd.get("full_name") as string | null) ?? signupName).trim();

    setSignupError(null);
    if (password.length < 6) {
      setSignupError("رمز عبور باید حداقل ۶ کاراکتر باشد");
      return;
    }

    signupInFlight.current = true;
    setSignupSubmitting(true);
    try {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        const fa = translateAuthError(error);
        setSignupError(fa);
        toast.error("ثبت‌نام ناموفق", { description: fa });
        return;
      }
      toast.success("ثبت‌نام انجام شد", { description: "اکنون می‌توانید وارد شوید." });
    } finally {
      signupInFlight.current = false;
      setSignupSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetInFlight.current) return;

    const fd = new FormData(e.currentTarget);
    const email = ((fd.get("email") as string | null) ?? resetEmail).trim();
    setResetError(null);
    setResetSent(false);

    if (!email) {
      setResetError("لطفاً ایمیل حساب مدیر را وارد کنید.");
      return;
    }

    resetInFlight.current = true;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        const fa = translateAuthError(error.message);
        setResetError(fa);
        toast.error("ارسال لینک بازیابی ناموفق بود", { description: fa });
        return;
      }
      setResetSent(true);
      toast.success("لینک بازیابی ارسال شد", { description: "ایمیل خود و پوشه Spam را بررسی کنید." });
    } finally {
      resetInFlight.current = false;
    }
  };

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-primary/5 via-background to-accent/10 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">دستیار هوشمند افراکالا</h1>
          <p className="mt-1 text-sm text-muted-foreground">سامانه یکپارچه مدیریت سازمانی</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ورود به حساب</CardTitle>
            <CardDescription>برای دسترسی به سامانه وارد شوید یا ثبت‌نام کنید.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" dir="rtl">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">ورود</TabsTrigger>
                <TabsTrigger value="signup">ثبت‌نام</TabsTrigger>
                <TabsTrigger value="reset">بازیابی رمز</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">ایمیل</Label>
                    <Input id="login-email" name="email" type="email" required dir="ltr"
                      autoComplete="email"
                      value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">رمز عبور</Label>
                    <Input id="login-password" name="password" type="password" required dir="ltr"
                      autoComplete="current-password"
                      value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                  </div>
                  {loginError && (
                    <p className="text-sm text-destructive" role="alert">{loginError}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={loginSubmitting} aria-busy={loginSubmitting}>
                    {loginSubmitting ? "در حال ورود..." : "ورود"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">نام و نام خانوادگی</Label>
                    <Input id="signup-name" name="full_name" required maxLength={100}
                      autoComplete="name"
                      value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">ایمیل</Label>
                    <Input id="signup-email" name="email" type="email" required dir="ltr"
                      autoComplete="email"
                      value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">رمز عبور (حداقل ۶ کاراکتر)</Label>
                    <Input id="signup-password" name="password" type="password" required minLength={6} dir="ltr"
                      autoComplete="new-password"
                      value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                  </div>
                  {signupError && (
                    <p className="text-sm text-destructive" role="alert">{signupError}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={signupSubmitting} aria-busy={signupSubmitting}>
                    {signupSubmitting ? "در حال ثبت‌نام..." : "ایجاد حساب"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    کاربران جدید با نقش «بیننده» ثبت می‌شوند. مدیر می‌تواند بعداً نقش‌ها را تغییر دهد.
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="reset">
                <form onSubmit={handlePasswordReset} className="space-y-4" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">ایمیل حساب مدیر</Label>
                    <Input
                      id="reset-email"
                      name="email"
                      type="email"
                      required
                      dir="ltr"
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  {resetError && (
                    <p className="text-sm text-destructive" role="alert">{resetError}</p>
                  )}
                  {resetSent && (
                    <p className="text-sm text-muted-foreground" role="status">
                      لینک تنظیم رمز جدید ارسال شد. بعد از باز کردن لینک، رمز جدید را در صفحه بعد وارد کنید.
                    </p>
                  )}
                  <Button type="submit" className="w-full" aria-busy={resetInFlight.current}>
                    {resetInFlight.current ? "در حال ارسال..." : "ارسال لینک تنظیم رمز"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">بازگشت به خانه</Link>
        </p>
      </div>
    </div>
  );
}