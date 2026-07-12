import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/shared/components/NotificationBell";
import { ClockInOutButton } from "@/components/attendance/ClockInOutButton";
import { OnlineDot } from "@/components/presence/OnlineDot";

export function AppHeader() {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabels = roles.map((r) => ROLE_LABELS[r]).join("، ") || "بدون نقش";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <SidebarTrigger />
      <div className="flex-1" />
      <ClockInOutButton />
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials}
              {user?.id ? <OnlineDot userId={user.id} /> : null}
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-xs font-medium text-foreground">{user?.email}</div>
              <div className="text-[10px] text-muted-foreground">{roleLabels}</div>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>حساب کاربری</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <User className="ml-2 h-4 w-4" />
            <span>پروفایل</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="ml-2 h-4 w-4" />
            <span>خروج</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
