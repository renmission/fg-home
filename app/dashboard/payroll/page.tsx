import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";
import { PERMISSIONS, can, type SessionUser } from "@/lib/auth/permissions";

export default async function PayrollPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  // Only Admin and Payroll Manager can access payroll
  if (!can(user, PERMISSIONS.PAYROLL_READ)) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PayrollDashboard user={user} />
    </div>
  );
}
