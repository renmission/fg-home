import { auth } from "@/lib/auth";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";
import type { SessionUser } from "@/lib/auth/permissions";

export default async function PayrollPage() {
  const session = await auth();
  const user = (session?.user ?? null) as SessionUser | null;

  return (
    <div>
      <PayrollDashboard user={user} />
    </div>
  );
}
