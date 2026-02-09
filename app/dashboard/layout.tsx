import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NAV_ITEMS, can, type SessionUser } from "@/lib/auth/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(user, item.permission)
  ).map(({ href, label }) => ({ href, label }));

  return (
    <DashboardShell navItems={visibleNavItems} user={user}>
      {children}
    </DashboardShell>
  );
}
