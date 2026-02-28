import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, users } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { salesTransactionsQuerySchema } from "@/schemas/reports";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { generateReportPdf, formatMoney, formatDateTime } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = salesTransactionsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const statusFilter = q.status ? [q.status] : ["completed", "voided"];
    const conditions = [inArray(sales.status, statusFilter as ("completed" | "voided")[])];

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
        id: sales.id,
        status: sales.status,
        subtotal: sales.subtotal,
        discountAmount: sales.discountAmount,
        discountType: sales.discountType,
        total: sales.total,
        completedAt: sales.completedAt,
        createdAt: sales.createdAt,
        cashierName: users.name,
      })
      .from(sales)
      .leftJoin(users, eq(sales.createdById, users.id))
      .where(where)
      .orderBy(desc(sales.completedAt));

    const data = rows.map((r) => ({
      ...r,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    if (q.format === "csv") {
      const csv = [
        ["Sale ID", "Status", "Cashier", "Subtotal", "Discount", "Total", "Completed At"].join(","),
        ...data.map((r) =>
          [
            r.id,
            r.status,
            `"${r.cashierName || ""}"`,
            r.subtotal,
            r.discountAmount,
            r.total,
            r.completedAt ?? "",
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sales-transactions-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;
      if (q.status) filters["Status"] = q.status;

      const pdfBuffer = await generateReportPdf({
        title: "Sales Transactions",
        subtitle: `${data.length} transaction${data.length !== 1 ? "s" : ""}`,
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "status", label: "Status", width: 60 },
          { key: "cashierName", label: "Cashier", width: 100 },
          {
            key: "subtotal",
            label: "Subtotal",
            format: formatMoney,
            align: "right",
            width: 80,
          },
          {
            key: "discountAmount",
            label: "Discount",
            format: formatMoney,
            align: "right",
            width: 70,
          },
          {
            key: "total",
            label: "Total",
            format: formatMoney,
            align: "right",
            width: 80,
          },
          {
            key: "completedAt",
            label: "Completed At",
            format: formatDateTime,
            width: 110,
          },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sales-transactions-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data, total: data.length });
  });
}
