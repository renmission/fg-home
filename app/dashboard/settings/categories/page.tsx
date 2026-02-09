import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsCategoriesClient } from "./settings-categories-client";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";

export default async function SettingsCategoriesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as SessionUser;
  if (!can(user, PERMISSIONS.SETTINGS_READ)) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-xl font-semibold sm:text-2xl">Categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Categories used when creating or editing products in Inventory.
      </p>
      <SettingsCategoriesClient canWrite={can(user, PERMISSIONS.SETTINGS_WRITE)} />
    </div>
  );
}
