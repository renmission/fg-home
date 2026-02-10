import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { inventoryStockLevelsQuerySchema } from "@/schemas/reports";
import { and, asc, eq, sql } from "drizzle-orm";
import { generateReportPdf } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = inventoryStockLevelsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success
      ? parsed.data
      : { format: "json" as const, category: undefined, includeLowStock: false };

    const conditions = [];
    if (q.category?.trim()) {
      conditions.push(eq(products.category, q.category.trim()));
    }
    if (q.includeLowStock) {
      conditions.push(
        sql`COALESCE(${stockLevels.quantity}, 0) <= ${products.reorderLevel} AND ${products.reorderLevel} > 0`
      );
    }
    conditions.push(eq(products.archived, 0)); // Only active products
    const where = conditions.length ? and(...conditions) : undefined;

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
      .where(where)
      .orderBy(asc(products.name));

    const data = rows.map((r) => ({
      ...r,
      quantity: r.quantity ?? 0,
      lowStock: (r.quantity ?? 0) <= r.reorderLevel && r.reorderLevel > 0,
    }));

    if (q.format === "csv") {
      const csv = [
        ["SKU", "Name", "Category", "Unit", "Current Quantity", "Reorder Level", "Low Stock"].join(
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
            r.lowStock ? "Yes" : "No",
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="stock-levels-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const filters: Record<string, string | null | undefined> = {};
      if (q.category) filters["Category"] = q.category;
      if (q.includeLowStock) filters["Filter"] = "Low Stock Only";

      const pdfBuffer = await generateReportPdf({
        title: "Inventory Stock Levels Report",
        subtitle: "Current stock levels for all products",
        generatedAt: new Date(),
        filters,
        data,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Product Name" },
          { key: "category", label: "Category" },
          { key: "unit", label: "Unit" },
          { key: "quantity", label: "Current Quantity", align: "right" },
          { key: "reorderLevel", label: "Reorder Level", align: "right" },
          {
            key: "lowStock",
            label: "Low Stock",
            format: (val) => (val ? "Yes" : "No"),
          },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="stock-levels-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
