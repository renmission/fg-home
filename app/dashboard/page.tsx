import { auth } from "@/lib/auth";
import { ROLES } from "@/lib/auth/permissions";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { InventoryDashboard } from "@/components/dashboard/inventory-dashboard";
import { PayrollDashboard } from "@/components/dashboard/payroll-dashboard";
import { DeliveryDashboard } from "@/components/dashboard/delivery-dashboard";
import { PosDashboard } from "@/components/dashboard/pos-dashboard";
import { ViewerDashboard } from "@/components/dashboard/viewer-dashboard";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QueryProvider } from "@/components/providers/query-provider";

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? session?.user?.email ?? "User";
  const roles = session?.user?.roles || [];

  const isAdmin = roles.includes(ROLES.ADMIN);
  const isInventoryManager = roles.includes(ROLES.INVENTORY_MANAGER);
  const isPayrollManager = roles.includes(ROLES.PAYROLL_MANAGER);
  const isDeliveryStaff = roles.includes(ROLES.DELIVERY_STAFF);
  const isPosCashier = roles.includes(ROLES.POS_CASHIER);

  // Determine which dashboard to show (priority order)
  let DashboardComponent = ViewerDashboard;
  if (isAdmin) {
    DashboardComponent = AdminDashboard;
  } else if (isInventoryManager) {
    DashboardComponent = InventoryDashboard;
  } else if (isPayrollManager) {
    DashboardComponent = PayrollDashboard;
  } else if (isDeliveryStaff) {
    DashboardComponent = DeliveryDashboard;
  } else if (isPosCashier) {
    DashboardComponent = PosDashboard;
  }

  return (
    <QueryProvider>
      <div className="space-y-6">
        <DashboardHeader name={name} />
        <DashboardComponent />
      </div>
    </QueryProvider>
  );
}
