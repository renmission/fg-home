import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockMovements } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { inventoryMovementSummaryQuerySchema } from "@/schemas/reports";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatDate } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = inventoryMovementSummaryQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const, groupBy: "day" as const };

    const conditions = [];
    if (q.dateFrom) {
      // Include full day: start of dateFrom
      const dateFromStart = new Date(q.dateFrom);
      dateFromStart.setHours(0, 0, 0, 0);
      conditions.push(gte(stockMovements.createdAt, dateFromStart));
    }
    if (q.dateTo) {
      // Include full day: end of dateTo (23:59:59.999)
      const dateToEnd = new Date(q.dateTo);
      dateToEnd.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.createdAt, dateToEnd));
    }
    if (q.type) {
      conditions.push(eq(stockMovements.type, q.type));
    }
    if (q.category?.trim()) {
      conditions.push(eq(products.category, q.category.trim()));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    let groupByClause: ReturnType<typeof sql>;
    let orderByClause: ReturnType<typeof sql>;

    switch (q.groupBy) {
      case "day":
        groupByClause = sql`DATE(${stockMovements.createdAt})`;
        orderByClause = sql`DATE(${stockMovements.createdAt}) DESC`;
        break;
      case "week":
        groupByClause = sql`DATE_TRUNC('week', ${stockMovements.createdAt})`;
        orderByClause = sql`DATE_TRUNC('week', ${stockMovements.createdAt}) DESC`;
        break;
      case "month":
        groupByClause = sql`DATE_TRUNC('month', ${stockMovements.createdAt})`;
        orderByClause = sql`DATE_TRUNC('month', ${stockMovements.createdAt}) DESC`;
        break;
      case "product":
        groupByClause = sql`${products.id}`;
        orderByClause = sql`${products.name} ASC`;
        break;
      case "category":
        groupByClause = sql`${products.category}`;
        orderByClause = sql`${products.category} ASC`;
        break;
      default:
        groupByClause = sql`DATE(${stockMovements.createdAt})`;
        orderByClause = sql`DATE(${stockMovements.createdAt}) DESC`;
    }

    // Build select and groupBy based on groupBy type
    type RowType = {
      period: Date | string | unknown;
      type: string;
      totalQuantity: number;
      count: number;
      productName?: string | null;
      productCategory?: string | null;
    };
    let rows: RowType[];
    let groupByFields: Array<unknown>;

    if (q.groupBy === "product") {
      groupByFields = [products.id, products.name, stockMovements.type];
      rows = await db
        .select({
          period: groupByClause.as("period"),
          type: stockMovements.type,
          totalQuantity: sql<number>`SUM(ABS(${stockMovements.quantity}))`.as("total_quantity"),
          count: sql<number>`COUNT(*)`.as("count"),
          productName: products.name,
          productCategory: products.category,
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .where(where)
        .groupBy(
          ...(groupByFields as [
            typeof products.id,
            typeof products.name,
            typeof stockMovements.type,
          ])
        )
        .orderBy(orderByClause);
    } else if (q.groupBy === "category") {
      groupByFields = [products.category, stockMovements.type];
      rows = await db
        .select({
          period: groupByClause.as("period"),
          type: stockMovements.type,
          totalQuantity: sql<number>`SUM(ABS(${stockMovements.quantity}))`.as("total_quantity"),
          count: sql<number>`COUNT(*)`.as("count"),
          productCategory: products.category,
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .where(where)
        .groupBy(...(groupByFields as [typeof products.category, typeof stockMovements.type]))
        .orderBy(orderByClause);
    } else {
      // For day/week/month
      rows = await db
        .select({
          period: groupByClause.as("period"),
          type: stockMovements.type,
          totalQuantity: sql<number>`SUM(ABS(${stockMovements.quantity}))`.as("total_quantity"),
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(stockMovements)
        .innerJoin(products, eq(stockMovements.productId, products.id))
        .where(where)
        .groupBy(groupByClause, stockMovements.type)
        .orderBy(orderByClause);
    }

    const data = rows.map((r) => ({
      period: r.period instanceof Date ? r.period.toISOString() : r.period,
      type: r.type,
      totalQuantity: Number(r.totalQuantity),
      count: Number(r.count),
      productName: "productName" in r ? r.productName : null,
      productCategory: "productCategory" in r ? r.productCategory : null,
    }));

    if (q.format === "csv") {
      const csv = [
        ["Period", "Type", "Total Quantity", "Count", "Product", "Category"].join(","),
        ...data.map((r) =>
          [
            r.period,
            r.type,
            r.totalQuantity,
            r.count,
            `"${r.productName || ""}"`,
            r.productCategory || "",
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="movement-summary-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;
      if (q.type) filters["Type"] = q.type;
      if (q.category) filters["Category"] = q.category;
      filters["Group By"] = q.groupBy || "day";

      const columns: Array<{
        key: string;
        label: string;
        format?: (value: unknown) => string;
        align?: "left" | "right" | "center";
      }> = [
        {
          key: "period",
          label:
            q.groupBy === "day"
              ? "Date"
              : q.groupBy === "week"
                ? "Week"
                : q.groupBy === "month"
                  ? "Month"
                  : q.groupBy === "product"
                    ? "Product"
                    : "Category",
          format: (val) => {
            if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
              return formatDate(val);
            }
            return String(val || "");
          },
        },
        { key: "type", label: "Type" },
        { key: "totalQuantity", label: "Total Quantity", align: "right" },
        { key: "count", label: "Movement Count", align: "right" },
      ];

      if (q.groupBy === "product") {
        columns.splice(1, 0, { key: "productName", label: "Product Name" });
        columns.splice(2, 0, { key: "productCategory", label: "Category" });
      } else if (q.groupBy === "category") {
        columns.splice(1, 0, { key: "productCategory", label: "Category" });
      }

      const pdfBuffer = await generateReportPdf({
        title: "Inventory Movement Summary",
        subtitle: `Stock movements grouped by ${q.groupBy || "day"}`,
        generatedAt: new Date(),
        filters,
        data,
        columns,
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="movement-summary-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
