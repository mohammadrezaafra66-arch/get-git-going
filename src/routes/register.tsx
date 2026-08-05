import { createFileRoute, isRedirect, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthReady } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  DynamicProfileFields,
  type DynamicValues,
} from "@/components/profile/DynamicProfileFields";
import { fetchActiveProfileFields, saveProfileFieldValues } from "@/lib/profile-fields/queries";
import { BRANDING, getPageTitle } from "@/config/branding";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    try {
      const auth = await ensureAuthReady();
      if (auth.user) throw redirect({ to: "/dashboard" });
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error("[register] beforeLoad auth check failed", err);
    }
  },
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: getPageTitle("ثبت‌نام") },
      {
        name: "description",
        content: `ایجاد حساب کاربری در ${BRANDING.platformName}؛ دسترسی به ابزارهای مدیریت محصول، قیمت و فروش.`,
      },
      { property: "og:title", content: getPageTitle("ثبت‌نام") },
      {
        property: "og:description",
        content: `ایجاد حساب کاربری در ${BRANDING.platformName}؛ دسترسی به ابزارهای مدیریت محصول، قیمت و فروش.`,
      },
      { property: "og:url", content: `${BRANDING.publicOrigin}/register` },
      { name: "twitter:title", content: getPageTitle("ثبت‌نام") },
      {
        name: "twitter:description",
        content: `ایجاد حساب کاربری در ${BRANDING.platformName}؛ دسترسی به ابزارهای مدیریت محصول، قیمت و فروش.`,
      },
    ],
    links: [{ rel: "canonical", href: `${BRANDING.publicOrigin}/register` }],
  }),
});

const schema = z.object({
  first_name: z.string().trim().min(2, "نام حداقل ۲ کاراکتر").max(50),
  last_name: z.string().trim().min(2, "نام خانوادگی حداقل ۲ کاراکتر").max(50),
  phone: z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09121234567)"),
  email: z.string().trim().email("ایمیل معتبر نیست").max(255),
  position_proposed: z.string().trim().max(100).optional().or(z.literal("")),
  password: z
    .string()
    .min(8, "رمز عبور حداقل ۸ کاراکتر")
    .regex(/[A-Za-z]/, "رمز باید حداقل یک حرف داشته باشد")
    .regex(/\d/, "رمز باید حداقل یک عدد داشته باشد"),
});

function RegisterPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    position_proposed: "",
    password: "",
  });
  const [dynValues, setDynValues] = useState<DynamicValues>({});
  const { data: dynFields = [] } = useQuery({
    queryKey: ["profile-fields-register"],
    queryFn: () => fetchActiveProfileFields({ registerOnly: true }),
  });

  const upd = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0]);
        if (!errs[k]) errs[k] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const fullName = `${parsed.data.first_name} ${parsed.data.last_name}`.trim();
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
          data: {
            full_name: fullName,
            phone: parsed.data.phone,
            position_proposed: parsed.data.position_proposed || null,
          },
        },
      });
      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes("already") || m.includes("registered")) {
          setErrors({ email: "این ایمیل قبلاً ثبت شده است." });
          toast.error("ثبت‌نام ناموفق", { description: "این ایمیل قبلاً ثبت شده است." });
        } else {
          toast.error("ثبت‌نام ناموفق", { description: error.message });
        }
        return;
      }
      // Save dynamic profile field values while we still have a session
      const newUserId = signUpData?.user?.id;
      if (newUserId && Object.keys(dynValues).length > 0) {
        try {
          await saveProfileFieldValues(newUserId, dynValues);
        } catch (e) {
          console.warn("[register] failed to save dynamic fields", e);
        }
      }
      // Sign out in case Supabase auto-created a session (so user must wait for approval).
      await supabase.auth.signOut();
      toast.success("ثبت‌نام شما با موفقیت انجام شد. پس از تأیید مدیر، حساب شما فعال خواهد شد.");
      navigate({ to: "/login" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-gradient-to-bl from-primary/5 via-background to-accent/10 px-4 py-8"
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ثبت‌نام در سامانه</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            پس از ثبت‌نام، حساب شما توسط مدیر بررسی و فعال می‌شود.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>ایجاد حساب جدید</CardTitle>
            <CardDescription>اطلاعات زیر را با دقت کامل کنید.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="first_name">نام</Label>
                  <Input
                    id="first_name"
                    value={form.first_name}
                    onChange={(e) => upd("first_name", e.target.value)}
                  />
                  {errors.first_name && (
                    <p className="text-xs text-destructive">{errors.first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">نام خانوادگی</Label>
                  <Input
                    id="last_name"
                    value={form.last_name}
                    onChange={(e) => upd("last_name", e.target.value)}
                  />
                  {errors.last_name && (
                    <p className="text-xs text-destructive">{errors.last_name}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">شماره موبایل</Label>
                <Input
                  id="phone"
                  dir="ltr"
                  placeholder="09xxxxxxxxx"
                  value={form.phone}
                  onChange={(e) => upd("phone", e.target.value)}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">ایمیل</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => upd("email", e.target.value)}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="position_proposed">سمت پیشنهادی (اختیاری)</Label>
                <Input
                  id="position_proposed"
                  value={form.position_proposed}
                  onChange={(e) => upd("position_proposed", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">رمز عبور (حداقل ۸ کاراکتر، شامل حروف و عدد)</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={form.password}
                  onChange={(e) => upd("password", e.target.value)}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
              {dynFields.length > 0 && (
                <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">اطلاعات تکمیلی</p>
                  <DynamicProfileFields
                    fields={dynFields}
                    values={dynValues}
                    onChange={(name, value) => setDynValues((s) => ({ ...s, [name]: value }))}
                    registerMode
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting}>
                {submitting ? "در حال ثبت‌نام..." : "ثبت‌نام"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                حساب دارید؟{" "}
                <Link to="/login" className="text-primary">
                  ورود
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
