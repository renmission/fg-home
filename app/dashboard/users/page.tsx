import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserManagementDashboard } from "@/components/users/user-management-dashboard";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!can(user, PERMISSIONS.USERS_READ)) redirect("/dashboard");

  return (
    <div>
      <UserManagementDashboard user={user} />
    </div>
  );
}
