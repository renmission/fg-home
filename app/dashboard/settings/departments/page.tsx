import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsDepartmentsClient } from "./settings-departments-client";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function SettingsDepartmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!can(user, PERMISSIONS.SETTINGS_READ)) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-xl font-semibold sm:text-2xl">Departments</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Departments used when creating or editing users and employees.
      </p>
      <SettingsDepartmentsClient canWrite={can(user, PERMISSIONS.SETTINGS_WRITE)} />
    </div>
  );
}
