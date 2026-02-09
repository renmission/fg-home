import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? "User";

  return (
    <div>
      <h1 className="text-xl font-semibold sm:text-2xl">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground sm:text-base">
        Welcome back, {name}. Use the menu to open Inventory, Payroll, or Deliveries.
      </p>
    </div>
  );
}
