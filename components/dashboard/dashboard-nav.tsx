"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { getNavIcon, IconSettings, IconChevronDown } from "@/components/dashboard/sidebar-icons";

export type NavItem = { href: string; label: string };

export function DashboardNav({
  items,
  settingsItems = [],
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  settingsItems?: NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isSettingsActive = pathname.startsWith("/dashboard/settings");
  const [settingsExpanded, setSettingsExpanded] = useState(isSettingsActive);

  useEffect(() => {
    if (isSettingsActive) setSettingsExpanded(true);
  }, [isSettingsActive]);

  return (
    <nav
      className={cn("flex flex-1 flex-col gap-0.5 p-2", collapsed && "items-center p-2")}
      aria-label="Main"
    >
      {items.map((item) => {
        const isActive =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = getNavIcon(item.href);
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation md:min-h-0 md:py-2",
              collapsed && "justify-center p-2 md:px-2",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="shrink-0" />
            {!collapsed && item.label}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href} content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
      {settingsItems.length > 0 &&
        (collapsed ? (
          <Tooltip content="Settings" side="right">
            <Link
              href={settingsItems[0]?.href ?? "/dashboard/settings/categories"}
              onClick={onNavigate}
              className={cn(
                "mt-1 flex min-h-11 items-center justify-center rounded-md p-2 transition-colors touch-manipulation md:min-h-0",
                isSettingsActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <IconSettings className="shrink-0" />
            </Link>
          </Tooltip>
        ) : (
          <div className="mt-1 flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setSettingsExpanded((e) => !e)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors touch-manipulation md:min-h-0 md:py-2",
                isSettingsActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              aria-expanded={settingsExpanded}
              aria-controls="settings-subnav"
            >
              <IconSettings className="shrink-0" />
              Settings
              <IconChevronDown
                className={cn(
                  "ml-auto shrink-0 transition-transform",
                  settingsExpanded && "rotate-180"
                )}
              />
            </button>
            <div
              id="settings-subnav"
              className={cn("flex flex-col gap-0.5 overflow-hidden", !settingsExpanded && "hidden")}
            >
              {settingsItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-9 items-center gap-3 rounded-md py-2 pl-9 pr-3 text-sm font-medium transition-colors md:min-h-0",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </nav>
  );
}
