import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NAV_ITEMS, PERMISSIONS, can, type SessionUser } from "@/lib/auth/permissions";

const SETTINGS_NAV_ITEMS = [
  { href: "/dashboard/settings/categories", label: "Categories" },
  { href: "/dashboard/settings/units", label: "Units" },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(user, item.permission)
  ).map(({ href, label }) => ({ href, label }));

  const settingsNavItems = can(user, PERMISSIONS.SETTINGS_READ)
    ? SETTINGS_NAV_ITEMS.map(({ href, label }) => ({ href, label }))
    : [];

  return (
    <DashboardShell navItems={visibleNavItems} settingsNavItems={settingsNavItems} user={user}>
      {children}
    </DashboardShell>
  );
}
