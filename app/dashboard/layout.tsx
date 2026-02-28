import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  NAV_TOP_ITEMS,
  NAV_GROUPS,
  can,
  type SessionUser,
  type NavItemConfig,
  ROLES,
} from "@/lib/auth/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const isVisible = (item: NavItemConfig) => {
    if (item.excludeRoles?.some((role: string) => user.roles?.includes(role))) {
      return false;
    }
    return !item.permission || can(user, item.permission);
  };

  const topNavItems = NAV_TOP_ITEMS.filter(isVisible).map(({ href, label }) => ({ href, label }));

  const isAdmin = user.roles?.includes(ROLES.ADMIN);
  const isHR = user.roles?.includes(ROLES.PAYROLL_MANAGER);

  const visibleNavGroups = NAV_GROUPS.map((group) => {
    const isHRGroup = group.label === "Human Resources";

    // If it's the HR group, only show to Admin or HR staff
    if (isHRGroup && !isAdmin && !isHR) {
      return { label: group.label, items: [] };
    }

    // If user is HR staff (non-admin), they ONLY see the HR group
    if (isHR && !isAdmin && !isHRGroup) {
      return { label: group.label, items: [] };
    }

    // Default: filter items by permission
    return {
      label: group.label,
      items: group.items
        .filter(isVisible)
        .map(({ href, label }) => ({ href, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }).filter((group) => group.items.length > 0);

  return (
    <DashboardShell topNavItems={topNavItems} navGroups={visibleNavGroups} user={user}>
      {children}
    </DashboardShell>
  );
}
