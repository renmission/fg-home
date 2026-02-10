"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PosDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.pos;
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

  const salesByDay = (data.salesByDay || []).map(
    (s: { date: string; total: number; count: number }) => ({
      date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      amount: Number(s.total),
      transactions: s.count,
    })
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard
          title="Today's Sales"
          value={`₱${Number(data.today?.totalAmount || 0).toLocaleString()}`}
          description={`${data.today?.transactionCount || 0} transactions`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          title="Last 30 Days"
          value={`₱${Number(data.recent?.totalAmount || 0).toLocaleString()}`}
          description={`${data.recent?.transactionCount || 0} transactions`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <DashboardCard
          title="Average per Day"
          value={`₱${Number(
            (data.recent?.totalAmount || 0) / Math.max(1, data.recent?.transactionCount || 1)
          ).toLocaleString()}`}
          description="Last 30 days"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Sales (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesByDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
              <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/dashboard/pos">Open POS</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
