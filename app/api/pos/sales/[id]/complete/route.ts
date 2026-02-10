import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems, products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { getPaymentTotal } from "@/lib/pos";
import { applyStockMovement } from "@/lib/inventory";
import { eq, inArray } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Complete a sale: validate payment >= total, create stock-out movements
 * (inventory integration), then mark sale as completed.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id: saleId } = await context.params;

    const [sale] = await db
      .select({
        id: sales.id,
        status: sales.status,
        total: sales.total,
      })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);

    if (!sale) {
      return Response.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.status !== "draft" && sale.status !== "held") {
      return Response.json({ error: "Sale is already completed or voided" }, { status: 400 });
    }

    const lines = await db
      .select({
        id: saleLineItems.id,
        productId: saleLineItems.productId,
        productName: products.name,
        quantity: saleLineItems.quantity,
      })
      .from(saleLineItems)
      .innerJoin(products, eq(saleLineItems.productId, products.id))
      .where(eq(saleLineItems.saleId, saleId));

    if (lines.length === 0) {
      return Response.json({ error: "Sale has no line items" }, { status: 400 });
    }

    const paymentTotal = await getPaymentTotal(saleId);
    const total = Number(sale.total);
    if (paymentTotal < total) {
      return Response.json({ error: "Insufficient payment", paymentTotal, total }, { status: 400 });
    }

    const productIds = [...new Set(lines.map((l) => l.productId))];
    const stockRows = await db
      .select({
        productId: stockLevels.productId,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .where(inArray(stockLevels.productId, productIds));

    const stockByProduct = Object.fromEntries(
      stockRows.map((r) => [r.productId, Number(r.quantity)])
    );

    for (const line of lines) {
      const available = stockByProduct[line.productId] ?? 0;
      if (available < line.quantity) {
        return Response.json(
          {
            error: "Insufficient stock",
            product: line.productName,
            productId: line.productId,
            required: line.quantity,
            available,
          },
          { status: 400 }
        );
      }
    }

    for (const line of lines) {
      const result = await applyStockMovement({
        productId: line.productId,
        type: "out",
        quantity: line.quantity,
        reference: `sale:${saleId}`,
        note: "POS sale",
        createdById: user?.id ?? null,
      });
      if (!result.ok) {
        return Response.json(
          {
            error:
              result.error === "insufficient_stock"
                ? "Insufficient stock for " + line.productName
                : "Product not found",
            productId: line.productId,
          },
          { status: 400 }
        );
      }
    }

    await db
      .update(sales)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId));

    const [completed] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);

    return Response.json({ data: completed });
  });
}
