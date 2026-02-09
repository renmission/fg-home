"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import type { NavItem } from "@/components/dashboard/dashboard-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import type { UserMenuUser } from "@/components/dashboard/user-menu";
import { NavbarSectionTitle } from "@/components/dashboard/navbar-section-title";
import { IconBell } from "@/components/dashboard/sidebar-icons";
import { cn } from "@/lib/utils";

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top navbar — full width, always visible (reference: logo + section title left; actions + theme + user right) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <MenuIcon />
          </Button>
          <Link
            href="/dashboard"
            className="shrink-0 font-semibold text-foreground transition-opacity hover:opacity-80"
            onClick={closeMenu}
          >
            FG Homes
          </Link>
          <span className="hidden text-muted-foreground/80 sm:inline">—</span>
          <NavbarSectionTitle />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Notifications"
          >
            <IconBell />
          </Button>
          <UserMenu user={user} />
        </div>
      </header>

      {/* Overlay — closes drawer when tapping outside on mobile */}
      <div
        role="presentation"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden",
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMenu}
        aria-hidden
      />

      {/* Main area: sidebar + content */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — drawer on mobile, static on md+ (darker background like reference) */}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-sidebar transition-transform duration-200 ease-out",
            "fixed top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-72 max-w-[85vw] md:relative md:top-0 md:z-auto md:h-auto md:w-56 md:max-w-none md:translate-x-0",
            menuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:justify-start">
            <span className="font-semibold text-foreground md:hidden">Menu</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:hidden"
              onClick={closeMenu}
              aria-label="Close menu"
            >
              <CloseIcon />
            </Button>
          </div>
          <DashboardNav items={navItems} settingsItems={settingsNavItems} onNavigate={closeMenu} />
        </aside>

        {/* Main content — full width */}
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="w-full px-4 py-4 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
