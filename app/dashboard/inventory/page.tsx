import { auth } from "@/lib/auth";
import { InventoryDashboard } from "@/components/inventory/inventory-dashboard";
import type { SessionUser } from "@/lib/auth/permissions";

export default async function InventoryPage() {
  const session = await auth();
  const user = (session?.user ?? null) as SessionUser | null;

  return (
    <div>
      <InventoryDashboard user={user} />
    </div>
  );
}
