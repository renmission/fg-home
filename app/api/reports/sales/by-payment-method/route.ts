import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, payments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { salesByPaymentMethodQuerySchema } from "@/schemas/reports";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney } from "@/lib/pdf-utils";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  gcash: "GCash",
  google_pay: "Google Pay",
  paymaya: "PayMaya",
  other: "Other",
};

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = salesByPaymentMethodQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const conditions = [eq(sales.status, "completed")];
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

    const rows = await db
      .select({
        method: payments.method,
        totalAmount: sql<string>`COALESCE(SUM(${payments.amount}), 0)`.as("total_amount"),
        transactionCount: sql<number>`COUNT(DISTINCT ${payments.saleId})::int`.as(
          "transaction_count"
        ),
      })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(where)
      .groupBy(payments.method)
      .orderBy(asc(payments.method));

    const data = rows.map((r) => ({
      method: r.method,
      methodLabel: PAYMENT_METHOD_LABELS[r.method] ?? r.method,
      totalAmount: r.totalAmount,
      transactionCount: Number(r.transactionCount),
    }));

    if (q.format === "csv") {
      const csv = [
        ["Payment Method", "Total Amount", "Transactions"].join(","),
        ...data.map((r) => [r.methodLabel, r.totalAmount, r.transactionCount].join(",")),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sales-by-payment-method-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;

      const pdfBuffer = await generateReportPdf({
        title: "Revenue by Payment Method",
        subtitle: `${data.length} payment method${data.length !== 1 ? "s" : ""}`,
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "methodLabel", label: "Payment Method", width: 120 },
          {
            key: "totalAmount",
            label: "Total Amount",
            format: formatMoney,
            align: "right",
            width: 100,
          },
          {
            key: "transactionCount",
            label: "Transactions",
            align: "right",
            width: 80,
          },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sales-by-payment-method-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
