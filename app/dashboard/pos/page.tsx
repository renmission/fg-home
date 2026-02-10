import { auth } from "@/lib/auth";
import { PosDashboard } from "@/components/pos/pos-dashboard";
import type { SessionUser } from "@/lib/auth/permissions";

export default async function PosPage() {
  const session = await auth();
  const user = (session?.user ?? null) as SessionUser | null;

  return (
    <div>
      <PosDashboard user={user} />
    </div>
  );
}
