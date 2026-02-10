import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { inventoryReorderSuggestionsQuerySchema } from "@/schemas/reports";
import { asc, eq, sql } from "drizzle-orm";
import { generateReportPdf } from "@/lib/pdf-utils";

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.REPORTS_READ);
    if (forbidden) return forbidden;

    const parsed = inventoryReorderSuggestionsQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    const q = parsed.success ? parsed.data : { format: "json" as const };

    // Products that need reordering: current quantity <= reorder level
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
        sql`(${stockLevels.quantity} <= ${products.reorderLevel} OR ${stockLevels.quantity} IS NULL) AND ${products.reorderLevel} > 0 AND ${products.archived} = 0`
      )
      .orderBy(asc(stockLevels.quantity), asc(products.name));

    const data = rows.map((r) => {
      const currentQty = r.quantity ?? 0;
      const suggestedQty = Math.max(r.reorderLevel * 2, r.reorderLevel + 10); // Suggest 2x reorder level or reorder level + 10, whichever is higher
      return {
        ...r,
        quantity: currentQty,
        reorderLevel: r.reorderLevel,
        suggestedQuantity: suggestedQty,
        quantityToOrder: suggestedQty - currentQty,
      };
    });

    if (q.format === "csv") {
      const csv = [
        [
          "SKU",
          "Name",
          "Category",
          "Unit",
          "Current Quantity",
          "Reorder Level",
          "Suggested Quantity",
          "Quantity to Order",
        ].join(","),
        ...data.map((r) =>
          [
            r.sku,
            `"${r.name}"`,
            r.category || "",
            r.unit,
            r.quantity,
            r.reorderLevel,
            r.suggestedQuantity,
            r.quantityToOrder,
          ].join(",")
        ),
      ].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="reorder-suggestions-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    if (q.format === "pdf") {
      const pdfBuffer = await generateReportPdf({
        title: "Reorder Suggestions Report",
        subtitle: "Recommended reorder quantities for low stock items",
        generatedAt: new Date(),
        data,
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Product Name" },
          { key: "category", label: "Category" },
          { key: "unit", label: "Unit" },
          { key: "quantity", label: "Current Quantity", align: "right" },
          { key: "reorderLevel", label: "Reorder Level", align: "right" },
          { key: "suggestedQuantity", label: "Suggested Quantity", align: "right" },
          { key: "quantityToOrder", label: "Quantity to Order", align: "right" },
        ],
      });

      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="reorder-suggestions-${new Date().toISOString().split("T")[0]}.pdf"`,
        },
      });
    }

    return Response.json({ data });
  });
}
