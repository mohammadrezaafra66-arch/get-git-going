import type { ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs";
import { PopupCenterProvider } from "@/lib/popups/PopupCenterProvider";
import { PriceChangePopupListener } from "@/shared/components/PriceChangePopupListener";
import { OwnerRemindersListener } from "@/shared/components/OwnerRemindersListener";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PopupCenterProvider>
      <PriceChangePopupListener />
      <OwnerRemindersListener />
      <SidebarProvider>
        <div dir="rtl" className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6 md:pb-6">
              <NavigationBreadcrumbs />
              {children}
            </main>
            <MobileBottomNav />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </PopupCenterProvider>
  );
}
