"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Truck, Package, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82CA9D"];

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  picked: "Picked",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  returned: "Returned",
};

export function DeliveryDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.delivery;
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-16" />
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const statusData = (data.byStatus || []).map((s: { status: string; count: number }) => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard
          title="Total Deliveries"
          value={data.total || 0}
          icon={<Truck className="h-4 w-4" />}
          href="/dashboard/deliveries"
        />
        <DashboardCard
          title="Pending Deliveries"
          value={data.pending || 0}
          description="Requires action"
          icon={<Clock className="h-4 w-4 text-orange-500" />}
          href="/dashboard/deliveries"
        />
        <DashboardCard
          title="Status Types"
          value={data.byStatus?.length || 0}
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      {data.pending > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {data.pending} delivery{data.pending !== 1 ? "ies" : ""} pending status update
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/deliveries">View Deliveries</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {statusData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deliveries by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry: { name: string; value: number }, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
