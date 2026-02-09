import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsUnitsClient } from "./settings-units-client";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function SettingsUnitsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!can(user, PERMISSIONS.SETTINGS_READ)) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-xl font-semibold sm:text-2xl">Units</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Units used when creating or editing products in Inventory (e.g. pcs, kg, bag).
      </p>
      <SettingsUnitsClient canWrite={can(user, PERMISSIONS.SETTINGS_WRITE)} />
    </div>
  );
}
