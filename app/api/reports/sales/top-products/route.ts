import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems, products } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { salesTopProductsQuerySchema } from "@/schemas/reports";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { generateReportPdf, formatMoney } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = salesTopProductsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const, limit: 10 };

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

    // Revenue per line: quantity * unitPrice minus line discount (handles percent and fixed types)
    const lineRevenueExpr = sql<string>`COALESCE(SUM(
      CASE
        WHEN ${saleLineItems.lineDiscountType} = 'percent'
          THEN ${saleLineItems.quantity}::numeric * ${saleLineItems.unitPrice} * (1 - ${saleLineItems.lineDiscountAmount} / 100)
        ELSE ${saleLineItems.quantity}::numeric * ${saleLineItems.unitPrice} - ${saleLineItems.lineDiscountAmount}
      END
    ), 0)`.as("total_revenue");

    const rows = await db
      .select({
        productId: saleLineItems.productId,
        productName: products.name,
        productSku: products.sku,
        totalQuantitySold: sql<number>`SUM(${saleLineItems.quantity})::int`.as(
          "total_quantity_sold"
        ),
        totalRevenue: lineRevenueExpr,
      })
      .from(saleLineItems)
      .innerJoin(sales, eq(saleLineItems.saleId, sales.id))
      .innerJoin(products, eq(saleLineItems.productId, products.id))
      .where(where)
      .groupBy(saleLineItems.productId, products.name, products.sku)
      .orderBy(desc(lineRevenueExpr))
      .limit(q.limit ?? 10);

    const data = rows.map((r) => ({
      ...r,
      totalQuantitySold: Number(r.totalQuantitySold),
    }));

    if (q.format === "csv") {
      const csv = [
        ["Product Name", "SKU", "Quantity Sold", "Revenue"].join(","),
        ...data.map((r) =>
          [`"${r.productName}"`, r.productSku, r.totalQuantitySold, r.totalRevenue].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="sales-top-products-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.dateFrom) filters["From"] = q.dateFrom;
      if (q.dateTo) filters["To"] = q.dateTo;
      filters["Top"] = String(q.limit ?? 10);

      const pdfBuffer = await generateReportPdf({
        title: "Top Selling Products",
        subtitle: `Top ${q.limit ?? 10} products by revenue`,
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "productName", label: "Product", width: 140 },
          { key: "productSku", label: "SKU", width: 80 },
          {
            key: "totalQuantitySold",
            label: "Qty Sold",
            align: "right",
            width: 70,
          },
          {
            key: "totalRevenue",
            label: "Revenue",
            format: formatMoney,
            align: "right",
            width: 90,
          },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sales-top-products-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
