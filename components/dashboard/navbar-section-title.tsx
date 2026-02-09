"use client";

import { usePathname } from "next/navigation";

const SECTION_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/inventory": "Inventory",
  "/dashboard/payroll": "Payroll",
  "/dashboard/deliveries": "Deliveries",
};

export function NavbarSectionTitle() {
  const pathname = usePathname();

  const label =
    SECTION_LABELS[pathname] ??
    Object.entries(SECTION_LABELS).find(
      ([path]) => pathname.startsWith(path) && path !== "/dashboard"
    )?.[1] ??
    "Dashboard";

  return <span className="text-sm font-medium text-muted-foreground sm:text-base">{label}</span>;
}
