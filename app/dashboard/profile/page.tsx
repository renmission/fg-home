import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserProfile } from "@/components/users/user-profile";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return <UserProfile />;
}
