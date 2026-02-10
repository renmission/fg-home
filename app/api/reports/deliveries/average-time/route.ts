import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries, deliveryStatusUpdates } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliveryAverageTimeQuerySchema } from "@/schemas/reports";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = deliveryAverageTimeQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const, groupBy: "day" as const };

    const conditions = [];
    if (q.dateFrom) {
      // Include full day: start of dateFrom
      const dateFromStart = new Date(q.dateFrom);
      dateFromStart.setHours(0, 0, 0, 0);
      conditions.push(gte(deliveries.createdAt, dateFromStart));
    }
    if (q.dateTo) {
      // Include full day: end of dateTo (23:59:59.999)
      const dateToEnd = new Date(q.dateTo);
      dateToEnd.setHours(23, 59, 59, 999);
      conditions.push(lte(deliveries.createdAt, dateToEnd));
    }
    // Only include delivered deliveries
    conditions.push(eq(deliveries.status, "delivered"));
    const where = conditions.length ? and(...conditions) : undefined;

    // Get created and delivered timestamps using a subquery for efficiency
    // We use MIN() to get the first time the delivery was marked as delivered
    const deliveryTimes = await db
      .select({
        deliveryId: deliveries.id,
        customerName: deliveries.customerName,
        createdAt: deliveries.createdAt,
        deliveredAt: sql<Date>`(
          SELECT MIN(${deliveryStatusUpdates.createdAt})
          FROM ${deliveryStatusUpdates}
          WHERE ${deliveryStatusUpdates.deliveryId} = ${deliveries.id}
          AND ${deliveryStatusUpdates.status} = 'delivered'
        )`.as("delivered_at"),
      })
      .from(deliveries)
      .where(where);

    const timesWithDuration = deliveryTimes
      .filter((d) => d.deliveredAt)
      .map((d) => {
        const created = d.createdAt;
        const delivered = d.deliveredAt as Date;
        const durationMs = delivered.getTime() - created.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        const durationDays = durationMs / (1000 * 60 * 60 * 24);

        let groupKey: string;
        if (q.groupBy === "customer") {
          groupKey = d.customerName || "Unknown";
        } else {
          const date = new Date(created);
          if (q.groupBy === "day") {
            groupKey = date.toISOString().split("T")[0];
          } else if (q.groupBy === "week") {
            // Use ISO week calculation (Monday as start of week)
            const weekStart = new Date(date);
            const day = weekStart.getDay();
            const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
            weekStart.setDate(diff);
            weekStart.setHours(0, 0, 0, 0);
            groupKey = weekStart.toISOString().split("T")[0];
          } else {
            // month
            groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          }
        }

        return {
          deliveryId: d.deliveryId,
          customerName: d.customerName,
          createdAt: created.toISOString(),
          deliveredAt: delivered.toISOString(),
          durationHours: Math.round(durationHours * 100) / 100,
          durationDays: Math.round(durationDays * 100) / 100,
          groupKey,
        };
      });

    // Group and calculate averages
    const grouped = timesWithDuration.reduce(
      (acc, item) => {
        if (!acc[item.groupKey]) {
          acc[item.groupKey] = {
            groupKey: item.groupKey,
            deliveries: [],
            totalHours: 0,
            count: 0,
          };
        }
        acc[item.groupKey].deliveries.push(item);
        acc[item.groupKey].totalHours += item.durationHours;
        acc[item.groupKey].count += 1;
        return acc;
      },
      {} as Record<
        string,
        {
          groupKey: string;
          deliveries: Array<{
            deliveryId: string;
            customerName: string | null;
            createdAt: string;
            deliveredAt: string;
            durationHours: number;
            durationDays: number;
            groupKey: string;
          }>;
          totalHours: number;
          count: number;
        }
      >
    );

    const data = Object.values(grouped).map((group) => ({
      groupKey: group.groupKey,
      averageHours: Math.round((group.totalHours / group.count) * 100) / 100,
      averageDays: Math.round((group.totalHours / group.count / 24) * 100) / 100,
      count: group.count,
      deliveries: group.deliveries,
    }));

    if (q.format === "csv") {
      const csv = [
        ["Group", "Average Hours", "Average Days", "Delivery Count"].join(","),
        ...data.map((r) => [r.groupKey, r.averageHours, r.averageDays, r.count].join(",")),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="delivery-average-time-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;
      filters["Group By"] = q.groupBy || "day";

      const pdfBuffer = await generateReportPdf({
        title: "Average Delivery Time Report",
        subtitle: `Average time from creation to delivery, grouped by ${q.groupBy || "day"}`,
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          {
            key: "groupKey",
            label:
              q.groupBy === "customer"
                ? "Customer"
                : q.groupBy === "day"
                  ? "Date"
                  : q.groupBy === "week"
                    ? "Week"
                    : "Month",
          },
          {
            key: "averageHours",
            label: "Average Hours",
            align: "right",
            format: (val) => `${Number(val).toFixed(2)} hrs`,
          },
          {
            key: "averageDays",
            label: "Average Days",
            align: "right",
            format: (val) => `${Number(val).toFixed(2)} days`,
          },
          { key: "count", label: "Delivery Count", align: "right" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="delivery-average-time-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
