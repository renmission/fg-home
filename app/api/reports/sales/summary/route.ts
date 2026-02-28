import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { salesSummaryQuerySchema } from "@/schemas/reports";
import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = salesSummaryQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [inArray(sales.status, ["completed", "voided"])];
    if (q.dateFrom) {
      const dateFromStart = new Date(q.dateFrom);
      dateFromStart.setHours(0, 0, 0, 0);
      conditions.push(gte(sales.completedAt, dateFromStart));
    }
    if (q.dateTo) {
      const dateToEnd = new Date(q.dateTo);
      dateToEnd.setHours(23, 59, 59, 999);
      conditions.push(lte(sales.completedAt, dateToEnd));
    }
    const where = and(...conditions);

    const [row] = await db
      .select({
        totalRevenue:
          sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'completed' THEN ${sales.total} ELSE 0 END), 0)`.as(
            "total_revenue"
          ),
        transactionCount: sql<number>`COUNT(*)::int`.as("transaction_count"),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${sales.status} = 'completed')::int`.as(
          "completed_count"
        ),
        voidedCount: sql<number>`COUNT(*) FILTER (WHERE ${sales.status} = 'voided')::int`.as(
          "voided_count"
        ),
        avgOrderValue:
          sql<string>`COALESCE(AVG(CASE WHEN ${sales.status} = 'completed' THEN ${sales.total} END), 0)`.as(
            "avg_order_value"
          ),
        totalDiscounts:
          sql<string>`COALESCE(SUM(CASE WHEN ${sales.status} = 'completed' THEN ${sales.discountAmount} ELSE 0 END), 0)`.as(
            "total_discounts"
          ),
      })
      .from(sales)
      .where(where);

    const data = {
      totalRevenue: row?.totalRevenue ?? "0",
      transactionCount: row?.transactionCount ?? 0,
      completedCount: row?.completedCount ?? 0,
      voidedCount: row?.voidedCount ?? 0,
      avgOrderValue: row?.avgOrderValue ?? "0",
      totalDiscounts: row?.totalDiscounts ?? "0",
    };

    if (q.format === "csv") {
      const csv = [
        ["Metric", "Value"].join(","),
        ["Total Revenue", formatMoney(data.totalRevenue)].join(","),
        ["Total Transactions", data.transactionCount].join(","),
        ["Completed Sales", data.completedCount].join(","),
        ["Voided Sales", data.voidedCount].join(","),
        ["Average Order Value", formatMoney(data.avgOrderValue)].join(","),
        ["Total Discounts Given", formatMoney(data.totalDiscounts)].join(","),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sales-summary-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      const pdfBuffer = await generateReportPdf({
        title: "Sales Summary",
        subtitle: `Total Revenue: ${formatMoney(data.totalRevenue)} | ${data.completedCount} completed, ${data.voidedCount} voided`,
        generatedAt: new Date(),
        filters,
        data: [
          { metric: "Total Revenue", value: formatMoney(data.totalRevenue) },
          { metric: "Total Transactions", value: String(data.transactionCount) },
          { metric: "Completed Sales", value: String(data.completedCount) },
          { metric: "Voided Sales", value: String(data.voidedCount) },
          { metric: "Average Order Value", value: formatMoney(data.avgOrderValue) },
          { metric: "Total Discounts Given", value: formatMoney(data.totalDiscounts) },
        ],
        columns: [
          { key: "metric", label: "Metric", width: 150 },
          { key: "value", label: "Value", align: "right", width: 100 },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sales-summary-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
