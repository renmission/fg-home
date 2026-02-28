import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NAV_TOP_ITEMS, NAV_GROUPS, can, type SessionUser } from "@/lib/auth/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const topNavItems = NAV_TOP_ITEMS.filter(
    (item) => !item.permission || can(user, item.permission)
  ).map(({ href, label }) => ({ href, label }));

  const visibleNavGroups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.permission || can(user, item.permission))
      .map(({ href, label }) => ({ href, label })),
  })).filter((group) => group.items.length > 0);

  return (
    <DashboardShell topNavItems={topNavItems} navGroups={visibleNavGroups} user={user}>
      {children}
    </DashboardShell>
  );
}
