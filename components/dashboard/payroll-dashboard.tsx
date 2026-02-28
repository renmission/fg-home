"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, FileText, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PayrollDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json = await res.json();
      return json.data?.payroll;
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds (payroll changes less frequently)
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

  const runsByMonth = data.runsByMonth || [];
  const recentRuns = data.recentRuns || [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard
          title="Active Employees"
          value={data.totalEmployees || 0}
          icon={<Users className="h-4 w-4" />}
          href="/dashboard/employees"
        />
        <DashboardCard
          title="Draft Payslips"
          value={data.pendingPayslips || 0}
          description="Requires attention"
          icon={<FileText className="h-4 w-4" />}
          href="/dashboard/payroll"
        />
        <DashboardCard
          title="Recent Runs"
          value={data.recentRuns?.length || 0}
          description="Last 5 payroll runs"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {data.pendingPayslips > 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Pending Payslips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {data.pendingPayslips} payslip{data.pendingPayslips !== 1 ? "s" : ""} in draft status
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/payroll">View Payroll</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payroll Runs by Month (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={runsByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {recentRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payroll Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentRuns.map(
                (run: { id: string; payPeriodId: string; status: string; createdAt: string }) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <div>
                      <p className="text-sm font-medium">Run #{run.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        run.status === "finalized"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
