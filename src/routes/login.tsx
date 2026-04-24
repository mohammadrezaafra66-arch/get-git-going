import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) toast.error("ورود ناموفق", { description: error });
    else {
      toast.success("خوش آمدید");
      navigate({ to: "/dashboard" });
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (signupPassword.length < 6) {
      toast.error("رمز عبور باید حداقل ۶ کاراکتر باشد");
      return;
    }
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName);
    setLoading(false);
    if (error) toast.error("ثبت‌نام ناموفق", { description: error });
    else toast.success("ثبت‌نام انجام شد", { description: "اکنون می‌توانید وارد شوید." });
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
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">ورود</TabsTrigger>
                <TabsTrigger value="signup">ثبت‌نام</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">ایمیل</Label>
                    <Input id="login-email" type="email" required dir="ltr"
                      value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">رمز عبور</Label>
                    <Input id="login-password" type="password" required dir="ltr"
                      value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "در حال ورود..." : "ورود"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">نام و نام خانوادگی</Label>
                    <Input id="signup-name" required maxLength={100}
                      value={signupName} onChange={(e) => setSignupName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">ایمیل</Label>
                    <Input id="signup-email" type="email" required dir="ltr"
                      value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">رمز عبور (حداقل ۶ کاراکتر)</Label>
                    <Input id="signup-password" type="password" required minLength={6} dir="ltr"
                      value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "در حال ثبت‌نام..." : "ایجاد حساب"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    کاربران جدید با نقش «بیننده» ثبت می‌شوند. مدیر می‌تواند بعداً نقش‌ها را تغییر دهد.
                  </p>
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