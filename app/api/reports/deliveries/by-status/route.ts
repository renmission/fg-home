import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliveryByStatusQuerySchema } from "@/schemas/reports";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatDateTime } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = deliveryByStatusQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [];
    if (q.status) {
      conditions.push(eq(deliveries.status, q.status));
    }
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
    const where = conditions.length ? and(...conditions) : undefined;

    // Get counts by status
    const statusCounts = await db
      .select({
        status: deliveries.status,
        count: sql<number>`COUNT(*)::int`.as("count"),
      })
      .from(deliveries)
      .where(where)
      .groupBy(deliveries.status)
      .orderBy(asc(deliveries.status));

    // Get detailed list if status is specified
    let details: Array<{
      id: string;
      trackingNumber: string;
      customerName: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }> = [];
    if (q.status) {
      const rows = await db
        .select({
          id: deliveries.id,
          trackingNumber: deliveries.trackingNumber,
          customerName: deliveries.customerName,
          status: deliveries.status,
          createdAt: deliveries.createdAt,
          updatedAt: deliveries.updatedAt,
        })
        .from(deliveries)
        .where(where)
        .orderBy(desc(deliveries.createdAt));

      details = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }

    const data = {
      summary: statusCounts.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      details,
    };

    if (q.format === "csv") {
      if (q.status && details.length > 0) {
        const csv = [
          ["Tracking Number", "Customer Name", "Status", "Created At", "Updated At"].join(","),
          ...details.map((r) =>
            [
              r.trackingNumber,
              `"${r.customerName || ""}"`,
              r.status,
              r.createdAt,
              r.updatedAt,
            ].join(",")
          ),
        ].join("\n");

        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="deliveries-by-status-${q.status}-${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      } else {
        // Summary CSV
        const csv = [
          ["Status", "Count"].join(","),
          ...data.summary.map((r) => [r.status, r.count].join(",")),
        ].join("\n");

        return new Response(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="deliveries-by-status-summary-${new Date().toISOString().split("T")[0]}.csv"`,
          },
        });
      }
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.status) filters["Status"] = q.status;
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      // If status is specified, show details; otherwise show summary
      if (q.status && details.length > 0) {
        const pdfBuffer = await generateReportPdf({
          title: `Deliveries by Status - ${q.status}`,
          subtitle: "Detailed list of deliveries",
          generatedAt: new Date(),
          filters,
          data: details,
          columns: [
            { key: "trackingNumber", label: "Tracking Number" },
            { key: "customerName", label: "Customer Name" },
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
            "Content-Disposition": `attachment; filename="deliveries-by-status-${q.status}-${new Date().toISOString().split("T")[0]}.pdf"`,
          },
        });
      } else {
        const pdfBuffer = await generateReportPdf({
          title: "Deliveries by Status - Summary",
          subtitle: "Delivery counts by status",
          generatedAt: new Date(),
          filters,
          data: data.summary,
          columns: [
            { key: "status", label: "Status" },
            { key: "count", label: "Count", align: "right" },
          ],
        });

        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="deliveries-by-status-summary-${new Date().toISOString().split("T")[0]}.pdf"`,
          },
        });
      }
    }

    return Response.json({ data });
  });
}
