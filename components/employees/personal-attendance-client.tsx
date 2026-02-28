"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/errors";

export function PersonalAttendanceClient() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["personal-attendance"],
    queryFn: async () => {
      const res = await fetch("/api/personal-attendance");
      if (!res.ok) throw new Error("Failed to load attendance info");
      return res.json();
    },
  });

  const clockActionMutation = useMutation({
    mutationFn: async (action: "clock_in" | "clock_out") => {
      const res = await fetch("/api/personal-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to submit attendance action");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personal-attendance"] });
    },
  });

  if (isLoading) return <div className="text-muted-foreground p-6">Checking your status...</div>;

  if (error || !data) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>Could not verify your employee status.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data.isEmployee) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not an Employee</CardTitle>
          <CardDescription>{data.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data.isActive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inactive Employee</CardTitle>
          <CardDescription>{data.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Pay period is now optional, so we don't block here

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mark Attendance for Today</CardTitle>
        <CardDescription>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.todayRecord?.clockOutTime ? (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-6 text-center text-green-800 dark:text-green-200">
            <h3 className="text-lg font-semibold mb-2">You have completed your shift.</h3>
            <p className="text-sm">
              You worked <strong>{data.todayRecord.hoursWorked}</strong> hours today.
            </p>
            <p className="text-xs mt-2 opacity-80">
              Clock In: {new Date(data.todayRecord.clockInTime).toLocaleTimeString()} <br />
              Clock Out: {new Date(data.todayRecord.clockOutTime).toLocaleTimeString()}
            </p>
          </div>
        ) : data.todayRecord?.clockInTime ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200">
              <h3 className="font-semibold mb-1">Currently Clocked In</h3>
              <p className="text-sm">
                Since {new Date(data.todayRecord.clockInTime).toLocaleTimeString()}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                clockActionMutation.mutate("clock_out");
              }}
              className="space-y-4"
            >
              {clockActionMutation.error && (
                <p className="text-sm text-destructive" role="alert">
                  {getErrorMessage(clockActionMutation.error)}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={clockActionMutation.isPending}
                className="w-full sm:w-auto mt-4"
                variant="destructive"
              >
                {clockActionMutation.isPending ? "Submitting..." : "Clock Out"}
              </Button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              clockActionMutation.mutate("clock_in");
            }}
            className="space-y-4"
          >
            {clockActionMutation.error && (
              <p className="text-sm text-destructive" role="alert">
                {getErrorMessage(clockActionMutation.error)}
              </p>
            )}

            <div className="grid gap-2 max-w-sm">
              <label htmlFor="notes" className="text-sm font-medium">
                Notes (Optional)
              </label>
              <input
                id="notes"
                type="text"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Late due to traffic, etc."
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={clockActionMutation.isPending}
              className="w-full sm:w-auto mt-4"
            >
              {clockActionMutation.isPending ? "Submitting..." : "Clock In"}
            </Button>
          </form>
        )}

        <div className="border-t border-border mt-8 pt-6">
          <h4 className="text-sm font-medium text-muted-foreground mb-4">Your Employee Info</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{data.employee.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Department</dt>
              <dd className="font-medium">{data.employee.department || "—"}</dd>
            </div>
            {data.period && (
              <div>
                <dt className="text-muted-foreground">Current Pay Period</dt>
                <dd className="font-medium">
                  {new Date(data.period.startDate).toLocaleDateString()} to{" "}
                  {new Date(data.period.endDate).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
