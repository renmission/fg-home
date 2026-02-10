"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Package, AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function InventoryDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.inventory;
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

  // Process movements by day for chart
  const movementsByDayMap = new Map<string, { in: number; out: number; adjustment: number }>();
  data.movementsByDay?.forEach((m: { date: string; type: string; count: number }) => {
    const existing = movementsByDayMap.get(m.date) || { in: 0, out: 0, adjustment: 0 };
    if (m.type === "in" || m.type === "out" || m.type === "adjustment") {
      existing[m.type] = m.count;
    }
    movementsByDayMap.set(m.date, existing);
  });
  const movementsByDayChart = Array.from(movementsByDayMap.entries()).map(([date, counts]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    ...counts,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard
          title="Total Products"
          value={data.totalProducts || 0}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          title="Low Stock Items"
          value={data.lowStockCount || 0}
          description="Below reorder level"
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
        />
        <DashboardCard
          title="Movement Types"
          value={data.movementsByType?.length || 0}
          description="Last 30 days"
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {data.lowStockCount > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {data.lowStockCount} product{data.lowStockCount !== 1 ? "s" : ""} need
              {data.lowStockCount === 1 ? "s" : ""} restocking
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/inventory">View Inventory</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stock Movements (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={movementsByDayChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="in" fill="#00C49F" name="In" />
              <Bar dataKey="out" fill="#FF8042" name="Out" />
              <Bar dataKey="adjustment" fill="#FFBB28" name="Adjustment" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
