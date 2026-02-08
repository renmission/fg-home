import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS, can, type SessionUser } from "@/lib/auth/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || can(user, item.permission)
  );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="font-semibold">
            FG Homes
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-2">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" className="w-full justify-start">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="container py-6">{children}</div>
      </main>
    </div>
  );
}
