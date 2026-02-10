import { auth } from "@/lib/auth";
import { ReportsDashboard } from "@/components/reports/reports-dashboard";
import type { SessionUser } from "@/lib/auth/permissions";

export default async function ReportsPage() {
  const session = await auth();
  const user = (session?.user ?? null) as SessionUser | null;

  return (
    <div>
      <ReportsDashboard user={user} />
    </div>
  );
}
