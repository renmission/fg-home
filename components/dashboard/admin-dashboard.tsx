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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Package, Truck, DollarSign, Users } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.admin;
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
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

  const movementData = data.inventory?.recentMovements || [];
  const deliveryStatusData = [
    { name: "Pending", value: data.deliveries?.pending || 0 },
    { name: "Delivered", value: (data.deliveries?.total || 0) - (data.deliveries?.pending || 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <DashboardCard
          title="Total Products"
          value={data.inventory?.totalProducts || 0}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          title="Low Stock Items"
          value={data.inventory?.lowStockCount || 0}
          description="Needs attention"
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          title="Pending Deliveries"
          value={data.deliveries?.pending || 0}
          icon={<Truck className="h-4 w-4" />}
        />
        <DashboardCard
          title="Recent Sales"
          value={`₱${Number(data.sales?.totalAmount || 0).toLocaleString()}`}
          description={`${data.sales?.transactionCount || 0} transactions`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          title="Active Users"
          value={data.users?.total || 0}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock Movements (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={movementData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={deliveryStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deliveryStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
