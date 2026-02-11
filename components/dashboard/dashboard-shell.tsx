"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import type { NavItem } from "@/components/dashboard/dashboard-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import type { UserMenuUser } from "@/components/dashboard/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

const MenuIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const PanelLeftCloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </svg>
);

const PanelLeftIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m13 9 3 3-3 3" />
  </svg>
);

export function DashboardShell({
  navItems,
  settingsNavItems = [],
  user,
  children,
}: {
  navItems: NavItem[];
  settingsNavItems?: NavItem[];
  user: UserMenuUser;
  children: React.ReactNode;
}) {
  const { sidebarOpen, openSidebar, closeSidebar, toggleSidebar } = useUIStore();

  useEffect(() => {
    const isMobile = () =>
      typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    if (sidebarOpen && isMobile()) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  /** Only close sidebar when navigating on mobile (drawer); leave desktop sidebar state unchanged */
  const handleNavNavigate = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      closeSidebar();
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top navbar — full width, always visible (reference: logo + section title left; actions + theme + user right) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={openSidebar}
            aria-label="Open menu"
          >
            <MenuIcon />
          </Button>
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
            onClick={closeSidebar}
          >
            <Image
              src="/logo-1.png"
              alt="FG Home Builders and Construction Supply"
              width={150}
              height={40}
              priority
              className="h-8 w-auto"
            />
            <span className="font-semibold text-foreground hidden md:inline-block">
              FG Home Builders
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className="hidden md:inline-flex" />
          <NotificationBell />
          <div className="hidden md:block">
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      {/* Overlay — closes drawer when tapping outside on mobile */}
      <div
        role="presentation"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeSidebar}
        aria-hidden
      />

      {/* Main area: fixed height so only main content scrolls, not the page */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — drawer on mobile; on desktop expanded (w-56) or collapsed (w-16) with icons + toggle visible */}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-sidebar transition-[transform,width] duration-200 ease-out",
            "fixed top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-72 max-w-[85vw] md:relative md:top-0 md:z-auto md:h-full md:min-h-[calc(100vh-3.5rem)] md:max-w-none md:shrink-0",
            sidebarOpen ? "translate-x-0 md:w-56" : "-translate-x-full md:translate-x-0 md:w-16"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:justify-end md:px-2">
            <Tooltip
              content={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              side="right"
              className="hidden md:inline-flex"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftIcon />}
              </Button>
            </Tooltip>
            <span className="font-semibold text-foreground md:hidden">Menu</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 md:hidden"
              onClick={closeSidebar}
              aria-label="Close menu"
            >
              <CloseIcon />
            </Button>
          </div>
          <DashboardNav
            items={navItems}
            settingsItems={settingsNavItems}
            onNavigate={handleNavNavigate}
            collapsed={!sidebarOpen}
          />

          {/* Mobile: Theme toggle and user menu */}
          <div className="mt-auto md:hidden">
            <div className="border-t border-border" />
            <div className="flex flex-col gap-1 px-3 py-2">
              <ThemeToggle className="w-full justify-start" />
              <div className="flex items-center gap-2 px-2 py-1.5">
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {user.name
                      ? user.name
                          .trim()
                          .split(/\s+/)
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()
                      : user.email
                        ? user.email.slice(0, 2).toUpperCase()
                        : "?"}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.name || user.email || "User"}
                  </p>
                  {user.email && user.name && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  signOut({ callbackUrl: "/login" });
                  closeSidebar();
                }}
              >
                Sign out
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "mt-auto shrink-0 border-t border-border px-3 py-3 text-center text-xs text-muted-foreground",
              !sidebarOpen && "md:px-0 md:py-2"
            )}
          >
            {sidebarOpen ? (
              <>© {new Date().getFullYear()} FG Homes</>
            ) : (
              <span className="hidden md:inline" title={`© ${new Date().getFullYear()} FG Homes`}>
                ©
              </span>
            )}
          </div>
        </aside>

        {/* Main content — full width, scrolls inside */}
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <div className="w-full px-4 py-4 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
