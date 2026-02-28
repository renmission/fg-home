"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { getNavIcon, IconChevronDown } from "@/components/dashboard/sidebar-icons";

export type NavItem = { href: string; label: string };
export type NavGroup = { label: string; items: NavItem[] };

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some(
    (item) =>
      pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );
}

export function DashboardNav({
  topItems = [],
  groups,
  onNavigate,
  collapsed = false,
}: {
  topItems?: NavItem[];
  groups: NavGroup[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, isGroupActive(g, pathname)]))
  );

  // Auto-expand the group containing the active route on navigation
  useEffect(() => {
    groups.forEach((group) => {
      if (isGroupActive(group, pathname)) {
        setExpanded((prev) => ({ ...prev, [group.label]: true }));
      }
    });
  }, [pathname, groups]);

  function renderNavLink(item: NavItem) {
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
  }

  return (
    <nav
      className={cn("flex flex-1 flex-col gap-0.5 p-2", collapsed && "items-center p-2")}
      aria-label="Main"
    >
      {topItems.length > 0 && (
        <>
          {topItems.map((item) => renderNavLink(item))}
          {!collapsed && <div className="mx-2 my-1 border-t border-border" />}
        </>
      )}
      {groups.map((group) => {
        const active = isGroupActive(group, pathname);
        const isExpanded = expanded[group.label] ?? false;
        const groupId = `group-subnav-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

        if (collapsed) {
          return (
            <div key={group.label} className="flex flex-col gap-0.5">
              {group.items.map((item) => renderNavLink(item))}
            </div>
          );
        }

        return (
          <div key={group.label} className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [group.label]: !prev[group.label] }))
              }
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors touch-manipulation md:min-h-0 md:py-2",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              aria-expanded={isExpanded}
              aria-controls={groupId}
            >
              <span className="flex-1 text-xs font-semibold uppercase tracking-wider">
                {group.label}
              </span>
              <IconChevronDown
                className={cn("shrink-0 transition-transform", isExpanded && "rotate-180")}
              />
            </button>
            <div id={groupId} className={cn("flex flex-col gap-0.5", !isExpanded && "hidden")}>
              {group.items.map((item) => renderNavLink(item))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
