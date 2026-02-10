import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliveryByDateRangeQuerySchema } from "@/schemas/reports";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatDateTime } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = deliveryByDateRangeQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

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
    if (q.status) {
      conditions.push(eq(deliveries.status, q.status));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: deliveries.id,
        trackingNumber: deliveries.trackingNumber,
        customerName: deliveries.customerName,
        customerAddress: deliveries.customerAddress,
        status: deliveries.status,
        createdAt: deliveries.createdAt,
        updatedAt: deliveries.updatedAt,
      })
      .from(deliveries)
      .where(where)
      .orderBy(desc(deliveries.createdAt));

    // Calculate status distribution
    const statusDistribution = await db
      .select({
        status: deliveries.status,
        count: sql<number>`COUNT(*)::int`.as("count"),
      })
      .from(deliveries)
      .where(where)
      .groupBy(deliveries.status)
      .orderBy(asc(deliveries.status));

    const total = rows.length;
    const completed = rows.filter((r) => r.status === "delivered").length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const data = {
      deliveries: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      summary: {
        total,
        completed,
        completionRate: Math.round(completionRate * 100) / 100,
        statusDistribution: statusDistribution.map((r) => ({
          status: r.status,
          count: Number(r.count),
        })),
      },
    };

    if (q.format === "csv") {
      const csv = [
        ["Tracking Number", "Customer Name", "Address", "Status", "Created At", "Updated At"].join(
          ","
        ),
        ...data.deliveries.map((r) =>
          [
            r.trackingNumber,
            `"${r.customerName || ""}"`,
            `"${r.customerAddress || ""}"`,
            r.status,
            r.createdAt,
            r.updatedAt,
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="deliveries-by-date-range-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;
      if (q.status) filters["Status"] = q.status;

      const pdfBuffer = await generateReportPdf({
        title: "Deliveries by Date Range",
        subtitle: `Total: ${data.summary.total} | Completed: ${data.summary.completed} | Completion Rate: ${data.summary.completionRate}%`,
        generatedAt: new Date(),
        filters,
        data: data.deliveries,
        columns: [
          { key: "trackingNumber", label: "Tracking Number" },
          { key: "customerName", label: "Customer Name" },
          { key: "customerAddress", label: "Address" },
          { key: "status", label: "Status" },
          {
            key: "createdAt",
            label: "Created At",
            format: formatDateTime,
          },
          {
            key: "updatedAt",
            label: "Updated At",
            format: formatDateTime,
          },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="deliveries-by-date-range-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
