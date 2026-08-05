import "@/lib/polyfills/crypto-uuid";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";
import { initCacheBuster, forceHardReload } from "@/lib/cache-buster";
import { registerServiceWorker } from "@/lib/pwa/register-sw";

import appCss from "../styles.css?url";
import { BRANDING, getPageTitle } from "@/config/branding";

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
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            تلاش دوباره
          </button>
          <button
            onClick={() => {
              void forceHardReload("manual: RootError");
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            رفرش کامل و پاک‌سازی کش
          </button>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
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
            <p className="text-sm text-muted-foreground">
              خطا در بارگذاری سیستم احراز هویت. لطفاً صفحه را رفرش کنید.
            </p>
            {import.meta.env.DEV && (
              <pre
                className="text-xs text-muted-foreground/70 whitespace-pre-wrap text-left"
                dir="ltr"
              >
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  this.setState({ error: null });
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                تلاش دوباره
              </button>
              <button
                onClick={() => {
                  void forceHardReload("manual: AuthBoundary");
                }}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
              >
                رفرش کامل و پاک‌سازی کش
              </button>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
              >
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
      { title: getPageTitle() },
      {
        name: "description",
        content: BRANDING.metaDescriptionFa,
      },
      { property: "og:title", content: BRANDING.defaultTitle },
      {
        property: "og:description",
        content: BRANDING.metaDescriptionFa,
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: BRANDING.platformName },
      { property: "og:locale", content: "fa_IR" },
      { name: "twitter:title", content: BRANDING.defaultTitle },
      {
        name: "twitter:description",
        content: BRANDING.metaDescriptionFa,
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6acdff0a-3360-441d-831a-b188d077dd2e/id-preview-9cbe8fe7--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app-1779096434314.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6acdff0a-3360-441d-831a-b188d077dd2e/id-preview-9cbe8fe7--6906e01f-9a81-48a3-a856-35cbd0c22eb2.lovable.app-1779096434314.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      // PWA (Phase 8.1). theme-color paints the Android status bar and the
      // standalone title bar; it matches --primary in src/styles.css.
      { name: "theme-color", content: "#007d7e" },
      { name: "application-name", content: BRANDING.applicationName },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: BRANDING.applicationName },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // PWA (Phase 8.1). All icons are local files under public/icons/ —
      // self-host rules 2 and 13 forbid depending on a CDN for critical assets.
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icons/icon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
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
    scripts: [
      {
        // Inline crypto.randomUUID polyfill — runs in <head> BEFORE any Vite
        // module chunk (including @supabase/supabase-js) loads. Required for
        // self-host over LAN HTTP where the origin is non-secure and the
        // browser hides crypto.randomUUID. Do NOT rely on the module import
        // at the top of this file — module chunks may be evaluated after
        // vendor chunks that already captured a reference to crypto.
        children:
          "(function(){try{var g=globalThis;var c=g.crypto;function mk(src){return function(){var b=new Uint8Array(16);if(src&&typeof src.getRandomValues==='function'){try{src.getRandomValues(b);}catch(e){for(var i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);}}else{for(var i=0;i<16;i++)b[i]=Math.floor(Math.random()*256);}b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;var h=[];for(var i=0;i<16;i++)h.push(b[i].toString(16).padStart(2,'0'));return h.slice(0,4).join('')+'-'+h.slice(4,6).join('')+'-'+h.slice(6,8).join('')+'-'+h.slice(8,10).join('')+'-'+h.slice(10,16).join('');};}if(c&&typeof c.randomUUID==='function'){try{c.randomUUID();return;}catch(e){}}var patched=mk(c);if(c){try{c.randomUUID=patched;return;}catch(e){}try{Object.defineProperty(g,'crypto',{configurable:true,value:{getRandomValues:c.getRandomValues?c.getRandomValues.bind(c):function(b){for(var i=0;i<b.length;i++)b[i]=Math.floor(Math.random()*256);return b;},subtle:c.subtle,randomUUID:patched}});}catch(e){}return;}try{Object.defineProperty(g,'crypto',{configurable:true,value:{getRandomValues:function(b){for(var i=0;i<b.length;i++)b[i]=Math.floor(Math.random()*256);return b;},randomUUID:patched}});}catch(e){}}catch(e){try{console.warn('[crypto-uuid] polyfill install failed',e);}catch(_){}}try{console.debug('[crypto-uuid] ready',typeof crypto!=='undefined'&&typeof crypto.randomUUID);}catch(_){}})();",
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: BRANDING.platformName,
          url: BRANDING.publicOrigin,
          description: BRANDING.metaDescriptionFa,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: BRANDING.platformName,
          url: BRANDING.publicOrigin,
          inLanguage: "fa-IR",
        }),
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

function normalizeEnvironmentName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isLocalOrTestHost(hostname: string) {
  const normalizedHost = hostname.trim().toLowerCase();
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "0.0.0.0" ||
    normalizedHost.startsWith("192.168.") ||
    normalizedHost.startsWith("10.") ||
    normalizedHost.includes("staging") ||
    normalizedHost.includes("test")
  );
}

function EnvironmentSafetyBanner() {
  const appEnv = normalizeEnvironmentName(
    import.meta.env.VITE_APP_ENV ?? import.meta.env.VITE_ENVIRONMENT_NAME ?? import.meta.env.MODE,
  );
  const bannerEnabled =
    normalizeEnvironmentName(import.meta.env.VITE_SHOW_ENVIRONMENT_BANNER) === "true";
  const configuredBannerText = String(import.meta.env.VITE_ENVIRONMENT_BANNER_TEXT ?? "").trim();
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHostname(window.location.hostname);
    }
  }, []);

  const isProduction = appEnv === "production";
  const isStaging = appEnv === "staging";
  const shouldShowNonProductionBanner = bannerEnabled || (appEnv !== "" && !isProduction);
  const suspiciousProductionRuntime =
    isProduction && hostname !== "" && isLocalOrTestHost(hostname);

  if (!shouldShowNonProductionBanner && !suspiciousProductionRuntime) {
    return null;
  }

  const bannerText = suspiciousProductionRuntime
    ? "هشدار ایمنی: محیط production روی آدرس تست/محلی اجرا شده است. قبل از ورود اطلاعات واقعی، تنظیمات را بررسی کنید."
    : configuredBannerText || `«محیط تست ${BRANDING.platformName} — اطلاعات این بخش واقعی نیست»`;

  const className = suspiciousProductionRuntime
    ? "border-b border-red-700 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm"
    : "border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow-sm";

  return (
    <div dir="rtl" role="alert" className={className} data-environment={appEnv || "unknown"}>
      {bannerText}
    </div>
  );
}

function RootComponent() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  useEffect(() => {
    initCacheBuster();
    // No-ops in dev and over plain http (LAN today) — see register-sw.ts.
    registerServiceWorker();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthErrorBoundary>
        <AuthProvider>
          <EnvironmentSafetyBanner />
          <Outlet />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </AuthErrorBoundary>
    </QueryClientProvider>
  );
}
