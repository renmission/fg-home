import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems, products } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { applyStockMovement } from "@/lib/inventory";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Void a completed sale: reverse stock (create "in" movements) and set status to voided.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id: saleId } = await context.params;

    const [sale] = await db
      .select({ id: sales.id, status: sales.status })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);

    if (!sale) {
      return Response.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.status !== "completed") {
      return Response.json({ error: "Only completed sales can be voided" }, { status: 400 });
    }

    const lines = await db
      .select({
        productId: saleLineItems.productId,
        productName: products.name,
        quantity: saleLineItems.quantity,
      })
      .from(saleLineItems)
      .innerJoin(products, eq(saleLineItems.productId, products.id))
      .where(eq(saleLineItems.saleId, saleId));

    for (const line of lines) {
      const result = await applyStockMovement({
        productId: line.productId,
        type: "in",
        quantity: line.quantity,
        reference: `void:${saleId}`,
        note: "Void sale - stock restored",
        createdById: user?.id ?? null,
      });
      if (!result.ok) {
        return Response.json(
          {
            error:
              result.error === "product_not_found"
                ? "Product not found"
                : "Failed to restore stock for " + line.productName,
            productId: line.productId,
          },
          { status: 400 }
        );
      }
    }

    await db
      .update(sales)
      .set({ status: "voided", updatedAt: new Date() })
      .where(eq(sales.id, saleId));

    const [updated] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    return Response.json({ data: updated });
  });
}
