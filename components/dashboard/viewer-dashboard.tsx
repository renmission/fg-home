"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Package, Truck, Users } from "lucide-react";

export function ViewerDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.viewer;
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds (viewer has read-only access)
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard
          title="Total Products"
          value={data.inventory?.totalProducts || 0}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          title="Total Deliveries"
          value={data.deliveries?.total || 0}
          icon={<Truck className="h-4 w-4" />}
        />
        <DashboardCard
          title="Active Employees"
          value={data.payroll?.totalEmployees || 0}
          icon={<Users className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}
