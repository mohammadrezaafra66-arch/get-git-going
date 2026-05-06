import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";
import { initCacheBuster, forceHardReload } from "@/lib/cache-buster";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">۴۰۴</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">صفحه یافت نشد</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          صفحه‌ای که به دنبال آن هستید وجود ندارد یا منتقل شده است.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            بازگشت به خانه
          </Link>
        </div>
      </div>
    </div>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-lg font-semibold text-foreground">خطا در بارگذاری برنامه</h1>
        <p className="text-sm text-muted-foreground">
          مشکلی هنگام بارگذاری رخ داد. لطفاً دوباره تلاش کنید.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            تلاش دوباره
          </button>
          <Link to="/login" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
            ورود
          </Link>
        </div>
      </div>
    </div>
  );
}

class AuthErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    logAuthDiagnostic("AuthProvider.boundary", error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
    });
    // Auto-recover from stale-chunk errors after a deploy
    const msg = `${error.name}: ${error.message}`;
    if (
      /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|Unable to preload CSS|MIME type \("text\/html"\)/i.test(
        msg,
      )
    ) {
      void forceHardReload(`AuthErrorBoundary: ${msg}`);
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-lg font-semibold text-foreground">خطا در سیستم احراز هویت</h1>
            <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { this.setState({ error: null }); }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                تلاش دوباره
              </button>
              <Link to="/login" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground">
                ورود
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "دستیار هوشمند افراکالا" },
      { name: "description", content: "سامانه یکپارچه مدیریت محصولات، قیمت‌گذاری، فروش و فاکتور افراکالا." },
      { property: "og:title", content: "دستیار هوشمند افراکالا" },
      { property: "og:description", content: "سامانه یکپارچه مدیریت محصولات، قیمت‌گذاری، فروش و فاکتور افراکالا." },
      { property: "og:type", content: "website" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preload",
        href: "/fonts/vazirmatn/Vazirmatn-400.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/vazirmatn/Vazirmatn-500.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/vazirmatn/Vazirmatn-700.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })
  );
  useEffect(() => {
    initCacheBuster();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthErrorBoundary>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </AuthErrorBoundary>
    </QueryClientProvider>
  );
}
