import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmployeeManagementDashboard } from "@/components/employees/employee-management-dashboard";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function EmployeesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;

  // We are using USERS_READ as the base permission for Employees
  if (!can(user, PERMISSIONS.USERS_READ)) redirect("/dashboard");

  return (
    <div>
      <EmployeeManagementDashboard user={user} />
    </div>
  );
}
