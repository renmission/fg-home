"use client";

import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./dashboard-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote } from "lucide-react";
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
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-1 max-w-sm">
          <Card className="animate-pulse">
            <CardHeader className="h-16" />
            <CardContent className="h-20" />
          </Card>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          title="Today's Sales"
          value={`₱${Number(data.today?.totalAmount || 0).toLocaleString()}`}
          description={`${data.today?.transactionCount || 0} transactions`}
          icon={<Banknote className="h-4 w-4" />}
          href="/dashboard/pos"
        />

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center">
            <Button asChild className="w-full h-12 text-lg">
              <Link href="/dashboard/pos">Open POS Terminal</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
