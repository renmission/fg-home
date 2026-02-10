import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { inventoryLowStockQuerySchema } from "@/schemas/reports";
import { asc, eq, sql } from "drizzle-orm";
import { generateReportPdf } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = inventoryLowStockQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        category: products.category,
        unit: products.unit,
        reorderLevel: products.reorderLevel,
        quantity: stockLevels.quantity,
      })
      .from(products)
      .leftJoin(stockLevels, eq(products.id, stockLevels.productId))
      .where(
        sql`COALESCE(${stockLevels.quantity}, 0) <= ${products.reorderLevel} AND ${products.reorderLevel} > 0 AND ${products.archived} = 0`
      )
      .orderBy(asc(sql`COALESCE(${stockLevels.quantity}, 0)`), asc(products.name));

    const data = rows.map((r) => ({
      ...r,
      quantity: r.quantity ?? 0,
      reorderLevel: r.reorderLevel,
      shortage: Math.max(0, r.reorderLevel - (r.quantity ?? 0)),
    }));

    if (q.format === "csv") {
      const csv = [
        ["SKU", "Name", "Category", "Unit", "Current Quantity", "Reorder Level", "Shortage"].join(
          ","
        ),
        ...data.map((r) =>
          [
            r.sku,
            `"${r.name}"`,
            r.category || "",
            r.unit,
            r.quantity,
            r.reorderLevel,
            r.shortage,
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="low-stock-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const pdfBuffer = await generateReportPdf({
        title: "Low Stock Report",
        subtitle: "Products with stock levels at or below reorder level",
        generatedAt: new Date(),
        data,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Product Name" },
          { key: "category", label: "Category" },
          { key: "unit", label: "Unit" },
          { key: "quantity", label: "Current Quantity", align: "right" },
          { key: "reorderLevel", label: "Reorder Level", align: "right" },
          { key: "shortage", label: "Shortage", align: "right" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="low-stock-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
