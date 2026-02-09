import { auth } from "@/lib/auth";
import { CustomerDashboard } from "@/components/customers/customer-dashboard";
import type { SessionUser } from "@/lib/auth/permissions";

export default async function CustomersPage() {
  const session = await auth();
  const user = (session?.user ?? null) as SessionUser | null;

  return (
    <div>
      <CustomerDashboard user={user} />
    </div>
  );
}
