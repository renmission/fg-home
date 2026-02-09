import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AttendanceDashboard } from "@/components/attendance/attendance-dashboard";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!can(user, PERMISSIONS.ATTENDANCE_READ)) redirect("/dashboard");

  return (
    <div>
      <AttendanceDashboard user={user} />
    </div>
  );
}
